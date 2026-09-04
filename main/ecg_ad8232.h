#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_adc/adc_oneshot.h"

#define ECG_SAMPLE_RATE 250
#define ECG_BUFFER_SIZE 500
#define ECG_CHUNK_SIZE 50
#define ECG_ADC_CHANNEL ADC_CHANNEL_0   // GPIO 36
#define ECG_ATTEN ADC_ATTEN_DB_12

typedef struct {
    int16_t samples[ECG_CHUNK_SIZE];
    uint32_t timestamp;
    uint16_t sequence;
} ecg_chunk_t;

typedef void (*ecg_data_callback_t)(ecg_chunk_t *chunk, void *arg);

typedef enum {
    ECG_STATE_IDLE,
    ECG_STATE_RUNNING,
    ECG_STATE_STOPPING,
    ECG_STATE_ERROR
} ecg_state_t;

typedef struct {
    ecg_state_t state;
    uint32_t session_id;
    uint16_t sequence_counter;
    uint32_t samples_since_start;
} ecg_session_t;

void ecg_ad8232_init(void);
void ecg_ad8232_start(uint32_t session_id);
void ecg_ad8232_stop(void);
bool ecg_ad8232_is_running(void);
uint32_t ecg_ad8232_get_current_session(void);
void ecg_ad8232_set_callback(ecg_data_callback_t callback, void *arg);
int16_t* ecg_ad8232_get_raw_buffer(void);
size_t ecg_ad8232_get_sample_count(void);
