#include "device_identity.h"

#include <stdio.h>
#include <string.h>

#include "esp_mac.h"
#include "esp_system.h"

static health_device_status_t device_status;

void device_identity_init(void)
{
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
    device_status.wifi_connected = false;
    device_status.mqtt_connected = false;
    device_status.time_synced = false;
    device_status.free_heap = esp_get_free_heap_size();
}

const health_device_status_t *device_identity_status(void)
{
    device_status.free_heap = esp_get_free_heap_size();
    return &device_status;
}
