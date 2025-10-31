from typing import List, Union, Generator, Iterator, Optional
import requests
import json
import re

class Pipeline:
    class Valves:
        MCP_BRIDGE_URL: str = "http://172.17.0.1:3101" # Adjust if needed
        ENABLE_AUTO_TOOL_DETECTION: bool = True
        
    def __init__(self):
        self.name = "MCP Homelab Tools"
        self.valves = self.Valves()
        self.tools = []
        
    async def on_startup(self):
        """Load available tools from MCP bridge on startup"""
        print(f"Starting {self.name} pipeline...")
        try:
            response = requests.get(f"{self.valves.MCP_BRIDGE_URL}/v1/tools", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.tools = data.get("tools", [])
                print(f"Loaded {len(self.tools)} MCP tools")
            else:
                print(f"MCP bridge not responding, running without tools")
                self.tools = []
        except Exception as e:
            print(f"Could not connect to MCP bridge: {e}")
            self.tools = []

    async def on_shutdown(self):
        print(f"Stopping {self.name} pipeline")

    def detect_tool_from_message(self, message: str) -> Optional[tuple]:
        """Detect which MCP tool to use based on message content"""
        message_lower = message.lower()
        
        # Docker-related queries
        if any(word in message_lower for word in ["container", "docker", "list containers", "docker ps"]):
            if "logs" in message_lower:
                # Extract container name if mentioned
                return ("docker_logs", {"container_name": self._extract_container_name(message), "tail": 100})
            elif "stats" in message_lower or "resource" in message_lower:
                return ("docker_stats", {})
            elif "inspect" in message_lower:
                container = self._extract_container_name(message)
                if container:
                    return ("docker_inspect", {"container_name": container})
            else:
                return ("docker_list_containers", {"all": "all" in message_lower or "stopped" in message_lower})
        
        # System monitoring
        if any(word in message_lower for word in ["system stats", "cpu", "memory", "temperature", "disk usage", "system status"]):
            return ("system_stats", {"detailed": "detailed" in message_lower})
        
        if "process" in message_lower and ("top" in message_lower or "running" in message_lower):
            return ("system_processes", {"sort_by": "memory" if "memory" in message_lower else "cpu", "limit": 10})
        
        if "network" in message_lower and ("info" in message_lower or "status" in message_lower or "ip" in message_lower):
            return ("network_info", {})
        
        # N8N workflows
        if any(word in message_lower for word in ["workflow", "n8n", "automation"]):
            if "list" in message_lower or "show" in message_lower:
                return ("n8n_list_workflows", {"active_only": "active" in message_lower})
            elif "execution" in message_lower:
                return ("n8n_list_executions", {"limit": 10})
        
        # File operations
        if "search" in message_lower and "file" in message_lower:
            pattern = self._extract_search_pattern(message)
            if pattern:
                return ("search_files", {"pattern": pattern, "path": "/home/admin/homelab"})
        
        if "read file" in message_lower or "show file" in message_lower or "cat" in message_lower:
            file_path = self._extract_file_path(message)
            if file_path:
                return ("read_file", {"file_path": file_path})
        
        if "list dir" in message_lower or "ls" in message_lower:
            return ("list_directory", {"path": "/home/admin/homelab", "recursive": "recursive" in message_lower})
        
        # Git operations
        if "git" in message_lower:
            if "status" in message_lower:
                return ("git_status", {"repo_path": "/home/admin/homelab"})
            elif "log" in message_lower or "history" in message_lower:
                return ("git_log", {"repo_path": "/home/admin/homelab", "limit": 10})
            elif "diff" in message_lower:
                return ("git_diff", {"repo_path": "/home/admin/homelab"})
            elif "branch" in message_lower:
                return ("git_branches", {"repo_path": "/home/admin/homelab"})
        
        # Gitea
        if "gitea" in message_lower or "repositories" in message_lower:
            if "list" in message_lower or "show" in message_lower:
                return ("gitea_list_repos", {})
        
        # Service health
        if any(word in message_lower for word in ["health", "service status", "services running", "uptime"]):
            return ("check_service_health", {})
        
        # Service URLs
        if "url" in message_lower or "link" in message_lower or "access" in message_lower:
            return ("get_service_urls", {})
        
        # Backups
        if "backup" in message_lower:
            if "list" in message_lower:
                return ("list_backups", {})
        
        # Connectivity
        if "ping" in message_lower or "connectivity" in message_lower:
            return ("check_connectivity", {})
        
        return None

    def _extract_container_name(self, message: str) -> str:
        """Extract container name from message"""
        # Look for common container names
        containers = ["gitea", "bookstack", "homer", "code-server", "uptime-kuma", "qwen-ui", "n8n", "filebrowser"]
        for container in containers:
            if container in message.lower():
                return container
        return "gitea"  # Default

    def _extract_search_pattern(self, message: str) -> Optional[str]:
        """Extract search pattern from message"""
        # Try to find quoted strings
        matches = re.findall(r'["\']([^"\']+)["\']', message)
        if matches:
            return matches[0]
        
        # Try to find pattern after "for"
        match = re.search(r'for\s+(\S+)', message, re.IGNORECASE)
        if match:
            return match.group(1)
        
        return None

    def _extract_file_path(self, message: str) -> Optional[str]:
        """Extract file path from message"""
        # Look for paths starting with /
        match = re.search(r'(/[\w/.-]+)', message)
        if match:
            return match.group(1)
        return None

    def execute_mcp_tool(self, tool_name: str, arguments: dict) -> str:
        """Execute an MCP tool and return formatted result"""
        try:
            response = requests.post(
                f"{self.valves.MCP_BRIDGE_URL}/v1/execute",
                json={
                    "tool_name": tool_name,
                    "arguments": arguments
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    # Extract text from result
                    content = result.get("result", [])
                    if content and len(content) > 0:
                        return content[0].get("text", "No output")
                    return "Tool executed successfully but returned no output"
                else:
                    return f"Tool execution failed: {result.get('error', 'Unknown error')}"
            else:
                return f"HTTP Error {response.status_code}: {response.text}"
                
        except requests.exceptions.Timeout:
            return "Request timed out - the operation is taking longer than expected"
        except requests.exceptions.ConnectionError:
            return "Cannot connect to MCP bridge. Make sure it's running on port 3100"
        except Exception as e:
            return f"Error executing tool: {str(e)}"

    def pipe(
        self, user_message: str, model_id: str, messages: List[dict], body: dict
    ) -> Union[str, Generator, Iterator]:
        """
        Main pipeline function - intercepts messages and routes to MCP tools when appropriate
        """
        
        # Check if auto-detection is enabled
        if not self.valves.ENABLE_AUTO_TOOL_DETECTION:
            return body
        
        # Detect if this message should use an MCP tool
        tool_info = self.detect_tool_from_message(user_message)
        
        if tool_info:
            tool_name, arguments = tool_info
            print(f"Detected tool: {tool_name} with args: {arguments}")
            
            # Execute the tool
            result = self.execute_mcp_tool(tool_name, arguments)
            
            # Return the result directly to the user
            # This bypasses the LLM and returns the tool output
            return result
        
        # If no tool detected, pass through to LLM normally
        return body
