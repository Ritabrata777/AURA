#pragma once

#include "driver/gpio.h"

// ─── Firmware / Protocol ─────────────────────────────────────────
#define APP_FIRMWARE_VERSION "0.1.0"
#define APP_PROTOCOL_VERSION 1
#define APP_LED_GPIO GPIO_NUM_2
#define APP_STATUS_PERIOD_MS 1000
#ifndef HEARTBEAT_GPIO
#define HEARTBEAT_GPIO GPIO_NUM_17
#endif

// ─── I2C Bus (shared by OLED and MAX30102) ──────────────────────
#define APP_I2C_MASTER_NUM    I2C_NUM_0
#define APP_I2C_SDA_IO        GPIO_NUM_22
#define APP_I2C_SCL_IO        GPIO_NUM_21
#define APP_I2C_FREQ_HZ       100000

// ─── MQTT Broker ─────────────────────────────────────────────────
#ifndef CONFIG_MQTT_BROKER_URI
// Your current WiFi IP where Mosquitto is running
#define CONFIG_MQTT_BROKER_URI "mqtt://10.146.117.232:1883"
#endif

// Override any menuconfig setting to ensure correct MQTT broker
#ifdef CONFIG_MQTT_BROKER_URI
#undef CONFIG_MQTT_BROKER_URI
#endif
#define CONFIG_MQTT_BROKER_URI "mqtt://10.146.117.232:1883"

// ─── Wi-Fi (fallback when NVS is empty) ──────────────────────────
#ifndef CONFIG_WIFI_SSID
#define CONFIG_WIFI_SSID "zxc"
#endif
#ifndef CONFIG_WIFI_PASSWORD
#define CONFIG_WIFI_PASSWORD "12345678"
#endif
