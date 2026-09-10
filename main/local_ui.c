#include "local_ui.h"

#include <stdio.h>
#include <string.h>

#include "buzzer.h"
#include "buttons.h"
#include "oled_ssd1306.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

static const char *TAG = "local_ui";

typedef enum {
    LOCAL_SCREEN_HOME,
    LOCAL_SCREEN_SPO2,
    LOCAL_SCREEN_TEMP,
    LOCAL_SCREEN_ECG,
    LOCAL_SCREEN_COLOR,
} local_screen_t;

typedef struct {
    button_event_t event;
} local_ui_event_t;

static QueueHandle_t s_event_queue;
static local_screen_t s_screen = LOCAL_SCREEN_HOME;
static max30102_metrics_t s_spo2 = {0};
static mlx90614_temp_t s_temp = {0};
static int16_t s_ecg_samples[SSD1306_WIDTH] = {0};
static size_t s_ecg_count = 0;
static tcs34725_reading_t s_color = {0};
static bool s_spo2_running = false;
static bool s_temp_running = false;

static const char *local_ui_screen_name(void)
{
    switch (s_screen) {
        case LOCAL_SCREEN_SPO2: return "VITALS";
        case LOCAL_SCREEN_TEMP: return "TEMP";
        case LOCAL_SCREEN_ECG: return "ECG";
        case LOCAL_SCREEN_COLOR: return "COLOR";
        default: return "HOME";
    }
}

static void local_ui_draw_header(void)
{
    char header[22];
    snprintf(header, sizeof(header), "%s  %d/5", local_ui_screen_name(), (int)s_screen + 1);
    oled_draw_text(2, 0, header, 1);
    oled_draw_line(0, 9, SSD1306_WIDTH - 1, 9);
}

static void local_ui_draw_footer(const char *action, bool running)
{
    char footer[22];
    snprintf(footer, sizeof(footer), "UP:NEXT  SEL:%s", running ? "STOP" : action);
    oled_draw_line(0, 55, SSD1306_WIDTH - 1, 55);
    oled_draw_string_centered(57, footer, 1);
}

static void local_ui_button_callback(button_event_t event, void *arg)
{
    (void)arg;
    if (s_event_queue == NULL) {
        return;
    }
    local_ui_event_t message = {.event = event};
    (void)xQueueSend(s_event_queue, &message, 0);
}

static void local_ui_draw_full(void)
{
    char line[24];
    oled_clear_framebuffer();
    local_ui_draw_header();

    switch (s_screen) {
        case LOCAL_SCREEN_HOME:
            oled_draw_string_centered(17, "Pulse Link", 1);
            oled_draw_string_centered(36, "HEALTH MONITOR", 1);
            local_ui_draw_footer("OPEN", false);
            break;

        case LOCAL_SCREEN_SPO2:
            if (s_spo2.hr_valid) {
                snprintf(line, sizeof(line), "%d", s_spo2.heart_rate);
            } else {
                snprintf(line, sizeof(line), "--");
            }
            oled_draw_text(5, 16, line, 3);
            oled_draw_text(5, 43, "BPM", 1);

            if (s_spo2.spo2_valid) {
                snprintf(line, sizeof(line), "%d%%", s_spo2.spo2);
            } else {
                snprintf(line, sizeof(line), "--");
            }
            oled_draw_text(80, 20, line, 2);
            oled_draw_text(76, 43, "SPO2", 1);
            local_ui_draw_footer("START", s_spo2_running);
            break;

        case LOCAL_SCREEN_TEMP:
            if (s_temp.valid) {
                snprintf(line, sizeof(line), "%.1f C", s_temp.object_temp_c);
                oled_draw_string_centered(17, line, 2);
            } else {
                oled_draw_string_centered(17, "--.- C", 2);
            }
            local_ui_draw_footer("START", s_temp_running);
            break;

        case LOCAL_SCREEN_ECG:
            if (s_ecg_count > 0) {
                oled_draw_ecg_waveform(s_ecg_samples, s_ecg_count);
            } else {
                oled_draw_string_centered(19, "PLACE ELECTRODES", 1);
                oled_draw_string_centered(34, "THEN SELECT", 1);
            }
            local_ui_draw_footer("START", ecg_ad8232_is_running());
            break;

        case LOCAL_SCREEN_COLOR:
            if (s_color.valid) {
                snprintf(line, sizeof(line), "R:%u G:%u", s_color.red, s_color.green);
                oled_draw_text(8, 16, line, 1);
                snprintf(line, sizeof(line), "B:%u C:%u", s_color.blue, s_color.clear);
                oled_draw_text(8, 28, line, 1);
                oled_draw_string_centered(42, "COLOR READY", 1);
            } else {
                oled_draw_string_centered(25, "SENSOR OFFLINE", 1);
            }
            local_ui_draw_footer("READ", false);
            break;
    }

    oled_flush();
}

