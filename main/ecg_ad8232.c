#include "ecg_ad8232.h"

#include <string.h>
#include <stdio.h>
#include "adc_bus.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_random.h"
#include "driver/gpio.h"
#include "esp_timer.h"
#include "freertos/queue.h"
#include "freertos/ringbuf.h"
#include "esp_adc/adc_oneshot.h"

static const char *TAG = "ecg_ad8232";

#define ECG_SAMPLE_INTERVAL_US (1000000 / ECG_SAMPLE_RATE)
// Hold up to 10 chunks. RINGBUF_TYPE_NOSPLIT stores an 8-byte header per item
// and rounds each item up to a 4-byte boundary, so the previous flat +32 slack
// was short by ~48 bytes and the buffer silently held only nine chunks.
#define ECG_RING_ITEM_SIZE (((sizeof(ecg_chunk_t) + 3) & ~((size_t)3)) + 8)
#define ECG_RING_BUFFER_SIZE (ECG_RING_ITEM_SIZE * 10)

static adc_oneshot_unit_handle_t s_adc_handle = NULL;
static bool s_adc_initialized = false;

static ecg_session_t s_session = {
    .state = ECG_STATE_IDLE,
    .session_id = {0},
    .sequence_counter = 0,
    .samples_since_start = 0
};

static int16_t s_raw_buffer[ECG_BUFFER_SIZE] = {0};
static size_t s_buffer_head = 0;

static ecg_data_callback_t s_data_callback = NULL;
static void *s_callback_arg = NULL;
static ecg_session_end_callback_t s_session_end_callback = NULL;
static void *s_session_end_arg = NULL;

static TaskHandle_t s_ecg_task_handle = NULL;
static esp_timer_handle_t s_sample_timer = NULL;

static RingbufHandle_t s_chunk_ringbuf = NULL;

// Set only once every piece of the pipeline exists. Starting a recording with
// a NULL timer or ring buffer used to abort inside ESP-IDF.
static bool s_ready = false;

// Why the current recording is ending, reported in ECG_SESSION_END.
static ecg_stop_reason_t s_stop_reason = ECG_STOP_REASON_STOPPED;

// Generate an RFC-4122-style UUID string. Used as the ECG session identifier so
// it is unique across reboots and safe to persist as a session key.
//
// The tail is printed as two fields because `unsigned long` is 32 bits here; a
// single %012lx over a 64-bit value dropped the high half.
static void generate_uuid(char *buf, size_t size)
{
    uint32_t r1 = esp_random();
    uint32_t r2 = esp_random();
    uint32_t r3 = esp_random();
    uint32_t r4 = esp_random();
    snprintf(buf, size,
             "%08lx-%04lx-%04lx-%04lx-%04lx%08lx",
             (unsigned long)r1,
             (unsigned long)((r2 >> 16) & 0xFFFF),
             (unsigned long)(0x4000 | (r2 & 0x0FFF)),
             (unsigned long)(0x8000 | (r3 & 0x3FFF)),
             (unsigned long)((r3 >> 16) & 0xFFFF),
             (unsigned long)r4);
}

// ESP-timer callbacks run in the esp_timer task (task context, not an ISR), so
// they may use the blocking ring buffer API. Using *_FromISR here would trip a
// configASSERT in ESP-IDF.
static void sample_timer_cb(void *arg)
{
    (void)arg;

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

        // When we have a full chunk of samples, copy and send via ring buffer.
        if (s_session.samples_since_start % ECG_CHUNK_SIZE == 0) {
            ecg_chunk_t chunk = {
                .sequence = s_session.sequence_counter++,
                .timestamp = (uint32_t)(esp_timer_get_time() / 1000),
                .samples = {0}
            };

            size_t read_pos = (s_buffer_head >= ECG_CHUNK_SIZE) ?
                              (s_buffer_head - ECG_CHUNK_SIZE) :
                              (ECG_BUFFER_SIZE - (ECG_CHUNK_SIZE - s_buffer_head));

            for (int i = 0; i < ECG_CHUNK_SIZE; i++) {
                chunk.samples[i] = s_raw_buffer[(read_pos + i) % ECG_BUFFER_SIZE];
            }

            // Blocking send: called from task context. Non-blocking fallback if
            // full so we never stall sampling; the dropped-chunk restart the
            // backend detects via missing sequence and can request a resend.
            xRingbufferSend(s_chunk_ringbuf, &chunk, sizeof(ecg_chunk_t), pdMS_TO_TICKS(1));
        }
    }
}

