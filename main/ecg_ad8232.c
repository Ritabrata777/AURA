#include "ecg_ad8232.h"

#include <string.h>
#include <stdio.h>
#include <limits.h>
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
#define ECG_RAW_CENTER 2048
#define ECG_DIAG_INTERVAL_S 5
#define ECG_FILTER_SETTLE_SAMPLES 25
#define ECG_SPECTRUM_SIZE 250
// Hold up to 10 chunks. RINGBUF_TYPE_NOSPLIT stores an 8-byte header per item
// and rounds each item up to a 4-byte boundary, so the previous flat +32 slack
// was short by ~48 bytes and the buffer silently held only nine chunks.
#define ECG_RING_ITEM_SIZE (((sizeof(ecg_raw_chunk_t) + 3) & ~((size_t)3)) + 8)
#define ECG_RING_BUFFER_SIZE (ECG_RING_ITEM_SIZE * 10)

static adc_oneshot_unit_handle_t s_adc_handle = NULL;
static bool s_adc_initialized = false;

static ecg_session_t s_session = {
    .state = ECG_STATE_IDLE,
    .session_id = {0},
    .sequence_counter = 0,
    .samples_since_start = 0
};

typedef struct {
    int16_t samples[ECG_CHUNK_SIZE];
    uint32_t timestamp;
    uint16_t sequence;
} ecg_raw_chunk_t;

static int16_t s_raw_buffer[ECG_BUFFER_SIZE] = {0};
static int16_t s_filtered_buffer[ECG_BUFFER_SIZE] = {0};
static size_t s_buffer_head = 0;
static size_t s_filtered_buffer_head = 0;

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

typedef struct {
    float b0;
    float b1;
    float b2;
    float a1;
    float a2;
    float z1;
    float z2;
} ecg_biquad_t;

// RBJ cookbook biquads designed for fs=250 Hz.
// Primary ECG chain:
//   HP 0.5 Hz Q=0.7071 -> LP 30 Hz 4th-order cascade -> notch 50 Hz Q=30.
//
// The 30 Hz two-section low-pass is deliberately steeper than one biquad, so
// small fast spikes are reduced without pushing the cutoff down into the
// 10-15 Hz range where QRS morphology would become rounded. The 50 Hz notch
// remains for mains pickup; the spectrum log still reports 30 Hz so the
// interference can be verified from raw ADC data.
// Samples are relative ADC counts centered around mid-scale, not calibrated mV.
static ecg_biquad_t s_hp_filter = {
    .b0 = 0.991153595f,
    .b1 = -1.982307190f,
    .b2 = 0.991153595f,
    .a1 = -1.982228930f,
    .a2 = 0.982385451f,
};
static ecg_biquad_t s_lp_filter_a = {
    .b0 = 0.083014239f,
    .b1 = 0.166028478f,
    .b2 = 0.083014239f,
    .a1 = -0.893103633f,
    .a2 = 0.225160589f,
};
static ecg_biquad_t s_lp_filter_b = {
    .b0 = 0.107384678f,
    .b1 = 0.214769355f,
    .b2 = 0.107384678f,
    .a1 = -1.155291512f,
    .a2 = 0.584830222f,
};
static ecg_biquad_t s_notch_filter = {
    .b0 = 0.984396390f,
    .b1 = -0.608390427f,
    .b2 = 0.984396390f,
    .a1 = -0.608390427f,
    .a2 = 0.968792780f,
};
static uint32_t s_dropped_chunks = 0;
static uint32_t s_sent_chunks = 0;
static int s_diag_raw_min = INT_MAX;
static int s_diag_raw_max = INT_MIN;
static int64_t s_diag_raw_sum = 0;
static int s_diag_filtered_min = INT_MAX;
static int s_diag_filtered_max = INT_MIN;
static int64_t s_diag_filtered_sum = 0;
static uint32_t s_diag_samples = 0;
static int64_t s_next_diag_time_us = 0;
static int64_t s_diag_window_start_us = 0;
static int64_t s_last_sample_time_us = 0;
static int32_t s_diag_interval_min_us = INT_MAX;
static int32_t s_diag_interval_max_us = 0;
static uint32_t s_filter_settle_remaining = 0;
static bool s_filter_primed = false;
static int16_t s_spectrum_raw[ECG_SPECTRUM_SIZE] = {0};
static int16_t s_spectrum_filtered[ECG_SPECTRUM_SIZE] = {0};
static size_t s_spectrum_count = 0;

