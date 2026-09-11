#pragma once

#include "max30102.h"
#include "mlx90614.h"
#include "ecg_ad8232.h"
#include "tcs34725.h"

void local_ui_init(const char *pairing_code);
void local_ui_set_spo2(const max30102_metrics_t *metrics);
void local_ui_set_max30102_heart_rate(int heart_rate, bool valid);
void local_ui_set_piezo_heart_rate(int bpm, bool valid);
void local_ui_set_temperature(const mlx90614_temp_t *temp);
void local_ui_set_ecg_chunk(const ecg_chunk_t *chunk);
void local_ui_set_color(const tcs34725_reading_t *reading);
