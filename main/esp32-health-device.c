#include "app_config.h"
#include "device_identity.h"
#include "device_status_task.h"
#include "wifi_manager.h"
#include "app_mqtt.h"
#include "ecg_ad8232.h"
#include "max30102.h"
#include "mlx90614.h"
#include "oled_ssd1306.h"
#include "buttons.h"
#include "buzzer.h"
#include "local_ui.h"
#include "device_comm.h"
#include "esp_log.h"
#include "esp_sntp.h"
#include "esp_timer.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "app";
static i2c_master_bus_handle_t s_i2c_bus_handle = NULL;

// ─── SNTP Time Sync ──────────────────────────────────────────────

// esp_sntp_init() asserts (`sntp_pcb == NULL`) if called a second time without
// a matching stop. Wi-Fi reconnects call in here on every event, so the second
// connect of a session used to panic the device outright.
static bool s_sntp_started = false;

static void sntp_sync_init(void)
{
    if (s_sntp_started) {
        ESP_LOGD(TAG, "SNTP already running, requesting a refresh");
        esp_sntp_restart();
        return;
    }

    ESP_LOGI(TAG, "Initializing SNTP for time sync");
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();
    s_sntp_started = true;
}

// ─── Centralized I2C Bus Init ────────────────────────────────────
static void i2c_bus_init(void)
{
    i2c_master_bus_config_t bus_config = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = APP_I2C_MASTER_NUM,
        .scl_io_num = APP_I2C_SCL_IO,
        .sda_io_num = APP_I2C_SDA_IO,
        .glitch_ignore_cnt = 7,
        .intr_priority = 0,
        .trans_queue_depth = 0,
        .flags = {
            .enable_internal_pullup = true
        }
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, &s_i2c_bus_handle));
    ESP_LOGI(TAG, "I2C bus initialized: SDA=%d SCL=%d", APP_I2C_SDA_IO, APP_I2C_SCL_IO);
}

// ─── Sensor Callbacks → MQTT ─────────────────────────────────────

// Spot readings are not part of a recording. device_comm fills in the active
// ECG session id when there is one and an empty string otherwise; the field
// itself is mandatory, so it can never be omitted again.
static void temperature_callback(mlx90614_temp_t *temp, void *arg)
{
    (void)arg;
    if (temp == NULL) {
        return;
    }

    if (!temp->valid) {
        local_ui_set_temperature(temp);
        // Report the gap instead of dropping it silently, so a sensor that has
        // stopped responding is visible on the dashboard.
        device_comm_publish_measurement("TEMPERATURE", 0.0f, "C", "UNAVAILABLE", NULL);
        return;
    }

    local_ui_set_temperature(temp);
    ESP_LOGI(TAG, "Temperature: %.2f C", temp->object_temp_c);
    device_comm_publish_measurement("TEMPERATURE", temp->object_temp_c, "C", "VALID", NULL);
}

static void spo2_data_callback(max30102_sample_t *sample, max30102_metrics_t *metrics, void *arg)
{
    (void)arg;
    (void)sample;
    if (metrics != NULL) {
        local_ui_set_spo2(metrics);
    }
    static uint32_t publish_counter = 0;
    publish_counter++;

    // Publish every ~2 seconds (50 samples at the 25 Hz effective FIFO rate)
    if (publish_counter % 50 == 0 && metrics != NULL) {
        if (sample != NULL) device_comm_publish_spo2_raw(sample, NULL);
        if (metrics->hr_valid && metrics->heart_rate > 0) {
            ESP_LOGI(TAG, "Heart Rate: %d bpm", metrics->heart_rate);
            device_comm_publish_measurement("HEART_RATE", (float)metrics->heart_rate, "bpm", "VALID", NULL);
        }
        if (metrics->spo2_valid && metrics->spo2 > 0) {
            ESP_LOGI(TAG, "SpO2: %d%%", metrics->spo2);
            device_comm_publish_measurement("SPO2", (float)metrics->spo2, "%", "VALID", NULL);
        }
    }
}

