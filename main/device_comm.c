#include "device_comm.h"

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/time.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_sntp.h"
#include "mqtt_client.h"
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

// Generate a simple pseudo-UUID from random bytes
static void generate_uuid(char *uuid_buffer, size_t buffer_size)
{
    uint32_t r1 = esp_random();
    uint32_t r2 = esp_random();
    uint32_t r3 = esp_random();
    uint32_t r4 = esp_random();
    snprintf(uuid_buffer, buffer_size,
             "%08lx-%04lx-%04lx-%04lx-%08lx%04lx",
             (unsigned long)r1,
             (unsigned long)((r2 >> 16) & 0xFFFF),
             (unsigned long)(0x4000 | (r2 & 0x0FFF)),
             (unsigned long)(0x8000 | (r3 & 0x3FFF)),
             (unsigned long)r4,
             (unsigned long)((r3 >> 16) & 0xFFFF));
}

// Get ISO-8601 UTC timestamp. Falls back to epoch-based if SNTP not synced.
static void get_iso_timestamp(char *buffer, size_t buffer_size)
{
    time_t now;
    struct tm timeinfo;
    time(&now);
    gmtime_r(&now, &timeinfo);

    if (timeinfo.tm_year > (2020 - 1900)) {
        // SNTP is synced — real time available
        strftime(buffer, buffer_size, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    } else {
        // Fallback: use monotonic uptime as ISO-like string
        int64_t uptime_sec = esp_timer_get_time() / 1000000;
        snprintf(buffer, buffer_size, "1970-01-01T00:00:%02lldZ", (long long)(uptime_sec % 60));
    }
}

static void mqtt_event_callback(mqtt_event_type_t event, void *data, void *arg)
{
    (void)arg;
    
    switch (event) {
        case MQTT_EVENT_CONNECTED: {
            ESP_LOGI(TAG, "MQTT connected, subscribing to commands");
            char topic[MQTT_MAX_TOPIC_LENGTH];
            snprintf(topic, sizeof(topic), "devices/%s/commands", s_device_id);
            mqtt_client_subscribe(topic, 1);
            break;
        }
        
        case MQTT_EVENT_DATA: {
            mqtt_event_data_t *mqtt_data = (mqtt_event_data_t *)data;
            
            if (strstr(mqtt_data->topic, "commands") != NULL) {
                device_command_received_t cmd = {0};
                const char *command_name = device_comm_parse_command(mqtt_data->data, &cmd);
                
                if (command_name != NULL && s_command_handler != NULL) {
                    ESP_LOGI(TAG, "Received command: %s", command_name);
                    s_command_handler(&cmd, s_command_handler_arg);
                }
            }
            break;
        }
        
        default:
            break;
    }
}

static void status_publish_task(void *arg)
{
    (void)arg;
    
    while (s_status_running) {
        device_comm_publish_status();
        vTaskDelay(pdMS_TO_TICKS(DEVICE_COMM_STATUS_PERIOD_MS));
    }
    vTaskDelete(NULL);
}

void device_comm_init(void)
{
    ESP_LOGI(TAG, "Initializing device communication");
    
    mqtt_client_set_event_callback(mqtt_event_callback, NULL);
}

void device_comm_set_device_id(const char *device_id)
{
    if (device_id != NULL) {
        strncpy(s_device_id, device_id, sizeof(s_device_id) - 1);
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
    
    char message_id[37];
    generate_uuid(message_id, sizeof(message_id));
    
    char timestamp[32];
    get_iso_timestamp(timestamp, sizeof(timestamp));
    
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "protocolVersion", HEALTH_DEVICE_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "messageId", message_id);
    cJSON_AddStringToObject(root, "deviceId", s_device_id);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddStringToObject(root, "type", "STATUS");
    cJSON_AddStringToObject(root, "firmwareVersion", APP_FIRMWARE_VERSION);
    cJSON_AddStringToObject(root, "hardwareId", status->hardware_id);
    cJSON_AddStringToObject(root, "pairingCode", status->pairing_code);
    cJSON_AddBoolToObject(root, "wifiConnected", status->wifi_connected);
    cJSON_AddBoolToObject(root, "mqttConnected", status->mqtt_connected);
    cJSON_AddBoolToObject(root, "timeSynced", status->time_synced);
    
    if (status->active_session_id[0] != '\0') {
        cJSON_AddStringToObject(root, "activeSessionId", status->active_session_id);
    }
    
    cJSON_AddNumberToObject(root, "freeHeap", status->free_heap);
    
    char *json_str = cJSON_PrintUnformatted(root);
    mqtt_client_publish(topic, json_str, 1, 1);
    
    cJSON_Delete(root);
    cJSON_free(json_str);
    
    ESP_LOGD(TAG, "Status published");
}

void device_comm_publish_measurement(const char *type, float value, const char *unit, const char *quality, const char *session_id)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() || type == NULL) {
        return;
    }
    
    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/measurements", s_device_id);
    
    char message_id[37];
    generate_uuid(message_id, sizeof(message_id));
    
    char timestamp[32];
    get_iso_timestamp(timestamp, sizeof(timestamp));
    
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "protocolVersion", HEALTH_DEVICE_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "messageId", message_id);
    cJSON_AddStringToObject(root, "deviceId", s_device_id);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddStringToObject(root, "type", "MEASUREMENT");
    cJSON_AddStringToObject(root, "measurementType", type);
    cJSON_AddNumberToObject(root, "value", value);
    cJSON_AddStringToObject(root, "unit", unit);
    cJSON_AddStringToObject(root, "quality", quality);
    
    if (session_id != NULL && session_id[0] != '\0') {
        cJSON_AddStringToObject(root, "sessionId", session_id);
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    mqtt_client_publish(topic, json_str, 1, 0);
    
    cJSON_Delete(root);
    cJSON_free(json_str);
}

