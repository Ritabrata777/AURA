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
#define PIEZO_WARMUP_MS 1500
#define PIEZO_MIN_INTERVAL_MS 460
#define PIEZO_MAX_INTERVAL_MS 1500
#define PIEZO_REFRACTORY_MS 430
#define PIEZO_TIMEOUT_MS 5000
#define PIEZO_REQUIRED_BEATS 4
#define PIEZO_BPM_SMOOTHING_COUNT 5
#define PIEZO_MIN_SIGNAL_SPAN 18
#define PIEZO_MAX_SIGNAL_SPAN 1800
#define PIEZO_THRESHOLD_FLOOR 12
#define PIEZO_THRESHOLD_GAIN 2.6f
#define PIEZO_SATURATED_RAW_HIGH 4080
#define PIEZO_SATURATED_AVG_HIGH 4000
#define PIEZO_SATURATED_MIN_HIGH 3700
#define PIEZO_RAIL_LOW_AVG 180
#define PIEZO_RAIL_HIGH_AVG 3915
#define PIEZO_RAIL_MIN_P2P 45
#define PIEZO_FULL_RAIL_P2P 3800

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
    float noise_floor = 0.0f;
    bool baseline_ready = false;
    int stats_min = 4095;
    int stats_max = 0;
    int64_t stats_sum = 0;
    int stats_count = 0;
    int64_t last_stats_us = esp_timer_get_time();
    int64_t started_us = 0;
    int64_t last_beat_us = 0;
    int64_t last_valid_us = 0;
    int64_t previous_interval_ms = 0;
    bool above_threshold = false;
    bool no_signal_reported = false;
    bool saturated_reported = false;
    bool signal_usable = false;
    bool was_running = false;
    int signal_mode = 0;
    int bpm_samples[PIEZO_BPM_SMOOTHING_COUNT] = {0};
    size_t bpm_count = 0;
    size_t bpm_index = 0;

    while (true) {
        if (!s_running) {
            was_running = false;
            baseline_ready = false;
            above_threshold = false;
            no_signal_reported = false;
            saturated_reported = false;
            signal_usable = false;
            signal_mode = 0;
            stats_min = 4095;
            stats_max = 0;
            stats_sum = 0;
            stats_count = 0;
            last_beat_us = 0;
            last_valid_us = 0;
            previous_interval_ms = 0;
            bpm_count = 0;
            bpm_index = 0;
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }

        int raw = piezo_adc_read();
        int64_t now_us = esp_timer_get_time();
        if (!was_running) {
            was_running = true;
            started_us = now_us;
            last_stats_us = now_us;
            baseline_ready = false;
            noise_floor = 0.0f;
            ESP_LOGI(TAG, "PIEZO: waiting for signal");
        }

        if (raw < 0) {
            ESP_LOGW(TAG, "PIEZO: ADC read failed");
            piezo_report(0, false);
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
        }

        if (!baseline_ready) {
            baseline = (float)raw;
            baseline_ready = true;
        }

        if (signal_mode == 0) {
            baseline += ((float)raw - baseline) * 0.003f;
        } else {
            baseline += ((float)raw - baseline) * 0.0005f;
        }
        float ac = (float)raw - baseline;
        float magnitude = ac < 0.0f ? -ac : ac;
        if (signal_mode < 0) {
            magnitude = (float)raw;
        } else if (signal_mode > 0) {
            magnitude = (float)(4095 - raw);
        }
        noise_floor += (magnitude - noise_floor) * 0.02f;

        if (raw < stats_min) stats_min = raw;
        if (raw > stats_max) stats_max = raw;
        stats_sum += raw;
        stats_count++;

        int signal_span = stats_max - stats_min;
        float adaptive_threshold = noise_floor * PIEZO_THRESHOLD_GAIN;
        if (adaptive_threshold < PIEZO_THRESHOLD_FLOOR) {
            adaptive_threshold = PIEZO_THRESHOLD_FLOOR;
        }
        bool warm = now_us - started_us >= (int64_t)PIEZO_WARMUP_MS * 1000;
        bool signal_present = signal_span >= PIEZO_MIN_SIGNAL_SPAN &&
                              signal_span <= PIEZO_MAX_SIGNAL_SPAN;
        bool over_threshold = warm && signal_usable && magnitude > adaptive_threshold;

        if (over_threshold && !above_threshold &&
            (last_beat_us == 0 ||
             now_us - last_beat_us >= (int64_t)PIEZO_REFRACTORY_MS * 1000)) {
            if (last_beat_us != 0) {
                int64_t interval_ms = (now_us - last_beat_us) / 1000;
                if (interval_ms >= PIEZO_MIN_INTERVAL_MS &&
                    interval_ms <= PIEZO_MAX_INTERVAL_MS) {
                    bool consistent = previous_interval_ms == 0 ||
                                      (interval_ms >= previous_interval_ms * 65 / 100 &&
                                       interval_ms <= previous_interval_ms * 135 / 100);
                    if (consistent) {
                        int bpm = (int)(60000 / interval_ms);
                        bpm_samples[bpm_index] = bpm;
                        bpm_index = (bpm_index + 1) % PIEZO_BPM_SMOOTHING_COUNT;
                        if (bpm_count < PIEZO_BPM_SMOOTHING_COUNT) {
                            bpm_count++;
                        }

                        ESP_LOGI(TAG, "PIEZO: BEAT DETECTED interval=%lld ms", interval_ms);

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
                        previous_interval_ms = interval_ms;
                    } else {
                        ESP_LOGD(TAG, "PIEZO: rejected unstable interval=%lld ms previous=%lld ms",
                                 interval_ms, previous_interval_ms);
                        bpm_count = 0;
                        bpm_index = 0;
                        previous_interval_ms = interval_ms;
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
            int p2p = stats_max - stats_min;
            bool saturated_window = stats_max >= PIEZO_SATURATED_RAW_HIGH &&
                                    avg >= PIEZO_SATURATED_AVG_HIGH &&
                                    stats_min >= PIEZO_SATURATED_MIN_HIGH;
            bool low_rail_signal = avg <= PIEZO_RAIL_LOW_AVG &&
                                   p2p >= PIEZO_RAIL_MIN_P2P &&
                                   p2p <= PIEZO_MAX_SIGNAL_SPAN;
            bool high_rail_signal = avg >= PIEZO_RAIL_HIGH_AVG &&
                                    p2p >= PIEZO_RAIL_MIN_P2P &&
                                    p2p <= PIEZO_MAX_SIGNAL_SPAN;
            bool centered_signal = avg > PIEZO_RAIL_LOW_AVG &&
                                   avg < PIEZO_RAIL_HIGH_AVG &&
                                   p2p >= PIEZO_MIN_SIGNAL_SPAN &&
                                   p2p <= PIEZO_MAX_SIGNAL_SPAN;
            bool full_rail_jump = p2p >= PIEZO_FULL_RAIL_P2P;
            signal_mode = low_rail_signal ? -1 : (high_rail_signal ? 1 : 0);
            signal_usable = !full_rail_jump &&
                            (centered_signal || low_rail_signal || high_rail_signal);
            ESP_LOGI(TAG, "PIEZO: ADC=%d min=%d max=%d avg=%d p2p=%d noise=%d thr=%d",
                     raw, stats_min, stats_max, avg, p2p,
                     (int)noise_floor, (int)adaptive_threshold);

            if (saturated_window && !high_rail_signal) {
                if (!saturated_reported) {
                    ESP_LOGW(TAG, "PIEZO: ADC SATURATED - BPM DISABLED");
                    saturated_reported = true;
                }
                piezo_report(0, false);
                no_signal_reported = false;
                last_beat_us = 0;
                last_valid_us = 0;
                above_threshold = false;
                signal_usable = false;
                bpm_count = 0;
                bpm_index = 0;
            } else {
                saturated_reported = false;
            }

            if (full_rail_jump) {
                ESP_LOGW(TAG, "PIEZO: ADC rail-to-rail clipping - check conditioning");
                piezo_report(0, false);
                last_beat_us = 0;
                last_valid_us = 0;
                previous_interval_ms = 0;
                above_threshold = false;
                signal_usable = false;
                bpm_count = 0;
                bpm_index = 0;
            } else if (!saturated_window && !signal_usable && !no_signal_reported) {
                ESP_LOGW(TAG, "PIEZO: NO SIGNAL");
                piezo_report(0, false);
                no_signal_reported = true;
                bpm_count = 0;
                bpm_index = 0;
            } else if (low_rail_signal) {
                ESP_LOGI(TAG, "PIEZO: low-biased pulse signal detected");
                no_signal_reported = false;
            } else if (high_rail_signal) {
                ESP_LOGI(TAG, "PIEZO: high-biased pulse signal detected");
                no_signal_reported = false;
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
