@echo off
setlocal
title Pulse Link - Start Services

set "ROOT=%~dp0"
set "PLATFORM=%ROOT%web-platform"

if not exist "%PLATFORM%\package.json" (
  echo ERROR: web-platform package.json was not found.
  echo Expected: "%PLATFORM%\package.json"
  pause
  exit /b 1
)

cd /d "%PLATFORM%"

echo Starting PostgreSQL and MQTT...
docker compose up -d postgres mqtt
if errorlevel 1 (
  echo ERROR: Docker services could not be started.
  echo Make sure Docker Desktop is running.
  pause
  exit /b 1
)

echo Opening API server...
start "Pulse Link API" /D "%PLATFORM%" cmd /k "npm run prisma:generate && npx prisma migrate deploy && npm run dev:api"

echo Opening web server...
start "Pulse Link Web" /D "%PLATFORM%" cmd /k "npm run dev:web"

echo.
echo Pulse Link services are starting.
echo Web: http://localhost:3000
echo API: http://localhost:3001
echo MQTT: mqtt://localhost:1883
echo.
echo ESP32 MQTT address must use this computer's Wi-Fi IPv4 address:
ipconfig | findstr /C:"IPv4 Address"
echo Set main/app_config.h to mqtt://YOUR_WIFI_IPV4:1883, then rebuild and flash.
echo Close the API and Web terminal windows to stop development servers.
echo Run "docker compose down" in web-platform to stop PostgreSQL and MQTT.
timeout /t 5 >nul
exit /b 0
