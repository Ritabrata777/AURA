#include "i2c_bus.h"

#include "app_config.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "i2c";

static i2c_master_bus_handle_t s_bus = NULL;

// A slave left mid-transaction by a previous reset (reflash, reset button,
// brownout) keeps driving SDA low and waits for SCL edges that never come.
// The first transaction on a freshly created master then times out no matter
// how good the wiring is. Clock the bus out here, before the master claims
// the pins, so the very first probe sees an idle bus.
static void i2c_bus_release_stuck_slave(void)
{
    gpio_reset_pin(APP_I2C_SCL_IO);
    gpio_reset_pin(APP_I2C_SDA_IO);
    gpio_set_direction(APP_I2C_SCL_IO, GPIO_MODE_OUTPUT_OD);
    gpio_set_pull_mode(APP_I2C_SDA_IO, GPIO_PULLUP_ONLY);
    gpio_set_direction(APP_I2C_SDA_IO, GPIO_MODE_INPUT);
    gpio_set_level(APP_I2C_SCL_IO, 1);
    esp_rom_delay_us(10);

    if (gpio_get_level(APP_I2C_SDA_IO) == 1) {
        return; // Bus already idle, nothing to recover.
    }

    ESP_LOGW(TAG, "SDA held low at boot — clocking out a stuck slave");
    for (int i = 0; i < 9 && gpio_get_level(APP_I2C_SDA_IO) == 0; i++) {
        gpio_set_level(APP_I2C_SCL_IO, 0);
        esp_rom_delay_us(5);
        gpio_set_level(APP_I2C_SCL_IO, 1);
        esp_rom_delay_us(5);
    }

    // STOP condition: SDA goes low -> high while SCL stays high.
    gpio_set_level(APP_I2C_SCL_IO, 0);
    esp_rom_delay_us(5);
    gpio_set_direction(APP_I2C_SDA_IO, GPIO_MODE_OUTPUT_OD);
    gpio_set_level(APP_I2C_SDA_IO, 0);
    esp_rom_delay_us(5);
    gpio_set_level(APP_I2C_SCL_IO, 1);
    esp_rom_delay_us(5);
    gpio_set_level(APP_I2C_SDA_IO, 1);
    esp_rom_delay_us(5);
    gpio_set_direction(APP_I2C_SDA_IO, GPIO_MODE_INPUT);

    if (gpio_get_level(APP_I2C_SDA_IO) == 0) {
        ESP_LOGE(TAG, "SDA still low after recovery — check wiring and pull-ups");
    } else {
        ESP_LOGI(TAG, "Bus recovered, SDA released");
    }
}

void i2c_bus_init(void)
{
    ESP_LOGI(TAG, "I2C: Initializing shared bus");
    ESP_LOGI(TAG, "I2C: SDA=%d SCL=%d", (int)APP_I2C_SDA_IO, (int)APP_I2C_SCL_IO);

    i2c_bus_release_stuck_slave();

    i2c_master_bus_config_t bus_config = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = APP_I2C_MASTER_NUM,
        .scl_io_num = APP_I2C_SCL_IO,
        .sda_io_num = APP_I2C_SDA_IO,
        .glitch_ignore_cnt = 7,
        .intr_priority = 0,
        .trans_queue_depth = 0,
        .flags = {
            .enable_internal_pullup = true,
        },
    };
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, &s_bus));
    ESP_LOGI(TAG, "I2C: Bus initialized successfully");
}

i2c_master_bus_handle_t i2c_bus_get_handle(void)
{
    return s_bus;
}

// Devices we expect or recognise on this bus. The scanner reports unknown
// addresses too, so a stray peripheral never hides behind silence.
typedef struct {
    uint8_t addr;
    const char *name;
} i2c_known_device_t;

static const i2c_known_device_t s_known_devices[] = {
    {0x29, "TCS34725 color sensor (not initialized)"},
    {0x3C, "SSD1306 OLED"},
    {0x3D, "SSD1306 OLED"},
    {0x57, "MAX30102"},
    {0x5A, "MLX90614 (not part of this design)"},
};

static const char *i2c_device_name(uint8_t addr)
{
    for (size_t i = 0; i < sizeof(s_known_devices) / sizeof(s_known_devices[0]); i++) {
        if (s_known_devices[i].addr == addr) {
            return s_known_devices[i].name;
        }
    }
    return "unknown device";
}

static bool i2c_probe_address(uint8_t addr)
{
    for (int attempt = 0; attempt < 2; attempt++) {
        if (i2c_master_probe(s_bus, addr, 20) == ESP_OK) {
            return true;
        }
        vTaskDelay(pdMS_TO_TICKS(2));
    }
    return false;
}

void i2c_bus_scan(void)
{
    ESP_LOGI(TAG, "I2C SCAN: SDA=%d SCL=%d", (int)APP_I2C_SDA_IO, (int)APP_I2C_SCL_IO);
    ESP_LOGI(TAG, "I2C SCAN: Scanning addresses 0x08-0x77 ...");

    bool oled_found = false;
    bool max30102_found = false;
    int found_count = 0;

    for (uint8_t addr = 0x08; addr <= 0x77; addr++) {
        if (!i2c_probe_address(addr)) {
            continue;
        }
        ESP_LOGI(TAG, "I2C SCAN: 0x%02X -> %s", addr, i2c_device_name(addr));
        found_count++;
        if (addr == 0x3C || addr == 0x3D) {
            oled_found = true;
        }
        if (addr == 0x57) {
            max30102_found = true;
        }
        vTaskDelay(pdMS_TO_TICKS(2));
    }

    ESP_LOGI(TAG, "I2C SCAN: %d device(s) found", found_count);

    // Only two devices are part of the design; say so plainly when one of
    // them is missing instead of letting the count speak for itself.
    if (!oled_found) {
        ESP_LOGW(TAG, "I2C SCAN: SSD1306 OLED did not respond at 0x3C or 0x3D");
    }
    if (!max30102_found) {
        ESP_LOGW(TAG, "I2C SCAN: MAX30102 did not respond at 0x57");
    }
    if (!oled_found || !max30102_found) {
        ESP_LOGW(TAG, "I2C SCAN: Bus incomplete — check power, wiring and pull-ups");
    }
}
