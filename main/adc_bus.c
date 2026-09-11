#include "adc_bus.h"

#include "esp_log.h"

static const char *TAG = "adc_bus";

static adc_oneshot_unit_handle_t s_adc_handle;

esp_err_t adc_bus_init(void)
{
    if (s_adc_handle != NULL) {
        return ESP_OK;
    }

    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    esp_err_t err = adc_oneshot_new_unit(&init_config, &s_adc_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ADC1 init failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "ADC1 initialized");
    return ESP_OK;
}

adc_oneshot_unit_handle_t adc_bus_get_handle(void)
{
    return s_adc_handle;
}
