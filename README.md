# Pi-Hub

A completely portable, self-hosted development environment running on a Raspberry Pi 4. Everything you need to code, deploy, and manage projects from anywhere, with 10 hours of battery life, automatic network failover, automated AI Documentation generation, MCP Server integration, and autonomous health management.

## Why Not Just Use Cloud Services?

Let's talk money. Here's what equivalent cloud services would cost:

**Monthly Costs:**
- GitHub Codespaces: $9-24/month
- VPS Hosting (DigitalOcean/Linode): $12-20/month
- Managed Git Hosting: $7-15/month
- Documentation Platform: $5-10/month
- Workflow Automation: $20-50/month
- File Storage (100GB+): $5-10/month
- **Total: $58-129/month** or **$696-1,548/year**

**Pi-Hub Component Costs (One-Time):**
- Raspberry Pi 4 (4GB): $55
- 128GB MicroSD Card: $15
- 2TB External SSD: $100
- 20,000mAh USB-C Power Bank: $40
- Waterproof Hard Case: $25
- 3D Printed Components: $3.50 if you have a printer
- LCD Display + LED Matrix: $20
- Heatsinks and cooling: $10
- USB-C Cables and adapters: $15
- **Total: ~$320**

**Break-Even Analysis:**
- At the low end ($58/month): Break even in 5.5 months
- At the high end ($129/month): Break even in 2.5 months
- After year one: Save $376-1,228 annually
- Power cost: ~$6/year (5W × 24/7)

The Pi pays for itself in less than half a year, and you own the hardware.

## What It Does

Pi-Hub transforms a Raspberry Pi into a complete development system with the following services:

**Development Tools**
- **Gitea**: Full-featured Git hosting with Actions for CI/CD pipelines. Clone repos, push code, trigger automated builds and tests.
- **VS Code Server**: Browser-based VS Code instance. Same extensions, same keybindings, same everything as desktop VSCode but accessible from any device (hardware intensive).
- **Qwen AI Assistant**: Local AI coding assistant powered by Qwen2.5. Connected to an Ollama instance running on separate hardware for code completion and explanations.

**Productivity & Automation**
- **N8N**: Workflow automation platform. Build integrations between services, automate deployments, schedule tasks, or scrape data.
- **BookStack**: Wiki and documentation platform. Keep project notes, technical docs, and knowledge base articles organized.
- **File Browser**: Web-based file manager with access to the 2TB SSD. Upload, download, and organize files without SSH or SCP.

**Monitoring & Management**
- **Uptime Kuma**: Service monitoring dashboard. Tracks which services are running and alerts when something goes down.
- **React Dashboard**: Unified dashboard for accessing all services. One landing page with links to everything, as well as some fun features, like a news feed, and message board.
- **Custom LCD Display**: Physical 20x4 LCD showing system stats (CPU, RAM, disk usage, network info) and service status with an 8x8 LED matrix displaying system health as emoji faces.

All services run in Docker containers connected through a shared network. External access is handled by Cloudflare Tunnels, so you don't need to mess with port forwarding or expose your home IP.

## The Portable Setup

This isn't just a Pi sitting on a desk, its a Pi sitting on a desk, but cool:

**Physical Design**
- Housed in a waterproof hard case
- Custom 3D-printed mounting system secures the Pi, SSD, and power bank
- 3D-printed face plate with cutouts for the LCD display and LED matrix
- Professional-ish appearance
- Ventilation designed to prevent overheating in the enclosed space

**Power System**
- 20,000mAh USB-C power bank provides 8-10 hours of continuous operation
- Pi 4 + 2TB SSD draws approximately 6-10W under normal load
- Pass-through charging means you can use it while plugged in
- Power bank has status LEDs visible through case cutout

**Network Intelligence**
- Automatically detects available WiFi networks and connects
- Falls back to iPhone hotspot when no known network is available
- Network transition happens seamlessly without service interruption
- Cloudflare Tunnel maintains persistent connection regardless of network changes
- Works at home, coffee shops, campus, or literally anywhere with cellular signal

**Storage**
- 2TB external SSD connected via USB 3.0
- Fast enough for database operations and container I/O
- Partitioned for Docker data, NAS storage, and project files
- Orders of magnitude more reliable than SD card for constant write operations

This setup means you can grab the case, throw it in a backpack, and have your entire development environment operational wherever you go.

## Why This Exists

I wanted a development environment I could access from any device without depending on cloud services or subscription fees. Laptop, desktop, tablet, phone, doesn't matter, open a browser and everything's there.

Having the whole thing portable meant I could work on projects during downtime at school, continue work on the same environment at home, and even code while traveling. The automatic network switching means it works everywhere without configuration.

