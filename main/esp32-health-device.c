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
#include "device_comm.h"
#include "esp_log.h"
#include "esp_sntp.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "app";

// ─── SNTP Time Sync ──────────────────────────────────────────────
static void sntp_sync_init(void)
{
    ESP_LOGI(TAG, "Initializing SNTP for time sync");
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();
}

// ─── Centralized I2C Bus Init ────────────────────────────────────
static void i2c_bus_init(void)
{
    i2c_config_t i2c_config = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = APP_I2C_SDA_IO,
        .scl_io_num = APP_I2C_SCL_IO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master = {
            .clk_speed = APP_I2C_FREQ_HZ
        }
    };
    ESP_ERROR_CHECK(i2c_param_config(APP_I2C_MASTER_NUM, &i2c_config));
    ESP_ERROR_CHECK(i2c_driver_install(APP_I2C_MASTER_NUM, I2C_MODE_MASTER, 0, 0, 0));
    ESP_LOGI(TAG, "I2C bus initialized: SDA=%d SCL=%d", APP_I2C_SDA_IO, APP_I2C_SCL_IO);
}

// ─── Sensor Callbacks → MQTT ─────────────────────────────────────

static void temperature_callback(mlx90614_temp_t *temp, void *arg)
{
    (void)arg;
    if (temp != NULL && temp->valid) {
        ESP_LOGI(TAG, "Temperature: %.2f C", temp->object_temp_c);
        device_comm_publish_measurement("TEMPERATURE", temp->object_temp_c, "C", "VALID", NULL);
    }
}

static void spo2_data_callback(max30102_sample_t *sample, max30102_metrics_t *metrics, void *arg)
{
    (void)arg;
    (void)sample;
    static uint32_t publish_counter = 0;
    publish_counter++;
    
    // Publish every ~2 seconds (100 samples at ~50Hz)
    if (publish_counter % 100 == 0 && metrics != NULL) {
        if (metrics->heart_rate > 0) {
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
        char session_id_str[37];
        snprintf(session_id_str, sizeof(session_id_str), "%lu", (unsigned long)ecg_ad8232_get_current_session());
        device_comm_publish_ecg_chunk(session_id_str, chunk->sequence, ECG_SAMPLE_RATE, chunk->samples, ECG_CHUNK_SIZE);
    }
}

// ─── Device Command Handler ─────────────────────────────────────

static void handle_device_command(device_command_received_t *cmd, void *arg)
{
    (void)arg;
    
    switch (cmd->command) {
        case DEVICE_CMD_START_ECG: {
            uint32_t session_id = (uint32_t)xTaskGetTickCount();
            ecg_ad8232_start(session_id);
            device_comm_publish_command_ack(cmd->command_id, "START_ECG", "ACCEPTED", NULL);
            break;
        }
        
        case DEVICE_CMD_STOP_ECG: {
            ecg_ad8232_stop();
            device_comm_publish_command_ack(cmd->command_id, "STOP_ECG", "COMPLETED", NULL);
            break;
        }
        
        case DEVICE_CMD_START_SPO2: {
            max30102_start();
            device_comm_publish_command_ack(cmd->command_id, "START_SPO2", "ACCEPTED", NULL);
            break;
        }
        
        case DEVICE_CMD_STOP_SPO2: {
            max30102_stop();
            device_comm_publish_command_ack(cmd->command_id, "STOP_SPO2", "COMPLETED", NULL);
            break;
        }
        
        case DEVICE_CMD_START_TEMPERATURE: {
            mlx90614_start_continuous(temperature_callback, NULL);
            device_comm_publish_command_ack(cmd->command_id, "START_TEMPERATURE", "ACCEPTED", NULL);
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
    (void)arg; (void)data;
    
    switch (event) {
        case APP_MQTT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "MQTT connected — starting sensors and status reporting");
            device_comm_start_periodic_status();
            
            // Auto-start sensors for development convenience
            max30102_set_callback(spo2_data_callback, NULL);
            max30102_start();
            mlx90614_start_continuous(temperature_callback, NULL);
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
    oled_ssd1306_init();
    buttons_init();
    
    // 4. Initialize sensors
    ecg_ad8232_init();
    ecg_ad8232_set_callback(ecg_data_callback, NULL);
    
    max30102_init();
    // MAX30102 callback is set when MQTT connects (in mqtt_event_callback)
    
    mlx90614_init();
    // MLX90614 continuous mode starts when MQTT connects
    
    // 5. WiFi + MQTT
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    
    wifi_manager_init();
    wifi_manager_set_event_callback(wifi_event_callback, NULL);
    wifi_manager_start();
    
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
