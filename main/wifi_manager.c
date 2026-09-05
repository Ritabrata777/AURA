#include "wifi_manager.h"
#include "app_config.h"

#include <string.h>
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_mac.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

static const char *TAG = "wifi_manager";

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1

static EventGroupHandle_t s_wifi_event_group = NULL;
static esp_netif_t *s_sta_netif = NULL;
static esp_netif_t *s_ap_netif = NULL;
static wifi_event_callback_t s_event_callback = NULL;
static void *s_callback_arg = NULL;
static bool s_is_connected = false;
static bool s_is_provisioning = false;

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT) {
        switch (event_id) {
            case WIFI_EVENT_STA_START:
                ESP_LOGI(TAG, "STA started, attempting to connect");
                esp_wifi_connect();
                break;
                
            case WIFI_EVENT_STA_DISCONNECTED: {
                wifi_event_sta_disconnected_t *disconnected = (wifi_event_sta_disconnected_t *)event_data;
                ESP_LOGW(TAG, "STA disconnected: ssid=%.*s reason=%d", 
                         disconnected->ssid_len, disconnected->ssid, disconnected->reason);
                s_is_connected = false;
                xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
                xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
                
                if (s_event_callback) {
                    s_event_callback(APP_WIFI_EVENT_DISCONNECTED, s_callback_arg);
                }
                
                // Auto-reconnect if not in provisioning mode
                if (!s_is_provisioning) {
                    esp_wifi_connect();
                }
                break;
            }
            
            case WIFI_EVENT_AP_STACONNECTED: {
                wifi_event_ap_staconnected_t *ap_event = (wifi_event_ap_staconnected_t *)event_data;
                ESP_LOGI(TAG, "Provisioning client connected: MAC=%02x:%02x:%02x:%02x:%02x:%02x AID=%d",
                         ap_event->mac[0], ap_event->mac[1], ap_event->mac[2],
                         ap_event->mac[3], ap_event->mac[4], ap_event->mac[5],
                         ap_event->aid);
                break;
            }
            
            case WIFI_EVENT_AP_STADISCONNECTED: {
                wifi_event_ap_stadisconnected_t *ap_event = (wifi_event_ap_stadisconnected_t *)event_data;
                ESP_LOGI(TAG, "Provisioning client disconnected: MAC=%02x:%02x:%02x:%02x:%02x:%02x AID=%d",
                         ap_event->mac[0], ap_event->mac[1], ap_event->mac[2],
                         ap_event->mac[3], ap_event->mac[4], ap_event->mac[5],
                         ap_event->aid);
                break;
            }
            
            case WIFI_EVENT_SCAN_DONE: {
                if (s_event_callback) {
                    s_event_callback(APP_WIFI_EVENT_SCAN_DONE, s_callback_arg);
                }
                break;
            }
            
            default:
                break;
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "STA got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        s_is_connected = true;
        xEventGroupClearBits(s_wifi_event_group, WIFI_FAIL_BIT);
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        
        if (s_event_callback) {
            s_event_callback(APP_WIFI_EVENT_CONNECTED, s_callback_arg);
        }
    }
}

void wifi_manager_init(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    
    s_wifi_event_group = xEventGroupCreate();
    
    s_sta_netif = esp_netif_create_default_wifi_sta();
    s_ap_netif = esp_netif_create_default_wifi_ap();
    
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        NULL));
}

esp_err_t wifi_manager_save_credentials(const app_wifi_config_t *config)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READWRITE, &nvs);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS for write: %s", esp_err_to_name(err));
        return err;
    }
    
    err = nvs_set_str(nvs, WIFI_KEY_SSID, config->ssid);
    if (err != ESP_OK) {
        nvs_close(nvs);
        return err;
    }
    
    err = nvs_set_str(nvs, WIFI_KEY_PASSWORD, config->password);
    if (err != ESP_OK) {
        nvs_close(nvs);
        return err;
    }
    
    err = nvs_commit(nvs);
    nvs_close(nvs);
    
    ESP_LOGI(TAG, "Wi-Fi credentials saved to NVS");
    return err;
}