static void reset_biquad(ecg_biquad_t *filter)
{
    filter->z1 = 0.0f;
    filter->z2 = 0.0f;
}

static void reset_filter_state(void)
{
    reset_biquad(&s_hp_filter);
    reset_biquad(&s_lp_filter_a);
    reset_biquad(&s_lp_filter_b);
    reset_biquad(&s_notch_filter);
    s_filter_settle_remaining = ECG_FILTER_SETTLE_SAMPLES;
    s_filter_primed = false;
}

static int16_t clamp_i16(float value)
{
    if (value > 32767.0f) {
        return 32767;
    }
    if (value < -32768.0f) {
        return -32768;
    }
    return (int16_t)value;
}

static float run_biquad(ecg_biquad_t *filter, float input)
{
    float output = (filter->b0 * input) + filter->z1;
    filter->z1 = (filter->b1 * input) - (filter->a1 * output) + filter->z2;
    filter->z2 = (filter->b2 * input) - (filter->a2 * output);
    return output;
}

static int16_t process_ecg_sample(int raw_sample)
{
    if (!s_filter_primed) {
        const float baseline = (float)raw_sample;
        s_hp_filter.z1 = -s_hp_filter.b0 * baseline;
        s_hp_filter.z2 = s_hp_filter.b2 * baseline;
        s_filter_primed = true;
    }

    float sample = (float)raw_sample;
    sample = run_biquad(&s_hp_filter, sample);
    sample = run_biquad(&s_lp_filter_a, sample);
    sample = run_biquad(&s_lp_filter_b, sample);
    sample = run_biquad(&s_notch_filter, sample);

    if (s_filter_settle_remaining > 0) {
        s_filter_settle_remaining--;
        sample = 0.0f;
    }

    return clamp_i16(sample);
}

static float goertzel_power(const int16_t *samples, size_t count, float coeff)
{
    float q0 = 0.0f;
    float q1 = 0.0f;
    float q2 = 0.0f;

    for (size_t i = 0; i < count; i++) {
        q0 = (coeff * q1) - q2 + (float)samples[i];
        q2 = q1;
        q1 = q0;
    }

    return ((q1 * q1) + (q2 * q2) - (coeff * q1 * q2)) / ((float)count * (float)count);
}

static void update_spectrum(int raw_sample, int filtered_sample)
{
    s_spectrum_raw[s_spectrum_count] = (int16_t)raw_sample;
    s_spectrum_filtered[s_spectrum_count] = (int16_t)filtered_sample;
    s_spectrum_count++;

    if (s_spectrum_count < ECG_SPECTRUM_SIZE) {
        return;
    }

    // 1 Hz bin spacing at fs=250 Hz and N=250. Values are normalized power,
    // useful for before/after comparison rather than calibrated amplitude.
    const float raw30 = goertzel_power(s_spectrum_raw, ECG_SPECTRUM_SIZE, 1.457937255f);
    const float raw35 = goertzel_power(s_spectrum_raw, ECG_SPECTRUM_SIZE, 1.274847979f);
    const float raw40 = goertzel_power(s_spectrum_raw, ECG_SPECTRUM_SIZE, 1.071653590f);
    const float raw50 = goertzel_power(s_spectrum_raw, ECG_SPECTRUM_SIZE, 0.618033989f);
    const float raw60 = goertzel_power(s_spectrum_raw, ECG_SPECTRUM_SIZE, 0.125581039f);
    const float raw100 = goertzel_power(s_spectrum_raw, ECG_SPECTRUM_SIZE, -1.618033989f);
    const float filt30 = goertzel_power(s_spectrum_filtered, ECG_SPECTRUM_SIZE, 1.457937255f);
    const float filt35 = goertzel_power(s_spectrum_filtered, ECG_SPECTRUM_SIZE, 1.274847979f);
    const float filt40 = goertzel_power(s_spectrum_filtered, ECG_SPECTRUM_SIZE, 1.071653590f);
    const float filt50 = goertzel_power(s_spectrum_filtered, ECG_SPECTRUM_SIZE, 0.618033989f);
    const float filt60 = goertzel_power(s_spectrum_filtered, ECG_SPECTRUM_SIZE, 0.125581039f);
    const float filt100 = goertzel_power(s_spectrum_filtered, ECG_SPECTRUM_SIZE, -1.618033989f);

    ESP_LOGI(TAG,
             "ECG spectrum 1s raw_pwr[30=%.1f 35=%.1f 40=%.1f 50=%.1f 60=%.1f 100=%.1f] "
             "filt_pwr[30=%.1f 35=%.1f 40=%.1f 50=%.1f 60=%.1f 100=%.1f]",
             raw30, raw35, raw40, raw50, raw60, raw100,
             filt30, filt35, filt40, filt50, filt60, filt100);

    s_spectrum_count = 0;
}