static void ecg_data_callback(ecg_chunk_t *chunk, void *arg)
{
    (void)arg;
    if (chunk != NULL) {
        const char *session_id = ecg_ad8232_get_current_session();
        device_comm_publish_ecg_chunk(session_id, chunk->sequence, ECG_SAMPLE_RATE, chunk->samples, ECG_CHUNK_SIZE);
    }
}

// Runs on the ECG processing task once the last chunk has been flushed.
static void ecg_session_end_callback(const char *session_id, uint32_t total_samples,
                                     ecg_stop_reason_t reason, void *arg)
{
    (void)arg;

    const char *reason_name = "STOPPED";
    if (reason == ECG_STOP_REASON_DURATION_ELAPSED) {
        reason_name = "DURATION_ELAPSED";
    } else if (reason == ECG_STOP_REASON_ERROR) {
        reason_name = "ERROR";
    }

    device_comm_publish_ecg_session_end(session_id, total_samples, reason_name);
    device_identity_set_active_session(NULL);
    // The retained status message should reflect the idle state immediately.
    device_comm_publish_status();
}

// A one-shot timer used to auto-stop an ECG recording when the requested
// duration elapses. START_ECG may carry "durationSeconds"; without it the
// recording continues until STOP_ECG.
static esp_timer_handle_t s_ecg_duration_timer = NULL;

static void ecg_duration_timer_cb(void *arg)
{
    (void)arg;
    ESP_LOGI(TAG, "ECG duration elapsed, stopping recording");
    ecg_ad8232_stop_with_reason(ECG_STOP_REASON_DURATION_ELAPSED);
}

/**
 * Starts a recording, optionally bounded by a duration.
 *
 * Returns an error code string on failure (matching CommandErrorCode in the
 * shared protocol) or NULL on success, so the caller can send an accurate ack
 * instead of always claiming ACCEPTED.
 */
static const char *ecg_start_with_duration(int duration_seconds)
{
    // Bounds are part of the protocol. An out-of-range value used to be taken
    // at face value, so `durationSeconds: 999999999` pinned the ADC timer for
    // 31 years and a negative value quietly became "no limit".
    if (duration_seconds != 0 &&
        (duration_seconds < DEVICE_COMM_ECG_MIN_DURATION_S ||
         duration_seconds > DEVICE_COMM_ECG_MAX_DURATION_S)) {
        ESP_LOGW(TAG, "Rejecting out-of-range ECG duration: %d s", duration_seconds);
        device_comm_publish_event("WARN", "ECG_DURATION_OUT_OF_RANGE",
                                  "Requested recording length is outside the allowed bounds");
        return "INVALID_PARAMETERS";
    }

    if (!ecg_ad8232_start()) {
        return ecg_ad8232_is_running() ? "BUSY" : "SENSOR_UNAVAILABLE";
    }

    const char *session_id = ecg_ad8232_get_current_session();
    if (session_id != NULL && session_id[0] != '\0') {
        device_identity_set_active_session(session_id);
        // Publish immediately so the dashboard shows the recording without
        // waiting for the next 5 s heartbeat.
        device_comm_publish_status();
    }

    if (duration_seconds > 0) {
        if (s_ecg_duration_timer == NULL) {
            const esp_timer_create_args_t args = {
                .callback = ecg_duration_timer_cb,
                .name = "ecg_duration",
            };
            if (esp_timer_create(&args, &s_ecg_duration_timer) != ESP_OK) {
                ESP_LOGE(TAG, "Could not create ECG duration timer");
                s_ecg_duration_timer = NULL;
                return NULL; // Recording is live; it just has no auto-stop.
            }
        }
        esp_timer_stop(s_ecg_duration_timer);
        esp_timer_start_once(s_ecg_duration_timer,
                             (uint64_t)duration_seconds * 1000000ULL);
    }

    return NULL;
}

