#include "buttons.h"
#include "buzzer.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

static const char *TAG = "buttons";

typedef struct {
    gpio_num_t gpio;
    bool stable_level;
    bool raw_level;
    uint32_t raw_changed_time;
    uint32_t press_start_time;
    bool long_press_sent;
} button_state_t;

static button_state_t s_buttons[2] = {
    {.gpio = BUTTON_UP_GPIO, .stable_level = true, .raw_level = true, .raw_changed_time = 0, .press_start_time = 0, .long_press_sent = false},
    {.gpio = BUTTON_SELECT_GPIO, .stable_level = true, .raw_level = true, .raw_changed_time = 0, .press_start_time = 0, .long_press_sent = false}
};

static button_event_callback_t s_callback = NULL;
static void *s_callback_arg = NULL;

static void buttons_task(void *arg)
{
    (void)arg;
    uint32_t current_time = 0;

    while (true) {
        current_time = xTaskGetTickCount() * portTICK_PERIOD_MS;

        for (int i = 0; i < 2; i++) {
            bool current_level = gpio_get_level(s_buttons[i].gpio) != 0;

            if (current_level != s_buttons[i].raw_level) {
                s_buttons[i].raw_level = current_level;
                s_buttons[i].raw_changed_time = current_time;
                continue;
            }

            if (current_level != s_buttons[i].stable_level &&
                current_time - s_buttons[i].raw_changed_time >= BUTTON_DEBOUNCE_MS) {
                s_buttons[i].stable_level = current_level;

                if (!current_level) {
                    s_buttons[i].press_start_time = current_time;
                    s_buttons[i].long_press_sent = false;
                    ESP_LOGI(TAG, "Button %d pressed", i + 1);
                    buzzer_beep(60);
                } else {
                    if (!s_buttons[i].long_press_sent) {
                        button_event_t event = (i == 0) ? BUTTON_EVENT_UP_SHORT : BUTTON_EVENT_SELECT_SHORT;
                        if (s_callback != NULL) {
                            s_callback(event, s_callback_arg);
                        }
                    }
                    s_buttons[i].press_start_time = 0;
                    s_buttons[i].long_press_sent = false;
                }
            }

            if (!s_buttons[i].stable_level && !s_buttons[i].long_press_sent &&
                s_buttons[i].press_start_time != 0 &&
                current_time - s_buttons[i].press_start_time >= BUTTON_LONG_PRESS_MS) {
                button_event_t event = (i == 0) ? BUTTON_EVENT_UP_LONG : BUTTON_EVENT_SELECT_LONG;
                s_buttons[i].long_press_sent = true;
                if (s_callback != NULL) {
                    s_callback(event, s_callback_arg);
                }
            }
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void buttons_init(void)
{
    ESP_LOGI(TAG, "Initializing buttons");
    
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << BUTTON_UP_GPIO) | (1ULL << BUTTON_SELECT_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE
    };
    gpio_config(&io_conf);

    for (int i = 0; i < 2; i++) {
        bool level = gpio_get_level(s_buttons[i].gpio) != 0;
        s_buttons[i].stable_level = level;
        s_buttons[i].raw_level = level;
        s_buttons[i].raw_changed_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
        s_buttons[i].press_start_time = 0;
        s_buttons[i].long_press_sent = false;
    }
    
    xTaskCreate(buttons_task, "buttons_task", 3072, NULL, 5, NULL);
    
    ESP_LOGI(TAG, "Buttons initialized: UP=%d, SELECT=%d", BUTTON_UP_GPIO, BUTTON_SELECT_GPIO);
}

void buttons_set_callback(button_event_callback_t callback, void *arg)
{
    s_callback = callback;
    s_callback_arg = arg;
}

bool buttons_is_up_pressed(void)
{
    return !gpio_get_level(BUTTON_UP_GPIO);
}

bool buttons_is_select_pressed(void)
{
    return !gpio_get_level(BUTTON_SELECT_GPIO);
}