The Pi uses about 5-8 watts of power depending on load. Running 24/7 at home costs less than $10/year in electricity. The 20,000mAh battery gives you a full work day of completely off-grid operation. Compare that to cloud VPS hosting at $5-20/month with usage limits and you're way ahead financially.

Having everything self-hosted means you control the data, the services, and how they're configured. No vendor lock-in, no surprise price increases, no service deprecations. If you want to change something, you just edit a docker-compose file.

It's also a practical way to learn system administration, networking, and containerization. Setting this up teaches you:
- Docker and container orchestration
- Linux service management and systemd
- Network troubleshooting and DNS configuration
- Database administration (PostgreSQL, MariaDB)
- SSH tunneling and secure remote access
- Power management and hardware optimization
- 3D design and physical product engineering

## Technical Details

**Hardware**
- Raspberry Pi 4 (4GB RAM)
- 128GB MicroSD card (system boot)
- 2TB USB 3.0 SSD (all data and containers)
- 20,000mAh USB-C PD power bank
- 2004A I2C LCD (20x4 characters)
- MAX7219 8x8 LED matrix
- Waterproof hard case with custom 3D-printed internals
- Heatsink and thermal management for enclosed operation

**Software Stack**
- Ubuntu Server 64-bit
- Docker and Docker Compose
- All services containerized and isolated
- Shared `homelab-network` bridge network for inter-container communication
- Python daemon for display management

**Data Persistence**
Each service has its own directory under `/home/admin/homelab/` with volumes for persistent data. The 2TB SSD is mounted at `/mnt/storage/` with separate partitions:
- `/mnt/storage/docker/` - Docker container data and images
- `/mnt/storage/nas/` - Shared file storage
- `/mnt/storage/projects/` - Development projects and scratch space

Everything is regular files on ext4 filesystem, so backups are straightforward. No proprietary formats or complex storage systems.

**Power Management**
The system is optimized for battery operation:
- Aggressive CPU frequency scaling
- Container resource limits prevent runaway processes
- SSD configured with laptop mode for power efficiency
- Typical runtime of 8-10 hours on battery depending on workload

**Network Failover**
WiFi configuration includes multiple network profiles with priority ordering:
1. Home network (primary)
2. Known trusted networks (school, work, etc.)
3. iPhone personal hotspot (fallback)

The system attempts connection in order and automatically switches when networks become available or unavailable. Cloudflare Tunnel maintains persistent outbound connection that survives network changes.

## Scripts

Two bash scripts handle the Startup and Shutdown:

**start-homelab.sh**
Brings up all services after a reboot or shutdown. Includes a 30-second delay to let the system stabilize after boot. Can be added to systemd or cron for automatic startup.

**shutdown-homelab.sh**
Gracefully stops all containers in reverse dependency order. Checks for orphaned containers, offers to clean up networks, and can optionally shut down the Pi itself. Includes a reminder about stopping the Windows AI server, if you so choose.

**homelab-display.py**
Python daemon that monitors Docker containers and system metrics, then displays everything on the connected LCD and LED matrix. Shows running service count, CPU/RAM/disk usage, temperature, uptime, and network info. The LED matrix shows a happy face when all services are up, neutral for most services, and sad when services are down.

Includes a fun startup animation sequence with a bunch of animations, change them or make some yourself, the led matrix is a cute little way to express yourself, it makes the system feel more alive.

## AI Integrations
*adding documentation tomorrow, its working but im going to bed*

## Who This Is For

This project makes sense if you:

**Want Location Independence**
Work from multiple locations or devices. Having your dev environment accessible via HTTPS from anywhere means you're never locked to one machine. Start coding on your desktop, continue on your laptop at a coffee shop, make a quick fix from your phone, or work during breaks on school computers. The portable case means you can literally carry your entire infrastructure with you.

**Value Privacy and Control**
All your code, notes, and workflows stay on hardware you own. No third party can read your repos, scan your projects, or train models on your data. You decide who has access and how it's secured. The AI assistant runs on your network, so your code never leaves your control.

**Learn By Doing**
This setup forces you to understand how modern web services actually work under the hood. You'll troubleshoot DNS issues, debug container networking, configure databases, manage SSL certificates, and optimize hardware. These are real-world skills that transfer directly to professional DevOps and infrastructure work.

**Have Limited Resources**
A used Pi 4 costs $30-50. Even buying new with all components, you're under $350 total. That's less than three months of equivalent cloud services. The upfront cost is manageable and the ongoing costs are basically zero. Perfect for students or anyone starting out, with a desire to learn basic DevOps, and Hardware skills.

**Like Tinkering**
If you enjoy customizing your tools, adding new services, and optimizing configurations, a Pi gives you complete freedom to experiment. Break something? Just redeploy the container. Want to try a new tool? Add it to the compose file. The entire system is yours to modify however you want.

