#pragma once

#include "driver/gpio.h"

// Buzzer pin for alerts and notifications
#define BUZZER_GPIO GPIO_NUM_13

void buzzer_init(void);
void buzzer_on(void);
void buzzer_off(void);
void buzzer_beep(int duration_ms);
