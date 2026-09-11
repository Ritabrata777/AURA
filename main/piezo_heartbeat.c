#include "piezo_heartbeat.h"

#include "adc_bus.h"
#include "app_config.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define PIEZO_ADC_UNIT ADC_UNIT_1
#define PIEZO_ADC_CHANNEL ADC_CHANNEL_7
#define PIEZO_ADC_ATTEN ADC_ATTEN_DB_12
#define PIEZO_ADC_BITWIDTH ADC_BITWIDTH_12

#define PIEZO_SAMPLE_RATE_HZ 200
#define PIEZO_SAMPLE_PERIOD_MS (1000 / PIEZO_SAMPLE_RATE_HZ)
#define PIEZO_STATS_PERIOD_MS 1000
#define PIEZO_MIN_INTERVAL_MS 300
#define PIEZO_MAX_INTERVAL_MS 2000
#define PIEZO_REFRACTORY_MS 280
#define PIEZO_TIMEOUT_MS 5000
#define PIEZO_REQUIRED_BEATS 3
#define PIEZO_BPM_SMOOTHING_COUNT 5
#define PIEZO_MIN_SIGNAL_SPAN 35
#define PIEZO_THRESHOLD_FLOOR 18

static const char *TAG = "piezo_heartbeat";

static adc_oneshot_unit_handle_t s_adc_handle;
static TaskHandle_t s_task;
static volatile bool s_running;
static bool s_adc_initialized;
static piezo_heartbeat_callback_t s_callback;
static void *s_callback_arg;

static void piezo_report(int bpm, bool valid)
{
    if (s_callback != NULL) {
        s_callback(bpm, valid, s_callback_arg);
    }
}

static int piezo_adc_read(void)
{
    int raw = 0;
    if (!s_adc_initialized ||
        adc_oneshot_read(s_adc_handle, PIEZO_ADC_CHANNEL, &raw) != ESP_OK) {
        return -1;
    }
    return raw;
}

static void piezo_task(void *arg)
{
    (void)arg;
    float baseline = 0.0f;
    float envelope = 0.0f;
    int stats_min = 4095;
    int stats_max = 0;
    int64_t stats_sum = 0;
    int stats_count = 0;
    int64_t last_stats_us = esp_timer_get_time();
    int64_t last_beat_us = 0;
    int64_t last_valid_us = 0;
    bool above_threshold = false;
    bool no_signal_reported = false;
    int bpm_samples[PIEZO_BPM_SMOOTHING_COUNT] = {0};
    size_t bpm_count = 0;
    size_t bpm_index = 0;

    while (true) {
        if (!s_running) {
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }

        int raw = piezo_adc_read();
        int64_t now_us = esp_timer_get_time();
        if (raw < 0) {
            ESP_LOGW(TAG, "PIEZO: ADC read failed");
            piezo_report(0, false);
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
        }

        if (stats_count == 0) {
            baseline = (float)raw;
        }

        baseline += ((float)raw - baseline) * 0.01f;
        float ac = (float)raw - baseline;
        if (ac < 0.0f) {
            ac = -ac;
        }
        envelope += (ac - envelope) * 0.20f;

        if (raw < stats_min) stats_min = raw;
        if (raw > stats_max) stats_max = raw;
        stats_sum += raw;
        stats_count++;

        int signal_span = stats_max - stats_min;
        float adaptive_threshold = envelope * 1.8f;
        if (adaptive_threshold < PIEZO_THRESHOLD_FLOOR) {
            adaptive_threshold = PIEZO_THRESHOLD_FLOOR;
        }
        bool signal_present = signal_span >= PIEZO_MIN_SIGNAL_SPAN;
        bool over_threshold = signal_present && ac > adaptive_threshold;

        if (over_threshold && !above_threshold &&
            (last_beat_us == 0 ||
             now_us - last_beat_us >= (int64_t)PIEZO_REFRACTORY_MS * 1000)) {
            if (last_beat_us != 0) {
                int64_t interval_ms = (now_us - last_beat_us) / 1000;
                if (interval_ms >= PIEZO_MIN_INTERVAL_MS &&
                    interval_ms <= PIEZO_MAX_INTERVAL_MS) {
                    int bpm = (int)(60000 / interval_ms);
                    bpm_samples[bpm_index] = bpm;
                    bpm_index = (bpm_index + 1) % PIEZO_BPM_SMOOTHING_COUNT;
                    if (bpm_count < PIEZO_BPM_SMOOTHING_COUNT) {
                        bpm_count++;
                    }

                    ESP_LOGI(TAG, "PIEZO: BEAT DETECTED");

                    if (bpm_count >= PIEZO_REQUIRED_BEATS) {
                        int total = 0;
                        for (size_t i = 0; i < bpm_count; i++) {
                            total += bpm_samples[i];
                        }
                        int smoothed = total / (int)bpm_count;
                        ESP_LOGI(TAG, "PIEZO: BPM=%d", smoothed);
                        piezo_report(smoothed, true);
                        last_valid_us = now_us;
                        no_signal_reported = false;
                    }
                } else {
                    ESP_LOGD(TAG, "PIEZO: rejected interval=%lld ms", interval_ms);
                }
            }
            last_beat_us = now_us;
        }
        above_threshold = over_threshold;

        if (now_us - last_stats_us >= (int64_t)PIEZO_STATS_PERIOD_MS * 1000) {
            int avg = stats_count > 0 ? (int)(stats_sum / stats_count) : raw;
            ESP_LOGI(TAG, "PIEZO: ADC=%d min=%d max=%d avg=%d",
                     raw, stats_min, stats_max, avg);

            if (!signal_present && !no_signal_reported) {
                ESP_LOGW(TAG, "PIEZO: NO SIGNAL");
                piezo_report(0, false);
                no_signal_reported = true;
                bpm_count = 0;
                bpm_index = 0;
            }

            stats_min = 4095;
            stats_max = 0;
            stats_sum = 0;
            stats_count = 0;
            last_stats_us = now_us;
        }

        if (last_valid_us != 0 &&
            now_us - last_valid_us > (int64_t)PIEZO_TIMEOUT_MS * 1000) {
            last_valid_us = 0;
            bpm_count = 0;
            bpm_index = 0;
            piezo_report(0, false);
            ESP_LOGW(TAG, "PIEZO: waiting for valid heartbeat");
        }

        vTaskDelay(pdMS_TO_TICKS(PIEZO_SAMPLE_PERIOD_MS));
    }
}

