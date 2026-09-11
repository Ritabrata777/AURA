#include "oled_ssd1306.h"
#include "app_config.h"
#include <string.h>
#include <stdio.h>
#include "driver/i2c_master.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "esp_log.h"

static const char *TAG="oled_ssd1306";
static uint8_t fb[1024];
static i2c_master_dev_handle_t dev;
static i2c_master_bus_handle_t bus;
static SemaphoreHandle_t mutex;

static void px(int x,int y){if(x>=0&&x<128&&y>=0&&y<64)fb[(y/8)*128+x]|=1u<<(y%8);}
static void glyph(char c,int x,int y,int z){
    static const uint8_t n[10][5]={{62,81,73,69,62},{0,66,127,64,0},{66,97,81,73,70},{33,65,69,75,49},{24,20,18,127,16},{39,69,69,69,57},{60,74,73,73,48},{1,113,9,5,3},{54,73,73,73,54},{6,73,73,41,30}};
    if(c>='0'&&c<='9'){for(int a=0;a<5;a++)for(int b=0;b<7;b++)if(n[c-'0'][a]&(1<<b))for(int i=0;i<z;i++)for(int j=0;j<z;j++)px(x+a*z+i,y+b*z+j);}
    else if(c=='-'){for(int a=0;a<5*z;a++)for(int i=0;i<z;i++)px(x+a,y+3*z+i);}
    else if(c!=' '){
        for(int a=0;a<5*z;a++) for(int i=0;i<z;i++) { px(x+a,y+i); px(x+a,y+6*z+i); }
        for(int b=0;b<7*z;b++) for(int i=0;i<z;i++) { px(x+i,y+b); px(x+4*z+i,y+b); }
    }
}
static esp_err_t command(uint8_t c){uint8_t b[2]={0x80,c};return i2c_master_transmit(dev,b,2,pdMS_TO_TICKS(300));}
static esp_err_t pages(void){for(int p=0;p<8;p++){esp_err_t e=command(0xb0|p);if(e)return e;if((e=command(2))!=ESP_OK)return e;if((e=command(0x10))!=ESP_OK)return e;uint8_t b[129]={0x40};memcpy(b+1,fb+p*128,128);if((e=i2c_master_transmit(dev,b,sizeof(b),pdMS_TO_TICKS(500)))!=ESP_OK)return e;}return ESP_OK;}
void oled_ssd1306_set_bus_handle(void*h){bus=(i2c_master_bus_handle_t)h;}
void oled_ssd1306_init(void)
{
    if (!bus) return;
    mutex = xSemaphoreCreateMutex();

    static const uint8_t addrs[] = {0x3C, 0x3D};
    for (int i = 0; i < 2; i++) {
        i2c_device_config_t c = {
            .dev_addr_length = I2C_ADDR_BIT_LEN_7,
            .device_address = addrs[i],
            .scl_speed_hz = 100000,
        };
        if (i2c_master_bus_add_device(bus, &c, &dev) != ESP_OK) continue;
        uint8_t test[] = {0x80, 0xAE};
        if (i2c_master_transmit(dev, test, sizeof(test), pdMS_TO_TICKS(50)) == ESP_OK) {
            ESP_LOGI(TAG, "OLED found at 0x%02X", addrs[i]);
            goto found;
        }
        i2c_master_bus_rm_device(dev);
        dev = NULL;
    }
    ESP_LOGE(TAG, "OLED not found on I2C bus");
    return;

found:;
    static const uint8_t a[] = {0xae,0xd5,0x80,0xa8,0x3f,0xd3,0,0x40,0xa1,0xc8,
                                0xda,0x12,0x81,0x7f,0xd9,0xf1,0xdb,0x40,0xa4,0xa6,0xaf};
    for (size_t i = 0; i < sizeof(a); i++) {
        if (command(a[i]) != ESP_OK) {
            ESP_LOGE(TAG, "init failed at cmd %zu", i);
            return;
        }
    }
    oled_clear();
}
void oled_clear_framebuffer(void){memset(fb,0,sizeof(fb));}
void oled_clear_area(int x,int y,int w,int h){for(int j=y;j<y+h;j++)for(int i=x;i<x+w;i++)if(i>=0&&i<128&&j>=0&&j<64)fb[j/8*128+i]&=~(1u<<(j%8));}
esp_err_t oled_flush(void){if(!dev||!mutex)return ESP_ERR_INVALID_STATE;xSemaphoreTake(mutex,portMAX_DELAY);esp_err_t e=pages();xSemaphoreGive(mutex);return e;}
esp_err_t oled_flush_dirty(void){return oled_flush();}
esp_err_t oled_clear(void){oled_clear_framebuffer();return oled_flush();}
esp_err_t oled_draw_text(int x,int y,const char*s,int z){if(!s)return ESP_ERR_INVALID_ARG;while(*s){glyph(*s,x,y,z);x+=6*z;s++;}return ESP_OK;}
esp_err_t oled_draw_string_centered(int y,const char*s,int z){return oled_draw_text((128-(int)strlen(s)*6*z)/2,y,s,z);}
void oled_draw_line(int x1,int y1,int x2,int y2){(void)x2;(void)y2;for(int x=x1;x<=x2;x++)px(x,y1);}
void oled_draw_ecg_waveform(int16_t*s,size_t n){for(size_t i=0;i<n&&i<128;i++){int y=32+s[i]/20;if(y<10)y=10;if(y>54)y=54;px((int)i,y);}}
void oled_show_device_id_with_countdown(const char*id,int seconds){for(int i=seconds;i>0;i--){char b[32];oled_clear_framebuffer();oled_draw_string_centered(0,"PULSE LINK",1);oled_draw_string_centered(18,"DEVICE ID",1);oled_draw_string_centered(30,id,1);snprintf(b,sizeof(b),"STARTING IN %d",i);oled_draw_string_centered(55,b,1);oled_flush();vTaskDelay(pdMS_TO_TICKS(1000));}oled_clear();}
esp_err_t oled_show_home_screen(const oled_display_state_t*s){(void)s;oled_clear_framebuffer();oled_draw_string_centered(20,"PULSE LINK",1);return oled_flush();}
void oled_show_ecg_screen(const oled_display_state_t*s,int16_t*a,size_t n){(void)s;oled_clear_framebuffer();oled_draw_ecg_waveform(a,n);oled_flush();}
void oled_show_spo2_screen(const oled_display_state_t*s){(void)s;} esp_err_t oled_show_temp_screen(const oled_display_state_t*s){(void)s;return ESP_OK;} esp_err_t oled_show_status_screen(const oled_display_state_t*s){(void)s;return ESP_OK;}
void oled_set_display_state(const oled_display_state_t*s){(void)s;} const oled_display_state_t*oled_get_display_state(void){return NULL;}
void oled_navigate_next(void){} void oled_navigate_prev(void){} void oled_select(void){}
