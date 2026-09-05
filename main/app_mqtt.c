#include "app_mqtt.h"

#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "mqtt_client.h"
#include "esp_event.h"

static const char *TAG = "app_mqtt";

static esp_mqtt_client_handle_t s_mqtt_client = NULL;
static mqtt_event_callback_t s_event_callback = NULL;
static void *s_callback_arg = NULL;
static bool s_is_connected = false;
static mqtt_config_t s_config = {0};

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, 
                               int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
    
    switch ((esp_mqtt_event_id_t)event_id) {
        case MQTT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "MQTT connected");
            s_is_connected = true;
            if (s_event_callback) {
                s_event_callback(APP_MQTT_EVENT_CONNECTED, NULL, s_callback_arg);
            }
            break;
            
        case MQTT_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "MQTT disconnected");
            s_is_connected = false;
            if (s_event_callback) {
                s_event_callback(APP_MQTT_EVENT_DISCONNECTED, NULL, s_callback_arg);
            }
            break;
            
        case MQTT_EVENT_SUBSCRIBED:
            ESP_LOGI(TAG, "MQTT subscribed, msg_id=%d", event->msg_id);
            if (s_event_callback) {
                mqtt_event_data_t data = {
                    .msg_id = event->msg_id
                };
                s_event_callback(APP_MQTT_EVENT_SUBSCRIBED, &data, s_callback_arg);
            }
            break;
            
        case MQTT_EVENT_UNSUBSCRIBED:
            ESP_LOGI(TAG, "MQTT unsubscribed, msg_id=%d", event->msg_id);
            if (s_event_callback) {
                mqtt_event_data_t data = {.msg_id = event->msg_id};
                s_event_callback(APP_MQTT_EVENT_UNSUBSCRIBED, &data, s_callback_arg);
            }
            break;
            
        case MQTT_EVENT_PUBLISHED:
            ESP_LOGI(TAG, "MQTT published, msg_id=%d", event->msg_id);
            if (s_event_callback) {
                mqtt_event_data_t data = {.msg_id = event->msg_id};
                s_event_callback(APP_MQTT_EVENT_PUBLISHED, &data, s_callback_arg);
            }
            break;
            
        case MQTT_EVENT_DATA:
            ESP_LOGD(TAG, "MQTT data received, topic=%.*s, msg_id=%d", 
                     event->topic_len, event->topic, event->msg_id);
            if (s_event_callback) {
                mqtt_event_data_t data = {
                    .data_len = event->data_len,
                    .msg_id = event->msg_id
                };
                strncpy(data.topic, event->topic, 
                        (event->topic_len < MQTT_MAX_TOPIC_LENGTH - 1) ? 
                        event->topic_len : MQTT_MAX_TOPIC_LENGTH - 1);
                data.data = event->data;
                s_event_callback(APP_MQTT_EVENT_DATA, &data, s_callback_arg);
            }
            break;
            
        case MQTT_EVENT_ERROR:
            ESP_LOGE(TAG, "MQTT error");
            if (s_event_callback) {
                s_event_callback(APP_MQTT_EVENT_ERROR, NULL, s_callback_arg);
            }
            break;
            
        default:
            ESP_LOGD(TAG, "MQTT other event id: %d", event_id);
            break;
    }
}

void mqtt_client_init(const mqtt_config_t *config)
{
    if (config == NULL) {
        ESP_LOGE(TAG, "Config is NULL");
        return;
    }
    
    memcpy(&s_config, config, sizeof(mqtt_config_t));
    
    esp_mqtt_client_config_t mqtt_cfg = {
        .broker = {
            .address = {
                .uri = config->broker_url
            }
        },
        .credentials = {
            .client_id = config->client_id,
            .username = config->username,
            .authentication = {
                .password = config->password
            }
        },
        .network = {
            .disable_auto_reconnect = false
        }
    };
    
    if (config->use_tls && config->cert_pem != NULL) {
        mqtt_cfg.broker.address.transport = MQTT_TRANSPORT_OVER_SSL;
        mqtt_cfg.broker.verification.certificate = config->cert_pem;
    }
    
    s_mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    
    if (s_mqtt_client != NULL) {
        esp_mqtt_client_register_event(s_mqtt_client, ESP_EVENT_ANY_ID, 
                                       mqtt_event_handler, NULL);
        ESP_LOGI(TAG, "MQTT client initialized");
    } else {
        ESP_LOGE(TAG, "Failed to initialize MQTT client");
    }
}

void mqtt_client_set_event_callback(mqtt_event_callback_t callback, void *arg)
{
    s_event_callback = callback;
    s_callback_arg = arg;
}

void mqtt_client_start(void)
{
    if (s_mqtt_client != NULL) {
        esp_mqtt_client_start(s_mqtt_client);
        ESP_LOGI(TAG, "MQTT client started");
    }
}

void mqtt_client_stop(void)
{
    if (s_mqtt_client != NULL) {
        esp_mqtt_client_stop(s_mqtt_client);
        s_is_connected = false;
    }
}

bool mqtt_client_is_connected(void)
{
    return s_is_connected;
}

int mqtt_client_publish(const char *topic, const char *data, int qos, int retain)
{
    if (s_mqtt_client == NULL || !s_is_connected) {
        ESP_LOGW(TAG, "Cannot publish: not connected");
        return -1;
    }
    
    int msg_id = esp_mqtt_client_publish(s_mqtt_client, topic, data, 
                                         strlen(data), qos, retain);
    ESP_LOGD(TAG, "Published to %s, msg_id=%d", topic, msg_id);
    return msg_id;
}

int mqtt_client_subscribe(const char *topic, int qos)
{
    if (s_mqtt_client == NULL || !s_is_connected) {
        ESP_LOGW(TAG, "Cannot subscribe: not connected");
        return -1;
    }
    
    int msg_id = esp_mqtt_client_subscribe(s_mqtt_client, topic, qos);
    ESP_LOGI(TAG, "Subscribed to %s, msg_id=%d", topic, msg_id);
    return msg_id;
}

int mqtt_client_unsubscribe(const char *topic)
{
    if (s_mqtt_client == NULL || !s_is_connected) {
        return -1;
    }
    
    return esp_mqtt_client_unsubscribe(s_mqtt_client, topic);
}

const char* mqtt_client_get_status(void)
{
    return s_is_connected ? "CONNECTED" : "DISCONNECTED";
}
