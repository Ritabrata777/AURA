#include "device_comm.h"

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/time.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_random.h"
#include "app_mqtt.h"
#include "device_identity.h"
#include "protocol_types.h"
#include "app_config.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "device_comm";

static char s_device_id[HEALTH_DEVICE_ID_LENGTH] = {0};
static device_command_handler_t s_command_handler = NULL;
static void *s_command_handler_arg = NULL;
static TaskHandle_t s_status_task_handle = NULL;
static bool s_status_running = false;

static void get_iso_timestamp(char *buffer, size_t buffer_size);

// Generate a proper RFC-4122-style UUID (8-4-4-4-12) from random bytes.
//
// The final group is printed as two fields. `unsigned long` is 32-bit on
// xtensa, so a single `%012lx` over a 64-bit expression silently discarded the
// top half and emitted four leading zeros on every id.
static void generate_uuid(char *uuid_buffer, size_t buffer_size)
{
    uint32_t r1 = esp_random();
    uint32_t r2 = esp_random();
    uint32_t r3 = esp_random();
    uint32_t r4 = esp_random();
    snprintf(uuid_buffer, buffer_size,
             "%08lx-%04lx-%04lx-%04lx-%04lx%08lx",
             (unsigned long)r1,
             (unsigned long)((r2 >> 16) & 0xFFFF),
             (unsigned long)(0x4000 | (r2 & 0x0FFF)),
             (unsigned long)(0x8000 | (r3 & 0x3FFF)),
             (unsigned long)((r3 >> 16) & 0xFFFF),
             (unsigned long)r4);
}

// Serialize, publish and free in one place.
//
// cJSON_PrintUnformatted returns NULL when it cannot allocate; the previous
// code passed that straight to mqtt_client_publish, which called strlen on it.
static void publish_json(const char *topic, cJSON *root, int qos, int retain)
{
    if (root == NULL) {
        return;
    }

    char *json_str = cJSON_PrintUnformatted(root);
    if (json_str == NULL) {
        ESP_LOGE(TAG, "Out of memory serializing message for %s", topic);
        cJSON_Delete(root);
        return;
    }

    mqtt_client_publish(topic, json_str, qos, retain);

    cJSON_Delete(root);
    cJSON_free(json_str);
}

// Build the five envelope fields every message on the wire carries.
static cJSON *new_envelope(const char *type)
{
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }

    char message_id[37];
    generate_uuid(message_id, sizeof(message_id));

    char timestamp[32];
    get_iso_timestamp(timestamp, sizeof(timestamp));

    cJSON_AddNumberToObject(root, "protocolVersion", HEALTH_DEVICE_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "messageId", message_id);
    cJSON_AddStringToObject(root, "deviceId", s_device_id);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddStringToObject(root, "type", type);
    return root;
}


// True once SNTP has given us a plausible wall-clock time.
bool device_comm_is_time_synced(void)
{
    time_t now;
    struct tm timeinfo;
    time(&now);
    gmtime_r(&now, &timeinfo);
    return timeinfo.tm_year > (2020 - 1900);
}

// Get ISO-8601 UTC timestamp. Before SNTP sync we still emit a syntactically
// valid ISO-8601 instant derived from the epoch plus uptime, so the backend can
// always parse it; `timeSynced` in the status payload tells the server whether
// the value is trustworthy.
static void get_iso_timestamp(char *buffer, size_t buffer_size)
{
    time_t now;
    struct tm timeinfo;
    time(&now);
    gmtime_r(&now, &timeinfo);

    if (timeinfo.tm_year > (2020 - 1900)) {
        strftime(buffer, buffer_size, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    } else {
        // Not synced yet: epoch + monotonic uptime, still valid ISO-8601.
        time_t uptime = (time_t)(esp_timer_get_time() / 1000000);
        gmtime_r(&uptime, &timeinfo);
        strftime(buffer, buffer_size, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    }
}

// Subscribe to the command topic for this device. Must be called after MQTT
// connects. (Kept here so the wire-level topic is defined in one place.)
void device_comm_subscribe_to_commands(void)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected()) {
        return;
    }
    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/commands", s_device_id);
    ESP_LOGI(TAG, "Subscribing to %s", topic);
    mqtt_client_subscribe(topic, 1);
}

