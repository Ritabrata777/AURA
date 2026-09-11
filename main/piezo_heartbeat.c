#include "piezo_heartbeat.h"

#include "app_config.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define PIEZO_MIN_INTERVAL_MS 300
#define PIEZO_MAX_INTERVAL_MS 2000
#define PIEZO_REFRACTORY_MS 250
#define PIEZO_TIMEOUT_MS 5000
#define PIEZO_SMOOTHING_COUNT 5

static const char *TAG = "piezo_heartbeat";
static TaskHandle_t s_task;
static volatile bool s_running;
static volatile uint32_t s_edge_count;
static volatile int64_t s_last_edge_us;
static piezo_heartbeat_callback_t s_callback;
static void *s_callback_arg;

static void IRAM_ATTR piezo_isr(void *arg)
{
    (void)arg;
    int64_t now = esp_timer_get_time();
    if (now - s_last_edge_us >= (int64_t)PIEZO_REFRACTORY_MS * 1000) {
        s_last_edge_us = now;
        s_edge_count++;
        BaseType_t higher_priority_task_woken = pdFALSE;
        if (s_task != NULL) {
            vTaskNotifyGiveFromISR(s_task, &higher_priority_task_woken);
        }
        if (higher_priority_task_woken) {
            portYIELD_FROM_ISR();
        }
    }
}

static void piezo_report(int bpm, bool valid)
{
    if (s_callback != NULL) {
        s_callback(bpm, valid, s_callback_arg);
    }
}

static void piezo_task(void *arg)
{
    (void)arg;
    uint32_t handled_edges = 0;
    int64_t previous_accepted_edge_us = 0;
    int samples[PIEZO_SMOOTHING_COUNT] = {0};
    size_t sample_count = 0;
    size_t sample_index = 0;
    int64_t last_valid_us = 0;
    bool unavailable_reported = false;

    while (true) {
        ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(250));

        if (!s_running) {
            continue;
        }

        uint32_t edges = s_edge_count;
        if (edges != handled_edges) {
            handled_edges = edges;
            int64_t edge_us = s_last_edge_us;
            if (previous_accepted_edge_us != 0) {
                int64_t interval_ms = (edge_us - previous_accepted_edge_us) / 1000;
                if (interval_ms >= PIEZO_MIN_INTERVAL_MS && interval_ms <= PIEZO_MAX_INTERVAL_MS) {
                    int bpm = (int)(60000 / interval_ms);
                    samples[sample_index] = bpm;
                    sample_index = (sample_index + 1) % PIEZO_SMOOTHING_COUNT;
                    if (sample_count < PIEZO_SMOOTHING_COUNT) sample_count++;

                    int total = 0;
                    for (size_t i = 0; i < sample_count; i++) total += samples[i];
                    int smoothed = total / (int)sample_count;
                    last_valid_us = edge_us;
                    unavailable_reported = false;
                    ESP_LOGI(TAG, "Piezo pulse: %d bpm (interval=%lld ms)", smoothed, interval_ms);
                    piezo_report(smoothed, true);
                } else {
                    ESP_LOGD(TAG, "Rejected piezo interval: %lld ms", interval_ms);
                }
            }
            previous_accepted_edge_us = edge_us;
        }

        if (last_valid_us != 0 && !unavailable_reported &&
            esp_timer_get_time() - last_valid_us > (int64_t)PIEZO_TIMEOUT_MS * 1000) {
            unavailable_reported = true;
            sample_count = 0;
            sample_index = 0;
            piezo_report(0, false);
            ESP_LOGW(TAG, "No valid piezo heartbeat for %d ms", PIEZO_TIMEOUT_MS);
        }
    }
}

void piezo_heartbeat_init(void)
{
    gpio_config_t config = {
        .pin_bit_mask = 1ULL << HEARTBEAT_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_POSEDGE,
    };
    ESP_ERROR_CHECK(gpio_config(&config));
    ESP_ERROR_CHECK(gpio_install_isr_service(ESP_INTR_FLAG_IRAM));
    ESP_ERROR_CHECK(gpio_isr_handler_add(HEARTBEAT_GPIO, piezo_isr, NULL));
    if (xTaskCreate(piezo_task, "piezo_heartbeat", 3072, NULL, 5, &s_task) != pdPASS) {
        ESP_LOGE(TAG, "Could not create heartbeat processing task");
        s_task = NULL;
    }
    ESP_LOGI(TAG, "Piezo heartbeat initialized: GPIO=%d", HEARTBEAT_GPIO);
}

void piezo_heartbeat_set_callback(piezo_heartbeat_callback_t callback, void *arg)
{
    s_callback = callback;
    s_callback_arg = arg;
}

void piezo_heartbeat_start(void) { s_running = true; }
void piezo_heartbeat_stop(void) { s_running = false; }
bool piezo_heartbeat_is_running(void) { return s_running; }
