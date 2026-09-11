#include "local_ui.h"

#include <stdio.h>

#include "buttons.h"
#include "oled_ssd1306.h"
#include "sensor_state.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

static const char *TAG = "local_ui";

// Render cadence. Fast enough for live numbers and a scrolling ECG trace,
// slow enough that the OLED flush (8 I2C page writes) leaves the shared
// bus mostly free for the MAX30102 FIFO reads.
#define LOCAL_UI_REFRESH_MS 200

typedef enum {
    LOCAL_SCREEN_HOME = 0,
    LOCAL_SCREEN_MAX30102,
    LOCAL_SCREEN_PIEZO,
    LOCAL_SCREEN_ECG,
    LOCAL_SCREEN_COUNT,
} local_screen_t;

typedef struct {
    button_event_t event;
} local_ui_event_t;

static QueueHandle_t s_event_queue;
static local_screen_t s_screen = LOCAL_SCREEN_HOME;

static const char *local_ui_screen_name(local_screen_t screen)
{
    switch (screen) {
        case LOCAL_SCREEN_MAX30102: return "MAX30102";
        case LOCAL_SCREEN_PIEZO:    return "PIEZO";
        case LOCAL_SCREEN_ECG:      return "ECG";
        default:                    return "HOME";
    }
}

// ─── Rendering (works only on the private state copy) ─────────────

static void local_ui_draw_header(void)
{
    char header[22];
    snprintf(header, sizeof(header), "%s  %d/%d", local_ui_screen_name(s_screen),
             (int)s_screen + 1, (int)LOCAL_SCREEN_COUNT);
    oled_draw_text(2, 0, header, 1);
    oled_draw_line(0, 9, SSD1306_WIDTH - 1, 9);
}

static void local_ui_draw_footer(void)
{
    oled_draw_line(0, 55, SSD1306_WIDTH - 1, 55);
    oled_draw_string_centered(57, "UP:NEXT  HOLD:HOME", 1);
}

static void draw_home(const sensor_state_t *st)
{
    char line[24];

    oled_draw_string_centered(13, "PULSE LINK", 1);

    if (st->max30102_hr_valid && st->max30102_hr > 0) {
        snprintf(line, sizeof(line), "HR: %d BPM", st->max30102_hr);
    } else {
        snprintf(line, sizeof(line), "HR: --");
    }
    oled_draw_text(8, 24, line, 1);

    if (st->max30102_spo2_valid && st->max30102_spo2 > 0) {
        snprintf(line, sizeof(line), "SPO2: %d%%", st->max30102_spo2);
    } else {
        snprintf(line, sizeof(line), "SPO2: --");
    }
    oled_draw_text(8, 33, line, 1);

    if (st->piezo_valid && st->piezo_hr > 0) {
        snprintf(line, sizeof(line), "PIEZO: %d BPM", st->piezo_hr);
    } else {
        snprintf(line, sizeof(line), "PIEZO: --");
    }
    oled_draw_text(8, 42, line, 1);

    snprintf(line, sizeof(line), "ECG: %s", st->ecg_running ? "ACTIVE" : "IDLE");
    oled_draw_text(8, 51, line, 1);
}

static void draw_max30102(const sensor_state_t *st)
{
    char line[16];

    if (st->max30102_hr_valid && st->max30102_hr > 0) {
        snprintf(line, sizeof(line), "%d", st->max30102_hr);
    } else {
        snprintf(line, sizeof(line), "--");
    }
    oled_draw_text(5, 14, line, 3);
    oled_draw_text(5, 44, "BPM", 1);

    if (st->max30102_spo2_valid && st->max30102_spo2 > 0) {
        snprintf(line, sizeof(line), "%d%%", st->max30102_spo2);
    } else {
        snprintf(line, sizeof(line), "--");
    }
    oled_draw_text(82, 18, line, 2);
    oled_draw_text(80, 40, "SPO2", 1);

    if (st->max30102_temp_valid) {
        snprintf(line, sizeof(line), "%.1fC", st->max30102_temp_c);
        oled_draw_text(78, 50, line, 1);
    }
}

