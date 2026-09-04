#include "ecg_ad8232.h"

#include <string.h>
#include "esp_log.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "freertos/queue.h"
#include "freertos/ringbuf.h"
#include "esp_adc/adc_oneshot.h"

static const char *TAG = "ecg_ad8232";

#define ECG_SAMPLE_INTERVAL_US (1000000 / ECG_SAMPLE_RATE)
// Hold up to 10 chunks in the ring buffer
#define ECG_RING_BUFFER_SIZE (sizeof(ecg_chunk_t) * 10 + 32)

static adc_oneshot_unit_handle_t s_adc_handle = NULL;
static bool s_adc_initialized = false;

static ecg_session_t s_session = {
    .state = ECG_STATE_IDLE,
    .session_id = 0,
    .sequence_counter = 0,
    .samples_since_start = 0
};

static int16_t s_raw_buffer[ECG_BUFFER_SIZE] = {0};
static size_t s_buffer_head = 0;

static ecg_data_callback_t s_data_callback = NULL;
static void *s_callback_arg = NULL;

static TaskHandle_t s_ecg_task_handle = NULL;
static esp_timer_handle_t s_sample_timer = NULL;

static RingbufHandle_t s_chunk_ringbuf = NULL;

// Static chunk buffer to avoid malloc in ISR
static ecg_chunk_t s_isr_chunk;

static void IRAM_ATTR sample_timer_isr(void *arg)
{
    if (s_session.state != ECG_STATE_RUNNING) {
        return;
    }
    
    int adc_value = 0;
    
    if (s_adc_initialized && adc_oneshot_read(s_adc_handle, ECG_ADC_CHANNEL, &adc_value) == ESP_OK) {
        // Convert 12-bit ADC to millivolts and center around 0
        int voltage_mv = (adc_value * 3300) >> 12;
        int16_t sample = (int16_t)(voltage_mv - 1650);
        
        s_raw_buffer[s_buffer_head] = sample;
        s_buffer_head = (s_buffer_head + 1) % ECG_BUFFER_SIZE;
        
        s_session.samples_since_start++;
        
        // When we have a full chunk of samples, copy and send via ring buffer
        if (s_session.samples_since_start % ECG_CHUNK_SIZE == 0) {
            s_isr_chunk.sequence = s_session.sequence_counter++;
            s_isr_chunk.timestamp = (uint32_t)(esp_timer_get_time() / 1000);
            
            size_t read_pos = (s_buffer_head >= ECG_CHUNK_SIZE) ? 
                              (s_buffer_head - ECG_CHUNK_SIZE) : 
                              (ECG_BUFFER_SIZE - (ECG_CHUNK_SIZE - s_buffer_head));
            
            for (int i = 0; i < ECG_CHUNK_SIZE; i++) {
                s_isr_chunk.samples[i] = s_raw_buffer[(read_pos + i) % ECG_BUFFER_SIZE];
            }
            
            BaseType_t xHigherPriorityTaskWoken = pdFALSE;
            xRingbufferSendFromISR(s_chunk_ringbuf, &s_isr_chunk, sizeof(ecg_chunk_t), &xHigherPriorityTaskWoken);
            
            if (xHigherPriorityTaskWoken) {
                portYIELD_FROM_ISR();
            }
        }
    }
}

static void ecg_processing_task(void *arg)
{
    (void)arg;
    size_t chunk_size = 0;
    
    while (true) {
        ecg_chunk_t *chunk = (ecg_chunk_t *)xRingbufferReceive(s_chunk_ringbuf, &chunk_size, portMAX_DELAY);
        
        if (chunk != NULL && s_data_callback != NULL && s_session.state == ECG_STATE_RUNNING) {
            s_data_callback(chunk, s_callback_arg);
        }
        
        if (chunk != NULL) {
            vRingbufferReturnItem(s_chunk_ringbuf, chunk);
        }
        
        if (s_session.state == ECG_STATE_STOPPING) {
            s_session.state = ECG_STATE_IDLE;
            ESP_LOGI(TAG, "ECG session stopped");
        }
    }
}

void ecg_ad8232_init(void)
{
    ESP_LOGI(TAG, "Initializing AD8232 ECG sensor");
    
    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config, &s_adc_handle));
    
    adc_oneshot_chan_cfg_t channel_config = {
        .atten = ECG_ATTEN,
        .bitwidth = ADC_BITWIDTH_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(s_adc_handle, ECG_ADC_CHANNEL, &channel_config));
    
    s_adc_initialized = true;
    
    s_chunk_ringbuf = xRingbufferCreate(ECG_RING_BUFFER_SIZE, RINGBUF_TYPE_NOSPLIT);
    if (s_chunk_ringbuf == NULL) {
        ESP_LOGE(TAG, "Failed to create chunk ring buffer");
        return;
    }
    
    xTaskCreate(ecg_processing_task, "ecg_proc", 4096, NULL, 10, &s_ecg_task_handle);
    
    const esp_timer_create_args_t timer_args = {
        .callback = sample_timer_isr,
        .name = "ecg_sample_timer",
    };
    ESP_ERROR_CHECK(esp_timer_create(&timer_args, &s_sample_timer));
    
    ESP_LOGI(TAG, "AD8232 initialized: %d Hz, %d samples buffer", ECG_SAMPLE_RATE, ECG_BUFFER_SIZE);
}

void ecg_ad8232_start(uint32_t session_id)
{
    if (s_session.state == ECG_STATE_RUNNING) {
        ESP_LOGW(TAG, "ECG already running");
        return;
    }
    
    ESP_LOGI(TAG, "Starting ECG session %lu", (unsigned long)session_id);
    
    s_session.session_id = session_id;
    s_session.sequence_counter = 0;
    s_session.samples_since_start = 0;
    s_buffer_head = 0;
    s_session.state = ECG_STATE_RUNNING;
    
    esp_timer_start_periodic(s_sample_timer, ECG_SAMPLE_INTERVAL_US);
}

void ecg_ad8232_stop(void)
{
    if (s_session.state != ECG_STATE_RUNNING) {
        return;
    }
    
    ESP_LOGI(TAG, "Stopping ECG session");
    s_session.state = ECG_STATE_STOPPING;
    esp_timer_stop(s_sample_timer);
}

bool ecg_ad8232_is_running(void)
{
    return s_session.state == ECG_STATE_RUNNING;
}

uint32_t ecg_ad8232_get_current_session(void)
{
    return s_session.session_id;
}

void ecg_ad8232_set_callback(ecg_data_callback_t callback, void *arg)
{
    s_data_callback = callback;
    s_callback_arg = arg;
}

int16_t* ecg_ad8232_get_raw_buffer(void)
{
    return s_raw_buffer;
}

size_t ecg_ad8232_get_sample_count(void)
{
    return s_session.samples_since_start;
}
