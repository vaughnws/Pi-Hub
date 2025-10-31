import React, { useState, useEffect, useRef } from 'react';
import { Activity, Server, Cpu, HardDrive, Thermometer, MessageSquare, X, Send, Trash2, Lock, PlayCircle, StopCircle, RefreshCw, Calendar, Terminal, Wifi } from 'lucide-react';

const API_BASE = '/api';

const styles = `
  @keyframes scroll {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }
  
  .animate-scroll {
    display: flex;
    animation: scroll 120s linear infinite;
    width: fit-content;
  }
  
  .animate-scroll:hover {
    animation-play-state: paused;
  }
`;

const App = () => {
  const [systemStats, setSystemStats] = useState({ cpu: 0, ram: 0, disk: 0, temp: 0, uptime: '0h' });
  const [containers, setContainers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [networkStats, setNetworkStats] = useState([]);
  const [techNews, setTechNews] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [isPinUnlocked, setIsPinUnlocked] = useState(sessionStorage.getItem('pinUnlocked') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const fetchSystemStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/system/stats`);
      if (res.ok) {
        const data = await res.json();
        setSystemStats(data);
      }
    } catch (err) {
      console.error('Error fetching system stats:', err);
    }
  };

  const fetchContainers = async () => {
    try {
      const res = await fetch(`${API_BASE}/docker/containers`);
      if (res.ok) {
        const data = await res.json();
        setContainers(data);
      }
    } catch (err) {
      console.error('Error fetching containers:', err);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API_BASE}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const fetchCalendar = async () => {
    try {
      const res = await fetch(`${API_BASE}/calendar`);
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data);
      }
    } catch (err) {
      console.error('Error fetching calendar:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/docker/recent-logs`);
      if (res.ok) {
        const data = await res.json();
        setRecentLogs(data);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchNetwork = async () => {
    try {
      const res = await fetch(`${API_BASE}/network/stats`);
      if (res.ok) {
        const data = await res.json();
        setNetworkStats(data);
      }
    } catch (err) {
      console.error('Error fetching network stats:', err);
    }
  };

  const fetchNews = async () => {
    try {
      const res = await fetch(`${API_BASE}/news/tech`);
      if (res.ok) {
        const data = await res.json();
        setTechNews(data);
      }
    } catch (err) {
      console.error('Error fetching news:', err);
    }
  };

  useEffect(() => {
    fetchSystemStats();
    fetchContainers();
    fetchMessages();
    fetchCalendar();
    fetchLogs();
    fetchNetwork();
    fetchNews();

    const interval = setInterval(() => {
      fetchSystemStats();
      fetchContainers();
      fetchLogs();
      fetchMessages();
    }, 10000);

    const slowInterval = setInterval(() => {
      fetchCalendar();
      fetchNews();
    }, 60000);

    return () => {
      clearInterval(interval);
      clearInterval(slowInterval);
    };
  }, []);

   const getHealthStatus = () => {
    const runningCount = containers.filter(c => c.status === 'running').length;
    const qwenRunning = containers.find(c => c.name === 'qwen-ui')?.status === 'running';
    const cpuWarning = systemStats.cpu > 80;
    const ramWarning = systemStats.ram > 80;
    const diskWarning = systemStats.disk > 85;
    const tempWarning = systemStats.temp > 55;

    if (runningCount === containers.length && !cpuWarning && !ramWarning && !diskWarning && !tempWarning) {
      return { status: 'healthy', color: 'text-green-500', bg: 'bg-green-500' };
    } else if (!qwenRunning && runningCount === containers.length - 1 && !cpuWarning && !ramWarning && !diskWarning && !tempWarning) {
      return { status: 'power saver', color: 'text-blue-500', bg: 'bg-blue-500' };
    } else if (cpuWarning || ramWarning || diskWarning || tempWarning || runningCount < containers.length - 1) {
      return { status: 'warning', color: 'text-yellow-500', bg: 'bg-yellow-500' };
    } else {
      return { status: 'critical', color: 'text-red-500', bg: 'bg-red-500' };
    }
  };

  const handleDockerAction = async (action, containerName = null) => {
    if (!isPinUnlocked) {
      setPendingAction({ action, containerName });
      setShowPinModal(true);
      return;
    }
    
    const confirmMsg = containerName 
      ? `${action.toUpperCase()} ${containerName}?`
      : `${action.toUpperCase()} all containers?`;
    
    if (window.confirm(confirmMsg)) {
      try {
        const res = await fetch(`${API_BASE}/docker/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ container: containerName })
        });
 
        if (res.ok) {
          const data = await res.json();
          alert(data.message);
          fetchContainers();
        } else {
          alert('Action failed');
        }
      } catch (err) {
        console.error('Docker action error:', err);
        alert('Failed to perform action');
      }
    }
  };

  const checkPin = () => {
    if (pinInput === '1234') { // Change this PIN as needed
      setIsPinUnlocked(true);
      sessionStorage.setItem('pinUnlocked', 'true');
      setShowPinModal(false);
      setPinInput('');
      if (pendingAction) {
        handleDockerAction(pendingAction.action, pendingAction.containerName);
        setPendingAction(null);
      }
    } else {
      alert('Invalid PIN');
      setPinInput('');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    if (!username) {
      const name = prompt('Please enter your name:');
      if (name) {
        setUsername(name);
        localStorage.setItem('username', name);
      } else {
        return;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          text: newMessage,
          timestamp: new Date().toISOString()
        })
      });
 
      if (res.ok) {
        setNewMessage('');
        fetchMessages();
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const deleteMessage = async (id) => {
    if (!window.confirm('Delete this message?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/messages/${id}`, {
        method: 'DELETE'
      });
 
      if (res.ok) {
        fetchMessages();
      }
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatEventDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  const health = getHealthStatus();

  const services = [
    { name: 'Gitea', subtitle: 'Git Repository & CI/CD', url: 'https://git.vaughnws.ca' },
    { name: 'Code Server', subtitle: 'VS Code in Browser', url: 'https://code.vaughnws.ca' },
    { name: 'AI Assistant', subtitle: 'Qwen2.5 Coding AI', url: 'https://ai.vaughnws.ca' },
    { name: 'N8N', subtitle: 'Workflow Automation', url: 'https://n8n.vaughnws.ca' },
    { name: 'File Browser', subtitle: 'File Management', url: 'https://files.vaughnws.ca' },
    { name: 'Documentation', subtitle: 'BookStack Wiki', url: 'https://docs.vaughnws.ca' },
    { name: 'Uptime Kuma', subtitle: 'Service Status', url: 'https://status.vaughnws.ca' },
    { name: 'Portainer', subtitle: 'Container Management', url: 'https://docker.vaughnws.ca' }
  ];

  const ResourceBar = ({ label, value, icon: Icon, warning = 80, critical = 90 }) => {
    const getColor = () => {
      if (value >= critical) return 'bg-red-500';
      if (value >= warning) return 'bg-yellow-500';
      return 'bg-green-500';
    };

    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-[#f0f0f0] opacity-60" />
            <span className="text-sm text-[#f0f0f0]">{label}</span>
          </div>
          <span className="text-sm font-mono text-[#f0f0f0]">{value}%</span>
        </div>
        <div className="w-full bg-[#1a1a1a] rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${getColor()}`}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    );
  };

  const MessageBubble = ({ msg }) => {
    const isOwn = msg.username === username;
    
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3 group`}>
        <div className="max-w-[85%]">
          <div className={`text-xs text-[#f0f0f0] opacity-60 mb-1 ${isOwn ? 'text-right' : 'text-left'}`}>
            {msg.username} • {formatTimestamp(msg.timestamp)}
          </div>
          <div className={`relative px-4 py-2 rounded-lg ${
            isOwn 
              ? 'bg-[#ff6b35] text-[#f0f0f0] rounded-br-none' 
              : 'bg-[#272727] text-[#f0f0f0] rounded-bl-none'
          } border border-[#303030]`}>
            <p className="text-sm break-words">{msg.text}</p>
            <button
              onClick={() => deleteMessage(msg.id)}
              className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full p-1 shadow-lg"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
  <>
    <style>{styles}</style>
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#272727] to-[#1a1a1a] text-[#f0f0f0]">
{/* Tech News Ticker */}
      <div className="bg-[#ff6b35] text-[#f0f0f0] py-2 overflow-hidden relative">
        <div className="animate-scroll">
          {techNews.length > 0 ? (
            [...techNews, ...techNews].map((item, idx) => (
              <a
                key={idx}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mx-8 hover:underline whitespace-nowrap"
              >
                <span className="font-bold">TECH NEWS:</span> {item.title}
              </a>
            ))
          ) : (
            <span className="inline-block mx-8">Loading tech news...</span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-[#272727] border-b border-[#303030] shadow-lg">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#ff6b35]">
                Pi-Hub
              </h1>
              <p className="text-sm text-[#f0f0f0] opacity-60 mt-1">Raspberry Pi Development Environment</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Message Board */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-[#ff6b35]" />
                  Message Board
                </h2>
                <button
                  onClick={() => fetchMessages()}
                  className="text-sm text-[#ff6b35] hover:opacity-80"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-4 bg-[#1a1a1a] rounded-lg p-3">
                {messages.slice(-5).map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-[#1a1a1a] border border-[#303030] rounded-lg px-4 py-2 text-[#f0f0f0] placeholder-[#f0f0f0] placeholder-opacity-40 focus:outline-none focus:border-[#ff6b35]"
                />
                <button
                  onClick={sendMessage}
                  className="bg-[#ff6b35] hover:opacity-80 text-[#f0f0f0] px-4 py-2 rounded-lg transition-opacity"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Calendar */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#ff6b35]" />
                Upcoming Classes
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {calendarEvents.length > 0 ? (
                  calendarEvents.map((event, idx) => (
                    <div key={idx} className="bg-[#1a1a1a] rounded-lg p-3 border border-[#303030]">
                      <div className="font-semibold text-[#f0f0f0]">{event.title}</div>
                      <div className="text-sm text-[#f0f0f0] opacity-60 mt-1">
                        {formatEventDate(event.start)}
                      </div>
                      {event.location && (
                        <div className="text-xs text-[#f0f0f0] opacity-40 mt-1">{event.location}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-[#f0f0f0] opacity-60 py-8">
                    No upcoming events
                  </div>
                )}
              </div>
            </div>

            {/* Services Grid */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Server className="w-5 h-5 text-[#ff6b35]" />
                Services
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service, idx) => (
                  <a
                    key={idx}
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#1a1a1a] hover:bg-[#303030] rounded-lg p-4 border border-[#303030] transition-all hover:scale-105 hover:shadow-lg hover:border-[#ff6b35]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-[#f0f0f0]">{service.name}</h3>
                        <p className="text-sm text-[#f0f0f0] opacity-60 mt-1">{service.subtitle}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Logs Viewer */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#ff6b35]" />
                Recent Activity
              </h2>
              <div className="bg-black rounded-lg p-4 font-mono text-xs max-h-48 overflow-y-auto">
                {recentLogs.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="text-[#ff6b35]">[{log.container}]</span>
                    <span className="text-[#f0f0f0] opacity-80 ml-2">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* System Health */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#ff6b35]" />
                System Health
              </h2>
              <div className={`text-center py-4 rounded-lg bg-[#1a1a1a] border-2 ${health.color.replace('text', 'border')}`}>
                <div className={`inline-block w-4 h-4 rounded-full ${health.bg} animate-pulse mb-2`} />
                <div className={`text-2xl font-bold ${health.color} uppercase`}>
                  {health.status}
                </div>
                <div className="text-sm text-[#f0f0f0] opacity-60 mt-1">
                  {containers.filter(c => c.status === 'running').length}/{containers.length} services running
                </div>
              </div>
            </div>

            {/* System Resources */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-[#ff6b35]" />
                Resources
              </h2>
              <ResourceBar label="CPU" value={systemStats.cpu} icon={Cpu} />
              <ResourceBar label="RAM" value={systemStats.ram} icon={Activity} />
              <ResourceBar label="Disk" value={systemStats.disk} icon={HardDrive} warning={85} critical={95} />
              <ResourceBar label="Temp" value={Math.round((systemStats.temp / 85) * 100)} icon={Thermometer} warning={65} critical={75} />
              <div className="mt-4 text-sm text-[#f0f0f0] opacity-60 text-center">
                Uptime: {systemStats.uptime}
              </div>
            </div>

            {/* Network Stats */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Wifi className="w-5 h-5 text-[#ff6b35]" />
                Network
              </h2>
              <div className="space-y-2">
                {networkStats.map((net, idx) => (
                  <div key={idx} className="bg-[#1a1a1a] rounded-lg p-3 border border-[#303030]">
                    <div className="text-sm font-semibold text-[#ff6b35]">{net.interface}</div>
                    <div className="text-xs text-[#f0f0f0] opacity-60 mt-1">{net.address}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Container Status */}
            <div className="bg-[#272727] rounded-xl p-6 border border-[#303030] shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Server className="w-5 h-5 text-[#ff6b35]" />
                  Containers
                </h2>
                {!isPinUnlocked && (
                  <button
                    onClick={() => setShowPinModal(true)}
                    className="text-[#ff6b35] hover:opacity-80"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-2 mb-4">
                {containers.map((container, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-3 border border-[#303030]">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        container.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`} />
                      <span className="text-sm font-mono text-[#f0f0f0]">{container.name}</span>
                    </div>
                    {isPinUnlocked && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDockerAction('start', container.name)}
                          className="p-1 hover:bg-[#303030] rounded"
                          title="Start"
                        >
                          <PlayCircle className="w-4 h-4 text-green-400" />
                        </button>
                        <button
                          onClick={() => handleDockerAction('stop', container.name)}
                          className="p-1 hover:bg-[#303030] rounded"
                          title="Stop"
                        >
                          <StopCircle className="w-4 h-4 text-red-400" />
                        </button>
                        <button
                          onClick={() => handleDockerAction('restart', container.name)}
                          className="p-1 hover:bg-[#303030] rounded"
                          title="Restart"
                        >
                          <RefreshCw className="w-4 h-4 text-blue-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {isPinUnlocked && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleDockerAction('start-all')}
                    className="bg-green-600 hover:bg-green-700 text-[#f0f0f0] py-2 rounded-lg text-sm transition-colors"
                  >
                    Start All
                  </button>
                  <button
                    onClick={() => handleDockerAction('restart-all')}
                    className="bg-blue-600 hover:bg-blue-700 text-[#f0f0f0] py-2 rounded-lg text-sm transition-colors"
                  >
                    Restart All
                  </button>
                  <button
                    onClick={() => handleDockerAction('stop-all')}
                    className="bg-red-600 hover:bg-red-700 text-[#f0f0f0] py-2 rounded-lg text-sm transition-colors"
                  >
                    Stop All
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PIN Modal */}
        {showPinModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-[#272727] rounded-xl p-6 max-w-md w-full mx-4 border border-[#303030]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[#ff6b35]" />
                  Enter PIN
                </h3>
                <button
                  onClick={() => {
                    setShowPinModal(false);
                    setPinInput('');
                    setPendingAction(null);
                  }}
                  className="text-[#f0f0f0] opacity-60 hover:opacity-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && checkPin()}
                placeholder="4-digit PIN"
                maxLength={4}
                className="w-full bg-[#1a1a1a] border border-[#303030] rounded-lg px-4 py-3 text-[#f0f0f0] text-center text-2xl tracking-widest placeholder-[#f0f0f0] placeholder-opacity-40 focus:outline-none focus:border-[#FF6B35] mb-4"
                autoFocus
            />
            <button
              onClick={checkPin}
              className="w-full bg-[#FF6B35] hover:bg-[#ff8255] text-white py-3 rounded-lg transition-colors font-semibold"
            >
              Unlock Controls
            </button>
            <p className="text-xs text-gray-400 text-center mt-4">
              PIN required for Docker container controls
            </p>
          </div>
        </div>
      )}
    </div>
    </div>
    </>
  );
};

export default App;
