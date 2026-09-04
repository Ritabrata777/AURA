idf_component_register(SRCS "device_comm.c" "buttons.c" "oled_ssd1306.c" "mlx90614.c" "max30102.c" "ecg_ad8232.c" "esp32-health-device.c"
                            "device_identity.c"
                            "device_status_task.c"
                            "wifi_manager.c"
                            "mqtt_client.c"
                    INCLUDE_DIRS "."
                    REQUIRES esp_wifi esp_netif nvs_flash mqtt cjson)
