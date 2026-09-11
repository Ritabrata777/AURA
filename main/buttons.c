#include "buttons.h"
#include "buzzer.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"

static const char *TAG = "buttons";

typedef struct {
    gpio_num_t gpio;
    bool last_state;
    uint32_t press_start_time;
    bool is_pressed;
    bool long_press_sent;
} button_state_t;

static button_state_t s_buttons[2] = {
    {.gpio = BUTTON_UP_GPIO, .last_state = true, .press_start_time = 0, .is_pressed = false, .long_press_sent = false},
    {.gpio = BUTTON_SELECT_GPIO, .last_state = true, .press_start_time = 0, .is_pressed = false, .long_press_sent = false}
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
            bool current_state = gpio_get_level(s_buttons[i].gpio);
            
            if (current_state == 0 && s_buttons[i].last_state == 1) {
                ESP_LOGI(TAG, "%s pressed", (i == 0) ? "UP" : "SELECT");
                buzzer_beep(60);
                s_buttons[i].is_pressed = true;
                s_buttons[i].press_start_time = current_time;
                s_buttons[i].long_press_sent = false;
            } else if (current_state == 1 && s_buttons[i].last_state == 0) {
                if (s_buttons[i].is_pressed) {
                    uint32_t press_duration = current_time - s_buttons[i].press_start_time;
                    button_event_t event = BUTTON_EVENT_NONE;
                    
                    if (press_duration >= BUTTON_LONG_PRESS_MS && !s_buttons[i].long_press_sent) {
                        event = (i == 0) ? BUTTON_EVENT_UP_LONG : BUTTON_EVENT_SELECT_LONG;
                    } else if (press_duration < BUTTON_LONG_PRESS_MS && press_duration >= BUTTON_DEBOUNCE_MS) {
                        event = (i == 0) ? BUTTON_EVENT_UP_SHORT : BUTTON_EVENT_SELECT_SHORT;
                    }
                    
                    if (event != BUTTON_EVENT_NONE && s_callback != NULL) {
                        s_callback(event, s_callback_arg);
                    }
                }
                s_buttons[i].is_pressed = false;
                s_buttons[i].long_press_sent = false;
            }
            
            if (s_buttons[i].is_pressed && !s_buttons[i].long_press_sent) {
                uint32_t press_duration = current_time - s_buttons[i].press_start_time;
                if (press_duration >= BUTTON_LONG_PRESS_MS) {
                    s_buttons[i].long_press_sent = true;
                    button_event_t event = (i == 0) ? BUTTON_EVENT_UP_LONG : BUTTON_EVENT_SELECT_LONG;
                    if (s_callback != NULL) {
                        s_callback(event, s_callback_arg);
                    }
                }
            }
            
            s_buttons[i].last_state = current_state;
        }
        
        vTaskDelay(pdMS_TO_TICKS(BUTTON_DEBOUNCE_MS / 2));
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
