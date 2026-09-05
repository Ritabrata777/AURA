#pragma once

#include <stdbool.h>
#include <stdint.h>

#define MQTT_TOPIC_PREFIX "devices"
#define MQTT_MAX_TOPIC_LENGTH 64
#define MQTT_MAX_PAYLOAD_LENGTH 1024

typedef enum {
    APP_MQTT_EVENT_CONNECTED,
    APP_MQTT_EVENT_DISCONNECTED,
    APP_MQTT_EVENT_SUBSCRIBED,
    APP_MQTT_EVENT_UNSUBSCRIBED,
    APP_MQTT_EVENT_PUBLISHED,
    APP_MQTT_EVENT_DATA,
    APP_MQTT_EVENT_ERROR
} mqtt_event_type_t;

typedef struct {
    char topic[MQTT_MAX_TOPIC_LENGTH];
    char *data;
    int data_len;
    int msg_id;
} mqtt_event_data_t;

typedef void (*mqtt_event_callback_t)(mqtt_event_type_t event, void *data, void *arg);

typedef struct {
    const char *broker_url;
    const char *client_id;
    const char *username;
    const char *password;
    const char *cert_pem;
    bool use_tls;
} mqtt_config_t;

void mqtt_client_init(const mqtt_config_t *config);
void mqtt_client_set_event_callback(mqtt_event_callback_t callback, void *arg);
void mqtt_client_start(void);
void mqtt_client_stop(void);
bool mqtt_client_is_connected(void);
int mqtt_client_publish(const char *topic, const char *data, int qos, int retain);
int mqtt_client_subscribe(const char *topic, int qos);
int mqtt_client_unsubscribe(const char *topic);
const char* mqtt_client_get_status(void);
