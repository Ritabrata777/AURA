#include "max30102.h"
#include "app_config.h"

#include <string.h>
#include <math.h>
#include "esp_log.h"
#include "driver/i2c.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "max30102";

// I2C bus is initialized once in app_main — we only use it here.
#define I2C_MASTER_NUM APP_I2C_MASTER_NUM

#define MAX30102_INT_PIN GPIO_NUM_34
#define MAX30102_FIFO_SAMPLES 16

#define MAX30102_REG_INT_STATUS1 0x00
#define MAX30102_REG_INT_STATUS2 0x01
#define MAX30102_REG_INT_ENABLE1 0x02
#define MAX30102_REG_INT_ENABLE2 0x03
#define MAX30102_REG_FIFO_WR_PTR 0x04
#define MAX30102_REG_OVF_COUNTER 0x05
#define MAX30102_REG_FIFO_RD_PTR 0x06
#define MAX30102_REG_FIFO_DATA 0x07
#define MAX30102_REG_FIFO_CONFIG 0x08
#define MAX30102_REG_MODE_CONFIG 0x09
#define MAX30102_REG_SPO2_CONFIG 0x0A
#define MAX30102_REG_LED1_PA 0x0C
#define MAX30102_REG_LED2_PA 0x0D
#define MAX30102_REG_PILOT_PA 0x10
#define MAX30102_REG_MULTI_LED_CTRL 0x11
#define MAX30102_REG_TEMP_INTR 0x1F
#define MAX30102_REG_TEMP_FRAC 0x20
#define MAX30102_REG_TEMP_CONFIG 0x21
#define MAX30102_REG_REV_ID 0xFE
#define MAX30102_REG_CHIP_ID 0xFF

#define MAX30102_CHIP_ID_VALUE 0x15

// Simple peak detection for heart rate
#define HR_BUFFER_SIZE 150    // ~3 seconds at 50 Hz effective rate
#define HR_MIN_PEAK_INTERVAL 15  // Min 15 samples between peaks (~40bpm floor)
#define HR_THRESHOLD_RATIO 0.6f

typedef struct {
    spo2_state_t state;
    TaskHandle_t task_handle;
    spo2_data_callback_t callback;
    void *callback_arg;
    max30102_metrics_t latest_metrics;
    uint32_t sample_count;
    // HR peak detection
    uint32_t ir_buffer[HR_BUFFER_SIZE];
    size_t ir_buf_idx;
    uint32_t last_peak_idx;
    // SpO2 R-value accumulation
    float sum_red_ac;
    float sum_red_dc;
    float sum_ir_ac;
    float sum_ir_dc;
    uint32_t ratio_count;
} max30102_driver_t;

static max30102_driver_t s_driver = {0};

static esp_err_t max30102_write_reg(uint8_t reg, uint8_t value)
{
    uint8_t buffer[2] = {reg, value};
    return i2c_master_write_to_device(I2C_MASTER_NUM, MAX30102_I2C_ADDRESS, 
                                       buffer, 2, pdMS_TO_TICKS(100));
}

static esp_err_t max30102_read_reg(uint8_t reg, uint8_t *value)
{
    return i2c_master_write_read_device(I2C_MASTER_NUM, MAX30102_I2C_ADDRESS,
                                         &reg, 1, value, 1, pdMS_TO_TICKS(100));
}

static esp_err_t max30102_read_fifo_data(uint32_t *ir, uint32_t *red)
{
    uint8_t buffer[6];
    uint8_t reg = MAX30102_REG_FIFO_DATA;
    esp_err_t ret = i2c_master_write_read_device(I2C_MASTER_NUM, MAX30102_I2C_ADDRESS,
                                                  &reg, 1, buffer, 6, 
                                                  pdMS_TO_TICKS(100));
    if (ret == ESP_OK) {
        *red = ((uint32_t)buffer[0] << 16) | ((uint32_t)buffer[1] << 8) | buffer[2];
        *ir  = ((uint32_t)buffer[3] << 16) | ((uint32_t)buffer[4] << 8) | buffer[5];
    }
    return ret;
}