// Route an inbound MQTT message. Returns true if it was a device command.
bool device_comm_handle_mqtt_data(mqtt_event_data_t *mqtt_data)
{
    if (mqtt_data == NULL || mqtt_data->data == NULL) {
        return false;
    }

    if (strcmp(mqtt_data->topic, "commands") == 0 ||
        strstr(mqtt_data->topic, "/commands") != NULL) {
        device_command_received_t cmd = {0};
        // The returned pointer aliases cmd.command_name, which outlives the
        // parsed JSON tree.
        const char *command_name = device_comm_parse_command(mqtt_data->data, &cmd);

        if (command_name != NULL && s_command_handler != NULL) {
            ESP_LOGI(TAG, "Received command: %s", command_name);
            s_command_handler(&cmd, s_command_handler_arg);
            return true;
        }
    }
    return false;
}

// The task is created once and lives for the life of the process, publishing
// only while enabled. It used to exit on stop and be re-created on start,
// which spawned a second task every time MQTT flapped inside one status
// period — each leaking 4 KB of stack.
static void status_publish_task(void *arg)
{
    (void)arg;

    while (true) {
        if (s_status_running) {
            device_comm_publish_status();
        }
        vTaskDelay(pdMS_TO_TICKS(DEVICE_COMM_STATUS_PERIOD_MS));
    }
}

void device_comm_init(void)
{
    ESP_LOGI(TAG, "Initializing device communication");
    // No callback is registered here: the application owns the single MQTT
    // event callback (set in app_main) and routes events into us via
    // device_comm_subscribe_to_commands() / device_comm_handle_mqtt_data().
}

void device_comm_set_device_id(const char *device_id)
{
    if (device_id != NULL) {
        strncpy(s_device_id, device_id, sizeof(s_device_id) - 1);
        s_device_id[sizeof(s_device_id) - 1] = '\0';
        ESP_LOGI(TAG, "Device ID set: %s", s_device_id);
    }
}

void device_comm_set_command_handler(device_command_handler_t handler, void *arg)
{
    s_command_handler = handler;
    s_command_handler_arg = arg;
}

void device_comm_publish_status(void)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected()) {
        return;
    }

    const health_device_status_t *status = device_identity_status();

    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/status", s_device_id);

    cJSON *root = new_envelope("STATUS");
    if (root == NULL) {
        return;
    }

    cJSON_AddStringToObject(root, "firmwareVersion", APP_FIRMWARE_VERSION);
    cJSON_AddStringToObject(root, "hardwareId", status->hardware_id);
    cJSON_AddStringToObject(root, "pairingCode", status->pairing_code);
    cJSON_AddBoolToObject(root, "wifiConnected", status->wifi_connected);
    cJSON_AddBoolToObject(root, "mqttConnected", status->mqtt_connected);
    cJSON_AddBoolToObject(root, "timeSynced", status->time_synced);

    // `activeSessionId` is declared `string | null`, so it must always be
    // present. Omitting it when idle left the dashboard showing the previous
    // session id indefinitely.
    if (status->active_session_id[0] != '\0') {
        cJSON_AddStringToObject(root, "activeSessionId", status->active_session_id);
    } else {
        cJSON_AddNullToObject(root, "activeSessionId");
    }

    cJSON_AddNumberToObject(root, "freeHeap", status->free_heap);
    cJSON_AddNumberToObject(root, "uptimeSeconds",
                            (double)(esp_timer_get_time() / 1000000LL));

    publish_json(topic, root, 1, 1);

    ESP_LOGD(TAG, "Status published");
}

