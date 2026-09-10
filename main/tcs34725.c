#include "tcs34725.h"

#include "app_config.h"
#include "driver/i2c_master.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "tcs34725";

#define TCS_CMD 0x80
#define TCS_REG_ENABLE 0x00
#define TCS_REG_ATIME 0x01
#define TCS_REG_CONTROL 0x0F
#define TCS_REG_ID 0x12
#define TCS_REG_CDATA 0x14

static i2c_master_dev_handle_t s_device;
static i2c_master_bus_handle_t s_bus;
static TaskHandle_t s_task;
static tcs34725_callback_t s_callback;
static void *s_callback_arg;
static bool s_available;

static esp_err_t tcs_write(uint8_t reg, uint8_t value)
{
    uint8_t data[] = {TCS_CMD | reg, value};
    return i2c_master_transmit(s_device, data, sizeof(data), pdMS_TO_TICKS(200));
}

static esp_err_t tcs_read_registers(uint8_t reg, uint8_t *data, size_t length)
{
    // Bit 5 enables the TCS34725 auto-increment protocol for a block read.
    uint8_t command = TCS_CMD | (length > 1 ? 0x20 : 0x00) | reg;
    return i2c_master_transmit_receive(s_device, &command, 1, data, length,
                                       pdMS_TO_TICKS(200));
}

esp_err_t tcs34725_read(tcs34725_reading_t *reading)
{
    if (reading == NULL || !s_available) {
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t data[8] = {0};
    esp_err_t err = tcs_read_registers(TCS_REG_CDATA, data, sizeof(data));
    if (err != ESP_OK) {
        reading->valid = false;
        return err;
    }

    reading->clear = (uint16_t)data[0] | ((uint16_t)data[1] << 8);
    reading->red = (uint16_t)data[2] | ((uint16_t)data[3] << 8);
    reading->green = (uint16_t)data[4] | ((uint16_t)data[5] << 8);
    reading->blue = (uint16_t)data[6] | ((uint16_t)data[7] << 8);
    reading->valid = true;
    return ESP_OK;
}

static void tcs_task(void *arg)
{
    (void)arg;
    tcs34725_reading_t reading;

    while (true) {
        if (tcs34725_read(&reading) == ESP_OK && s_callback != NULL) {
            s_callback(&reading, s_callback_arg);
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

void tcs34725_set_bus_handle(void *bus_handle)
{
    s_bus = (i2c_master_bus_handle_t)bus_handle;
}

void tcs34725_init(void)
{
    if (s_bus == NULL) {
        ESP_LOGE(TAG, "I2C bus handle not set");
        return;
    }

    i2c_device_config_t config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = TCS34725_I2C_ADDRESS,
        .scl_speed_hz = APP_I2C_FREQ_HZ,
    };

    esp_err_t err = i2c_master_bus_add_device(s_bus, &config, &s_device);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "Could not add device: %s", esp_err_to_name(err));
        return;
    }

    uint8_t id = 0;
    err = tcs_read_registers(TCS_REG_ID, &id, 1);
    if (err != ESP_OK || (id != 0x44 && id != 0x4D)) {
        ESP_LOGW(TAG, "TCS34725 not found, id=0x%02X", id);
        return;
    }

    // 50 ms integration, 4x gain. These raw channels become model features;
    // no hemoglobin value is inferred until a validated model is supplied.
    ESP_ERROR_CHECK(tcs_write(TCS_REG_ATIME, 0xEB));
    ESP_ERROR_CHECK(tcs_write(TCS_REG_CONTROL, 0x01));
    ESP_ERROR_CHECK(tcs_write(TCS_REG_ENABLE, 0x01));
    vTaskDelay(pdMS_TO_TICKS(3));
    ESP_ERROR_CHECK(tcs_write(TCS_REG_ENABLE, 0x03));
    vTaskDelay(pdMS_TO_TICKS(60));

    s_available = true;
    ESP_LOGI(TAG, "TCS34725 ready at 0x%02X", TCS34725_I2C_ADDRESS);
}

esp_err_t tcs34725_start(tcs34725_callback_t callback, void *arg)
{
    if (!s_available) {
        return ESP_ERR_INVALID_STATE;
    }
    if (s_task != NULL) {
        return ESP_OK;
    }

    s_callback = callback;
    s_callback_arg = arg;
    if (xTaskCreate(tcs_task, "tcs34725_task", 3072, NULL, 4, &s_task) != pdPASS) {
        s_task = NULL;
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

void tcs34725_stop(void)
{
    if (s_task != NULL) {
        vTaskDelete(s_task);
        s_task = NULL;
    }
    if (s_available) {
        tcs_write(TCS_REG_ENABLE, 0x00);
    }
}

bool tcs34725_is_running(void)
{
    return s_task != NULL;
}
