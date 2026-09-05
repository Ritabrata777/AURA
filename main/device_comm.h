#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "cJSON.h"
#include "app_mqtt.h"

#define DEVICE_COMM_STATUS_PERIOD_MS 5000

// Recording length bounds, mirrored from packages/protocol (ECG_MIN/MAX_
// DURATION_SECONDS). The device enforces them itself so a malformed or
// malicious command cannot pin the ADC timer on forever.
#define DEVICE_COMM_ECG_MIN_DURATION_S 1
#define DEVICE_COMM_ECG_MAX_DURATION_S 3600

// Longest wire-level command name plus NUL ("START_TEMPERATURE" is 17).
#define DEVICE_COMMAND_NAME_LENGTH 24

typedef enum {
    DEVICE_CMD_START_ECG,
    DEVICE_CMD_STOP_ECG,
    DEVICE_CMD_START_SPO2,
    DEVICE_CMD_STOP_SPO2,
    DEVICE_CMD_START_TEMPERATURE,
    DEVICE_CMD_STOP_TEMPERATURE,
    DEVICE_CMD_GET_STATUS,
    DEVICE_CMD_UNKNOWN
} device_command_t;

typedef struct {
    char command_id[37];
    device_command_t command;
    // The name is copied rather than borrowed from the parsed cJSON tree: the
    // tree is freed before the handler runs, so a borrowed pointer dangled.
    char command_name[DEVICE_COMMAND_NAME_LENGTH];
    int parameters[4];
} device_command_received_t;

typedef void (*device_command_handler_t)(device_command_received_t *cmd, void *arg);

void device_comm_init(void);
void device_comm_set_device_id(const char *device_id);
void device_comm_set_command_handler(device_command_handler_t handler, void *arg);
void device_comm_subscribe_to_commands(void);
bool device_comm_handle_mqtt_data(mqtt_event_data_t *mqtt_data);
bool device_comm_is_time_synced(void);
void device_comm_publish_status(void);
void device_comm_publish_measurement(const char *type, float value, const char *unit, const char *quality, const char *session_id);
void device_comm_publish_ecg_chunk(const char *session_id, uint16_t sequence, uint16_t sample_rate, int16_t *samples, size_t count);
void device_comm_publish_ecg_session_end(const char *session_id, uint32_t total_samples, const char *reason);
void device_comm_publish_event(const char *severity, const char *code, const char *message);
void device_comm_publish_command_ack(const char *command_id, const char *command, const char *status, const char *error_code);
void device_comm_start_periodic_status(void);
void device_comm_stop_periodic_status(void);
const char* device_comm_parse_command(const char *json_payload, device_command_received_t *cmd);
