#pragma once

#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

// Single shared I2C master bus for every on-board sensor (SSD1306, MAX30102).
// The bus is created exactly once, here, and every driver attaches to the
// handle returned by i2c_bus_get_handle(). No driver may reconfigure the
// I2C GPIOs on its own.

void i2c_bus_init(void);
i2c_master_bus_handle_t i2c_bus_get_handle(void);
esp_err_t i2c_bus_lock(uint32_t timeout_ms);
void i2c_bus_unlock(void);

// Probes every address 0x08-0x77 and reports what responded. Devices that
// are expected on this bus but missing are called out explicitly.
void i2c_bus_scan(void);
