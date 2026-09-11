#include "max30102.h"
#include "app_config.h"
#include "i2c_bus.h"

#include <string.h>
#include <math.h>
#include "esp_log.h"
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "max30102";

static i2c_master_dev_handle_t s_device;
static i2c_master_bus_handle_t s_bus;

#define MAX30102_INT_PIN GPIO_NUM_34
#define MAX30102_FIFO_SAMPLES 16
// Give up on the sensor after this many back-to-back I2C failures (~1 s).
#define MAX30102_MAX_CONSECUTIVE_ERRORS 50

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
// Effective FIFO rate this driver actually sees: SPO2_CONFIG 0x27 sets a
// 100 sps sensor rate and FIFO_CONFIG 0x4F applies 4x on-chip averaging,
// which decimates the stream to 25 samples/s. Every time-based calculation
// below must use THIS rate — the old code assumed 50 Hz and reported heart
// rates at exactly twice their true value.
#define MAX30102_EFFECTIVE_SPS 25
#define HR_BUFFER_SIZE 150    // ~6 s of IR signal at the effective rate
// Refractory period between peaks: 8/25 s ≈ 0.32 s → detects up to ~190 bpm.
#define HR_MIN_PEAK_INTERVAL 8
#define HR_THRESHOLD_RATIO 0.6f
// Beyond this many samples without a peak (~4 s) the last rate is stale.
#define HR_STALE_AFTER_SAMPLES (4 * MAX30102_EFFECTIVE_SPS)
// Peak-to-peak floor below which the trace is sensor noise, not a pulse.
#define HR_MIN_AMPLITUDE 1000

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
    bool buffer_ready;
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
    esp_err_t err = i2c_bus_lock(200);
    if (err != ESP_OK) {
        return err;
    }
    err = i2c_master_transmit(s_device, buffer, sizeof(buffer), pdMS_TO_TICKS(100));
    i2c_bus_unlock();
    return err;
}

static esp_err_t max30102_read_reg(uint8_t reg, uint8_t *value)
{
    esp_err_t err = i2c_bus_lock(200);
    if (err != ESP_OK) {
        return err;
    }
    err = i2c_master_transmit_receive(s_device, &reg, 1, value, 1, pdMS_TO_TICKS(100));
    i2c_bus_unlock();
    return err;
}

static esp_err_t max30102_read_fifo_data(uint32_t *ir, uint32_t *red)
{
    uint8_t buffer[6];
    uint8_t reg = MAX30102_REG_FIFO_DATA;
    esp_err_t ret = i2c_bus_lock(200);
    if (ret != ESP_OK) {
        return ret;
    }
    ret = i2c_master_transmit_receive(s_device, &reg, 1, buffer, sizeof(buffer),
                                      pdMS_TO_TICKS(100));
    i2c_bus_unlock();
    if (ret == ESP_OK) {
        *red = ((uint32_t)buffer[0] << 16) | ((uint32_t)buffer[1] << 8) | buffer[2];
        *ir  = ((uint32_t)buffer[3] << 16) | ((uint32_t)buffer[4] << 8) | buffer[5];
    }
    return ret;
}

