#!/usr/bin/env python3

import time
import docker
import psutil
from luma.core.interface.serial import spi, noop
from luma.core.render import canvas
from luma.led_matrix.device import max7219
from RPLCD.i2c import CharLCD
import socket

class HomelabDisplay:
    def __init__(self):
        self.led_device = None
        self.lcd_device = None
        self.docker_client = None
        self.initialize_hardware()
    
    def initialize_hardware(self):
        """Initialize LCD, LED matrix, and Docker client"""
        try:
            # MAX7219 8x8 LED Matrix
            serial_spi = spi(port=0, device=0, gpio=noop())
            self.led_device = max7219(serial_spi, cascaded=1, block_orientation=0)
            print("MAX7219 LED matrix initialized")
        except Exception as e:
            print(f"MAX7219 initialization failed: {e}")
            self.led_device = None
        
        try:
            # 2004A LCD via I2C using RPLCD
            self.lcd_device = CharLCD('PCF8574', 0x27, cols=20, rows=4)
            self.lcd_device.backlight_enabled = True
            self.lcd_device.clear()
            print("2004A LCD initialized with RPLCD")
        except Exception as e:
            print(f"LCD initialization failed: {e}")
            self.lcd_device = None
        
        try:
            # Docker client
            self.docker_client = docker.from_env()
            print("Docker client initialized")
        except Exception as e:
            print(f"Docker client initialization failed: {e}")
            self.docker_client = None

    def get_homelab_status(self):
        """Get status of homelab services"""
        services = {
            'pi-hub-dashboard': '-',
            'gitea': '-', 
            'code-server': '-',
            'uptime-kuma': '-',
            'qwen-ui': '-',
            'bookstack': '-',
            'n8n': '-',
            'filebrowser': '-'
        }
        
        if not self.docker_client:
            return services
        
        try:
            containers = self.docker_client.containers.list()
            running_services = [c.name.lower() for c in containers]
            
            # Check for each service in container names
            if any('pi-hub-dashboard' in name for name in running_services):
                services['pi-hub-dashboard'] = '*'
            if any('gitea' in name for name in running_services):
                services['gitea'] = '*'
            if any('code-server' in name for name in running_services):
                services['code-server'] = '*'
            if any('uptime-kuma' in name for name in running_services):
                services['uptime-kuma'] = '*'
            if any('qwen-ui' in name for name in running_services):
                services['qwen-ui'] = '*'
            if any('bookstack' in name for name in running_services):
                services['bookstack'] = '*'
            if any('n8n' in name for name in running_services):
                services['n8n'] = '*'
            if any('filebrowser' in name for name in running_services):
                services['filebrowser'] = '*'
                    
        except Exception as e:
            print(f"Docker error: {e}")
        
        return services

    def get_system_info(self):
        """Get basic system information"""
        try:
            # Get IP address
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            
            # Get CPU and memory usage
            cpu_percent = int(psutil.cpu_percent(interval=1))
            ram_percent = int(psutil.virtual_memory().percent)
            
            # Get disk usage
            disk_usage = int(psutil.disk_usage('/').percent)
            
            # Get temperature if available
            temp = "N/A"
            try:
                with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
                    temp_raw = int(f.read()) / 1000
                    temp = f"{temp_raw:.1f}C"
            except:
                pass
            
            # Get uptime
            uptime_seconds = time.time() - psutil.boot_time()
            uptime_hours = int(uptime_seconds // 3600)
            uptime_days = uptime_hours // 24
            uptime_hours = uptime_hours % 24
            
            if uptime_days > 0:
                uptime_str = f"{uptime_days}d{uptime_hours}h"
            else:
                uptime_str = f"{uptime_hours}h"
            
            # Get network interface info
            network_info = "WiFi"
            try:
                import subprocess
                result = subprocess.run(['iwconfig'], capture_output=True, text=True, timeout=2)
                if 'ESSID' in result.stdout and 'off/any' not in result.stdout:
                    # Extract ESSID name
                    for line in result.stdout.split('\n'):
                        if 'ESSID:' in line:
                            essid = line.split('ESSID:')[1].strip().replace('"', '')
                            if essid and essid != 'off/any':
                                network_info = essid[:8]  # Truncate to fit display
                                break
            except:
                pass
            
            return {
                'cpu': cpu_percent,
                'ram': ram_percent,
                'disk': disk_usage,
                'temp': temp,
                'ip': ip,
                'uptime': uptime_str,
                'network': network_info
            }
        except Exception as e:
            print(f"System info error: {e}")
            return {'cpu': 0, 'ram': 0, 'disk': 0, 'temp': 'N/A', 'ip': 'Unknown', 'uptime': '0h', 'network': 'Unknown'}

    def display_on_lcd(self, services, system_info):
        """Display status on 2004A LCD"""
        if not self.lcd_device:
            return
            
        try:
            self.lcd_device.clear()
            
            # Line 1: Title and running services count
            running_count = sum(1 for status in services.values() if status == '*')
            self.lcd_device.write_string(f"Homelab ({running_count}/8)")
            
            # Line 2: System resources with disk usage
            self.lcd_device.cursor_pos = (1, 0)
            self.lcd_device.write_string(f"CPU:{system_info['cpu']}% RAM:{system_info['ram']}% DSK:{system_info['disk']}%")
            
            # Line 3: More system info
            self.lcd_device.cursor_pos = (2, 0)
            self.lcd_device.write_string(f"Up:{system_info['uptime']} T:{system_info['temp']}")
            
            # Line 4: Network information
            self.lcd_device.cursor_pos = (3, 0)
            self.lcd_device.write_string(f"Net:{system_info['network']}")
                
        except Exception as e:
            print(f"LCD display error: {e}")

    def display_on_matrix(self, services):
        """Display status face on MAX7219"""
        if not self.led_device:
            return
            
        try:
            with canvas(self.led_device) as draw:
                self.led_device.clear()
                
                running_count = sum(1 for status in services.values() if status == '*')
                
                # Define face patterns (8x8 bitmap)
                if running_count == 8:
                    # Happy face
                    pattern = [0x3C,0x42,0xA5,0x81,0xA5,0x99,0x42,0x3C]
                elif running_count >= 6:
                    # Neutral face
                    pattern = [0x3C,0x42,0xA5,0x81,0xBD,0x81,0x42,0x3C]
                else:
                    # Sad face
                    pattern = [0x3C,0x42,0xA5,0x81,0x99,0xA5,0x42,0x3C]
                
                # Convert hex pattern to pixels
                for y in range(8):
                    byte_val = pattern[y]
                    for x in range(8):
                        # Check if bit is set (starting from MSB)
                        if byte_val & (0x80 >> x):
                            draw.point((x, y), fill="white")
                
        except Exception as e:
            print(f"Matrix display error: {e}")

    def display_startup_message(self):
        """Display startup message on both displays"""
        if self.lcd_device:
            try:
                self.lcd_device.clear()
                self.lcd_device.write_string("Homelab Display")
                self.lcd_device.cursor_pos = (1, 0)
                self.lcd_device.write_string("Starting up...")
                self.lcd_device.cursor_pos = (3, 0)
                self.lcd_device.write_string("Please wait...")
            except Exception as e:
                print(f"LCD startup message error: {e}")
        
        if self.led_device:
            try:
                # Extended loading animation sequence
                
                # Phase 1: Expanding circles
                for radius in range(1, 4):
                    with canvas(self.led_device) as draw:
                        self.led_device.clear()
                        # Draw circle around center
                        center_x, center_y = 3, 3
                        for x in range(8):
                            for y in range(8):
                                dist = ((x - center_x) ** 2 + (y - center_y) ** 2) ** 0.5
                                if abs(dist - radius) < 0.7:
                                    draw.point((x, y), fill="white")
                    time.sleep(0.3)
                
                # Phase 2: Spinning radar sweep
                for sweep in range(16):
                    with canvas(self.led_device) as draw:
                        self.led_device.clear()
                        # Center dot
                        draw.point((3, 3), fill="white")
                        draw.point((4, 3), fill="white")
                        draw.point((3, 4), fill="white")
                        draw.point((4, 4), fill="white")
                        
                        # Rotating sweep line
                        angle = sweep * 22.5  # 22.5 degrees per step
                        import math
                        for r in range(1, 4):
                            x = 3 + int(r * math.cos(math.radians(angle)))
                            y = 3 + int(r * math.sin(math.radians(angle)))
                            if 0 <= x < 8 and 0 <= y < 8:
                                draw.point((x, y), fill="white")
                    time.sleep(0.15)
                
                # Phase 3: Bouncing dot
                positions = [
                    (0,0), (1,0), (2,0), (3,0), (4,0), (5,0), (6,0), (7,0),
                    (7,1), (7,2), (7,3), (7,4), (7,5), (7,6), (7,7),
                    (6,7), (5,7), (4,7), (3,7), (2,7), (1,7), (0,7),
                    (0,6), (0,5), (0,4), (0,3), (0,2), (0,1)
                ]
                
                for i, (x, y) in enumerate(positions):
                    with canvas(self.led_device) as draw:
                        self.led_device.clear()
                        # Trail effect - show last 3 positions with decreasing brightness
                        for j in range(3):
                            if i - j >= 0:
                                trail_x, trail_y = positions[i - j]
                                draw.point((trail_x, trail_y), fill="white")
                    time.sleep(0.08)
                
                # Phase 4: Fill and clear pattern
                fill_order = [
                    (3,3), (4,3), (3,4), (4,4),  # Center first
                    (2,3), (5,3), (3,2), (3,5), (2,4), (5,4), (4,2), (4,5),  # Ring 1
                    (1,1), (1,2), (1,3), (1,4), (1,5), (1,6),  # Left edge
                    (2,1), (3,1), (4,1), (5,1), (6,1),  # Top edge
                    (6,2), (6,3), (6,4), (6,5), (6,6),  # Right edge
                    (5,6), (4,6), (3,6), (2,6),  # Bottom edge
                    (0,0), (0,7), (7,0), (7,7)  # Corners
                ]
                
                # Fill pattern
                lit_pixels = set()
                for x, y in fill_order:
                    lit_pixels.add((x, y))
                    with canvas(self.led_device) as draw:
                        for px, py in lit_pixels:
                            draw.point((px, py), fill="white")
                    time.sleep(0.05)
                
                # Brief pause with full display
                time.sleep(0.3)
                
                # Clear pattern (reverse)
                for x, y in reversed(fill_order):
                    lit_pixels.discard((x, y))
                    with canvas(self.led_device) as draw:
                        self.led_device.clear()
                        for px, py in lit_pixels:
                            draw.point((px, py), fill="white")
                    time.sleep(0.03)
                    
            except Exception as e:
                print(f"Matrix startup animation error: {e}")

    def run(self):
        """Main display loop"""
        print("Hello Vaughn! Starting Up...") # change as needed 
        
        # Show startup message
        self.display_startup_message()
        time.sleep(3)
        
        # Main loop
        while True:
            try:
                # Get current status
                services = self.get_homelab_status()
                system_info = self.get_system_info()
                
                # Update displays
                self.display_on_lcd(services, system_info)
                self.display_on_matrix(services)
                
                # Print status to console for debugging
                running_services = [name for name, status in services.items() if status == '*']
                print(f"Running: {len(running_services)}/8 services - {', '.join(running_services)}")
                print(f"System: CPU {system_info['cpu']}%, RAM {system_info['ram']}%, IP {system_info['ip']}")
                
                # Wait before next update
                time.sleep(5)
                
            except KeyboardInterrupt:
                print("\nShutting down, Goodbye!")
                break
            except Exception as e:
                print(f"Main loop error: {e}")
                time.sleep(5)
        
        # Clean shutdown
        if self.lcd_device:
            try:
                self.lcd_device.clear()
                self.lcd_device.write_string("Display")
                self.lcd_device.cursor_pos = (1, 0)
                self.lcd_device.write_string("Shutting down...")
                self.lcd_device.cursor_pos = (3, 0)
                self.lcd_device.write_string("Goodbye!")
            except:
                pass
        
        if self.led_device:
            try:
                self.led_device.clear()
            except:
                pass
        
        print("Homelab display stopped")

def main():
    """Entry point"""
    display = HomelabDisplay()
    display.run()

if __name__ == "__main__":
    main()