static void local_ui_draw_values(void)
{
    char line[24];

    switch (s_screen) {
        case LOCAL_SCREEN_SPO2:
            oled_clear_area(0, 8, SSD1306_WIDTH, 24);
            if (s_spo2.hr_valid) {
                snprintf(line, sizeof(line), "HR %d", s_spo2.heart_rate);
            } else {
                snprintf(line, sizeof(line), "HR --");
            }
            oled_draw_text(4, 13, line, 2);

            if (s_spo2.spo2_valid) {
                snprintf(line, sizeof(line), "O2 %d%%", s_spo2.spo2);
            } else {
                snprintf(line, sizeof(line), "O2 --");
            }
            oled_draw_text(68, 13, line, 2);
            break;

        case LOCAL_SCREEN_TEMP:
            oled_clear_area(0, 16, SSD1306_WIDTH, 32);
            if (s_temp.valid) {
                snprintf(line, sizeof(line), "%.1f C", s_temp.object_temp_c);
                oled_draw_string_centered(18, line, 3);
            } else {
                oled_draw_string_centered(23, "--.- C", 2);
            }
            break;

        case LOCAL_SCREEN_COLOR:
            oled_clear_area(0, 16, SSD1306_WIDTH, 24);
            if (s_color.valid) {
                snprintf(line, sizeof(line), "R:%u G:%u", s_color.red, s_color.green);
                oled_draw_text(8, 17, line, 1);
                snprintf(line, sizeof(line), "B:%u C:%u", s_color.blue, s_color.clear);
                oled_draw_text(8, 29, line, 1);
            } else {
                oled_draw_string_centered(28, "SENSOR OFFLINE", 1);
            }
            break;

        default:
            return;
    }

    oled_flush_dirty();
}

static void local_ui_stop_measurement(void)
{
    if (ecg_ad8232_is_running()) {
        ecg_ad8232_stop();
    }
    if (s_screen == LOCAL_SCREEN_SPO2) {
        max30102_stop();
        s_spo2_running = false;
    }
    if (s_screen == LOCAL_SCREEN_TEMP) {
        mlx90614_stop_continuous();
        s_temp_running = false;
    }
}

static void local_ui_start_measurement(void)
{
    bool running = false;
    if (s_screen == LOCAL_SCREEN_ECG) {
        running = ecg_ad8232_is_running();
    } else if (s_screen == LOCAL_SCREEN_SPO2) {
        running = s_spo2_running;
    } else if (s_screen == LOCAL_SCREEN_TEMP) {
        running = s_temp_running;
    }

    if (running) {
        local_ui_stop_measurement();
        local_ui_draw_full();
        return;
    }

    switch (s_screen) {
        case LOCAL_SCREEN_SPO2:
            max30102_start();
            s_spo2_running = true;
            break;
        case LOCAL_SCREEN_TEMP:
            mlx90614_start_continuous(NULL, NULL);
            s_temp_running = true;
            break;
        case LOCAL_SCREEN_ECG:
            s_ecg_count = 0;
            ecg_ad8232_start();
            break;
        default:
            break;
    }
    local_ui_draw_full();
}

static void local_ui_task(void *arg)
{
    (void)arg;
    local_ui_event_t message;

    while (true) {
        if (xQueueReceive(s_event_queue, &message, pdMS_TO_TICKS(250)) == pdTRUE) {
            switch (message.event) {
                case BUTTON_EVENT_UP_SHORT:
                    local_ui_stop_measurement();
                    s_screen = (local_screen_t)((s_screen + 1) % 5);
                    local_ui_draw_full();
                    break;
                case BUTTON_EVENT_SELECT_SHORT:
                    local_ui_start_measurement();
                    break;
                case BUTTON_EVENT_UP_LONG:
                case BUTTON_EVENT_SELECT_LONG:
                    local_ui_stop_measurement();
                    s_screen = LOCAL_SCREEN_HOME;
                    local_ui_draw_full();
                    break;
                default:
                    break;
            }
        }

        // Refresh only the changing numeric values; static labels and button
        // hints stay untouched so the screen no longer flashes on every update.
        if (s_screen == LOCAL_SCREEN_SPO2 || s_screen == LOCAL_SCREEN_TEMP ||
            s_screen == LOCAL_SCREEN_COLOR) {
            local_ui_draw_full();
        } else if (s_screen == LOCAL_SCREEN_ECG && ecg_ad8232_is_running()) {
            local_ui_draw_full();
        }
    }
}

void local_ui_init(const char *pairing_code)
{
    if (pairing_code != NULL) {
        ESP_LOGI(TAG, "Showing pairing code %s for 5 seconds", pairing_code);
        oled_show_device_id_with_countdown(pairing_code, 5);
    }

    s_event_queue = xQueueCreate(8, sizeof(local_ui_event_t));
    if (s_event_queue == NULL) {
        ESP_LOGE(TAG, "Could not create local UI event queue");
        return;
    }

    buttons_set_callback(local_ui_button_callback, NULL);
    xTaskCreate(local_ui_task, "local_ui", 4096, NULL, 4, NULL);
    local_ui_draw_full();
}

void local_ui_set_spo2(const max30102_metrics_t *metrics)
{
    if (metrics != NULL) {
        s_spo2 = *metrics;
    }
}

void local_ui_set_temperature(const mlx90614_temp_t *temp)
{
    if (temp != NULL) {
        s_temp = *temp;
    }
}

void local_ui_set_ecg_chunk(const ecg_chunk_t *chunk)
{
    if (chunk == NULL) {
        return;
    }
    size_t count = ECG_CHUNK_SIZE < SSD1306_WIDTH ? ECG_CHUNK_SIZE : SSD1306_WIDTH;
    memcpy(s_ecg_samples, chunk->samples, count * sizeof(s_ecg_samples[0]));
    s_ecg_count = count;
}

void local_ui_set_color(const tcs34725_reading_t *reading)
{
    if (reading != NULL) {
        s_color = *reading;
    }
}