// Simple moving-average based peak detection for heart rate
static void process_sample_for_hr(uint32_t ir_value, max30102_metrics_t *metrics)
{
    s_driver.ir_buffer[s_driver.ir_buf_idx % HR_BUFFER_SIZE] = ir_value;
    s_driver.ir_buf_idx++;
    
    if (s_driver.ir_buf_idx < HR_BUFFER_SIZE) {
        return; // Not enough data yet
    }
    
    // Find max in recent window
    uint32_t max_val = 0, min_val = UINT32_MAX;
    for (int i = 0; i < HR_BUFFER_SIZE; i++) {
        if (s_driver.ir_buffer[i] > max_val) max_val = s_driver.ir_buffer[i];
        if (s_driver.ir_buffer[i] < min_val) min_val = s_driver.ir_buffer[i];
    }
    
    uint32_t threshold = min_val + (uint32_t)((max_val - min_val) * HR_THRESHOLD_RATIO);
    size_t current_idx = (s_driver.ir_buf_idx - 1) % HR_BUFFER_SIZE;
    size_t prev_idx = (current_idx == 0) ? HR_BUFFER_SIZE - 1 : current_idx - 1;
    
    // Detect rising edge crossing threshold
    if (s_driver.ir_buffer[current_idx] > threshold && 
        s_driver.ir_buffer[prev_idx] <= threshold &&
        (s_driver.ir_buf_idx - s_driver.last_peak_idx) > HR_MIN_PEAK_INTERVAL) {
        
        uint32_t interval = s_driver.ir_buf_idx - s_driver.last_peak_idx;
        s_driver.last_peak_idx = s_driver.ir_buf_idx;
        
        // Convert interval to BPM (assuming ~50 Hz effective sample rate)
        float bpm = 60.0f * 50.0f / (float)interval;
        
        if (bpm > 30.0f && bpm < 220.0f) {
            // Simple IIR filter for smoothing
            metrics->heart_rate = (uint16_t)(0.7f * metrics->heart_rate + 0.3f * bpm);
            if (metrics->heart_rate == 0) {
                metrics->heart_rate = (uint16_t)bpm;
            }
        }
    }
}

// Simple SpO2 from R-value: SpO2 = 110 - 25 * R
static void process_sample_for_spo2(uint32_t red, uint32_t ir, max30102_metrics_t *metrics)
{
    // Use simple DC component (running average)
    float red_dc = (float)red;
    float ir_dc = (float)ir;
    
    s_driver.sum_red_dc += red_dc;
    s_driver.sum_ir_dc += ir_dc;
    s_driver.ratio_count++;
    
    if (s_driver.ratio_count >= 100) {
        float avg_red = s_driver.sum_red_dc / s_driver.ratio_count;
        float avg_ir = s_driver.sum_ir_dc / s_driver.ratio_count;
        
        if (avg_ir > 1000 && avg_red > 1000) {
            float ratio = (avg_red / avg_ir);
            float spo2 = 110.0f - 25.0f * ratio;
            
            if (spo2 > 100.0f) spo2 = 100.0f;
            if (spo2 < 70.0f) spo2 = 70.0f;
            
            metrics->spo2 = (uint8_t)spo2;
            metrics->spo2_valid = true;
        }
        
        s_driver.sum_red_dc = 0;
        s_driver.sum_ir_dc = 0;
        s_driver.ratio_count = 0;
    }
}

