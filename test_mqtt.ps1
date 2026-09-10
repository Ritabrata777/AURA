# ESP32 MQTT Testing Script
# This script helps you test MQTT communication with your ESP32

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "ESP32 MQTT Testing Tool" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$CONTAINER_ID = "8d819f213bdc"
$BROKER_IP = "10.241.102.232"

# Check if Docker is running
Write-Host "[1/3] Checking Docker status..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>$null
if (-not $dockerRunning) {
    Write-Host "ERROR: Docker is not running!" -ForegroundColor Red
    exit 1
}

# Check if Mosquitto container is running
Write-Host "[2/3] Checking Mosquitto broker..." -ForegroundColor Yellow
$mosquittoRunning = docker ps --filter "id=$CONTAINER_ID" --format "{{.ID}}"
if (-not $mosquittoRunning) {
    Write-Host "ERROR: Mosquitto container not running!" -ForegroundColor Red
    Write-Host "Start it with: docker start $CONTAINER_ID" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Mosquitto broker running" -ForegroundColor Green

# Test MQTT connection
Write-Host "[3/3] Testing MQTT broker..." -ForegroundColor Yellow
$testResult = docker exec $CONTAINER_ID mosquitto_pub -h localhost -t "test/kiro" -m "Connection test" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ MQTT broker responding" -ForegroundColor Green
} else {
    Write-Host "✗ MQTT test failed: $testResult" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "System Ready!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "MQTT Broker: mqtt://$BROKER_IP`:1883" -ForegroundColor White
Write-Host ""

# Interactive menu
while ($true) {
    Write-Host ""
    Write-Host "Choose an option:" -ForegroundColor Yellow
    Write-Host "1. Subscribe to all ESP32 messages (devices/#)"
    Write-Host "2. Subscribe to specific device"
    Write-Host "3. Send START_SPO2 command"
    Write-Host "4. Send START_ECG command"
    Write-Host "5. Send GET_STATUS command"
    Write-Host "6. View Mosquitto logs"
    Write-Host "7. Test publish message"
    Write-Host "0. Exit"
    Write-Host ""
    
    $choice = Read-Host "Enter choice"
    
    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Host "Subscribing to devices/# (Press Ctrl+C to stop)..." -ForegroundColor Green
            Write-Host ""
            docker exec -it $CONTAINER_ID mosquitto_sub -h localhost -t "devices/#" -v
        }
        "2" {
            $deviceId = Read-Host "Enter device ID (e.g., ECE334149CAC)"
            Write-Host ""
            Write-Host "Subscribing to devices/$deviceId/# (Press Ctrl+C to stop)..." -ForegroundColor Green
            Write-Host ""
            docker exec -it $CONTAINER_ID mosquitto_sub -h localhost -t "devices/$deviceId/#" -v
        }
        "3" {
            $deviceId = Read-Host "Enter device ID"
            $message = '{"command":"START_SPO2","commandId":"cmd-' + (Get-Date -Format "yyyyMMddHHmmss") + '"}'
            Write-Host "Sending: $message" -ForegroundColor Cyan
            docker exec $CONTAINER_ID mosquitto_pub -h localhost -t "devices/$deviceId/commands" -m $message
            Write-Host "✓ Command sent" -ForegroundColor Green
        }
        "4" {
            $deviceId = Read-Host "Enter device ID"
            $duration = Read-Host "Duration in seconds (default: 30)"
            if ([string]::IsNullOrWhiteSpace($duration)) { $duration = 30 }
            $message = '{"command":"START_ECG","commandId":"cmd-' + (Get-Date -Format "yyyyMMddHHmmss") + '","durationSeconds":' + $duration + '}'
            Write-Host "Sending: $message" -ForegroundColor Cyan
            docker exec $CONTAINER_ID mosquitto_pub -h localhost -t "devices/$deviceId/commands" -m $message
            Write-Host "✓ Command sent" -ForegroundColor Green
        }
        "5" {
            $deviceId = Read-Host "Enter device ID"
            $message = '{"command":"GET_STATUS","commandId":"cmd-' + (Get-Date -Format "yyyyMMddHHmmss") + '"}'
            Write-Host "Sending: $message" -ForegroundColor Cyan
            docker exec $CONTAINER_ID mosquitto_pub -h localhost -t "devices/$deviceId/commands" -m $message
            Write-Host "✓ Command sent" -ForegroundColor Green
        }
        "6" {
            Write-Host ""
            Write-Host "Mosquitto logs (Press Ctrl+C to stop)..." -ForegroundColor Green
            Write-Host ""
            docker logs -f $CONTAINER_ID
        }
        "7" {
            $topic = Read-Host "Enter topic (e.g., test/message)"
            $message = Read-Host "Enter message"
            docker exec $CONTAINER_ID mosquitto_pub -h localhost -t $topic -m $message
            Write-Host "✓ Message sent" -ForegroundColor Green
        }
        "0" {
            Write-Host "Goodbye!" -ForegroundColor Cyan
            exit 0
        }
        default {
            Write-Host "Invalid choice!" -ForegroundColor Red
        }
    }
}
