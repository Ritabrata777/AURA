#include "mlx90614.h"
#include "app_config.h"

#include <string.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "mlx90614";

// I2C bus is initialized once in app_main
#define I2C_MASTER_NUM APP_I2C_MASTER_NUM

#define MLX90614_REG_TA 0x06
#define MLX90614_REG_TOBJ1 0x07

typedef struct {
    temp_state_t state;
    TaskHandle_t task_handle;
    temp_data_callback_t callback;
    void *callback_arg;
    mlx90614_temp_t latest_temp;
} mlx90614_driver_t;

static mlx90614_driver_t s_driver = {0};

static esp_err_t mlx90614_read_word(uint8_t reg, uint16_t *value)
{
    uint8_t buffer[3];
    esp_err_t ret = i2c_master_write_read_device(I2C_MASTER_NUM, MLX90614_I2C_ADDRESS,
                                                  &reg, 1, buffer, 3, pdMS_TO_TICKS(100));
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
    temp->valid = true;
    
    ESP_LOGD(TAG, "Temp: object=%.2f C, ambient=%.2f C", 
             temp->object_temp_c, temp->ambient_temp_c);
    
    return ESP_OK;
}

static void mlx90614_task(void *arg)
{
    (void)arg;
    mlx90614_temp_t temp = {0};
    
    while (s_driver.state == TEMP_STATE_RUNNING) {
        if (mlx90614_read_temperature(&temp) == ESP_OK) {
            memcpy(&s_driver.latest_temp, &temp, sizeof(mlx90614_temp_t));
            
            if (s_driver.callback != NULL) {
                s_driver.callback(&temp, s_driver.callback_arg);
            }
        } else {
            ESP_LOGW(TAG, "Failed to read temperature");
        }
        
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
    
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
    
    ESP_LOGI(TAG, "Starting continuous temperature measurement");
    
    s_driver.callback = callback;
    s_driver.callback_arg = arg;
    s_driver.state = TEMP_STATE_RUNNING;
    
    xTaskCreate(mlx90614_task, "mlx90614_task", 3072, NULL, 5, &s_driver.task_handle);
}

void mlx90614_stop_continuous(void)
{
    if (s_driver.state != TEMP_STATE_RUNNING) {
        return;
    }
    
    ESP_LOGI(TAG, "Stopping continuous temperature measurement");
    
    s_driver.state = TEMP_STATE_IDLE;
    // Let task self-delete
}

bool mlx90614_is_running(void)
{
    return s_driver.state == TEMP_STATE_RUNNING;
}
