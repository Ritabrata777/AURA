#include "oled_ssd1306.h"
#include <string.h>
#include "esp_log.h"

static const char *TAG = "oled_ssd1306";

static oled_display_state_t s_display_state = {
    .current_screen = MENU_HOME,
    .heart_rate = 0,
    .spo2 = 0,
    .temperature = 0.0f,
    .device_status = "Initializing",
    .ecg_running = false,
    .spo2_running = false,
    .temp_running = false
};

// Stubbed OLED — all display functions are no-ops.
// Sensor data flows through MQTT to the web frontend instead.

void oled_ssd1306_init(void)
{
    ESP_LOGI(TAG, "OLED display stubbed (data shown on web frontend)");
}

void oled_clear(void) {}
void oled_draw_text(int x, int y, const char *text, int size) { (void)x; (void)y; (void)text; (void)size; }
void oled_draw_string_centered(int y, const char *text, int size) { (void)y; (void)text; (void)size; }
void oled_draw_line(int x1, int y1, int x2, int y2) { (void)x1; (void)y1; (void)x2; (void)y2; }
void oled_draw_ecg_waveform(int16_t *samples, size_t count) { (void)samples; (void)count; }
void oled_show_home_screen(const oled_display_state_t *state) { (void)state; }
void oled_show_ecg_screen(const oled_display_state_t *state, int16_t *ecg_samples, size_t count) { (void)state; (void)ecg_samples; (void)count; }
void oled_show_spo2_screen(const oled_display_state_t *state) { (void)state; }
void oled_show_temp_screen(const oled_display_state_t *state) { (void)state; }
void oled_show_status_screen(const oled_display_state_t *state) { (void)state; }

void oled_set_display_state(const oled_display_state_t *state)
{
    if (state == NULL) return;
    memcpy(&s_display_state, state, sizeof(oled_display_state_t));
}

const oled_display_state_t* oled_get_display_state(void)
{
    return &s_display_state;
}

void oled_navigate_next(void)
{
    s_display_state.current_screen = (menu_screen_t)((s_display_state.current_screen + 1) % MENU_COUNT);
}

void oled_navigate_prev(void)
{
    s_display_state.current_screen = (menu_screen_t)((s_display_state.current_screen - 1 + MENU_COUNT) % MENU_COUNT);
}

void oled_select(void)
{
    switch (s_display_state.current_screen) {
        case MENU_ECG:
            s_display_state.ecg_running = !s_display_state.ecg_running;
            break;
        case MENU_SPO2:
            s_display_state.spo2_running = !s_display_state.spo2_running;
            break;
        case MENU_TEMPERATURE:
            s_display_state.temp_running = !s_display_state.temp_running;
            break;
        default:
            break;
    }
}
