#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#define TCS34725_I2C_ADDRESS 0x29

typedef struct {
    uint16_t clear;
    uint16_t red;
    uint16_t green;
    uint16_t blue;
    bool valid;
} tcs34725_reading_t;

typedef void (*tcs34725_callback_t)(const tcs34725_reading_t *reading, void *arg);

void tcs34725_set_bus_handle(void *bus_handle);
void tcs34725_init(void);
esp_err_t tcs34725_read(tcs34725_reading_t *reading);
esp_err_t tcs34725_start(tcs34725_callback_t callback, void *arg);
void tcs34725_stop(void);
bool tcs34725_is_running(void);
