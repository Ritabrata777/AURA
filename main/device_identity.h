#pragma once

#include "protocol_types.h"

void device_identity_init(void);
const health_device_status_t *device_identity_status(void);
void device_identity_set_active_session(const char *session_id);
