#pragma once

#include <stdbool.h>

typedef void (*piezo_heartbeat_callback_t)(int bpm, bool valid, void *arg);

void piezo_heartbeat_init(void);
void piezo_heartbeat_set_callback(piezo_heartbeat_callback_t callback, void *arg);
void piezo_heartbeat_start(void);
void piezo_heartbeat_stop(void);
bool piezo_heartbeat_is_running(void);
