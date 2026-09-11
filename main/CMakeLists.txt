idf_component_register(SRCS "i2c_bus.c" "sensor_state.c" "oled_ssd1306.c" "buzzer.c" "device_comm.c" "buttons.c" "max30102.c" "tcs34725.c" "ecg_ad8232.c" "local_ui.c" "esp32-health-device.c"
                            "device_identity.c"
                            "device_status_task.c"
                            "wifi_manager.c"
                            "app_mqtt.c"
                            "piezo_heartbeat.c"
                    INCLUDE_DIRS "."
                    REQUIRES esp_wifi esp_netif nvs_flash espressif__mqtt espressif__cjson esp_driver_gpio esp_driver_i2c driver esp_adc esp_event esp_timer esp_ringbuf)
