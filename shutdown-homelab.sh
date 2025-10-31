#!/bin/bash

# Homelab Shutdown Script
# Run with: bash shutdown-homelab.sh

echo "Shutting down Homelab Development Platform..."

# Function to safely stop a service
stop_service() {
    local service_dir=$1
    local service_name=$2
    
    if [ -d "$service_dir" ]; then
        echo "Stopping $service_name..."
        cd "$service_dir"
        docker compose down
        echo "$service_name stopped"
    else
        echo "WARNING: $service_name directory not found: $service_dir"
    fi
}

# Base directories
HOMELAB_DIR="/home/admin/homelab"
N8N_DIR="/home/admin/n8n-compose"

echo "Stopping homelab services..."

# Stop all homelab services
stop_service "$HOMELAB_DIR/bookstack" "BookStack Documentation"
stop_service "$HOMELAB_DIR/qwen" "Qwen AI Interface"
stop_service "$HOMELAB_DIR/monitoring" "Uptime Kuma"
stop_service "$HOMELAB_DIR/code-server" "Code Server"
stop_service "$HOMELAB_DIR/gitea" "Gitea Git Server"
stop_service "$HOMELAB_DIR/dashboard" "Dashboard"

# Stop N8N and File Browser
echo "Stopping N8N and File Browser..."
stop_service "$N8N_DIR" "N8N & File Browser"

echo ""
echo "Checking for any remaining containers..."
RUNNING_CONTAINERS=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v "NAMES")

if [ -n "$RUNNING_CONTAINERS" ]; then
    echo "Found running containers:"
    echo "$RUNNING_CONTAINERS"
    echo ""
    read -p "Stop all remaining containers? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping all remaining containers..."
        docker stop $(docker ps -q) 2>/dev/null || echo "No containers to stop"
    fi
else
    echo "No containers currently running"
fi

echo ""
echo "Network cleanup..."
# Check if homelab network exists and has containers
NETWORK_EXISTS=$(docker network ls | grep homelab-network || true)
if [ -n "$NETWORK_EXISTS" ]; then
    CONNECTED_CONTAINERS=$(docker network inspect homelab-network --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || true)
    if [ -z "$CONNECTED_CONTAINERS" ]; then
        echo "Removing empty homelab network..."
        docker network rm homelab-network 2>/dev/null || echo "Network already removed or in use"
    else
        echo "Network still has connected containers: $CONNECTED_CONTAINERS"
    fi
fi

echo ""
echo "Final status:"
echo "================"
echo "Docker containers: $(docker ps --format '{{.Names}}' | wc -l) running"
echo "Docker networks: $(docker network ls | grep -v bridge | grep -v host | grep -v none | wc -l) custom networks"
echo "Docker volumes: $(docker volume ls -q | wc -l) volumes"

echo ""
echo "Windows AI Server:"
echo "============================"
echo "Don't forget to stop services on your Windows laptop:"
echo "1. Stop Ollama: Press Ctrl+C in ollama terminal"
echo "2. Stop Cloudflare tunnel: Press Ctrl+C in cloudflared terminal"
echo "3. Or stop scheduled tasks:"
echo "   schtasks /end /tn \"OllamaAutoStart\""
echo "   schtasks /end /tn \"CloudflareAITunnel\""

echo ""
echo "Shutdown Options:"
echo "==================="
echo "1. Keep Pi running (services stopped)"
echo "2. Shutdown Pi completely"
echo ""

read -p "Shutdown the Pi? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Shutting down Raspberry Pi in 5 seconds..."
    echo "Press Ctrl+C to cancel..."
    sleep 5
    sudo shutdown -h now
else
    echo ""
    echo "Homelab services stopped successfully!"
    echo ""
    echo "To restart later:"
    echo "==================="
    echo "cd /home/admin && bash setup-homelab.sh"
    echo ""
    echo "Or start individual services:"
    echo "cd /home/admin/homelab/[service] && docker compose up -d"
fi
