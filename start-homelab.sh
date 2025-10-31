#!/bin/bash
# Wait for system to stabilize after boot
sleep 30

# Ensure Docker network exists
docker network create homelab-network 2>/dev/null || true

# Start all homelab services
cd /home/admin/homelab
for service in dashboard gitea code-server monitoring qwen bookstack; do
    if [ -d "$service" ]; then
        echo "Starting $service..."
        cd "$service"
        docker compose up -d
        cd ..
    fi
done

# Start N8N and File Browser
cd /home/admin/n8n-compose
docker compose up -d

echo "Homelab startup complete"
