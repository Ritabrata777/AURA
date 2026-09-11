#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

#define MAX30102_I2C_ADDRESS 0x57

typedef struct {
    uint32_t ir;
    uint32_t red;
} max30102_sample_t;

typedef struct {
    int heart_rate;
    int spo2;
    bool hr_valid;
    bool spo2_valid;
} max30102_metrics_t;

typedef enum {
    SPO2_STATE_IDLE,
    SPO2_STATE_RUNNING,
    SPO2_STATE_STOPPING,
    SPO2_STATE_ERROR
} spo2_state_t;

typedef void (*spo2_data_callback_t)(max30102_sample_t *sample, max30102_metrics_t *metrics, void *arg);

void max30102_init(void);
void max30102_set_bus_handle(void *bus_handle);
esp_err_t max30102_start(void);
void max30102_stop(void);
bool max30102_is_running(void);
void max30102_set_callback(spo2_data_callback_t callback, void *arg);
esp_err_t max30102_read_fifo(max30102_sample_t *samples, size_t max_samples, size_t *read_count);
esp_err_t max30102_get_metrics(max30102_metrics_t *metrics);
