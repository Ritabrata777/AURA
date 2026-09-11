#include "sensor_state.h"

#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "sensor";

static sensor_state_t s_state;
static SemaphoreHandle_t s_mutex;

void sensor_state_init(void)
{
    memset(&s_state, 0, sizeof(s_state));
    s_mutex = xSemaphoreCreateMutex();
    if (s_mutex == NULL) {
        ESP_LOGE(TAG, "Could not create sensor state mutex");
    }
}

void sensor_state_get(sensor_state_t *out)
{
    if (out == NULL || s_mutex == NULL) {
        if (out != NULL) {
            memset(out, 0, sizeof(*out));
        }
        return;
    }
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    *out = s_state;
    xSemaphoreGive(s_mutex);
}

void sensor_state_set_max30102(int hr, bool hr_valid,
                               int spo2, bool spo2_valid,
                               float temp_c, bool temp_valid)
{
    if (s_mutex == NULL) {
        return;
    }
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    s_state.max30102_hr = hr_valid ? hr : 0;
    s_state.max30102_hr_valid = hr_valid;
    s_state.max30102_spo2 = spo2_valid ? spo2 : 0;
    s_state.max30102_spo2_valid = spo2_valid;
    s_state.max30102_temp_c = temp_c;
    s_state.max30102_temp_valid = temp_valid;
    xSemaphoreGive(s_mutex);
}

void sensor_state_set_piezo(int bpm, bool valid)
{
    if (s_mutex == NULL) {
        return;
    }
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    s_state.piezo_hr = valid ? bpm : 0;
    s_state.piezo_valid = valid;
    xSemaphoreGive(s_mutex);
}

void sensor_state_set_ecg_running(bool running)
{
    if (s_mutex == NULL) {
        return;
    }
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    s_state.ecg_running = running;
    if (!running) {
        s_state.ecg_waveform_count = 0;
    }
    xSemaphoreGive(s_mutex);
}

void sensor_state_ecg_append(const int16_t *samples, size_t count)
{
    if (samples == NULL || count == 0 || s_mutex == NULL) {
        return;
    }

    xSemaphoreTake(s_mutex, portMAX_DELAY);
    size_t existing = s_state.ecg_waveform_count;
    if (existing > SENSOR_ECG_WAVEFORM_MAX) {
        existing = SENSOR_ECG_WAVEFORM_MAX;
    }

    // If a chunk is bigger than the buffer, keep only its newest samples.
    size_t append = (count < SENSOR_ECG_WAVEFORM_MAX) ? count : SENSOR_ECG_WAVEFORM_MAX;
    const int16_t *src = samples + (count - append);

    size_t retain = existing;
    if (retain + append > SENSOR_ECG_WAVEFORM_MAX) {
        retain = SENSOR_ECG_WAVEFORM_MAX - append;
    }

    if (retain > 0 && existing > retain) {
        memmove(s_state.ecg_waveform,
                s_state.ecg_waveform + (existing - retain),
                retain * sizeof(s_state.ecg_waveform[0]));
    }
    memcpy(s_state.ecg_waveform + retain, src, append * sizeof(s_state.ecg_waveform[0]));
    s_state.ecg_waveform_count = retain + append;
    xSemaphoreGive(s_mutex);
}
