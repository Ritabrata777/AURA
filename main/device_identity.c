#include "device_identity.h"

#include <stdio.h>
#include <string.h>

#include "esp_mac.h"
#include "esp_system.h"
#include "app_mqtt.h"
#include "wifi_manager.h"
#include "device_comm.h"

static health_device_status_t device_status;

void device_identity_init(void)
{
    memset(&device_status, 0, sizeof(device_status));

    uint8_t mac[6] = {0};
    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    snprintf(device_status.hardware_id, sizeof(device_status.hardware_id),
             "%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    snprintf(device_status.pairing_code, sizeof(device_status.pairing_code),
             "MED-%02X%02X%02X", mac[3], mac[4], mac[5]);

    // Use hardware_id as device_id for development.
    // In production, the backend assigns a UUID during provisioning.
    strncpy(device_status.device_id, device_status.hardware_id, sizeof(device_status.device_id) - 1);

    device_status.active_session_id[0] = '\0';
    device_status.free_heap = esp_get_free_heap_size();
}

const health_device_status_t *device_identity_status(void)
{
    // Always reflect the live network state so a status report is trustworthy.
    device_status.wifi_connected = wifi_manager_is_connected();
    device_status.mqtt_connected = mqtt_client_is_connected();
    device_status.time_synced = device_comm_is_time_synced();
    device_status.free_heap = esp_get_free_heap_size();
    return &device_status;
}

void device_identity_set_active_session(const char *session_id)
{
    if (session_id != NULL) {
        strncpy(device_status.active_session_id, session_id,
                sizeof(device_status.active_session_id) - 1);
        device_status.active_session_id[sizeof(device_status.active_session_id) - 1] = '\0';
    } else {
        device_status.active_session_id[0] = '\0';
    }
}