static void reset_diagnostics(void)
{
    s_dropped_chunks = 0;
    s_sent_chunks = 0;
    s_diag_raw_min = INT_MAX;
    s_diag_raw_max = INT_MIN;
    s_diag_raw_sum = 0;
    s_diag_filtered_min = INT_MAX;
    s_diag_filtered_max = INT_MIN;
    s_diag_filtered_sum = 0;
    s_diag_samples = 0;
    s_diag_window_start_us = esp_timer_get_time();
    s_next_diag_time_us = s_diag_window_start_us + ((int64_t)ECG_DIAG_INTERVAL_S * 1000000);
    s_last_sample_time_us = 0;
    s_diag_interval_min_us = INT_MAX;
    s_diag_interval_max_us = 0;
    s_spectrum_count = 0;
}

static void update_diagnostics(int raw_adc, int raw_sample, int filtered_sample)
{
    const int64_t now = esp_timer_get_time();

    if (raw_sample < s_diag_raw_min) {
        s_diag_raw_min = raw_sample;
    }
    if (raw_sample > s_diag_raw_max) {
        s_diag_raw_max = raw_sample;
    }
    s_diag_raw_sum += raw_sample;

    if (filtered_sample < s_diag_filtered_min) {
        s_diag_filtered_min = filtered_sample;
    }
    if (filtered_sample > s_diag_filtered_max) {
        s_diag_filtered_max = filtered_sample;
    }
    s_diag_filtered_sum += filtered_sample;
    s_diag_samples++;

    if (now >= s_next_diag_time_us && s_diag_samples > 0) {
        const int raw_avg = (int)(s_diag_raw_sum / s_diag_samples);
        const int filtered_avg = (int)(s_diag_filtered_sum / s_diag_samples);
        const int64_t elapsed_us = now - s_diag_window_start_us;
        const int measured_rate = elapsed_us > 0 ?
                                  (int)((s_diag_samples * 1000000LL + (elapsed_us / 2)) / elapsed_us) :
                                  0;
        const int interval_min = s_diag_interval_min_us == INT_MAX ? 0 : s_diag_interval_min_us;
        ESP_LOGI(TAG,
                 "ECG: fs=%dHz target=%dHz dt_min=%dus dt_max=%dus adc=%d "
                 "raw=%d raw_min=%d raw_max=%d raw_avg=%d raw_p2p=%d "
                 "filt=%d filt_min=%d filt_max=%d filt_avg=%d filt_p2p=%d sent=%lu dropped=%lu",
                 measured_rate,
                 ECG_SAMPLE_RATE,
                 interval_min,
                 s_diag_interval_max_us,
                 raw_adc,
                 raw_sample,
                 s_diag_raw_min,
                 s_diag_raw_max,
                 raw_avg,
                 s_diag_raw_max - s_diag_raw_min,
                 filtered_sample,
                 s_diag_filtered_min,
                 s_diag_filtered_max,
                 filtered_avg,
                 s_diag_filtered_max - s_diag_filtered_min,
                 (unsigned long)s_sent_chunks,
                 (unsigned long)s_dropped_chunks);

        s_diag_raw_min = INT_MAX;
        s_diag_raw_max = INT_MIN;
        s_diag_raw_sum = 0;
        s_diag_filtered_min = INT_MAX;
        s_diag_filtered_max = INT_MIN;
        s_diag_filtered_sum = 0;
        s_diag_samples = 0;
        s_diag_window_start_us = now;
        s_diag_interval_min_us = INT_MAX;
        s_diag_interval_max_us = 0;
        s_next_diag_time_us = now + ((int64_t)ECG_DIAG_INTERVAL_S * 1000000);
    }
}

