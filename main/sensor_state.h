#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// Width of the display ECG trace; the last N samples are kept rolling so
// the OLED can render a scrolling waveform.
#define SENSOR_ECG_WAVEFORM_MAX 128

// Single shared snapshot of the latest sensor readings. The sensor tasks
// (MAX30102, ECG, piezo) write it through the setters below; the OLED UI
// task copies it with sensor_state_get() and renders from the copy. No
// consumer ever drives a sensor, and no producer ever touches the display.
typedef struct {
    // MAX30102 — kept strictly separate from the piezo measurement.
    int max30102_hr;
    bool max30102_hr_valid;
    int max30102_spo2;
    bool max30102_spo2_valid;
    float max30102_temp_c;
    bool max30102_temp_valid;

    // Piezo heartbeat sensor.
    int piezo_hr;
    bool piezo_valid;

    // AD8232 ECG.
    bool ecg_running;
    int16_t ecg_waveform[SENSOR_ECG_WAVEFORM_MAX];
    size_t ecg_waveform_count;
} sensor_state_t;

void sensor_state_init(void);

// Locks, copies the whole struct, unlocks. Call from any task.
void sensor_state_get(sensor_state_t *out);

void sensor_state_set_max30102(int hr, bool hr_valid,
                               int spo2, bool spo2_valid,
                               float temp_c, bool temp_valid);
void sensor_state_set_piezo(int bpm, bool valid);
void sensor_state_set_ecg_running(bool running);

// Appends samples to the rolling ECG waveform buffer, keeping only the
// newest SENSOR_ECG_WAVEFORM_MAX samples.
void sensor_state_ecg_append(const int16_t *samples, size_t count);
