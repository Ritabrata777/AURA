#pragma once

// The local OLED UI is a pure display: it renders the latest shared sensor
// state on a fixed refresh cycle and lets the buttons pick which screen is
// shown. It never initializes, starts, stops, or reads any sensor.
void local_ui_init(const char *pairing_code);