**Need True Portability**
Unlike a traditional homelab, this actually goes with you. The waterproof case, battery power, and automatic network switching mean you can work anywhere. Library study session? Weekend trip? Power outage? No problem.

## Limitations

**Performance**
A Pi 4 with 4GB RAM is not going to compile large projects quickly. It's fine for web development, Python, Node.js, and most scripting work, but compiling native code or running heavy builds will be slow. The AI assistant runs on separate hardware specifically because the Pi can't handle large language models effectively.

**Storage Endurance**
While the SSD is much better than an SD card, constant database writes and container updates do wear it down over time. Budget SSDs might last 2-3 years of heavy use. Enterprise drives cost more but last longer. SD card is only for boot, so corruption is less of a concern.

**Single Point of Failure**
Everything runs on one device. If the Pi dies, the SSD fails, or the case takes damage, you lose access to everything until you restore from backups. This is not a production-grade setup with redundancy or high availability. Keep offsite backups of important data, or setup an offloading pipeline to backup when on home network.

**Network Dependent**
External access relies on Cloudflare Tunnels staying up and having some kind of internet connection available. If both your networks and your phone hotspot are down, you can't reach services remotely. Local access over WiFi direct to the Pi still works though.

**Heat Management**
Enclosed Pis can get warm under sustained load. The case has ventilation and the Pi has heatsinks, but running CPU-intensive tasks for extended periods in hot environments may cause thermal throttling. Monitor temps with the LCD display. As of now, the system idles at 45, and peaks at 55 under heavy load, if yours goes higher, consider using a fan.

**Physical Security**
A portable device can be lost, stolen, or damaged. The waterproof case protects against water and impacts, but it's still a physical object you need to keep track of. Encrypt sensitive data and keep backups elsewhere.

## Installation

***Not Plug-n-Play***
- Unfortunately the setup requires some config, this is just an overview.
- I will be updating for more significant documentation over time, use this as a general to do list.

1. Flash Ubuntu Server 64-bit to microSD card using Raspberry Pi Imager
2. Configure SSH access and connect the Pi to your network
3. Install Docker and Docker Compose
4. Format and partition the SSD, mount at `/mnt/storage`
5. Clone this repo or copy the files to `/home/admin/homelab/`
6. Edit docker-compose files to change default passwords
7. Configure Cloudflare Tunnels for external access
8. Set up multiple WiFi networks for automatic switching
9. Wire up LCD and LED matrix displays
10. Configure `homelab-display.py` to start on boot
11. Assemble everything in the case with 3D-printed mounts, etc.
12. Consider setting up tailscale as well, much easier ssh

## Future Improvements

**Infrastructure**
- Add Grafana and Prometheus for detailed metrics visualization
- Implement automated backups to external storage or cloud
- Set up Traefik or Nginx Proxy Manager for automatic SSL and routing
- Configure Docker more resource limits to prevent containers from hogging RAM

**Services**
- Portainer for easier container management
- Nextcloud for file sync across devices
- Vaultwarden for password management
- Pi-hole for network-wide ad blocking
- Actual Budget for personal finance tracking

**Hardware**
- Switch to Rock5B with significantly more ram and compute
- Add UPS functionality with power state detection
- Implement automatic graceful shutdown on low battery - this is next...
- Add temperature and humidity sensors
- RGB LED strip for swag factor
- Touch screen for interactive control without external device
- External antenna for better WiFi range in challenging RF environments

**Display Enhancements**
- V2 with Oled or larger LCD for more resolution
- Show active connections and bandwidth usage
- Display last commit info from Gitea
- Show recent N8N workflow runs
- Alert animations for service failures
- Battery level indicator on LED matrix
- Scrolling text for long messages

## Why This Setup Works

**Cost Effective**: One-time hardware investment beats recurring cloud costs within 6 months.

**Actually Portable**: Battery power and network failover mean it works anywhere, not just "portable between power outlets."

**Educational**: Building and maintaining this teaches practical DevOps and infrastructure skills.

**Flexible**: Add, remove, or modify services without changing cloud subscriptions.

**Private**: All data stays on hardware you physically control.

**Professional**: The clean physical presentation and enterprise-grade software stack demonstrate real engineering thinking.

**Reliable**: Containerization means services are isolated and reproducible. SSD storage means consistent performance.

**Expandable**: The 2TB SSD and modular Docker setup mean you can keep adding services without starting over.

The combination of thoughtful hardware design, robust software architecture, and intelligent automation creates something that's both practical for daily use and impressive as a portfolio project. It demonstrates that you can build professional infrastructure on consumer hardware with the right planning and execution.

## License

This project is open source. Use it, modify it, share it. If you build something similar, I'd love to hear about it.