static void ecg_processing_task(void *arg)
{
    (void)arg;
    size_t chunk_size = 0;

    while (true) {
        // A bounded wait rather than portMAX_DELAY: on stop, the sample timer
        // has already been cancelled, so no further chunk ever arrives and the
        // STOPPING → IDLE transition below would never run. The session then
        // stayed "running" forever and a restart was refused.
        ecg_chunk_t *chunk = (ecg_chunk_t *)xRingbufferReceive(s_chunk_ringbuf, &chunk_size,
                                                               pdMS_TO_TICKS(200));

        // STOPPING must also deliver: the last chunk enqueued by the sample
        // timer before it was cancelled often arrives here after the state has
        // flipped, and dropping it lost the final 200 ms of the recording even
        // though the drain loop below was written to preserve exactly that tail.
        if (chunk != NULL && s_data_callback != NULL &&
            (s_session.state == ECG_STATE_RUNNING || s_session.state == ECG_STATE_STOPPING)) {
            s_data_callback(chunk, s_callback_arg);
        }

        if (chunk != NULL) {
            vRingbufferReturnItem(s_chunk_ringbuf, chunk);
        }

        if (s_session.state == ECG_STATE_STOPPING) {
            // Drain whatever is still queued before closing the session, so
            // the tail of the recording is not thrown away.
            void *pending = xRingbufferReceive(s_chunk_ringbuf, &chunk_size, 0);
            while (pending != NULL) {
                if (s_data_callback != NULL) {
                    s_data_callback((ecg_chunk_t *)pending, s_callback_arg);
                }
                vRingbufferReturnItem(s_chunk_ringbuf, pending);
                pending = xRingbufferReceive(s_chunk_ringbuf, &chunk_size, 0);
            }

            const uint32_t total_samples = s_session.samples_since_start;
            const ecg_stop_reason_t reason = s_stop_reason;

            s_session.state = ECG_STATE_IDLE;
            ESP_LOGI(TAG, "ECG session stopped after %lu samples",
                     (unsigned long)total_samples);

            // Announced from the task, not from ecg_ad8232_stop(): stop may be
            // called from the esp_timer task, where a blocking MQTT publish is
            // not welcome.
            if (s_session_end_callback != NULL) {
                s_session_end_callback(s_session.session_id, total_samples, reason,
                                       s_session_end_arg);
            }
        }
    }
}

void ecg_ad8232_init(void)
{
    ESP_LOGI(TAG, "Initializing AD8232 ECG sensor");

    ESP_ERROR_CHECK(adc_bus_init());
    s_adc_handle = adc_bus_get_handle();

    adc_oneshot_chan_cfg_t channel_config = {
        .atten = ECG_ATTEN,
        .bitwidth = ADC_BITWIDTH_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(s_adc_handle, ECG_ADC_CHANNEL, &channel_config));

    s_adc_initialized = true;

    s_chunk_ringbuf = xRingbufferCreate(ECG_RING_BUFFER_SIZE, RINGBUF_TYPE_NOSPLIT);
    if (s_chunk_ringbuf == NULL) {
        ESP_LOGE(TAG, "Failed to create chunk ring buffer");
        s_session.state = ECG_STATE_ERROR;
        return;
    }

    if (xTaskCreate(ecg_processing_task, "ecg_proc", 4096, NULL, 10, &s_ecg_task_handle) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create ECG processing task");
        vRingbufferDelete(s_chunk_ringbuf);
        s_chunk_ringbuf = NULL;
        s_session.state = ECG_STATE_ERROR;
        return;
    }

    const esp_timer_create_args_t timer_args = {
        .callback = sample_timer_cb,
        .name = "ecg_sample_timer",
    };
    ESP_ERROR_CHECK(esp_timer_create(&timer_args, &s_sample_timer));

    s_ready = true;

    ESP_LOGI(TAG, "AD8232 initialized: %d Hz, %d samples buffer", ECG_SAMPLE_RATE, ECG_BUFFER_SIZE);
}

bool ecg_ad8232_start(void)
{
    // Init may have bailed out early (no ring buffer, no task, no timer).
    // Starting anyway dereferenced NULL handles inside ESP-IDF and panicked.
    if (!s_ready) {
        ESP_LOGE(TAG, "ECG subsystem unavailable — ignoring start");
        return false;
    }

    if (s_session.state == ECG_STATE_RUNNING) {
        ESP_LOGW(TAG, "ECG already running");
        return false;
    }

    if (s_session.state == ECG_STATE_STOPPING) {
        ESP_LOGW(TAG, "Previous ECG session is still closing — ignoring start");
        return false;
    }

    char session_id[ECG_SESSION_ID_LENGTH];
    generate_uuid(session_id, sizeof(session_id));
    ESP_LOGI(TAG, "Starting ECG session %s", session_id);

    strncpy(s_session.session_id, session_id, sizeof(s_session.session_id) - 1);
    s_session.session_id[sizeof(s_session.session_id) - 1] = '\0';
    s_session.sequence_counter = 0;
    s_session.samples_since_start = 0;
    s_buffer_head = 0;
    s_stop_reason = ECG_STOP_REASON_STOPPED;
    s_session.state = ECG_STATE_RUNNING;

    esp_err_t err = esp_timer_start_periodic(s_sample_timer, ECG_SAMPLE_INTERVAL_US);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Could not start sample timer: %s", esp_err_to_name(err));
        s_session.state = ECG_STATE_IDLE;
        return false;
    }

    return true;
}

void ecg_ad8232_stop_with_reason(ecg_stop_reason_t reason)
{
    if (s_session.state != ECG_STATE_RUNNING) {
        return;
    }

    ESP_LOGI(TAG, "Stopping ECG session");
    s_stop_reason = reason;
    s_session.state = ECG_STATE_STOPPING;
    esp_timer_stop(s_sample_timer);
}

void ecg_ad8232_stop(void)
{
    ecg_ad8232_stop_with_reason(ECG_STOP_REASON_STOPPED);
}

bool ecg_ad8232_is_running(void)
{
    return s_session.state == ECG_STATE_RUNNING;
}

const char* ecg_ad8232_get_current_session(void)
{
    return s_session.session_id;
}

void ecg_ad8232_set_callback(ecg_data_callback_t callback, void *arg)
{
    s_data_callback = callback;
    s_callback_arg = arg;
}

void ecg_ad8232_set_session_end_callback(ecg_session_end_callback_t callback, void *arg)
{
    s_session_end_callback = callback;
    s_session_end_arg = arg;
}

int16_t* ecg_ad8232_get_raw_buffer(void)
{
    return s_raw_buffer;
}

size_t ecg_ad8232_get_sample_count(void)
{
    return s_session.samples_since_start;
}