esp_err_t piezo_heartbeat_init(void)
{
    if (HEARTBEAT_GPIO != GPIO_NUM_35) {
        ESP_LOGW(TAG, "PIEZO: configured GPIO=%d, expected ADC1_CH7 GPIO35", HEARTBEAT_GPIO);
    }

    esp_err_t err = adc_bus_init();
    if (err != ESP_OK) {
        return err;
    }
    s_adc_handle = adc_bus_get_handle();

    adc_oneshot_chan_cfg_t channel_config = {
        .atten = PIEZO_ADC_ATTEN,
        .bitwidth = PIEZO_ADC_BITWIDTH,
    };
    err = adc_oneshot_config_channel(s_adc_handle, PIEZO_ADC_CHANNEL, &channel_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "PIEZO: ADC channel config failed: %s", esp_err_to_name(err));
        return err;
    }

    s_adc_initialized = true;

    if (xTaskCreate(piezo_task, "piezo_heartbeat", 4096, NULL, 4, &s_task) != pdPASS) {
        ESP_LOGE(TAG, "Could not create heartbeat processing task");
        s_task = NULL;
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "PIEZO: ADC initialized GPIO=%d unit=%d channel=%d atten=%d sample_rate=%d Hz",
             HEARTBEAT_GPIO, PIEZO_ADC_UNIT, PIEZO_ADC_CHANNEL,
             PIEZO_ADC_ATTEN, PIEZO_SAMPLE_RATE_HZ);
    return ESP_OK;
}

void piezo_heartbeat_set_callback(piezo_heartbeat_callback_t callback, void *arg)
{
    s_callback = callback;
    s_callback_arg = arg;
}

void piezo_heartbeat_start(void)
{
    if (!s_adc_initialized) {
        ESP_LOGW(TAG, "PIEZO: cannot start, ADC not initialized");
        return;
    }
    if (!s_running) {
        s_running = true;
        ESP_LOGI(TAG, "PIEZO: sampling started");
    }
}

void piezo_heartbeat_stop(void)
{
    if (s_running) {
        s_running = false;
        piezo_report(0, false);
        ESP_LOGI(TAG, "PIEZO: sampling stopped");
    }
}

bool piezo_heartbeat_is_running(void)
{
    return s_running;
}
