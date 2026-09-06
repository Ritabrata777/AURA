FROM eclipse-mosquitto:2

# Password file is generated at container start from environment secrets, so
# real credentials never live in the repository. Anonymous MQTT on the public
# internet would let anyone read health data or publish fake vitals.
COPY <<'EOF' /entrypoint.sh
#!/bin/sh
set -e
if [ -z "$MQTT_USERNAME" ] || [ -z "$MQTT_PASSWORD" ]; then
  echo "MQTT_USERNAME and MQTT_PASSWORD must be set" >&2
  exit 1
fi
touch /mosquitto/config/passwd
mosquitto_passwd -b /mosquitto/config/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
exec mosquitto -c /mosquitto/config/mosquitto.conf
EOF
RUN chmod +x /entrypoint.sh

COPY mosquitto-cloud.conf /mosquitto/config/mosquitto.conf

EXPOSE 1883
ENTRYPOINT ["/entrypoint.sh"]
