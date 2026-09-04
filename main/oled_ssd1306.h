#pragma once

#include <stdint.h>
#include <stdbool.h>

#define SSD1306_I2C_ADDRESS 0x3C
#define SSD1306_WIDTH 128
#define SSD1306_HEIGHT 64

typedef enum {
    MENU_HOME,
    MENU_ECG,
    MENU_SPO2,
    MENU_TEMPERATURE,
    MENU_STATUS,
    MENU_COUNT
} menu_screen_t;

typedef struct {
    menu_screen_t current_screen;
    int16_t heart_rate;
    int16_t spo2;
    float temperature;
    const char *device_status;
    bool ecg_running;
    bool spo2_running;
    bool temp_running;
} oled_display_state_t;

void oled_ssd1306_init(void);
void oled_clear(void);
void oled_draw_text(int x, int y, const char *text, int size);
void oled_draw_string_centered(int y, const char *text, int size);
void oled_draw_line(int x1, int y1, int x2, int y2);
void oled_draw_ecg_waveform(int16_t *samples, size_t count);
void oled_show_home_screen(const oled_display_state_t *state);
void oled_show_ecg_screen(const oled_display_state_t *state, int16_t *ecg_samples, size_t count);
void oled_show_spo2_screen(const oled_display_state_t *state);
void oled_show_temp_screen(const oled_display_state_t *state);
void oled_show_status_screen(const oled_display_state_t *state);
void oled_set_display_state(const oled_display_state_t *state);
const oled_display_state_t* oled_get_display_state(void);
void oled_navigate_next(void);
void oled_navigate_prev(void);
void oled_select(void);
