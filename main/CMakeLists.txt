idf_component_register(SRCS "device_comm.c" "buttons.c" "oled_ssd1306.c" "mlx90614.c" "max30102.c" "ecg_ad8232.c" "esp32-health-device.c"
                            "device_identity.c"
                            "device_status_task.c"
                            "wifi_manager.c"
                            "app_mqtt.c"
                    INCLUDE_DIRS "."
                    REQUIRES esp_wifi esp_netif nvs_flash espressif__mqtt espressif__cjson esp_driver_gpio driver esp_adc esp_event esp_timer esp_ringbuf)
