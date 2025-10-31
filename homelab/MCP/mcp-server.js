#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as dotenvx from "@dotenvx/dotenvx";
import fs from 'fs/promises';
import path from 'path';

// Silence dotenvx banner
const originalWrite = process.stdout.write;
process.stdout.write = () => {}; // noop

dotenvx.config({ silent: true });

// Restore stdout
process.stdout.write = originalWrite;

const execAsync = promisify(exec);

class HomelabMCPServer {
  constructor() {
    this.n8nApiKey = process.env.N8N_API_KEY; // Set your N8N API key
    this.n8nBaseUrl = process.env.N8N_BASE_URL || 'http://localhost:5678'; // Set your N8N URL
    this.homelabPath = '/home/admin/homelab';
    
    console.error("Initializing Homelab MCP Server...");
    
    this.server = new Server(
      {
        name: "homelab-control",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error("Tools list requested - returning 45 tools");
      return {
        tools: [
          // DOCKER MANAGEMENT TOOLS
          {
            name: "docker_list_containers",
            description: "List all Docker containers with detailed status, resource usage, and uptime",
            inputSchema: {
              type: "object",
              properties: {
                all: { type: "boolean", description: "Include stopped containers", default: false },
                filter: { type: "string", description: "Filter by name (partial match)" }
              }
            }
          },
          {
            name: "docker_container_action",
            description: "Perform actions on Docker containers (start, stop, restart, pause, unpause)",
            inputSchema: {
              type: "object",
              properties: {
                container_name: { type: "string", description: "Name of the container" },
                action: { type: "string", enum: ["start", "stop", "restart", "pause", "unpause"], description: "Action to perform" }
              },
              required: ["container_name", "action"]
            }
          },
          {
            name: "docker_logs",
            description: "Get logs from a specific Docker container with filtering options",
            inputSchema: {
              type: "object",
              properties: {
                container_name: { type: "string", description: "Name of the container" },
                tail: { type: "number", description: "Number of lines from end", default: 100 },
                since: { type: "string", description: "Show logs since timestamp (e.g., '2h', '30m')" },
                grep: { type: "string", description: "Filter logs by text pattern" }
              },
              required: ["container_name"]
            }
          },
          {
            name: "docker_stats",
            description: "Get real-time resource usage stats for all containers",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "docker_inspect",
            description: "Get detailed container configuration and state information",
            inputSchema: {
              type: "object",
              properties: { container_name: { type: "string", description: "Name of the container" } },
              required: ["container_name"]
            }
          },
          {
            name: "docker_compose_status",
            description: "Get status of all docker-compose projects in homelab directory",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "docker_compose_action",
            description: "Control docker-compose services (up, down, restart, pull)",
            inputSchema: {
              type: "object",
              properties: {
                service_dir: { type: "string", description: "Service directory name (e.g., 'gitea', 'n8n-compose')" },
                action: { type: "string", enum: ["up", "down", "restart", "pull", "logs"], description: "Action to perform" }
              },
              required: ["service_dir", "action"]
            }
          },

          // SYSTEM MONITORING & HEALTH
          {
            name: "system_stats",
            description: "Comprehensive system statistics (CPU, RAM, disk, temperature, network)",
            inputSchema: {
              type: "object",
              properties: {
                detailed: { type: "boolean", description: "Include per-core CPU stats and detailed disk info", default: false }
              }
            }
          },
          {
            name: "system_processes",
            description: "List top processes by CPU or memory usage",
            inputSchema: {
              type: "object",
              properties: {
                sort_by: { type: "string", enum: ["cpu", "memory"], description: "Sort processes by resource usage", default: "cpu" },
                limit: { type: "number", description: "Number of processes to show", default: 10 }
              }
            }
          },
          {
            name: "network_info",
            description: "Get network interface information, IP addresses, and connection status",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "disk_usage",
            description: "Detailed disk usage analysis by directory",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Path to analyze", default: "/home/admin" },
                depth: { type: "number", description: "Directory depth to analyze", default: 2 }
              }
            }
          },
          {
            name: "check_service_health",
            description: "Check health status of all homelab services (HTTP health checks)",
            inputSchema: { type: "object", properties: {} }
          },

          // N8N WORKFLOW MANAGEMENT
          {
            name: "n8n_list_workflows",
            description: "List all N8N workflows with status, tags, and last execution",
            inputSchema: {
              type: "object",
              properties: {
                active_only: { type: "boolean", description: "Show only active workflows", default: false }
              }
            }
          },
          {
            name: "n8n_get_workflow",
            description: "Get detailed information about a specific workflow",
            inputSchema: {
              type: "object",
              properties: { workflow_id: { type: "string", description: "Workflow ID" } },
              required: ["workflow_id"]
            }
          },
          {
            name: "n8n_trigger_webhook",
            description: "Trigger an N8N workflow via webhook with custom data",
            inputSchema: {
              type: "object",
              properties: {
                webhook_path: { type: "string", description: "Webhook path (e.g., 'hello-claude')" },
                data: { type: "object", description: "Data payload to send" },
                method: { type: "string", enum: ["POST", "GET"], description: "HTTP method", default: "POST" }
              },
              required: ["webhook_path"]
            }
          },
          {
            name: "n8n_list_executions",
            description: "Get recent workflow executions with filtering and status",
            inputSchema: {
              type: "object",
              properties: {
                limit: { type: "number", description: "Number of executions", default: 10 },
                status: { type: "string", enum: ["success", "error", "running"], description: "Filter by status" },
                workflow_id: { type: "string", description: "Filter by workflow ID" }
              }
            }
          },
          {
            name: "n8n_activate_workflow",
            description: "Activate or deactivate a workflow",
            inputSchema: {
              type: "object",
              properties: {
                workflow_id: { type: "string", description: "Workflow ID" },
                active: { type: "boolean", description: "Set active status" }
              },
              required: ["workflow_id", "active"]
            }
          },

          // FILE SYSTEM OPERATIONS
          {
            name: "search_files",
            description: "Search for files by name or content with powerful filters",
            inputSchema: {
              type: "object",
              properties: {
                pattern: { type: "string", description: "Filename pattern (glob or regex)" },
                content_search: { type: "string", description: "Search within file contents" },
                path: { type: "string", description: "Base path to search", default: "/home/admin/homelab" },
                file_type: { type: "string", description: "File extension filter (e.g., '.yml', '.js')" },
                max_results: { type: "number", description: "Maximum results to return", default: 50 }
              }
            }
          },
          {
            name: "read_file",
            description: "Read contents of a specific file",
            inputSchema: {
              type: "object",
              properties: {
                file_path: { type: "string", description: "Full path to file" },
                lines: { type: "string", description: "Line range (e.g., '1-50', 'all')", default: "all" }
              },
              required: ["file_path"]
            }
          },
          {
            name: "write_file",
            description: "Write or append content to a file (use with caution)",
            inputSchema: {
              type: "object",
              properties: {
                file_path: { type: "string", description: "Full path to file" },
                content: { type: "string", description: "Content to write" },
                mode: { type: "string", enum: ["write", "append"], description: "Write mode", default: "write" }
              },
              required: ["file_path", "content"]
            }
          },
          {
            name: "list_directory",
            description: "List directory contents with details",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Directory path", default: "/home/admin/homelab" },
                recursive: { type: "boolean", description: "Include subdirectories", default: false }
              }
            }
          },
          {
            name: "find_large_files",
            description: "Find largest files in a directory tree",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Base path to search", default: "/home/admin" },
                limit: { type: "number", description: "Number of files to return", default: 20 }
              }
            }
          },

          // GIT OPERATIONS
          {
            name: "git_status",
            description: "Get Git repository status with changes, branch info, and commit status",
            inputSchema: {
              type: "object",
              properties: {
                repo_path: { type: "string", description: "Path to Git repository", default: "/home/admin/homelab" }
              }
            }
          },
          {
            name: "git_log",
            description: "Get recent Git commit history",
            inputSchema: {
              type: "object",
              properties: {
                repo_path: { type: "string", description: "Path to Git repository", default: "/home/admin/homelab" },
                limit: { type: "number", description: "Number of commits", default: 10 }
              }
            }
          },
          {
            name: "git_diff",
            description: "Show Git diff for uncommitted changes",
            inputSchema: {
              type: "object",
              properties: {
                repo_path: { type: "string", description: "Path to Git repository", default: "/home/admin/homelab" },
                file_path: { type: "string", description: "Specific file to diff (optional)" }
              }
            }
          },
          {
            name: "git_branches",
            description: "List all Git branches (local and remote)",
            inputSchema: {
              type: "object",
              properties: {
                repo_path: { type: "string", description: "Path to Git repository", default: "/home/admin/homelab" }
              }
            }
          },

          // GITEA API OPERATIONS
          {
            name: "gitea_list_repos",
            description: "List all Gitea repositories",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "gitea_repo_info",
            description: "Get detailed information about a Gitea repository",
            inputSchema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner username" },
                repo_name: { type: "string", description: "Repository name" }
              },
              required: ["owner", "repo_name"]
            }
          },
          {
            name: "gitea_recent_commits",
            description: "Get recent commits from a Gitea repository",
            inputSchema: {
              type: "object",
              properties: {
                owner: { type: "string", description: "Repository owner" },
                repo_name: { type: "string", description: "Repository name" },
                limit: { type: "number", description: "Number of commits", default: 10 }
              },
              required: ["owner", "repo_name"]
            }
          },

          // DATABASE QUERIES
          {
            name: "query_gitea_database",
            description: "Query Gitea PostgreSQL database for statistics",
            inputSchema: {
              type: "object",
              properties: {
                query_type: { type: "string", enum: ["repo_count", "user_count", "recent_activity", "repo_sizes"], description: "Type of query to run" }
              },
              required: ["query_type"]
            }
          },
          {
            name: "query_bookstack_database",
            description: "Query BookStack database for content statistics",
            inputSchema: {
              type: "object",
              properties: {
                query_type: { type: "string", enum: ["page_count", "book_count", "recent_pages", "search"], description: "Type of query" },
                search_term: { type: "string", description: "Search term (for search query type)" }
              },
              required: ["query_type"]
            }
          },

          // BACKUP & MAINTENANCE
          {
            name: "create_backup",
            description: "Create a backup of specified service data",
            inputSchema: {
              type: "object",
              properties: {
                service: { type: "string", enum: ["gitea", "bookstack", "n8n", "all"], description: "Service to backup" },
                backup_type: { type: "string", enum: ["data", "database", "full"], description: "Type of backup", default: "full" }
              },
              required: ["service"]
            }
          },
          {
            name: "list_backups",
            description: "List all available backups",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "cleanup_docker",
            description: "Clean up Docker resources (unused images, containers, volumes)",
            inputSchema: {
              type: "object",
              properties: {
                aggressive: { type: "boolean", description: "Remove all unused resources", default: false }
              }
            }
          },

          // UTILITY & AUTOMATION
          {
            name: "run_command",
            description: "Execute a whitelisted shell command",
            inputSchema: {
              type: "object",
              properties: { command: { type: "string", description: "Command to execute (from whitelist)" } },
              required: ["command"]
            }
          },
          {
            name: "check_connectivity",
            description: "Check network connectivity to services and external sites",
            inputSchema: {
              type: "object",
              properties: {
                targets: { type: "array", items: { type: "string" }, description: "List of hosts/URLs to check", default: ["8.8.8.8", "google.com", "github.com"] }
              }
            }
          },
          {
            name: "get_service_urls",
            description: "Get all service URLs and their status",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "schedule_task",
            description: "Schedule a task to run via N8N workflow",
            inputSchema: {
              type: "object",
              properties: {
                task_name: { type: "string", description: "Name of the task" },
                workflow_webhook: { type: "string", description: "N8N webhook to trigger" },
                schedule: { type: "string", description: "Cron schedule or time description" },
                data: { type: "object", description: "Data to pass to workflow" }
              },
              required: ["task_name", "workflow_webhook"]
            }
          },
          {
            name: "system_reboot",
            description: "Schedule a system reboot (with confirmation)",
            inputSchema: {
              type: "object",
              properties: {
                delay_minutes: { type: "number", description: "Delay before reboot", default: 1 },
                confirm: { type: "boolean", description: "Confirmation required", default: false }
              }
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`Tool called: ${name}`);
      
      try {
        // Route to appropriate handler
        const handlers = {
          // Docker
          docker_list_containers: () => this.dockerListContainers(args),
          docker_container_action: () => this.dockerContainerAction(args),
          docker_logs: () => this.dockerLogs(args),
          docker_stats: () => this.dockerStats(args),
          docker_inspect: () => this.dockerInspect(args),
          docker_compose_status: () => this.dockerComposeStatus(args),
          docker_compose_action: () => this.dockerComposeAction(args),
          
          // System
          system_stats: () => this.systemStats(args),
          system_processes: () => this.systemProcesses(args),
          network_info: () => this.networkInfo(args),
          disk_usage: () => this.diskUsage(args),
          check_service_health: () => this.checkServiceHealth(args),
          
          // N8N
          n8n_list_workflows: () => this.n8nListWorkflows(args),
          n8n_get_workflow: () => this.n8nGetWorkflow(args),
          n8n_trigger_webhook: () => this.n8nTriggerWebhook(args),
          n8n_list_executions: () => this.n8nListExecutions(args),
          n8n_activate_workflow: () => this.n8nActivateWorkflow(args),
          
          // Files
          search_files: () => this.searchFiles(args),
          read_file: () => this.readFile(args),
          write_file: () => this.writeFile(args),
          list_directory: () => this.listDirectory(args),
          find_large_files: () => this.findLargeFiles(args),
          
          // Git
          git_status: () => this.gitStatus(args),
          git_log: () => this.gitLog(args),
          git_diff: () => this.gitDiff(args),
          git_branches: () => this.gitBranches(args),
          
          // Gitea
          gitea_list_repos: () => this.giteaListRepos(args),
          gitea_repo_info: () => this.giteaRepoInfo(args),
          gitea_recent_commits: () => this.giteaRecentCommits(args),
          
          // Database
          query_gitea_database: () => this.queryGiteaDatabase(args),
          query_bookstack_database: () => this.queryBookstackDatabase(args),
          
          // Backup
          create_backup: () => this.createBackup(args),
          list_backups: () => this.listBackups(args),
          cleanup_docker: () => this.cleanupDocker(args),
          
          // Utility
          run_command: () => this.runCommand(args),
          check_connectivity: () => this.checkConnectivity(args),
          get_service_urls: () => this.getServiceUrls(args),
          schedule_task: () => this.scheduleTask(args),
          system_reboot: () => this.systemReboot(args)
        };

        const handler = handlers[name];
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        return await handler();
      } catch (error) {
        console.error(`Error in ${name}:`, error.message);
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  // ============================================
  // DOCKER IMPLEMENTATIONS
  // ============================================

  async dockerListContainers(args) {
    const { all = false, filter } = args;
    const allFlag = all ? '-a' : '';
    const command = `docker ps ${allFlag} --format "{{.Names}}|{{.Status}}|{{.Image}}|{{.Ports}}"`;
    
    const { stdout } = await execAsync(command);
    let containers = stdout.trim().split('\n').filter(line => line).map(line => {
      const [name, status, image, ports] = line.split('|');
      return { name, status, image, ports };
    });

    if (filter) {
      containers = containers.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
    }

    return {
      content: [{
        type: "text",
        text: `Found ${containers.length} containers:\n\n` + 
              containers.map(c => 
                `   ${c.name}\n` +
                `   Status: ${c.status}\n` +
                `   Image: ${c.image}\n` +
                `   Ports: ${c.ports || 'none'}`
              ).join('\n\n')
      }]
    };
  }

  async dockerContainerAction(args) {
    const { container_name, action } = args;
    await execAsync(`docker ${action} ${container_name}`);
    
    return {
      content: [{
        type: "text",
        text: ` Successfully ${action}ed container: ${container_name}`
      }]
    };
  }

  async dockerLogs(args) {
    const { container_name, tail = 100, since, grep } = args;
    let command = `docker logs ${container_name} --tail ${tail}`;
    
    if (since) {
      command += ` --since ${since}`;
    }
    
    const { stdout } = await execAsync(command);
    let logs = stdout;
    
    if (grep) {
      logs = stdout.split('\n').filter(line => line.includes(grep)).join('\n');
    }
    
    return {
      content: [{
        type: "text",
        text: ` Logs for ${container_name} (last ${tail} lines):\n\n${logs}`
      }]
    };
  }

  async dockerStats(args) {
    const { stdout } = await execAsync('docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}"');
    
    const stats = stdout.trim().split('\n').map(line => {
      const [name, cpu, mem, net, block] = line.split('|');
      return { name, cpu, mem, net, block };
    });

    return {
      content: [{
        type: "text",
        text: ` Container Resource Usage:\n\n` +
              stats.map(s =>
                `${s.name}:\n` +
                `  CPU: ${s.cpu}\n` +
                `  Memory: ${s.mem}\n` +
                `  Network: ${s.net}\n` +
                `  Disk I/O: ${s.block}`
              ).join('\n\n')
      }]
    };
  }

  async dockerInspect(args) {
    const { container_name } = args;
    const { stdout } = await execAsync(`docker inspect ${container_name}`);
    const info = JSON.parse(stdout)[0];
    
    return {
      content: [{
        type: "text",
        text: ` Container Details: ${container_name}\n\n` +
              `Status: ${info.State.Status}\n` +
              `Started: ${new Date(info.State.StartedAt).toLocaleString()}\n` +
              `Image: ${info.Config.Image}\n` +
              `Ports: ${JSON.stringify(info.NetworkSettings.Ports, null, 2)}\n` +
              `Networks: ${Object.keys(info.NetworkSettings.Networks).join(', ')}\n` +
              `Restart Policy: ${info.HostConfig.RestartPolicy.Name}`
      }]
    };
  }

  async dockerComposeStatus(args) {
    const services = ['dashboard', 'gitea', 'code-server', 'monitoring', 'qwen', 'bookstack'];
    const results = [];

    for (const service of services) {
      const servicePath = path.join(this.homelabPath, service);
      try {
        await fs.access(servicePath);
        const { stdout } = await execAsync(`cd ${servicePath} && docker compose ps --format json`);
        const containers = stdout.trim().split('\n').filter(l => l).map(l => JSON.parse(l));
        results.push({
          service,
          status: 'running',
          containers: containers.length,
          details: containers
        });
      } catch (error) {
        results.push({ service, status: 'not found or stopped' });
      }
    }

    return {
      content: [{
        type: "text",
        text: ` Docker Compose Services:\n\n` +
              results.map(r =>
                `${r.service}: ${r.status}` +
                (r.containers ? ` (${r.containers} containers)` : '')
              ).join('\n')
      }]
    };
  }

  async dockerComposeAction(args) {
    const { service_dir, action } = args;
    const servicePath = service_dir.includes('/') ? service_dir : path.join(this.homelabPath, service_dir);
    
    const { stdout } = await execAsync(`cd ${servicePath} && docker compose ${action} -d`);
    
    return {
      content: [{
        type: "text",
        text: ` Executed 'docker compose ${action}' in ${service_dir}\n\n${stdout}`
      }]
    };
  }

  // ============================================
  // SYSTEM IMPLEMENTATIONS
  // ============================================

  async systemStats(args) {
    const { detailed = false } = args;
    
    const { stdout } = await execAsync(`
      echo "=== Raspberry Pi Homelab Status ==="
      echo ""
      echo " CPU:"
      top -bn1 | grep "Cpu(s)" | awk '{print "  Usage: " 100 - $8 "%"}'
      echo ""
      echo " Memory:"
      free -h | awk 'NR==2{printf "  Total: %s\\n  Used: %s (%.1f%%)\\n  Free: %s\\n", $2, $3, $3*100/$2, $4}'
      echo ""
      echo " Disk:"
      df -h / | awk 'NR==2{printf "  Total: %s\\n  Used: %s\\n  Available: %s\\n  Usage: %s\\n", $2, $3, $4, $5}'
      echo ""
      echo "  Temperature:"
      vcgencmd measure_temp | cut -d'=' -f2
      echo ""
      echo "  Uptime:"
      uptime -p | sed 's/up //'
      echo ""
      echo " Load Average:"
      uptime | awk -F'load average:' '{print $2}'
    `);

    return {
      content: [{
        type: "text",
        text: stdout
      }]
    };
  }

  async systemProcesses(args) {
    const { sort_by = 'cpu', limit = 10 } = args;
    const sortFlag = sort_by === 'memory' ? '-m' : '-c';
    
    const { stdout } = await execAsync(`ps aux --sort=${sortFlag} | head -n ${limit + 1}`);
    
    return {
      content: [{
        type: "text",
        text: `🔝 Top ${limit} Processes (by ${sort_by}):\n\n${stdout}`
      }]
    };
  }

  async networkInfo(args) {
    const { stdout } = await execAsync(`
      echo "=== Network Information ==="
      echo ""
      echo "Network Interfaces:"
      ip -4 addr show | grep -E 'inet|^[0-9]' | grep -v '127.0.0.1'
      echo ""
      echo "Default Gateway:"
      ip route | grep default
      echo ""
      echo "DNS Servers:"
      cat /etc/resolv.conf | grep nameserver
      echo ""
      echo "Active Connections:"
      ss -tunap | grep ESTAB | wc -l | awk '{print $1 " established connections"}'
    `);

    return {
      content: [{
        type: "text",
        text: stdout
      }]
    };
  }

  async diskUsage(args) {
    const { path: dirPath = '/home/admin', depth = 2 } = args;
    
    const { stdout } = await execAsync(`du -h --max-depth=${depth} ${dirPath} 2>/dev/null | sort -hr | head -20`);
    
    return {
      content: [{
        type: "text",
        text: ` Disk Usage for ${dirPath} (depth ${depth}):\n\n${stdout}`
      }]
    };
  }

  async checkServiceHealth(args) { // set these URLs to your actual service URLs
    const services = [
      { name: 'Homer Dashboard', url: 'http://localhost:80' },
      { name: 'Gitea', url: 'http://localhost:3000' },
      { name: 'Code Server', url: 'http://localhost:8443' },
      { name: 'N8N', url: 'http://localhost:5678' },
      { name: 'Uptime Kuma', url: 'http://localhost:3001' },
      { name: 'BookStack', url: 'http://localhost:8086' },
      { name: 'Qwen AI', url: 'http://localhost:8090' },
      { name: 'File Browser', url: 'http://localhost:8080' }
    ];

    const results = await Promise.all(services.map(async service => {
      try {
        await axios.get(service.url, { timeout: 2000 });
        return ` ${service.name} - Healthy`;
      } catch (error) {
        return ` ${service.name} - Unreachable`;
      }
    }));

    return {
      content: [{
        type: "text",
        text: ` Service Health Check:\n\n${results.join('\n')}`
      }]
    };
  }

  // ============================================
  // N8N IMPLEMENTATIONS
  // ============================================

  async n8nListWorkflows(args) {
    if (!this.n8nApiKey) throw new Error('N8N API key not configured');

    const { active_only = false } = args;
    const response = await axios.get(`${this.n8nBaseUrl}/api/v1/workflows`, {
      headers: { 'X-N8N-API-KEY': this.n8nApiKey }
    });

    let workflows = response.data.data || [];
    
    if (active_only) {
      workflows = workflows.filter(w => w.active);
    }

    if (workflows.length === 0) {
      return {
        content: [{ type: "text", text: "📋 No workflows found" }]
      };
    }

    return {
      content: [{
        type: "text",
        text: ` N8N Workflows (${workflows.length}):\n\n` +
              workflows.map(w =>
                `${w.active ? 'yes' : 'no'} ${w.name}\n` +
                `   ID: ${w.id}\n` +
                `   Nodes: ${w.nodes?.length || 0}\n` +
                `   Updated: ${new Date(w.updatedAt).toLocaleString()}\n` +
                `   Tags: ${w.tags?.map(t => t.name).join(', ') || 'none'}`
              ).join('\n\n')
      }]
    };
  }

  async n8nGetWorkflow(args) {
    if (!this.n8nApiKey) throw new Error('N8N API key not configured');

    const { workflow_id } = args;
    const response = await axios.get(`${this.n8nBaseUrl}/api/v1/workflows/${workflow_id}`, {
      headers: { 'X-N8N-API-KEY': this.n8nApiKey }
    });

    const workflow = response.data;
    
    return {
      content: [{
        type: "text",
        text: ` Workflow: ${workflow.name}\n\n` +
              `ID: ${workflow.id}\n` +
              `Status: ${workflow.active ? 'is Active' : 'is Inactive'}\n` +
              `Nodes: ${workflow.nodes?.length || 0}\n` +
              `Connections: ${Object.keys(workflow.connections || {}).length}\n` +
              `Created: ${new Date(workflow.createdAt).toLocaleString()}\n` +
              `Updated: ${new Date(workflow.updatedAt).toLocaleString()}\n\n` +
              `Node Types:\n${workflow.nodes?.map(n => `  - ${n.type} (${n.name})`).join('\n') || 'none'}`
      }]
    };
  }

  async n8nTriggerWebhook(args) {
    const { webhook_path, data = {}, method = 'POST' } = args;
    const webhookUrl = `${this.n8nBaseUrl}/webhook/${webhook_path}`;
    
    const response = await axios({
      method,
      url: webhookUrl,
      data: {
        ...data,
        triggered_by: 'Claude via MCP',
        timestamp: new Date().toISOString()
      },
      headers: { 'Content-Type': 'application/json' }
    });

    return {
      content: [{
        type: "text",
        text: ` Webhook Triggered: ${webhook_path}\n\nResponse:\n${JSON.stringify(response.data, null, 2)}`
      }]
    };
  }

  async n8nListExecutions(args) {
    if (!this.n8nApiKey) throw new Error('N8N API key not configured');

    const { limit = 10, status, workflow_id } = args;
    
    let url = `${this.n8nBaseUrl}/api/v1/executions?limit=${limit}`;
    if (workflow_id) url += `&workflowId=${workflow_id}`;
    
    const response = await axios.get(url, {
      headers: { 'X-N8N-API-KEY': this.n8nApiKey }
    });

    let executions = response.data.data || [];
    
    if (status) {
      executions = executions.filter(e => {
        if (status === 'success') return e.finished && !e.data?.resultData?.error;
        if (status === 'error') return e.finished && e.data?.resultData?.error;
        if (status === 'running') return !e.finished;
        return true;
      });
    }

    return {
      content: [{
        type: "text",
        text: ` Recent Executions (${executions.length}):\n\n` +
              executions.map(e => {
                const statusIcon = !e.finished ? '⏳' : (e.data?.resultData?.error ? 'no' : 'yes');
                return `${statusIcon} ${e.workflowData?.name || 'Unknown'}\n` +
                       `   Started: ${new Date(e.startedAt).toLocaleString()}\n` +
                       `   Mode: ${e.mode}\n` +
                       `   ID: ${e.id}`;
              }).join('\n\n')
      }]
    };
  }

  async n8nActivateWorkflow(args) {
    if (!this.n8nApiKey) throw new Error('N8N API key not configured');

    const { workflow_id, active } = args;
    
    await axios.patch(`${this.n8nBaseUrl}/api/v1/workflows/${workflow_id}`, 
      { active },
      { headers: { 'X-N8N-API-KEY': this.n8nApiKey } }
    );

    return {
      content: [{
        type: "text",
        text: `Workflow ${workflow_id} is now ${active ? 'active' : 'inactive'}`
      }]
    };
  }

  // ============================================
  // FILE SYSTEM IMPLEMENTATIONS
  // ============================================

  async searchFiles(args) {
    const { pattern, content_search, path: searchPath = this.homelabPath, file_type, max_results = 50 } = args;
    
    let command = `find ${searchPath} -type f`;
    
    if (pattern) {
      command += ` -name "*${pattern}*"`;
    }
    
    if (file_type) {
      command += ` -name "*${file_type}"`;
    }
    
    command += ` 2>/dev/null | head -${max_results}`;
    
    const { stdout } = await execAsync(command);
    let results = stdout.trim().split('\n').filter(f => f);
    
    if (content_search && results.length > 0) {
      const grepCommand = `grep -l "${content_search}" ${results.join(' ')} 2>/dev/null`;
      const { stdout: grepOut } = await execAsync(grepCommand);
      results = grepOut.trim().split('\n').filter(f => f);
    }
    
    return {
      content: [{
        type: "text",
        text: `Found ${results.length} files:\n\n${results.join('\n')}`
      }]
    };
  }

  async readFile(args) {
    const { file_path, lines = 'all' } = args;
    
    let content = await fs.readFile(file_path, 'utf-8');
    
    if (lines !== 'all') {
      const [start, end] = lines.split('-').map(Number);
      const fileLines = content.split('\n');
      content = fileLines.slice(start - 1, end || start).join('\n');
    }
    
    return {
      content: [{
        type: "text",
        text: `File: ${file_path}\n\n${content}`
      }]
    };
  }

  async writeFile(args) {
    const { file_path, content, mode = 'write' } = args;
    
    if (!file_path.startsWith('/home/admin/homelab/')) {
      throw new Error('Can only write files in /home/admin/homelab/ directory');
    }
    
    if (mode === 'append') {
      await fs.appendFile(file_path, content);
    } else {
      await fs.writeFile(file_path, content);
    }
    
    return {
      content: [{
        type: "text",
        text: `File ${mode === 'append' ? 'appended to' : 'written to'}: ${file_path}`
      }]
    };
  }

  async listDirectory(args) {
    const { path: dirPath = this.homelabPath, recursive = false } = args;
    
    const command = recursive 
      ? `find ${dirPath} -maxdepth 3 -type f -o -type d | head -100`
      : `ls -lah ${dirPath}`;
    
    const { stdout } = await execAsync(command);
    
    return {
      content: [{
        type: "text",
        text: `Directory: ${dirPath}\n\n${stdout}`
      }]
    };
  }

  async findLargeFiles(args) {
    const { path: searchPath = '/home/admin', limit = 20 } = args;
    
    const { stdout } = await execAsync(
      `find ${searchPath} -type f -exec du -h {} + 2>/dev/null | sort -rh | head -${limit}`
    );
    
    return {
      content: [{
        type: "text",
        text: `Largest ${limit} Files:\n\n${stdout}`
      }]
    };
  }

  // ============================================
  // GIT IMPLEMENTATIONS
  // ============================================

  async gitStatus(args) {
    const { repo_path = this.homelabPath } = args;
    
    const { stdout } = await execAsync(`cd ${repo_path} && git status`);
    
    return {
      content: [{
        type: "text",
        text: `Git Status: ${repo_path}\n\n${stdout}`
      }]
    };
  }

  async gitLog(args) {
    const { repo_path = this.homelabPath, limit = 10 } = args;
    
    const { stdout } = await execAsync(
      `cd ${repo_path} && git log --oneline --decorate --graph -${limit}`
    );
    
    return {
      content: [{
        type: "text",
        text: `Git Log: ${repo_path}\n\n${stdout}`
      }]
    };
  }

  async gitDiff(args) {
    const { repo_path = this.homelabPath, file_path } = args;
    
    const command = file_path 
      ? `cd ${repo_path} && git diff ${file_path}`
      : `cd ${repo_path} && git diff`;
    
    const { stdout } = await execAsync(command);
    
    return {
      content: [{
        type: "text",
        text: `Git Diff: ${repo_path}\n\n${stdout || 'No changes'}`
      }]
    };
  }

  async gitBranches(args) {
    const { repo_path = this.homelabPath } = args;
    
    const { stdout } = await execAsync(`cd ${repo_path} && git branch -a`);
    
    return {
      content: [{
        type: "text",
        text: `Git Branches: ${repo_path}\n\n${stdout}`
      }]
    };
  }

  // ============================================
  // GITEA IMPLEMENTATIONS
  // ============================================

  async giteaListRepos(args) {
    try {
      const response = await axios.get('http://localhost:3000/api/v1/repos/search'); // Adjust endpoint as needed
      const repos = response.data.data || [];
      
      return {
        content: [{
          type: "text",
          text: `Gitea Repositories (${repos.length}):\n\n` +
                repos.map(r =>
                  `${r.private ? 'private' : 'public'} ${r.full_name}\n` +
                  `   Stars: ${r.stars_count} | Forks: ${r.forks_count}\n` +
                  `   Updated: ${new Date(r.updated_at).toLocaleDateString()}`
                ).join('\n\n')
        }]
      };
    } catch (error) {
      throw new Error('Could not connect to Gitea API');
    }
  }

  async giteaRepoInfo(args) {
    const { owner, repo_name } = args;
    
    const response = await axios.get(`http://localhost:3000/api/v1/repos/${owner}/${repo_name}`); // Adjust endpoint as needed
    const repo = response.data;
    
    return {
      content: [{
        type: "text",
        text: `Repository: ${repo.full_name}\n\n` +
              `Description: ${repo.description || 'None'}\n` +
              `Stars: ${repo.stars_count} | Forks: ${repo.forks_count}\n` +
              `Open Issues: ${repo.open_issues_count}\n` +
              `Default Branch: ${repo.default_branch}\n` +
              `Size: ${(repo.size / 1024).toFixed(2)} MB\n` +
              `Created: ${new Date(repo.created_at).toLocaleString()}\n` +
              `Updated: ${new Date(repo.updated_at).toLocaleString()}\n` +
              `Clone URL: ${repo.clone_url}`
      }]
    };
  }

  async giteaRecentCommits(args) {
    const { owner, repo_name, limit = 10 } = args;
    
    const response = await axios.get(
      `http://localhost:3000/api/v1/repos/${owner}/${repo_name}/commits?limit=${limit}` // Adjust endpoint as needed
    );
    const commits = response.data;
    
    return {
      content: [{
        type: "text",
        text: `Recent Commits: ${owner}/${repo_name}\n\n` +
              commits.map(c =>
                `${c.sha.substring(0, 7)} - ${c.commit.message}\n` +
                `   Author: ${c.commit.author.name}\n` +
                `   Date: ${new Date(c.commit.author.date).toLocaleString()}`
              ).join('\n\n')
      }]
    };
  }

  // ============================================
  // DATABASE IMPLEMENTATIONS
  // ============================================

  async queryGiteaDatabase(args) {
    const { query_type } = args;
    
    const queries = {
      repo_count: `docker exec gitea-postgres psql -U gitea -d gitea -c "SELECT COUNT(*) as total_repos FROM repository;"`,
      user_count: `docker exec gitea-postgres psql -U gitea -d gitea -c "SELECT COUNT(*) as total_users FROM \\"user\\";"`,
      recent_activity: `docker exec gitea-postgres psql -U gitea -d gitea -c "SELECT name, updated_unix FROM repository ORDER BY updated_unix DESC LIMIT 10;"`,
      repo_sizes: `docker exec gitea-postgres psql -U gitea -d gitea -c "SELECT name, size FROM repository ORDER BY size DESC LIMIT 10;"`
    };
    
    const command = queries[query_type];
    if (!command) throw new Error('Invalid query type');
    
    const { stdout } = await execAsync(command);
    
    return {
      content: [{
        type: "text",
        text: `Gitea Database Query (${query_type}):\n\n${stdout}`
      }]
    };
  }

  async queryBookstackDatabase(args) {
    const { query_type, search_term } = args;
    
    const queries = {
      page_count: `docker exec bookstack_db mysql -u bookstack -pbookstack_password bookstackapp -e "SELECT COUNT(*) as total_pages FROM pages;"`,
      book_count: `docker exec bookstack_db mysql -u bookstack -pbookstack_password bookstackapp -e "SELECT COUNT(*) as total_books FROM books;"`,
      recent_pages: `docker exec bookstack_db mysql -u bookstack -pbookstack_password bookstackapp -e "SELECT name, updated_at FROM pages ORDER BY updated_at DESC LIMIT 10;"`,
      search: search_term ? `docker exec bookstack_db mysql -u bookstack -pbookstack_password bookstackapp -e "SELECT name FROM pages WHERE name LIKE '%${search_term}%' LIMIT 10;"` : null
    };
    
    const command = queries[query_type];
    if (!command) throw new Error('Invalid query type or missing search term');
    
    const { stdout } = await execAsync(command);
    
    return {
      content: [{
        type: "text",
        text: `BookStack Database Query (${query_type}):\n\n${stdout}`
      }]
    };
  }

  // ============================================
  // BACKUP & MAINTENANCE IMPLEMENTATIONS
  // ============================================

  async createBackup(args) {
    const { service, backup_type = 'full' } = args;
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupDir = `/home/admin/backups/${service}`;
    
    await execAsync(`mkdir -p ${backupDir}`);
    
    const backupCommands = { // Example backup commands; adjust paths as needed
      gitea: `tar -czf ${backupDir}/gitea-${timestamp}.tar.gz /home/admin/homelab/gitea/data`,
      bookstack: `tar -czf ${backupDir}/bookstack-${timestamp}.tar.gz /home/admin/homelab/bookstack/bookstack_app_data`,
      n8n: `tar -czf ${backupDir}/n8n-${timestamp}.tar.gz /home/admin/n8n-compose/n8n_data`,
      all: `tar -czf ${backupDir}/homelab-full-${timestamp}.tar.gz /home/admin/homelab`
    };
    
    const command = backupCommands[service];
    if (!command) throw new Error('Invalid service for backup');
    
    await execAsync(command);
    
    return {
      content: [{
        type: "text",
        text: `Backup created: ${service}-${timestamp}.tar.gz\n` +
              `Location: ${backupDir}/`
      }]
    };
  }

  async listBackups(args) {
    const { stdout } = await execAsync('find /home/admin/backups -name "*.tar.gz" -type f -printf "%T@ %p\\n" | sort -rn | head -20');
    
    const backups = stdout.trim().split('\n').map(line => {
      const [timestamp, filepath] = line.split(' ');
      const date = new Date(parseFloat(timestamp) * 1000);
      return `${date.toLocaleString()} - ${path.basename(filepath)}`;
    });
    
    return {
      content: [{
        type: "text",
        text: `Available Backups:\n\n${backups.join('\n') || 'No backups found'}`
      }]
    };
  }

  async cleanupDocker(args) {
    const { aggressive = false } = args;
    
    const commands = [
      'docker system prune -f',
      aggressive ? 'docker system prune -af --volumes' : null
    ].filter(Boolean);
    
    const results = [];
    for (const cmd of commands) {
      const { stdout } = await execAsync(cmd);
      results.push(stdout);
    }
    
    return {
      content: [{
        type: "text",
        text: `Docker Cleanup Results:\n\n${results.join('\n\n')}`
      }]
    };
  }

  // ============================================
  // UTILITY IMPLEMENTATIONS
  // ============================================

  async runCommand(args) {
    const { command } = args;
    
    const whitelist = [
      'uptime', 'whoami', 'date', 'hostname',
      'docker ps', 'docker stats --no-stream',
      'free -h', 'df -h', 'top -bn1',
      'vcgencmd measure_temp', 'vcgencmd measure_clock arm'
    ];
    
    if (!whitelist.includes(command)) {
      throw new Error(`Command not whitelisted: ${command}`);
    }
    
    const { stdout } = await execAsync(command);
    
    return {
      content: [{
        type: "text",
        text: `Command: ${command}\n\n${stdout}`
      }]
    };
  }

  async checkConnectivity(args) {
    const { targets = ['8.8.8.8', 'google.com', 'github.com'] } = args;
    
    const results = await Promise.all(targets.map(async target => {
      try {
        await execAsync(`ping -c 1 -W 2 ${target}`);
        return `${target} - Reachable`;
      } catch {
        return `${target} - Unreachable`;
      }
    }));
    
    return {
      content: [{
        type: "text",
        text: `Connectivity Check:\n\n${results.join('\n')}`
      }]
    };
  }

  async getServiceUrls(args) { // set these URLs to your actual service URLs
    const services = [
      { name: 'Homer Dashboard', url: 'https://vaughnws.ca', local: 'http://localhost:80' },
      { name: 'Gitea', url: 'https://git.vaughnws.ca', local: 'http://localhost:3000' },
      { name: 'Code Server', url: 'https://code.vaughnws.ca', local: 'http://localhost:8443' },
      { name: 'N8N', url: 'https://n8n.vaughnws.ca', local: 'http://localhost:5678' },
      { name: 'Uptime Kuma', url: 'https://status.vaughnws.ca', local: 'http://localhost:3001' },
      { name: 'BookStack', url: 'https://docs.vaughnws.ca', local: 'http://localhost:8086' },
      { name: 'Qwen AI', url: 'https://ai.vaughnws.ca', local: 'http://localhost:8090' },
      { name: 'File Browser', url: 'https://files.vaughnws.ca', local: 'http://localhost:8080' }
    ];
    
    return {
      content: [{
        type: "text",
        text: `Service URLs:\n\n` +
              services.map(s => 
                `${s.name}:\n  Public: ${s.url}\n  Local: ${s.local}`
              ).join('\n\n')
      }]
    };
  }

  async scheduleTask(args) {
    const { task_name, workflow_webhook, schedule, data = {} } = args;
    
    return {
      content: [{
        type: "text",
        text: `To schedule this task, create an N8N workflow with:\n\n` +
              `Task: ${task_name}\n` +
              `Webhook: ${workflow_webhook}\n` +
              `Schedule: ${schedule || 'Manual trigger'}\n` +
              `Data: ${JSON.stringify(data, null, 2)}\n\n` +
              `Use the N8N Schedule Trigger node with cron expression.`
      }]
    };
  }

  async systemReboot(args) {
    const { delay_minutes = 1, confirm = false } = args;
    
    if (!confirm) {
      return {
        content: [{
          type: "text",
          text: `System reboot requires confirmation.\n\n` +
                `Set "confirm": true to proceed with reboot in ${delay_minutes} minute(s).`
        }]
      };
    }
    
    await execAsync(`sudo shutdown -r +${delay_minutes} "Reboot initiated via MCP"`);
    
    return {
      content: [{
        type: "text",
        text: `System reboot scheduled in ${delay_minutes} minute(s).\n\n` +
              `Cancel with: sudo shutdown -c`
      }]
    };
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      console.error("Shutting down...");
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Full-Featured Homelab MCP Server running on stdio");
    console.error(`Loaded 45+ tools successfully`);
  }
}

const server = new HomelabMCPServer();
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
