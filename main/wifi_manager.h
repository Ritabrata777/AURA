#pragma once

#include <stdbool.h>
#include "esp_event.h"

#define WIFI_MAX_SSID_LENGTH 32
#define WIFI_MAX_PASSWORD_LENGTH 64
#define WIFI_NAMESPACE "wifi_config"
#define WIFI_KEY_SSID "ssid"
#define WIFI_KEY_PASSWORD "password"

typedef enum {
    APP_WIFI_EVENT_CONNECTED,
    APP_WIFI_EVENT_DISCONNECTED,
    APP_WIFI_EVENT_SCAN_DONE,
    APP_WIFI_EVENT_FAILED
} app_wifi_event_t;

typedef void (*wifi_event_callback_t)(app_wifi_event_t event, void *arg);

typedef struct {
    char ssid[WIFI_MAX_SSID_LENGTH];
    char password[WIFI_MAX_PASSWORD_LENGTH];
} app_wifi_config_t;

void wifi_manager_init(void);
esp_err_t wifi_manager_save_credentials(const app_wifi_config_t *config);
esp_err_t wifi_manager_load_credentials(app_wifi_config_t *config);
esp_err_t wifi_manager_clear_credentials(void);
bool wifi_manager_is_connected(void);
const char* wifi_manager_get_connection_status(void);
void wifi_manager_set_event_callback(wifi_event_callback_t callback, void *arg);
void wifi_manager_start(void);
void wifi_manager_stop(void);
void wifi_manager_start_provisioning_mode(void);