static void draw_piezo(const sensor_state_t *st)
{
    char line[16];

    if (st->piezo_valid && st->piezo_hr > 0) {
        snprintf(line, sizeof(line), "%d", st->piezo_hr);
    } else {
        snprintf(line, sizeof(line), "--");
    }
    oled_draw_text(5, 14, line, 3);
    oled_draw_text(5, 44, "BPM", 1);

    oled_draw_text(74, 20, "STATUS", 1);
    if (st->piezo_valid) {
        oled_draw_text(74, 32, "ACTIVE", 1);
    } else {
        oled_draw_text(74, 32, "NO SIG", 1);
    }
}

static void draw_ecg(const sensor_state_t *st)
{
    if (st->ecg_running && st->ecg_waveform_count > 0) {
        oled_draw_ecg_waveform(st->ecg_waveform, st->ecg_waveform_count);
    } else {
        oled_draw_string_centered(24, "PLACE ELECTRODES", 1);
        oled_draw_string_centered(36, "START ECG VIA WEB", 1);
    }
}

// ─── UI task ──────────────────────────────────────────────────────

static void local_ui_button_callback(button_event_t event, void *arg)
{
    (void)arg;
    if (s_event_queue == NULL) {
        return;
    }
    local_ui_event_t message = {.event = event};
    (void)xQueueSend(s_event_queue, &message, 0);
}

static void local_ui_task(void *arg)
{
    (void)arg;
    local_ui_event_t message;
    uint32_t refresh_count = 0;

    while (true) {
        // Button events only select a screen; sensors are never touched.
        if (xQueueReceive(s_event_queue, &message, pdMS_TO_TICKS(LOCAL_UI_REFRESH_MS)) == pdTRUE) {
            switch (message.event) {
                case BUTTON_EVENT_UP_SHORT:
                case BUTTON_EVENT_SELECT_SHORT:
                    s_screen = (local_screen_t)((s_screen + 1) % LOCAL_SCREEN_COUNT);
                    ESP_LOGI(TAG, "Screen changed to %s", local_ui_screen_name(s_screen));
                    break;

                case BUTTON_EVENT_UP_LONG:
                case BUTTON_EVENT_SELECT_LONG:
                    s_screen = LOCAL_SCREEN_HOME;
                    ESP_LOGI(TAG, "Screen changed to HOME");
                    break;

                default:
                    break;
            }
        }

        // Snapshot the shared state under its lock, then render from the
        // copy — no lock is held during the slow OLED I2C flush, so sensor
        // tasks keep updating the state while the display draws.
        sensor_state_t state;
        sensor_state_get(&state);

        oled_clear_framebuffer();
        local_ui_draw_header();
        switch (s_screen) {
            case LOCAL_SCREEN_MAX30102: draw_max30102(&state); break;
            case LOCAL_SCREEN_PIEZO:    draw_piezo(&state);    break;
            case LOCAL_SCREEN_ECG:      draw_ecg(&state);      break;
            case LOCAL_SCREEN_HOME:     draw_home(&state);     break;
            default:                    draw_home(&state);     break;
        }
        if (s_screen != LOCAL_SCREEN_HOME) {
            local_ui_draw_footer();
        }
        oled_flush();

        // Heartbeat log (every ~2 s) proving the display keeps refreshing
        // regardless of which screen is shown or which buttons are pressed.
        refresh_count++;
        if (refresh_count % 10 == 0) {
            ESP_LOGI(TAG, "Displaying %s: MAX30102 HR=%d SpO2=%d piezo HR=%d",
                     local_ui_screen_name(s_screen),
                     state.max30102_hr_valid ? state.max30102_hr : 0,
                     state.max30102_spo2_valid ? state.max30102_spo2 : 0,
                     state.piezo_valid ? state.piezo_hr : 0);
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
    // Priority 4 keeps the UI below every sensor task (5+), so rendering
    // can never delay acquisition.
    xTaskCreate(local_ui_task, "local_ui", 4096, NULL, 4, NULL);
}