// ─── Device Command Handler ─────────────────────────────────────

static void handle_device_command(device_command_received_t *cmd, void *arg)
{
    (void)arg;

    switch (cmd->command) {
        case DEVICE_CMD_START_ECG: {
            max30102_stop();
            mlx90614_stop_continuous();
            int duration_seconds = (cmd->parameters[0] > 0) ? cmd->parameters[0] : 0;
            const char *error_code = ecg_start_with_duration(duration_seconds);
            // The ack now reports what actually happened. It previously always
            // said ACCEPTED, including when the sensor never started.
            device_comm_publish_command_ack(cmd->command_id, "START_ECG",
                                            error_code == NULL ? "ACCEPTED" : "REJECTED",
                                            error_code);
            break;
        }

        case DEVICE_CMD_STOP_ECG: {
            // The session-end callback clears the active session and publishes
            // ECG_SESSION_END once the queued chunks have drained.
            if (s_ecg_duration_timer != NULL) {
                esp_timer_stop(s_ecg_duration_timer);
            }
            ecg_ad8232_stop_with_reason(ECG_STOP_REASON_STOPPED);
            device_comm_publish_command_ack(cmd->command_id, "STOP_ECG", "COMPLETED", NULL);
            break;
        }

        case DEVICE_CMD_START_SPO2: {
            // MAX30102 and MLX90614 share the I2C bus. Keep one sensor mode
            // active at a time so the selected test owns the bus and stale
            // readings from another mode are not produced.
            mlx90614_stop_continuous();
            esp_err_t err = max30102_start();
            device_comm_publish_command_ack(cmd->command_id, "START_SPO2",
                                            err == ESP_OK ? "ACCEPTED" : "REJECTED",
                                            err == ESP_OK ? NULL : "SENSOR_UNAVAILABLE");
            break;
        }

        case DEVICE_CMD_STOP_SPO2: {
            max30102_stop();
            device_comm_publish_command_ack(cmd->command_id, "STOP_SPO2", "COMPLETED", NULL);
            break;
        }

        case DEVICE_CMD_START_TEMPERATURE: {
            max30102_stop();
            mlx90614_start_continuous(temperature_callback, NULL);
            bool started = mlx90614_is_running();
            device_comm_publish_command_ack(cmd->command_id, "START_TEMPERATURE",
                                            started ? "ACCEPTED" : "REJECTED",
                                            started ? NULL : "SENSOR_UNAVAILABLE");
            break;
        }

        case DEVICE_CMD_STOP_TEMPERATURE: {
            mlx90614_stop_continuous();
            device_comm_publish_command_ack(cmd->command_id, "STOP_TEMPERATURE", "COMPLETED", NULL);
            break;
        }

        case DEVICE_CMD_GET_STATUS: {
            device_comm_publish_status();
            device_comm_publish_command_ack(cmd->command_id, "GET_STATUS", "COMPLETED", NULL);
            break;
        }

        case DEVICE_CMD_UNKNOWN: {
            // Reachable now that the parser dispatches unrecognised names
            // instead of dropping them, so the operator sees a rejection
            // rather than a request that never resolves.
            ESP_LOGW(TAG, "Rejecting unsupported command: %s", cmd->command_name);
            device_comm_publish_command_ack(cmd->command_id, "UNKNOWN", "REJECTED", "INVALID_COMMAND");
            break;
        }

        default:
            break;
    }
}

// ─── WiFi / MQTT Event Callbacks ─────────────────────────────────

static void wifi_event_callback(app_wifi_event_t event, void *arg)
{
    (void)arg;
    
    switch (event) {
        case APP_WIFI_EVENT_CONNECTED:
            ESP_LOGI(TAG, "Wi-Fi connected, syncing time and starting MQTT");
            sntp_sync_init();
            mqtt_client_start();
            break;
            
        case APP_WIFI_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "Wi-Fi disconnected");
            break;
            
        default:
            break;
    }
}

