#include "device_status_task.h"

#include "app_config.h"
#include "device_identity.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "device_status";

static void device_status_task(void *argument)
{
    (void)argument;
    bool led_on = false;

    while (true) {
        led_on = !led_on;
        gpio_set_level(APP_LED_GPIO, led_on ? 1 : 0);

        const health_device_status_t *status = device_identity_status();
        ESP_LOGI(TAG, "heartbeat hardware=%s pairing=%s heap=%lu",
                 status->hardware_id,
                 status->pairing_code,
                 (unsigned long)status->free_heap);
        vTaskDelay(pdMS_TO_TICKS(APP_STATUS_PERIOD_MS));
    }
}

void device_status_task_start(void)
{
    gpio_reset_pin(APP_LED_GPIO);
    gpio_set_direction(APP_LED_GPIO, GPIO_MODE_OUTPUT);
    xTaskCreate(device_status_task, "device_status", 3072, NULL, 5, NULL);
}
