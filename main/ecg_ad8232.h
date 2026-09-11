#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_adc/adc_oneshot.h"

#define ECG_SAMPLE_RATE 125
#define ECG_BUFFER_SIZE 500
#define ECG_CHUNK_SIZE 50
#define ECG_SESSION_ID_LENGTH 37
#define ECG_ADC_CHANNEL ADC_CHANNEL_0   // GPIO 36
#define ECG_ATTEN ADC_ATTEN_DB_12

typedef struct {
    int16_t samples[ECG_CHUNK_SIZE];
    uint32_t timestamp;
    uint16_t sequence;
} ecg_chunk_t;

typedef void (*ecg_data_callback_t)(ecg_chunk_t *chunk, void *arg);

/** Why a recording ended; mirrors EcgSessionEndMessage["reason"]. */
typedef enum {
    ECG_STOP_REASON_STOPPED,
    ECG_STOP_REASON_DURATION_ELAPSED,
    ECG_STOP_REASON_ERROR
} ecg_stop_reason_t;

/**
 * Called once per recording, after the last queued chunk has been delivered.
 * Runs on the ECG processing task, so publishing from here is safe.
 */
typedef void (*ecg_session_end_callback_t)(const char *session_id,
                                           uint32_t total_samples,
                                           ecg_stop_reason_t reason,
                                           void *arg);

typedef enum {
    ECG_STATE_IDLE,
    ECG_STATE_RUNNING,
    ECG_STATE_STOPPING,
    ECG_STATE_ERROR
} ecg_state_t;

typedef struct {
    ecg_state_t state;
    char session_id[ECG_SESSION_ID_LENGTH];
    uint16_t sequence_counter;
    uint32_t samples_since_start;
} ecg_session_t;

void ecg_ad8232_init(void);
/** Returns false when the subsystem is unavailable or a session is already active. */
bool ecg_ad8232_start(void);
void ecg_ad8232_stop(void);
void ecg_ad8232_stop_with_reason(ecg_stop_reason_t reason);
bool ecg_ad8232_is_running(void);
const char* ecg_ad8232_get_current_session(void);
void ecg_ad8232_set_callback(ecg_data_callback_t callback, void *arg);
void ecg_ad8232_set_session_end_callback(ecg_session_end_callback_t callback, void *arg);
int16_t* ecg_ad8232_get_raw_buffer(void);
size_t ecg_ad8232_get_sample_count(void);