static esp_err_t max30102_read_temperature_c(float *temperature_c)
{
    if (temperature_c == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t err = max30102_write_reg(MAX30102_REG_TEMP_CONFIG, 0x01);
    if (err != ESP_OK) {
        return err;
    }

    vTaskDelay(pdMS_TO_TICKS(35));

    uint8_t integer_part = 0;
    uint8_t fraction_part = 0;
    err = max30102_read_reg(MAX30102_REG_TEMP_INTR, &integer_part);
    if (err != ESP_OK) {
        return err;
    }

    err = max30102_read_reg(MAX30102_REG_TEMP_FRAC, &fraction_part);
    if (err != ESP_OK) {
        return err;
    }

    *temperature_c = (float)((int8_t)integer_part) + (float)(fraction_part & 0x0F) * 0.0625f;
    return ESP_OK;
}

// Simple moving-average based peak detection for heart rate
static void process_sample_for_hr(uint32_t ir_value, max30102_metrics_t *metrics)
{
    s_driver.ir_buffer[s_driver.ir_buf_idx % HR_BUFFER_SIZE] = ir_value;
    s_driver.ir_buf_idx++;

    if (s_driver.ir_buf_idx < HR_BUFFER_SIZE) {
        metrics->hr_valid = false;
        return; // Not enough data yet — buffer still filling
    }
    s_driver.buffer_ready = true;

    // A rate computed from a beat several seconds ago is not a live reading.
    // Without this, hr_valid latched true after the first peak and the device
    // kept republishing a frozen number once the finger was removed.
    if (s_driver.ir_buf_idx - s_driver.last_peak_idx > HR_STALE_AFTER_SAMPLES) {
        metrics->hr_valid = false;
    }

    // Find max in recent window
    uint32_t max_val = 0, min_val = UINT32_MAX;
    for (int i = 0; i < HR_BUFFER_SIZE; i++) {
        if (s_driver.ir_buffer[i] > max_val) max_val = s_driver.ir_buffer[i];
        if (s_driver.ir_buffer[i] < min_val) min_val = s_driver.ir_buffer[i];
    }

    // A flat trace is noise, not a pulse — no finger on the sensor.
    if (max_val - min_val < HR_MIN_AMPLITUDE) {
        metrics->hr_valid = false;
        return;
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
        
        // Convert interval to BPM using the effective (post-averaging) rate
        float bpm = 60.0f * (float)MAX30102_EFFECTIVE_SPS / (float)interval;
        
        if (bpm > 30.0f && bpm < 220.0f) {
            // Simple IIR filter for smoothing
            metrics->heart_rate = (uint16_t)(0.7f * metrics->heart_rate + 0.3f * bpm);
            if (metrics->heart_rate == 0) {
                metrics->heart_rate = (uint16_t)bpm;
            }
            metrics->hr_valid = true;
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
        
        if (avg_ir > 1000 && avg_red > 1000 && avg_red < avg_ir * 3.0f) {
            float ratio = (avg_red / avg_ir);
            float spo2 = 110.0f - 25.0f * ratio;

            if (spo2 > 100.0f) spo2 = 100.0f;
            if (spo2 < 70.0f) spo2 = 70.0f;

            metrics->spo2 = (uint8_t)spo2;
            metrics->spo2_valid = true;
        } else {
            // Not enough signal separation — treat as unresolved rather than a
            // valid reading, so the platform doesn't persist garbage as data.
            metrics->spo2_valid = false;
        }
        
        s_driver.sum_red_dc = 0;
        s_driver.sum_ir_dc = 0;
        s_driver.ratio_count = 0;
    }
}

static void max30102_task(void *arg)
{
    (void)arg;
    max30102_sample_t samples[MAX30102_FIFO_SAMPLES] = {0};
    size_t samples_read = 0;
    uint32_t consecutive_errors = 0;

    while (s_driver.state == SPO2_STATE_RUNNING) {
        esp_err_t err = max30102_read_fifo(samples, MAX30102_FIFO_SAMPLES, &samples_read);

        if (err == ESP_OK) {
            consecutive_errors = 0;
            for (size_t i = 0; i < samples_read; i++) {
                process_sample_for_hr(samples[i].ir, &s_driver.latest_metrics);
                process_sample_for_spo2(samples[i].red, samples[i].ir, &s_driver.latest_metrics);
                s_driver.sample_count++;

                if (s_driver.sample_count % MAX30102_EFFECTIVE_SPS == 0) {
                    float temperature_c = 0.0f;
                    if (max30102_read_temperature_c(&temperature_c) == ESP_OK) {
                        s_driver.latest_metrics.temperature_c = temperature_c;
                        s_driver.latest_metrics.temp_valid = true;
                    } else {
                        s_driver.latest_metrics.temp_valid = false;
                    }
                }

                if (s_driver.callback != NULL) {
                    s_driver.callback(&samples[i], &s_driver.latest_metrics, s_driver.callback_arg);
                }
            }
        } else if (++consecutive_errors >= MAX30102_MAX_CONSECUTIVE_ERRORS) {
            // The sensor has gone away mid-session. Stop rather than spin on a
            // failing bus, and make sure nothing downstream treats the last
            // metrics as current.
            ESP_LOGE(TAG, "MAX30102 unreachable (%s) — stopping", esp_err_to_name(err));
            s_driver.latest_metrics.hr_valid = false;
            s_driver.latest_metrics.spo2_valid = false;
            break;
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }

    // Preserve ERROR; anything else settles back to IDLE.
    if (s_driver.state != SPO2_STATE_ERROR) {
        s_driver.state = SPO2_STATE_IDLE;
    }
    s_driver.task_handle = NULL;
    vTaskDelete(NULL);
}

void max30102_set_bus_handle(void *bus_handle)
{
    s_bus = (i2c_master_bus_handle_t)bus_handle;
}

void max30102_init(void)
{
    ESP_LOGI(TAG, "Initializing MAX30102 sensor");

    if (s_bus == NULL) {
        ESP_LOGE(TAG, "I2C bus handle not set");
        return;
    }

    i2c_device_config_t config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = MAX30102_I2C_ADDRESS,
        .scl_speed_hz = APP_I2C_FREQ_HZ,
    };
    if (i2c_master_bus_add_device(s_bus, &config, &s_device) != ESP_OK) {
        ESP_LOGE(TAG, "Could not add MAX30102 device");
        s_driver.state = SPO2_STATE_ERROR;
        return;
    }
    ESP_LOGI(TAG, "I2C: MAX30102 device registered");

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
    // A start arriving while the previous task is still winding down would
    // create a second reader on the same I2C device. This happened on every
    // MQTT reconnect, since connect auto-starts the sensors.
    if (s_driver.task_handle != NULL) {
        ESP_LOGW(TAG, "MAX30102 is still stopping — ignoring start");
        return ESP_ERR_INVALID_STATE;
    }

    ESP_LOGI(TAG, "Starting MAX30102 measurement");

    max30102_write_reg(MAX30102_REG_MODE_CONFIG, 0x03);

    // Reset HR/SpO2 accumulators
    memset(&s_driver.latest_metrics, 0, sizeof(max30102_metrics_t));
    s_driver.ir_buf_idx = 0;
    s_driver.last_peak_idx = 0;
    s_driver.buffer_ready = false;
    s_driver.sum_red_dc = 0;
    s_driver.sum_ir_dc = 0;
    s_driver.ratio_count = 0;

    s_driver.state = SPO2_STATE_RUNNING;
    s_driver.sample_count = 0;

    if (xTaskCreate(max30102_task, "max30102_task", 4096, NULL, 5, &s_driver.task_handle) != pdPASS) {
        s_driver.task_handle = NULL;
        s_driver.state = SPO2_STATE_IDLE;
        ESP_LOGE(TAG, "Could not create MAX30102 task");
        return ESP_ERR_NO_MEM;
    }

    return ESP_OK;
}

void max30102_stop(void)
{
    if (s_driver.state != SPO2_STATE_RUNNING) {
        return;
    }

    ESP_LOGI(TAG, "Stopping MAX30102 measurement");

    // The task observes this, settles the state and clears its own handle.
    s_driver.state = SPO2_STATE_STOPPING;
    max30102_write_reg(MAX30102_REG_MODE_CONFIG, 0x00);
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

/**
 * Drains up to `max_samples` entries from the sensor FIFO.
 *
 * Every I2C access is checked. The previous version ignored all of them and
 * still returned ESP_OK, so a disconnected sensor left `samples` holding
 * uninitialised stack bytes that the caller then published as VALID readings.
 */
esp_err_t max30102_read_fifo(max30102_sample_t *samples, size_t max_samples, size_t *read_count)
{
    if (samples == NULL || read_count == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    *read_count = 0;

    uint8_t fifo_wr_ptr = 0, fifo_rd_ptr = 0;

    esp_err_t err = max30102_read_reg(MAX30102_REG_FIFO_WR_PTR, &fifo_wr_ptr);
    if (err != ESP_OK) {
        return err;
    }

    err = max30102_read_reg(MAX30102_REG_FIFO_RD_PTR, &fifo_rd_ptr);
    if (err != ESP_OK) {
        return err;
    }

    size_t available = (size_t)((fifo_wr_ptr - fifo_rd_ptr) & 0x1F);
    if (available > max_samples) {
        available = max_samples;
    }

    for (size_t i = 0; i < available; i++) {
        err = max30102_read_fifo_data(&samples[i].ir, &samples[i].red);
        if (err != ESP_OK) {
            // Report what was actually read; the caller must not look past it.
            return (i > 0) ? ESP_OK : err;
        }
        *read_count = i + 1;
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
