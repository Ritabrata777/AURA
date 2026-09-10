# ESP32 Health Device Troubleshooting Guide

## Current Status After Updates

### ✅ What Was Fixed
1. **Pin Configuration** - Updated for ESP32-38 pin board
2. **I2C Communication** - Fixed scanner and buffer transmission issues  
3. **OLED Display** - Enhanced error handling and chunked data transmission
4. **Logging** - Added detailed diagnostic information

### 📋 Expected Log Output

When the device starts correctly, you should see:

```
I (xxx) app: I2C bus initialized: SDA=22 SCL=21
I (xxx) app: Starting I2C scanner...
I (xxx) app: I2C device found at address 0x3C    ← OLED detected
I (xxx) oled_ssd1306: OLED found at 0x3C
I (xxx) oled_ssd1306: Sending OLED initialization commands...
I (xxx) oled_ssd1306: OLED initialization commands sent successfully
I (xxx) oled_ssd1306: Clearing display...
I (xxx) oled_ssd1306: Testing OLED display...
I (xxx) oled_ssd1306: OLED display test successful!
I (xxx) app: ✓ OLED Display working correctly
```

## 🔧 Hardware Connections (ESP32-38 Pin)

### OLED SSD1306 (I2C)
- **VCC** → 3.3V (NOT 5V!)
- **GND** → Ground  
- **SDA** → GPIO 22
- **SCL** → GPIO 21

### Buttons
- **Button 1** → GPIO 32 (with internal pullup)
- **Button 2** → GPIO 33 (with internal pullup)

### Buzzer  
- **Buzzer** → GPIO 13

### ECG AD8232
- **ECG OUT** → GPIO 34 (ADC input)
- **LO+** → GPIO 25
- **LO-** → GPIO 26  
- **SDN** → GPIO 27

## 🚨 Common Issues & Solutions

### OLED Display Not Working

**Symptoms:**
- No display on OLED screen
- Errors like "ESP_ERR_INVALID_RESPONSE"
- "No I2C devices found"

**Troubleshooting:**
1. **Check Power Supply**
   - OLED must use 3.3V, NOT 5V
   - Ensure adequate current supply (some USB ports are insufficient)

2. **Check Wiring**
   - Verify SDA/SCL connections to GPIO 22/21
   - Ensure solid connections (breadboard contacts can be loose)
   - Try external 4.7kΩ pull-up resistors on SDA/SCL if needed

3. **Check I2C Address**
   - Log should show "I2C device found at address 0x3C"
   - Some OLEDs use 0x3D instead

### MQTT Connection Failures

**Symptoms:**  
- "MQTT error transport connect"
- "MQTT disconnected"

**Solutions:**
1. **Update Broker IP** in `main/app_config.h`:
   ```c
   #define CONFIG_MQTT_BROKER_URI "mqtt://YOUR_BROKER_IP:1883"
   ```

2. **Check Network**
   - Ensure ESP32 and MQTT broker are on same network
   - Test broker connectivity: `mosquitto_pub -h YOUR_BROKER_IP -t test -m "hello"`

3. **WiFi Credentials**
   - Update in menuconfig or check logs for connection status

## 📊 Monitoring Success

### OLED Success Indicators
- Text appears on display ("Hello World", "ESP32 Ready!")
- Log shows: "✓ OLED Display working correctly"
- Display cycles through different screens every 10 seconds

### MQTT Success Indicators  
- Log shows: "✓ MQTT connected successfully"
- Device starts publishing sensor data
- Remote MQTT clients can receive messages

### I2C Success Indicators
- I2C scanner finds device at 0x3C  
- No "ESP_ERR_INVALID_RESPONSE" errors
- Smooth display updates without communication errors

## 🔍 Debug Commands

### View Current Configuration
Check the device logs for:
- WiFi SSID being used
- MQTT broker URL 
- I2C device detection results
- Pin assignments confirmation

### Test MQTT Broker  
From another machine on the network:
```bash
# Test broker connectivity
mosquitto_pub -h YOUR_BROKER_IP -t test -m "hello"
mosquitto_sub -h YOUR_BROKER_IP -t "devices/+/+"
```

### Verify OLED Hardware
- Try a simple I2C scanner sketch first
- Test OLED with Arduino library to verify hardware
- Check for proper 3.3V supply voltage with multimeter

## 📞 Next Steps

If issues persist:

1. **OLED Issues**: Focus on power supply (3.3V) and wiring
2. **MQTT Issues**: Verify broker IP and network connectivity  
3. **I2C Issues**: Check for hardware conflicts or faulty connections

The enhanced logging will pinpoint exactly where the failure occurs.