void device_comm_publish_measurement(const char *type, float value, const char *unit, const char *quality, const char *session_id)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() || type == NULL) {
        return;
    }

    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/measurements", s_device_id);

    cJSON *root = new_envelope("MEASUREMENT");
    if (root == NULL) {
        return;
    }

    cJSON_AddStringToObject(root, "measurementType", type);
    cJSON_AddNumberToObject(root, "value", value);
    cJSON_AddStringToObject(root, "unit", unit != NULL ? unit : "");
    cJSON_AddStringToObject(root, "quality", quality != NULL ? quality : "UNAVAILABLE");

    // `sessionId` is required by the protocol, and the backend's type guard
    // rejects the whole message without it — which silently discarded every
    // heart rate, SpO2 and temperature reading the device ever sent. Spot
    // readings taken outside a recording fall back to the active ECG session
    // if one is running, and to an empty string otherwise.
    const char *effective_session = session_id;
    if (effective_session == NULL || effective_session[0] == '\0') {
        effective_session = device_identity_status()->active_session_id;
    }
    cJSON_AddStringToObject(root, "sessionId", effective_session != NULL ? effective_session : "");

    publish_json(topic, root, 1, 0);
}

void device_comm_publish_ecg_chunk(const char *session_id, uint16_t sequence, uint16_t sample_rate, int16_t *samples, size_t count)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() ||
        session_id == NULL || session_id[0] == '\0' || samples == NULL) {
        return;
    }

    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/ecg", s_device_id);

    cJSON *root = new_envelope("ECG_DATA");
    if (root == NULL) {
        return;
    }

    cJSON_AddStringToObject(root, "sessionId", session_id);
    cJSON_AddNumberToObject(root, "sequence", sequence);
    cJSON_AddNumberToObject(root, "sampleRate", sample_rate);

    cJSON *samples_array = cJSON_AddArrayToObject(root, "samples");
    if (samples_array == NULL) {
        cJSON_Delete(root);
        return;
    }
    for (size_t i = 0; i < count; i++) {
        cJSON_AddItemToArray(samples_array, cJSON_CreateNumber(samples[i]));
    }

    publish_json(topic, root, 1, 0);
}

// Closes a recording server-side. Without this the backend never wrote
// `endedAt`, so every session read as "in progress" forever.
void device_comm_publish_ecg_session_end(const char *session_id, uint32_t total_samples, const char *reason)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() ||
        session_id == NULL || session_id[0] == '\0') {
        return;
    }

    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/ecg", s_device_id);

    cJSON *root = new_envelope("ECG_SESSION_END");
    if (root == NULL) {
        return;
    }

    cJSON_AddStringToObject(root, "sessionId", session_id);
    cJSON_AddNumberToObject(root, "totalSamples", (double)total_samples);
    cJSON_AddStringToObject(root, "reason", reason != NULL ? reason : "STOPPED");

    publish_json(topic, root, 1, 0);
    ESP_LOGI(TAG, "Published ECG session end for %s (%lu samples)",
             session_id, (unsigned long)total_samples);
}

// Operational notices (sensor missing, recording clamped, and so on). These
// land in the backend audit log rather than the measurement tables.
void device_comm_publish_event(const char *severity, const char *code, const char *message)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() || code == NULL) {
        return;
    }

    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/events", s_device_id);

    cJSON *root = new_envelope("EVENT");
    if (root == NULL) {
        return;
    }

    cJSON_AddStringToObject(root, "severity", severity != NULL ? severity : "INFO");
    cJSON_AddStringToObject(root, "code", code);
    cJSON_AddStringToObject(root, "message", message != NULL ? message : "");

    publish_json(topic, root, 1, 0);
}

void device_comm_publish_command_ack(const char *command_id, const char *command, const char *status, const char *error_code)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() || command_id == NULL) {
        return;
    }

    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/acks", s_device_id);

    cJSON *root = new_envelope("COMMAND_ACK");
    if (root == NULL) {
        return;
    }

    cJSON_AddStringToObject(root, "commandId", command_id);
    cJSON_AddStringToObject(root, "command", command != NULL ? command : "UNKNOWN");
    cJSON_AddStringToObject(root, "status", status != NULL ? status : "REJECTED");

    if (error_code != NULL) {
        cJSON_AddStringToObject(root, "errorCode", error_code);
    } else {
        cJSON_AddNullToObject(root, "errorCode");
    }

    publish_json(topic, root, 1, 0);
}

