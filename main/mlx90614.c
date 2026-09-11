#include "mlx90614.h"
#include "app_config.h"

#include <string.h>
#include "esp_log.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "mlx90614";

static i2c_master_dev_handle_t s_device;

#define MLX90614_REG_TA 0x06
#define MLX90614_REG_TOBJ1 0x07

// Give up after this many consecutive failed reads (~10 s).
#define MLX90614_MAX_CONSECUTIVE_ERRORS 10

// Plausible range for a contactless body/object reading. Values outside it
// mean a bad I2C read or the sensor pointing at something else entirely, and
// must not be published as a valid vital sign.
#define MLX90614_MIN_VALID_C (-40.0f)
#define MLX90614_MAX_VALID_C 125.0f

typedef struct {
    temp_state_t state;
    TaskHandle_t task_handle;
    temp_data_callback_t callback;
    void *callback_arg;
    mlx90614_temp_t latest_temp;
} mlx90614_driver_t;

static mlx90614_driver_t s_driver = {0};

void mlx90614_set_bus_handle(void *bus_handle)
{
    i2c_master_bus_handle_t bus = (i2c_master_bus_handle_t)bus_handle;

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = MLX90614_I2C_ADDRESS,
        .scl_speed_hz = 100000,
    };

    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus, &dev_cfg, &s_device));
    ESP_LOGI(TAG, "MLX90614 device added to I2C bus");
}

static esp_err_t mlx90614_read_word(uint8_t reg, uint16_t *value)
{
    uint8_t buffer[3];
    esp_err_t ret = i2c_master_transmit_receive(s_device, &reg, 1, buffer, 3, pdMS_TO_TICKS(100));
    if (ret != ESP_OK) {
        return ret;
    }
    
    *value = buffer[0] | (buffer[1] << 8);
    return ESP_OK;
}

esp_err_t mlx90614_read_temperature(mlx90614_temp_t *temp)
{
    if (temp == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    uint16_t ta_raw = 0, tobj_raw = 0;
    
    esp_err_t ret = mlx90614_read_word(MLX90614_REG_TA, &ta_raw);
    if (ret != ESP_OK) {
        return ret;
    }
    
    ret = mlx90614_read_word(MLX90614_REG_TOBJ1, &tobj_raw);
    if (ret != ESP_OK) {
        return ret;
    }
    
    temp->ambient_temp_c = ((float)ta_raw * 0.02f) - 273.15f;
    temp->object_temp_c = ((float)tobj_raw * 0.02f) - 273.15f;

    // The datasheet's linear conversion happily turns a corrupt word into a
    // number like -273 C. `valid` was hardcoded true, so those went straight
    // out as measurements.
    temp->valid = temp->object_temp_c >= MLX90614_MIN_VALID_C &&
                  temp->object_temp_c <= MLX90614_MAX_VALID_C;

    if (!temp->valid) {
        ESP_LOGW(TAG, "Discarding implausible temperature: %.2f C", temp->object_temp_c);
        return ESP_ERR_INVALID_RESPONSE;
    }

    ESP_LOGD(TAG, "Temp: object=%.2f C, ambient=%.2f C",
             temp->object_temp_c, temp->ambient_temp_c);

    return ESP_OK;
}

static void mlx90614_task(void *arg)
{
    (void)arg;
    mlx90614_temp_t temp = {0};
    uint32_t consecutive_errors = 0;

    while (s_driver.state == TEMP_STATE_RUNNING) {
        if (mlx90614_read_temperature(&temp) == ESP_OK) {
            consecutive_errors = 0;
            memcpy(&s_driver.latest_temp, &temp, sizeof(mlx90614_temp_t));

            if (s_driver.callback != NULL) {
                s_driver.callback(&temp, s_driver.callback_arg);
            }
        } else {
            ESP_LOGW(TAG, "Failed to read temperature");
            // Never let a stale reading look current.
            s_driver.latest_temp.valid = false;
            temp.valid = false;

            if (++consecutive_errors >= MLX90614_MAX_CONSECUTIVE_ERRORS) {
                ESP_LOGE(TAG, "MLX90614 unreachable — stopping continuous mode");
                break;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    if (s_driver.state != TEMP_STATE_ERROR) {
        s_driver.state = TEMP_STATE_IDLE;
    }
    s_driver.task_handle = NULL;
    vTaskDelete(NULL);
}

void mlx90614_init(void)
{
    ESP_LOGI(TAG, "Initializing MLX90614 temperature sensor");
    
    // I2C bus is already initialized in app_main — skip duplicate init
    
    uint16_t temp_raw = 0;
    esp_err_t ret = mlx90614_read_word(MLX90614_REG_TA, &temp_raw);
    
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "MLX90614 found");
    } else {
        ESP_LOGW(TAG, "MLX90614 not found or communication error (continuing without)");
        s_driver.state = TEMP_STATE_ERROR;
        return;
    }
}

void mlx90614_start_continuous(temp_data_callback_t callback, void *arg)
{
    if (s_driver.state == TEMP_STATE_ERROR) {
        ESP_LOGW(TAG, "MLX90614 not available");
        return;
    }
    if (s_driver.state == TEMP_STATE_RUNNING) {
        return;
    }
    // Stop only asks the task to finish; it can still be inside its 1 s delay.
    // Restarting here used to leave two tasks polling the same sensor.
    if (s_driver.task_handle != NULL) {
        ESP_LOGW(TAG, "MLX90614 is still stopping — ignoring start");
        return;
    }

    ESP_LOGI(TAG, "Starting continuous temperature measurement");

    s_driver.callback = callback;
    s_driver.callback_arg = arg;
    s_driver.state = TEMP_STATE_RUNNING;

    if (xTaskCreate(mlx90614_task, "mlx90614_task", 3072, NULL, 5, &s_driver.task_handle) != pdPASS) {
        s_driver.task_handle = NULL;
        s_driver.state = TEMP_STATE_IDLE;
        ESP_LOGE(TAG, "Could not create MLX90614 task");
    }
}

void mlx90614_stop_continuous(void)
{
    if (s_driver.state != TEMP_STATE_RUNNING) {
        return;
    }

    ESP_LOGI(TAG, "Stopping continuous temperature measurement");

    // The task settles the state to IDLE and clears its handle on the way out.
    s_driver.state = TEMP_STATE_STOPPING;
}

bool mlx90614_is_running(void)
{
    return s_driver.state == TEMP_STATE_RUNNING;
}
