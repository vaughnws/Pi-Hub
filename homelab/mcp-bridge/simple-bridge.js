#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const app = express();
const PORT = 3101;

app.use(express.json());

let mcpProcess = null;
let tools = [];
let requestId = 0;
let pendingRequests = new Map();

// Start MCP server
function startMCPServer() {
    console.log('Starting MCP server...');
    
    mcpProcess = spawn('node', ['/home/admin/homelab/mcp-server/mcp-server.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = createInterface({
        input: mcpProcess.stdout,
        crlfDelay: Infinity
    });

    rl.on('line', (line) => {
        try {
            const data = JSON.parse(line);
            const id = data.id;
            
            if (pendingRequests.has(id)) {
                const { resolve } = pendingRequests.get(id);
                resolve(data);
                pendingRequests.delete(id);
            }
        } catch (e) {
            // Ignore non-JSON lines (console.error output)
        }
    });

    mcpProcess.stderr.on('data', (data) => {
        console.error(`MCP: ${data}`);
    });

    // Initialize - list tools
    setTimeout(() => {
        sendMCPRequest('tools/list', {}).then(response => {
            if (response.result?.tools) {
                tools = response.result.tools;
                console.log(`Loaded ${tools.length} tools`);
            }
        });
    }, 1000);
}

function sendMCPRequest(method, params) {
    return new Promise((resolve, reject) => {
        const id = ++requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        pendingRequests.set(id, { resolve, reject });
        
        mcpProcess.stdin.write(JSON.stringify(request) + '\n');

        // Timeout after 30 seconds
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('Request timeout'));
            }
        }, 30000);
    });
}

// API Routes
app.get('/v1/tools', (req, res) => {
    res.json({ tools });
});

app.post('/v1/execute', async (req, res) => {
    try {
        const { tool_name, arguments: args } = req.body;

        console.log(`Executing: ${tool_name}`);
        const response = await sendMCPRequest('tools/call', {
            name: tool_name,
            arguments: args || {}
        });

        res.json({
            success: true,
            tool: tool_name,
            result: response.result?.content || []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        tools_count: tools.length,
        mcp_running: mcpProcess !== null
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`MCP Bridge running on port ${PORT}`);
    startMCPServer();
});

process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (mcpProcess) mcpProcess.kill();
    process.exit(0);
});
