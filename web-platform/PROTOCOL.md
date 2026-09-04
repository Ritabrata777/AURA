# Health Device Protocol

Protocol version: 1. This is the synchronized web-platform copy of the firmware contract. Update both files in the same change.

## Topics

All topics use `devices/{deviceId}/{suffix}`. Supported suffixes are `status`, `measurements`, `ecg`, `events`, `commands`, and `acks`. MQTT is server-side only; browsers use authenticated REST and WebSocket APIs.

## Common envelope

```json
{
	"protocolVersion": 1,
	"messageId": "uuid",
	"deviceId": "uuid",
	"timestamp": "2026-09-04T12:00:00Z"
}
```

The backend-issued `deviceId` and stable `hardwareId` identify a device. The human-readable `pairingCode` is not a credential; MQTT authentication uses a separate provisioned credential or client certificate.

## Measurement

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

Measurement types are `HEART_RATE`, `SPO2`, and `TEMPERATURE`. These are sensor measurements or derived metrics, not diagnoses.

## ECG chunks

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

The API persists one ECG session and chunk records keyed by `(sessionId, sequence)`, detects missing sequences, and never stores one database row per sample.

## Commands and acknowledgements

Commands are `START_ECG`, `STOP_ECG`, `START_SPO2`, `STOP_SPO2`, `START_TEMPERATURE`, and `GET_STATUS`.

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

Acknowledgements use `ACCEPTED`, `COMPLETED`, or `REJECTED`. Error codes are `INVALID_COMMAND`, `BUSY`, `SENSOR_UNAVAILABLE`, `INVALID_PARAMETERS`, and `NOT_PROVISIONED`.

## Required server behavior

- Validate every payload and reject unsupported protocol versions.
- Authenticate devices independently of pairing codes.
- Broadcast only validated data over authorized WebSocket sessions.
- Enforce patient ownership and accepted doctor-patient relationships.
- Audit access to sensitive health data.
