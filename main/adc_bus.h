#pragma once

#include "esp_adc/adc_oneshot.h"
#include "esp_err.h"

esp_err_t adc_bus_init(void);
adc_oneshot_unit_handle_t adc_bus_get_handle(void);