static void update_sample_timing_diagnostics(int64_t now)
{
    if (s_last_sample_time_us != 0) {
        const int64_t delta_us = now - s_last_sample_time_us;
        if (delta_us > 0 && delta_us < s_diag_interval_min_us) {
            s_diag_interval_min_us = (int32_t)delta_us;
        }
        if (delta_us > s_diag_interval_max_us && delta_us <= INT_MAX) {
            s_diag_interval_max_us = (int32_t)delta_us;
        }
    }
    s_last_sample_time_us = now;
}

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
        update_sample_timing_diagnostics(esp_timer_get_time());
        int16_t raw_sample = (int16_t)(adc_value - ECG_RAW_CENTER);

        s_raw_buffer[s_buffer_head] = raw_sample;
        s_buffer_head = (s_buffer_head + 1) % ECG_BUFFER_SIZE;

        s_session.samples_since_start++;

        // When we have a full chunk of samples, copy and send via ring buffer.
        if (s_session.samples_since_start % ECG_CHUNK_SIZE == 0) {
            ecg_raw_chunk_t chunk = {
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

            if (xRingbufferSend(s_chunk_ringbuf, &chunk, sizeof(ecg_raw_chunk_t), 0) != pdTRUE) {
                s_dropped_chunks++;
                ESP_LOGW(TAG, "ECG: dropped raw chunk sequence=%u", chunk.sequence);
            }
        }
    }
}

static void process_raw_chunk(const ecg_raw_chunk_t *raw_chunk)
{
    if (raw_chunk == NULL) {
        return;
    }

    ecg_chunk_t filtered_chunk = {
        .sequence = raw_chunk->sequence,
        .timestamp = raw_chunk->timestamp,
        .samples = {0}
    };

    for (int i = 0; i < ECG_CHUNK_SIZE; i++) {
        const int raw_sample = raw_chunk->samples[i];
        const int filtered_sample = process_ecg_sample(raw_sample);
        filtered_chunk.samples[i] = filtered_sample;
        s_filtered_buffer[s_filtered_buffer_head] = (int16_t)filtered_sample;
        s_filtered_buffer_head = (s_filtered_buffer_head + 1) % ECG_BUFFER_SIZE;
        update_diagnostics(raw_sample + ECG_RAW_CENTER, raw_sample, filtered_sample);
        update_spectrum(raw_sample, filtered_sample);
    }

    s_sent_chunks++;

    if (s_data_callback != NULL) {
        s_data_callback(&filtered_chunk, s_callback_arg);
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
        ecg_raw_chunk_t *chunk = (ecg_raw_chunk_t *)xRingbufferReceive(s_chunk_ringbuf, &chunk_size,
                                                                       pdMS_TO_TICKS(200));

        // STOPPING must also deliver: the last chunk enqueued by the sample
        // timer before it was cancelled often arrives here after the state has
        // flipped, and dropping it lost the final 200 ms of the recording even
        // though the drain loop below was written to preserve exactly that tail.
        if (chunk != NULL &&
            (s_session.state == ECG_STATE_RUNNING || s_session.state == ECG_STATE_STOPPING)) {
            process_raw_chunk(chunk);
        }

        if (chunk != NULL) {
            vRingbufferReturnItem(s_chunk_ringbuf, chunk);
        }

        if (s_session.state == ECG_STATE_STOPPING) {
            // Drain whatever is still queued before closing the session, so
            // the tail of the recording is not thrown away.
            void *pending = xRingbufferReceive(s_chunk_ringbuf, &chunk_size, 0);
            while (pending != NULL) {
                process_raw_chunk((ecg_raw_chunk_t *)pending);
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
    s_filtered_buffer_head = 0;
    memset(s_raw_buffer, 0, sizeof(s_raw_buffer));
    memset(s_filtered_buffer, 0, sizeof(s_filtered_buffer));
    reset_filter_state();
    reset_diagnostics();
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
