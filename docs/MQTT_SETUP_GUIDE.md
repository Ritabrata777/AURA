# MQTT Broker Setup Guide - Eclipse Mosquitto (Docker)

## Your Current Setup

You have Eclipse Mosquitto MQTT broker running in Docker:
- **Container ID**: `8d819f213bdc`
- **Image**: `eclipse-mosquitto:2`
- **MQTT Port**: `1883` (exposed)
- **WebSocket Port**: `9001` (exposed)

## Step 1: Find Your Computer's IP Address

The ESP32 needs to connect to your computer's IP address (NOT `localhost`).

### Windows
```powershell
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

### Linux/Mac
```bash
ip addr show
# or
ifconfig
```
Look for `inet` address (not 127.0.0.1).

**Example IPs:**
- Home WiFi: `192.168.1.100`, `192.168.0.50`, `10.0.0.25`
- Mobile Hotspot: `192.168.43.1`, `172.20.10.1`

## Step 2: Update ESP32 Configuration

Edit `main/app_config.h` and replace the broker URL:

```c
#define CONFIG_MQTT_BROKER_URI "mqtt://YOUR_IP_ADDRESS:1883"
```

**Example:**
```c
#define CONFIG_MQTT_BROKER_URI "mqtt://192.168.1.100:1883"
```

## Step 3: Verify Mosquitto Configuration

Check if your Mosquitto broker allows anonymous connections:

```bash
# Check if the container is running
docker ps | grep mosquitto

# View Mosquitto logs
docker logs 8d819f213bdc

# Check Mosquitto configuration
docker exec 8d819f213bdc cat /mosquitto/config/mosquitto.conf
```

### If Anonymous Access is Disabled

Create or update `mosquitto.conf`:

```conf
# Allow anonymous connections (for development)
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/

# WebSocket support
listener 9001
protocol websockets
```

Then restart the container:
```bash
docker restart 8d819f213bdc
```

## Step 4: Test MQTT Connection

Before flashing ESP32, test the broker from your computer:

### Install Mosquitto Client Tools

**Windows:**
Download from: https://mosquitto.org/download/

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install mosquitto-clients
```

**Mac:**
```bash
brew install mosquitto
```

### Test Publishing & Subscribing

**Terminal 1 - Subscribe:**
```bash
mosquitto_sub -h localhost -t "test/#" -v
```

**Terminal 2 - Publish:**
```bash
mosquitto_pub -h localhost -t "test/message" -m "Hello MQTT"
```

You should see the message appear in Terminal 1.

### Test ESP32 Topics

**Subscribe to ESP32 device topics:**
```bash
mosquitto_sub -h localhost -t "devices/+/+" -v
```

This will show all messages from your ESP32 when it connects.

## Step 5: Firewall Configuration

Make sure port 1883 is accessible:

### Windows Firewall
```powershell
# Allow incoming connections on port 1883
New-NetFirewallRule -DisplayName "MQTT Broker" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow
```