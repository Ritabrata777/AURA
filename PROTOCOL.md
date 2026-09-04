# Health Device Protocol

Version: 1
Status: prototype contract

This document is the compatibility contract between the ESP32 firmware and the web platform. Changes that alter topic names, required fields, field meanings, or command behavior require a protocol version change and must be copied to the web-platform repository.

## Identity

- `deviceId`: backend-issued UUID; used in MQTT topics.
- `hardwareId`: stable ESP32 chip identity, never a credential.
- `pairingCode`: short human-readable code, for example `MED-A7F291`.
- Device authentication uses a separate provisioned credential or client certificate. The pairing code is never an MQTT or HTTPS secret.

## MQTT topics

All topics are rooted at `devices/{deviceId}`:

- `status`: retained device status and heartbeat.
- `measurements`: derived point-in-time measurements.
- `ecg`: chunked ECG samples.
- `events`: lifecycle, error, and audit-relevant events.
- `commands`: backend-to-device commands.
- `acks`: device acknowledgements for commands.

Production MQTT uses TLS and authenticated client identity. Browsers never connect directly to MQTT.

## Common envelope

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "deviceId": "uuid",
  "timestamp": "2026-09-04T12:00:00Z"
}
```

`timestamp` is UTC ISO-8601 after time synchronization. Before synchronization, the device must set `timeSynced` to `false` in status and may use its monotonic boot-relative timestamp internally.

## Status payload

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "deviceId": "uuid",
  "timestamp": "2026-09-04T12:00:00Z",
  "type": "STATUS",
  "firmwareVersion": "0.1.0",
  "hardwareId": "esp32-chip-id",
  "pairingCode": "MED-A7F291",
  "wifiConnected": true,
  "mqttConnected": true,
  "timeSynced": true,
  "activeSessionId": null,
  "freeHeap": 123456
}
```

## Measurement payload

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "deviceId": "uuid",
  "timestamp": "2026-09-04T12:00:00Z",
  "type": "MEASUREMENT",
  "measurementType": "HEART_RATE",
  "value": 72.0,
  "unit": "bpm",
  "quality": "VALID",
  "sessionId": "uuid"
}
```

Supported `measurementType` values: `HEART_RATE`, `SPO2`, `TEMPERATURE`. Values are raw or derived sensor measurements, not diagnoses.

## ECG chunks

ECG samples are batched; one MQTT message must not represent one sample.

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "deviceId": "uuid",
  "timestamp": "2026-09-04T12:00:00Z",
  "type": "ECG_DATA",
  "sessionId": "uuid",
  "sequence": 10,
  "sampleRate": 250,
  "samples": [2048, 2051, 2044]
}
```

The backend persists one `ecg_sessions` record and chunk records keyed by `(sessionId, sequence)`. Missing sequences are detectable without storing individual sample rows.

## Commands and acknowledgements

Command topic payload:

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "deviceId": "uuid",
  "command": "START_ECG",
  "parameters": { "durationSeconds": 60 }
}
```

Commands: `START_ECG`, `STOP_ECG`, `START_SPO2`, `STOP_SPO2`, `START_TEMPERATURE`, `GET_STATUS`.

Acknowledgement topic payload:

```json
{
  "protocolVersion": 1,
  "messageId": "uuid",
  "commandId": "uuid",
  "deviceId": "uuid",
  "type": "COMMAND_ACK",
  "command": "START_ECG",
  "status": "ACCEPTED",
  "errorCode": null
}
```

`status` is `ACCEPTED`, `COMPLETED`, or `REJECTED`. Error codes include `INVALID_COMMAND`, `BUSY`, `SENSOR_UNAVAILABLE`, `INVALID_PARAMETERS`, and `NOT_PROVISIONED`.

## Compatibility rules

1. Unknown optional fields must be ignored.
2. Unknown commands must be rejected with `INVALID_COMMAND`.
3. `protocolVersion` is required on every payload.
4. The server validates every inbound payload before persistence or broadcast.
5. Health data is sensitive; APIs expose only authorized patient data and audit access.