esp_err_t wifi_manager_load_credentials(app_wifi_config_t *config)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READONLY, &nvs);
    if (err != ESP_OK) {
        ESP_LOGI(TAG, "No Wi-Fi credentials in NVS");
        return err;
    }
    
    size_t ssid_len = WIFI_MAX_SSID_LENGTH;
    err = nvs_get_str(nvs, WIFI_KEY_SSID, config->ssid, &ssid_len);
    if (err != ESP_OK) {
        nvs_close(nvs);
        return err;
    }
    
    size_t pass_len = WIFI_MAX_PASSWORD_LENGTH;
    err = nvs_get_str(nvs, WIFI_KEY_PASSWORD, config->password, &pass_len);
    nvs_close(nvs);
    
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Wi-Fi credentials loaded from NVS: SSID=%s", config->ssid);
    }
    
    return err;
}

esp_err_t wifi_manager_clear_credentials(void)
{
    nvs_handle_t nvs;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READWRITE, &nvs);
    if (err != ESP_OK) {
        return err;
    }
    
    nvs_erase_key(nvs, WIFI_KEY_SSID);
    nvs_erase_key(nvs, WIFI_KEY_PASSWORD);
    err = nvs_commit(nvs);
    nvs_close(nvs);
    
    ESP_LOGI(TAG, "Wi-Fi credentials cleared");
    return err;
}

bool wifi_manager_is_connected(void)
{
    return s_is_connected;
}

const char* wifi_manager_get_connection_status(void)
{
    if (s_is_provisioning) {
        return "PROVISIONING";
    } else if (s_is_connected) {
        return "CONNECTED";
    } else {
        return "DISCONNECTED";
    }
}

void wifi_manager_set_event_callback(wifi_event_callback_t callback, void *arg)
{
    s_event_callback = callback;
    s_callback_arg = arg;
}

void wifi_manager_start(void)
{
    app_wifi_config_t app_config = {0};
    bool has_credentials = false;
    
    // Try NVS first
    if (wifi_manager_load_credentials(&app_config) == ESP_OK && app_config.ssid[0] != '\0') {
        has_credentials = true;
    }
    
    // Fallback to Kconfig
    if (!has_credentials && strlen(CONFIG_WIFI_SSID) > 0) {
        strncpy(app_config.ssid, CONFIG_WIFI_SSID, sizeof(app_config.ssid) - 1);
        strncpy(app_config.password, CONFIG_WIFI_PASSWORD, sizeof(app_config.password) - 1);
        has_credentials = true;
        ESP_LOGI(TAG, "Using Kconfig Wi-Fi credentials: SSID=%s", app_config.ssid);
    }
    
    if (has_credentials) {
        ESP_LOGI(TAG, "Starting STA mode with credentials for SSID=%s", app_config.ssid);
        
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
        
        wifi_config_t sta_config = {0};
        strncpy((char *)sta_config.sta.ssid, app_config.ssid, sizeof(sta_config.sta.ssid) - 1);
        strncpy((char *)sta_config.sta.password, app_config.password, sizeof(sta_config.sta.password) - 1);
        
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_config));
        ESP_ERROR_CHECK(esp_wifi_start());
        
        s_is_provisioning = false;
    } else {
        ESP_LOGI(TAG, "No credentials found, starting provisioning mode");
        wifi_manager_start_provisioning_mode();
    }
}

void wifi_manager_stop(void)
{
    ESP_ERROR_CHECK(esp_wifi_stop());
    s_is_connected = false;
}

void wifi_manager_start_provisioning_mode(void)
{
    ESP_LOGI(TAG, "Starting Wi-Fi provisioning AP: 'HealthDevice-XXXX'");
    
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    
    wifi_config_t ap_config = {0};
    strncpy((char *)ap_config.ap.ssid, "HealthDevice-XXXX", sizeof(ap_config.ap.ssid) - 1);
    ap_config.ap.channel = 0;
    ap_config.ap.max_connection = 4;
    ap_config.ap.authmode = WIFI_AUTH_OPEN;
    
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    
    s_is_provisioning = true;
    
    ESP_LOGI(TAG, "Provisioning AP started. Connect and POST credentials to /wifi/config endpoint");
}