static void max30102_task(void *arg)
{
    (void)arg;
    max30102_sample_t samples[MAX30102_FIFO_SAMPLES];
    size_t samples_read = 0;
    
    while (s_driver.state == SPO2_STATE_RUNNING) {
        if (max30102_read_fifo(samples, MAX30102_FIFO_SAMPLES, &samples_read) == ESP_OK) {
            for (size_t i = 0; i < samples_read; i++) {
                process_sample_for_hr(samples[i].ir, &s_driver.latest_metrics);
                process_sample_for_spo2(samples[i].red, samples[i].ir, &s_driver.latest_metrics);
                
                if (s_driver.callback != NULL) {
                    s_driver.callback(&samples[i], &s_driver.latest_metrics, s_driver.callback_arg);
                }
                
                s_driver.sample_count++;
            }
        }
        
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    
    s_driver.state = SPO2_STATE_IDLE;
    vTaskDelete(NULL);
}

void max30102_init(void)
{
    ESP_LOGI(TAG, "Initializing MAX30102 sensor");
    
    // I2C bus is already initialized in app_main — skip duplicate init
    
    uint8_t chip_id = 0;
    esp_err_t ret = max30102_read_reg(MAX30102_REG_CHIP_ID, &chip_id);
    
    if (ret == ESP_OK && chip_id == MAX30102_CHIP_ID_VALUE) {
        ESP_LOGI(TAG, "MAX30102 found, chip ID: 0x%02X", chip_id);
    } else {
        ESP_LOGW(TAG, "MAX30102 not found or wrong chip ID: 0x%02X (continuing without)", chip_id);
        s_driver.state = SPO2_STATE_ERROR;
        return;
    }
    
    max30102_write_reg(MAX30102_REG_INT_ENABLE1, 0xC0);
    max30102_write_reg(MAX30102_REG_INT_ENABLE2, 0x00);
    max30102_write_reg(MAX30102_REG_FIFO_WR_PTR, 0x00);
    max30102_write_reg(MAX30102_REG_OVF_COUNTER, 0x00);
    max30102_write_reg(MAX30102_REG_FIFO_RD_PTR, 0x00);
    max30102_write_reg(MAX30102_REG_FIFO_CONFIG, 0x4F);  // Sample avg=4, FIFO rollover
    max30102_write_reg(MAX30102_REG_MODE_CONFIG, 0x03);   // SpO2 mode
    max30102_write_reg(MAX30102_REG_SPO2_CONFIG, 0x27);   // 100 sps, 411us, 18-bit
    max30102_write_reg(MAX30102_REG_LED1_PA, 0x24);       // Red LED
    max30102_write_reg(MAX30102_REG_LED2_PA, 0x24);       // IR LED
    max30102_write_reg(MAX30102_REG_PILOT_PA, 0x7F);
    
    ESP_LOGI(TAG, "MAX30102 configured for SpO2 and HR monitoring");
}

esp_err_t max30102_start(void)
{
    if (s_driver.state == SPO2_STATE_ERROR) {
        ESP_LOGW(TAG, "MAX30102 not available");
        return ESP_ERR_INVALID_STATE;
    }
    if (s_driver.state == SPO2_STATE_RUNNING) {
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, "Starting MAX30102 measurement");
    
    max30102_write_reg(MAX30102_REG_MODE_CONFIG, 0x03);
    
    // Reset HR/SpO2 accumulators
    memset(&s_driver.latest_metrics, 0, sizeof(max30102_metrics_t));
    s_driver.ir_buf_idx = 0;
    s_driver.last_peak_idx = 0;
    s_driver.sum_red_dc = 0;
    s_driver.sum_ir_dc = 0;
    s_driver.ratio_count = 0;
    
    s_driver.state = SPO2_STATE_RUNNING;
    s_driver.sample_count = 0;
    
    xTaskCreate(max30102_task, "max30102_task", 4096, NULL, 5, &s_driver.task_handle);
    
    return ESP_OK;
}

void max30102_stop(void)
{
    if (s_driver.state != SPO2_STATE_RUNNING) {
        return;
    }
    
    ESP_LOGI(TAG, "Stopping MAX30102 measurement");
    
    s_driver.state = SPO2_STATE_STOPPING;
    max30102_write_reg(MAX30102_REG_MODE_CONFIG, 0x00);
    
    // Let the task self-delete
    if (s_driver.task_handle != NULL) {
        s_driver.task_handle = NULL;
    }
}

bool max30102_is_running(void)
{
    return s_driver.state == SPO2_STATE_RUNNING;
}

void max30102_set_callback(spo2_data_callback_t callback, void *arg)
{
    s_driver.callback = callback;
    s_driver.callback_arg = arg;
}

esp_err_t max30102_read_fifo(max30102_sample_t *samples, size_t max_samples, size_t *read_count)
{
    uint8_t fifo_wr_ptr = 0, fifo_rd_ptr = 0;
    
    max30102_read_reg(MAX30102_REG_FIFO_WR_PTR, &fifo_wr_ptr);
    max30102_read_reg(MAX30102_REG_FIFO_RD_PTR, &fifo_rd_ptr);
    
    *read_count = (fifo_wr_ptr - fifo_rd_ptr) & 0x0F;
    
    if (*read_count > max_samples) {
        *read_count = max_samples;
    }
    
    for (size_t i = 0; i < *read_count; i++) {
        max30102_read_fifo_data(&samples[i].ir, &samples[i].red);
    }
    
    return ESP_OK;
}

esp_err_t max30102_get_metrics(max30102_metrics_t *metrics)
{
    if (metrics == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    memcpy(metrics, &s_driver.latest_metrics, sizeof(max30102_metrics_t));
    return ESP_OK;
}
