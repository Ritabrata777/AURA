#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#define MLX90614_I2C_ADDRESS 0x5A

typedef struct {
    float object_temp_c;
    float ambient_temp_c;
    bool valid;
} mlx90614_temp_t;

typedef enum {
    TEMP_STATE_IDLE,
    TEMP_STATE_RUNNING,
    TEMP_STATE_STOPPING,
    TEMP_STATE_ERROR
} temp_state_t;

typedef void (*temp_data_callback_t)(mlx90614_temp_t *temp, void *arg);

void mlx90614_init(void);
void mlx90614_set_bus_handle(void *bus_handle);
esp_err_t mlx90614_read_temperature(mlx90614_temp_t *temp);
void mlx90614_start_continuous(temp_data_callback_t callback, void *arg);
void mlx90614_stop_continuous(void);
bool mlx90614_is_running(void);
