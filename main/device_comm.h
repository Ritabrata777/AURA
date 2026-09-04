#pragma once

#include <stdint.h>
#include <stdbool.h>
#include "cJSON.h"

#define DEVICE_COMM_STATUS_PERIOD_MS 5000

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
    int parameters[4];
} device_command_received_t;

typedef void (*device_command_handler_t)(device_command_received_t *cmd, void *arg);

void device_comm_init(void);
void device_comm_set_device_id(const char *device_id);
void device_comm_set_command_handler(device_command_handler_t handler, void *arg);
void device_comm_publish_status(void);
void device_comm_publish_measurement(const char *type, float value, const char *unit, const char *quality, const char *session_id);
void device_comm_publish_ecg_chunk(const char *session_id, uint16_t sequence, uint16_t sample_rate, int16_t *samples, size_t count);
void device_comm_publish_command_ack(const char *command_id, const char *command, const char *status, const char *error_code);
void device_comm_start_periodic_status(void);
void device_comm_stop_periodic_status(void);
const char* device_comm_parse_command(const char *json_payload, device_command_received_t *cmd);
