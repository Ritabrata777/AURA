#pragma once

#include <stdbool.h>
#include <stdint.h>

#define HEALTH_DEVICE_PROTOCOL_VERSION 1
#define HEALTH_DEVICE_ID_LENGTH 37
#define HEALTH_HARDWARE_ID_LENGTH 17
#define HEALTH_PAIRING_CODE_LENGTH 11
#define HEALTH_SESSION_ID_LENGTH 37

// Wire-level names are kept in one place so firmware and backend stay aligned.
typedef enum {
    HEALTH_COMMAND_START_ECG,
    HEALTH_COMMAND_STOP_ECG,
    HEALTH_COMMAND_START_SPO2,
    HEALTH_COMMAND_STOP_SPO2,
    HEALTH_COMMAND_START_TEMPERATURE,
    HEALTH_COMMAND_GET_STATUS,
    HEALTH_COMMAND_UNKNOWN
} health_command_t;

typedef enum {
    HEALTH_ACK_ACCEPTED,
    HEALTH_ACK_COMPLETED,
    HEALTH_ACK_REJECTED
} health_ack_status_t;

typedef struct {
    char device_id[HEALTH_DEVICE_ID_LENGTH];
    char hardware_id[HEALTH_HARDWARE_ID_LENGTH];
    char pairing_code[HEALTH_PAIRING_CODE_LENGTH];
    bool wifi_connected;
    bool mqtt_connected;
    bool time_synced;
    char active_session_id[HEALTH_SESSION_ID_LENGTH];
    uint32_t free_heap;
} health_device_status_t;