void device_comm_publish_ecg_chunk(const char *session_id, uint16_t sequence, uint16_t sample_rate, int16_t *samples, size_t count)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() || session_id == NULL || samples == NULL) {
        return;
    }
    
    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/ecg", s_device_id);
    
    char message_id[37];
    generate_uuid(message_id, sizeof(message_id));
    
    char timestamp[32];
    get_iso_timestamp(timestamp, sizeof(timestamp));
    
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "protocolVersion", HEALTH_DEVICE_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "messageId", message_id);
    cJSON_AddStringToObject(root, "deviceId", s_device_id);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddStringToObject(root, "type", "ECG_DATA");
    cJSON_AddStringToObject(root, "sessionId", session_id);
    cJSON_AddNumberToObject(root, "sequence", sequence);
    cJSON_AddNumberToObject(root, "sampleRate", sample_rate);
    
    cJSON *samples_array = cJSON_AddArrayToObject(root, "samples");
    for (size_t i = 0; i < count; i++) {
        cJSON_AddItemToArray(samples_array, cJSON_CreateNumber(samples[i]));
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    mqtt_client_publish(topic, json_str, 1, 0);
    
    cJSON_Delete(root);
    cJSON_free(json_str);
}

void device_comm_publish_command_ack(const char *command_id, const char *command, const char *status, const char *error_code)
{
    if (s_device_id[0] == '\0' || !mqtt_client_is_connected() || command_id == NULL) {
        return;
    }
    
    char topic[MQTT_MAX_TOPIC_LENGTH];
    snprintf(topic, sizeof(topic), "devices/%s/acks", s_device_id);
    
    char message_id[37];
    generate_uuid(message_id, sizeof(message_id));
    
    char timestamp[32];
    get_iso_timestamp(timestamp, sizeof(timestamp));
    
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "protocolVersion", HEALTH_DEVICE_PROTOCOL_VERSION);
    cJSON_AddStringToObject(root, "messageId", message_id);
    cJSON_AddStringToObject(root, "commandId", command_id);
    cJSON_AddStringToObject(root, "deviceId", s_device_id);
    cJSON_AddStringToObject(root, "timestamp", timestamp);
    cJSON_AddStringToObject(root, "type", "COMMAND_ACK");
    cJSON_AddStringToObject(root, "command", command);
    cJSON_AddStringToObject(root, "status", status);
    
    if (error_code != NULL) {
        cJSON_AddStringToObject(root, "errorCode", error_code);
    } else {
        cJSON_AddNullToObject(root, "errorCode");
    }
    
    char *json_str = cJSON_PrintUnformatted(root);
    mqtt_client_publish(topic, json_str, 1, 0);
    
    cJSON_Delete(root);
    cJSON_free(json_str);
}

void device_comm_start_periodic_status(void)
{
    if (s_status_running) {
        return;
    }
    
    s_status_running = true;
    xTaskCreate(status_publish_task, "status_pub", 4096, NULL, 5, &s_status_task_handle);
}

void device_comm_stop_periodic_status(void)
{
    s_status_running = false;
    // Let the task exit its loop and self-delete
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
    
    strncpy(cmd->command_id, command_id->valuestring, sizeof(cmd->command_id) - 1);
    
    const char *command_name = command->valuestring;
    
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
        cmd->command = DEVICE_CMD_UNKNOWN;
        command_name = NULL;
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