static void mqtt_event_callback(mqtt_event_type_t event, void *data, void *arg)
{
    (void)arg;

    switch (event) {
        case APP_MQTT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "MQTT connected — subscribing to commands, starting sensors");
            device_comm_subscribe_to_commands();
            device_comm_start_periodic_status();

            // Auto-start sensors for development convenience
            max30102_set_callback(spo2_data_callback, NULL);
            max30102_start();
            mlx90614_start_continuous(temperature_callback, NULL);
            break;

        case APP_MQTT_EVENT_DATA:
            device_comm_handle_mqtt_data((mqtt_event_data_t *)data);
            break;

        case APP_MQTT_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "MQTT disconnected");
            device_comm_stop_periodic_status();
            break;

        default:
            break;
    }
}

// ─── Main Entry Point ────────────────────────────────────────────

void app_main(void)
{
    ESP_LOGI(TAG, "=== Health Device Starting ===");
    
    // 1. Device identity (MAC-based IDs)
    device_identity_init();
    
    // 2. Initialize I2C bus ONCE (shared by OLED, MAX30102, MLX90614)
    i2c_bus_init();
    
    // 3. Initialize peripherals (all use the shared I2C bus)
    oled_ssd1306_set_bus_handle(s_i2c_bus_handle);
    oled_ssd1306_init();
    max30102_set_bus_handle(s_i2c_bus_handle);
    mlx90614_set_bus_handle(s_i2c_bus_handle);
    buzzer_init();
    buzzer_beep(120);
    buttons_init();
    local_ui_init(device_identity_status()->pairing_code);
    
    // 4. Initialize sensors
    ecg_ad8232_init();
    ecg_ad8232_set_callback(ecg_data_callback, NULL);
    ecg_ad8232_set_session_end_callback(ecg_session_end_callback, NULL);

    max30102_init();
    // MAX30102 callback is set when MQTT connects (in mqtt_event_callback)

    mlx90614_init();
    // MLX90614 continuous mode starts when MQTT connects

    // 5. Networking.
    //
    // Order matters: wifi_manager_start() can raise APP_WIFI_EVENT_CONNECTED
    // before app_main returns, and that handler calls mqtt_client_start(). MQTT
    // and device_comm must therefore be fully configured *first* — otherwise
    // the client starts unconfigured, or connects with no command handler and
    // no device id, and the first commands are dropped on the floor.
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    wifi_manager_init();
    wifi_manager_set_event_callback(wifi_event_callback, NULL);

    const health_device_status_t *status = device_identity_status();

    mqtt_config_t mqtt_config = {
        .broker_url = CONFIG_MQTT_BROKER_URI,
        .client_id = status->hardware_id,
        .username = NULL,
        .password = NULL,
        .cert_pem = NULL,
        .use_tls = false
    };
    mqtt_client_init(&mqtt_config);
    mqtt_client_set_event_callback(mqtt_event_callback, NULL);

    // 6. Device communication (MQTT serialization + command handling)
    device_comm_init();
    device_comm_set_device_id(status->device_id);
    device_comm_set_command_handler(handle_device_command, NULL);

    // Everything downstream of a connection is now wired up.
    wifi_manager_start();

    // 7. Status LED blinker
    device_status_task_start();
    
    ESP_LOGI(TAG, "=== Device Ready ===");
    ESP_LOGI(TAG, "firmware=%s protocol=%d hardware=%s pairing=%s device_id=%s",
             APP_FIRMWARE_VERSION,
             APP_PROTOCOL_VERSION,
             status->hardware_id,
             status->pairing_code,
             status->device_id);
    ESP_LOGI(TAG, "MQTT broker: %s", CONFIG_MQTT_BROKER_URI);
    
    oled_display_state_t display_state = {
        .current_screen = MENU_HOME,
        .device_status = "Ready"
    };
    oled_set_display_state(&display_state);
    
    // Main loop — just keep alive
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