void device_comm_start_periodic_status(void)
{
    s_status_running = true;

    if (s_status_task_handle != NULL) {
        return;
    }

    if (xTaskCreate(status_publish_task, "status_pub", 4096, NULL, 5, &s_status_task_handle) != pdPASS) {
        s_status_task_handle = NULL;
        ESP_LOGE(TAG, "Could not create status task");
    }
}

void device_comm_stop_periodic_status(void)
{
    // The task stays alive and idles; see status_publish_task.
    s_status_running = false;
}

const char* device_comm_parse_command(const char *json_payload, device_command_received_t *cmd)
{
    if (json_payload == NULL || cmd == NULL) {
        return NULL;
    }

    cJSON *root = cJSON_Parse(json_payload);
    if (root == NULL) {
        ESP_LOGW(TAG, "Failed to parse command JSON");
        return NULL;
    }

    cJSON *command_id = cJSON_GetObjectItemCaseSensitive(root, "commandId");
    cJSON *command = cJSON_GetObjectItemCaseSensitive(root, "command");

    if (command_id == NULL || command == NULL || !cJSON_IsString(command_id) || !cJSON_IsString(command)) {
        cJSON_Delete(root);
        return NULL;
    }

    // strncpy does not NUL-terminate on truncation, and cmd is not guaranteed
    // to be zeroed by every caller.
    strncpy(cmd->command_id, command_id->valuestring, sizeof(cmd->command_id) - 1);
    cmd->command_id[sizeof(cmd->command_id) - 1] = '\0';

    // Copy the name out of the tree before it is freed below. The caller used
    // to receive a pointer into the freed tree and log it.
    strncpy(cmd->command_name, command->valuestring, sizeof(cmd->command_name) - 1);
    cmd->command_name[sizeof(cmd->command_name) - 1] = '\0';

    const char *command_name = cmd->command_name;

    if (strcmp(command_name, "START_ECG") == 0) {
        cmd->command = DEVICE_CMD_START_ECG;
    } else if (strcmp(command_name, "STOP_ECG") == 0) {
        cmd->command = DEVICE_CMD_STOP_ECG;
    } else if (strcmp(command_name, "START_SPO2") == 0) {
        cmd->command = DEVICE_CMD_START_SPO2;
    } else if (strcmp(command_name, "STOP_SPO2") == 0) {
        cmd->command = DEVICE_CMD_STOP_SPO2;
    } else if (strcmp(command_name, "START_TEMPERATURE") == 0) {
        cmd->command = DEVICE_CMD_START_TEMPERATURE;
    } else if (strcmp(command_name, "STOP_TEMPERATURE") == 0) {
        cmd->command = DEVICE_CMD_STOP_TEMPERATURE;
    } else if (strcmp(command_name, "GET_STATUS") == 0) {
        cmd->command = DEVICE_CMD_GET_STATUS;
    } else {
        // Still dispatch it: the handler replies REJECTED/INVALID_COMMAND so
        // the operator sees a result instead of the request timing out. The
        // previous NULL return made that whole branch unreachable.
        cmd->command = DEVICE_CMD_UNKNOWN;
    }

    cJSON *parameters = cJSON_GetObjectItemCaseSensitive(root, "parameters");
    if (parameters != NULL && cJSON_IsObject(parameters)) {
        cJSON *duration = cJSON_GetObjectItemCaseSensitive(parameters, "durationSeconds");
        if (duration != NULL && cJSON_IsNumber(duration)) {
            cmd->parameters[0] = duration->valueint;
        }
    }

    cJSON_Delete(root);
    return command_name;
}
