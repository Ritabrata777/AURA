#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "driver/gpio.h"

// Moved from GPIO 35/36 (input-only, no internal pullup) to GPIO 33/32
#define BUTTON_UP_GPIO GPIO_NUM_33
#define BUTTON_SELECT_GPIO GPIO_NUM_32

#define BUTTON_DEBOUNCE_MS 50
#define BUTTON_LONG_PRESS_MS 1500

typedef enum {
    BUTTON_EVENT_NONE,
    BUTTON_EVENT_UP_SHORT,
    BUTTON_EVENT_UP_LONG,
    BUTTON_EVENT_SELECT_SHORT,
    BUTTON_EVENT_SELECT_LONG
} button_event_t;

typedef void (*button_event_callback_t)(button_event_t event, void *arg);

void buttons_init(void);
void buttons_set_callback(button_event_callback_t callback, void *arg);
bool buttons_is_up_pressed(void);
bool buttons_is_select_pressed(void);
