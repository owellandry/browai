import React, { useState, useEffect, useRef } from 'react';
import { 
  IoClose, 
  IoTrash, 
  IoTerminal,
  IoGlobe,
  IoSwapVertical,
  IoInformationCircle,
  IoCheckmarkCircle,
  IoWarning,
  IoCloseCircle
} from 'react-icons/io5';
import './DevConsole.css';

function DevConsole({ onClose }) {
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [networkLog, setNetworkLog] = useState([]);
  const [wsLog, setWsLog] = useState([]);
  const [mcpInfo, setMcpInfo] = useState(null);
  const consoleContentRef = useRef(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    // Cargar logs iniciales
    loadNetworkLog();
    loadWsLog();
    loadMcpInfo();

    // Agregar logs de ejemplo
    addLog('info', 'Consola de desarrollador iniciada');
    addLog('success', 'MCP Server conectado');

    // Actualizar cada 2 segundos
    const interval = setInterval(() => {
      loadNetworkLog();
      loadWsLog();
      loadMcpInfo();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Auto-scroll si está habilitado
    if (autoScrollRef.current && consoleContentRef.current) {
      consoleContentRef.current.scrollTop = consoleContentRef.current.scrollHeight;
    }
  }, [logs, networkLog, wsLog]);

  const loadNetworkLog = async () => {
    if (window.electronAPI && window.electronAPI.getNetworkLog) {
      const log = await window.electronAPI.getNetworkLog();
      setNetworkLog(log || []);
    }
  };

  const loadWsLog = async () => {
    if (window.electronAPI && window.electronAPI.getWsLog) {
      const log = await window.electronAPI.getWsLog();
      setWsLog(log || []);
    }
  };

  const loadMcpInfo = async () => {
    if (window.electronAPI && window.electronAPI.getCurrentInfo) {
      const info = await window.electronAPI.getCurrentInfo();
      setMcpInfo(info);
    }
  };

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    setLogs(prev => [...prev, { type, message, timestamp, id: Date.now() + Math.random() }]);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('info', 'Logs limpiados');
  };

  const clearNetworkLog = async () => {
    if (window.electronAPI && window.electronAPI.clearNetworkLog) {
      await window.electronAPI.clearNetworkLog();
      setNetworkLog([]);
      addLog('info', 'Log de red limpiado');
    }
  };

  const clearWsLog = async () => {
    if (window.electronAPI && window.electronAPI.clearWsLog) {
      await window.electronAPI.clearWsLog();
      setWsLog([]);
      addLog('info', 'Log de WebSocket limpiado');
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'info': return <IoInformationCircle />;
      case 'success': return <IoCheckmarkCircle />;
      case 'warning': return <IoWarning />;
      case 'error': return <IoCloseCircle />;
      default: return <IoInformationCircle />;
    }
  };

  const renderLogsTab = () => (
    <>
      {logs.length === 0 ? (
        <div className="empty-console">
          <IoTerminal className="empty-console-icon" />
          <div className="empty-console-text">No hay logs disponibles</div>
        </div>
      ) : (
        logs.map(log => (
          <div key={log.id} className={`log-entry ${log.type}`}>
            <span className="log-timestamp">{log.timestamp}</span>
            <span className="log-message">
              {getLogIcon(log.type)} {log.message}
            </span>
          </div>
        ))
      )}
    </>
  );

  const renderNetworkTab = () => (
    <>
      <div className="console-stats">
        <div className="stat-card">
          <div className="stat-label">Total de Requests</div>
          <div className="stat-value">{networkLog.length}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#4caf50' }}>
          <div className="stat-label">Exitosos (2xx)</div>
          <div className="stat-value">
            {networkLog.filter(e => e.status >= 200 && e.status < 300).length}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#f44336' }}>
          <div className="stat-label">Errores (4xx/5xx)</div>
          <div className="stat-value">
            {networkLog.filter(e => e.status >= 400).length}
          </div>
        </div>
      </div>

      {networkLog.length === 0 ? (
        <div className="empty-console">
          <IoGlobe className="empty-console-icon" />
          <div className="empty-console-text">No hay actividad de red</div>
        </div>
      ) : (
        [...networkLog].reverse().map((entry, idx) => (
          <div key={idx} className="network-entry">
            <div className="network-header">
              <div>
                <span className="network-method">{entry.method}</span>
                <span className="network-url">{entry.url}</span>
              </div>
              {entry.status && (
                <span className={`network-status ${entry.status < 400 ? 'success' : 'error'}`}>
                  {entry.status}
                </span>
              )}
            </div>
            <div className="network-details">
              {formatTimestamp(entry.timestamp)} • {entry.type} • View {entry.viewId}
            </div>
          </div>
        ))
      )}
    </>
  );

  const renderWebSocketTab = () => (
    <>
      <div className="console-stats">
        <div className="stat-card" style={{ borderLeftColor: '#9c27b0' }}>
          <div className="stat-label">Total de Frames</div>
          <div className="stat-value">{wsLog.length}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#ff9800' }}>
          <div className="stat-label">Enviados</div>
          <div className="stat-value">
            {wsLog.filter(e => e.type === 'sent').length}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#2196f3' }}>
          <div className="stat-label">Recibidos</div>
          <div className="stat-value">
            {wsLog.filter(e => e.type === 'received').length}
          </div>
        </div>
      </div>

      {wsLog.length === 0 ? (
        <div className="empty-console">
          <IoSwapVertical className="empty-console-icon" />
          <div className="empty-console-text">No hay actividad de WebSocket</div>
        </div>
      ) : (
        [...wsLog].reverse().map((entry, idx) => (
          <div key={idx} className="ws-entry">
            <div>
              <span className={`ws-type ${entry.type}`}>
                {entry.type.toUpperCase()}
              </span>
              <span style={{ color: '#888', fontSize: '11px' }}>
                {formatTimestamp(entry.timestamp)} • View {entry.viewId}
              </span>
            </div>
            {entry.payload && (
              <div className="ws-payload">
                {entry.payload.length > 200 
                  ? entry.payload.substring(0, 200) + '...' 
                  : entry.payload}
              </div>
            )}
            {entry.url && (
              <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>
                {entry.url}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );

  const renderMcpTab = () => (
    <>
      <div className="mcp-info">
        <div className="mcp-info-row">
          <span className="mcp-info-label">Estado del MCP</span>
          <span className="mcp-info-value">
            <span className="status-badge active">ACTIVO</span>
          </span>
        </div>
        <div className="mcp-info-row">
          <span className="mcp-info-label">Vista Actual</span>
          <span className="mcp-info-value">{mcpInfo?.viewId || 'N/A'}</span>
        </div>
        <div className="mcp-info-row">
          <span className="mcp-info-label">URL Actual</span>
          <span className="mcp-info-value" style={{ fontSize: '11px', wordBreak: 'break-all' }}>
            {mcpInfo?.url || 'N/A'}
          </span>
        </div>
        <div className="mcp-info-row">
          <span className="mcp-info-label">Título</span>
          <span className="mcp-info-value">{mcpInfo?.title || 'N/A'}</span>
        </div>
      </div>

      <div className="console-stats">
        <div className="stat-card">
          <div className="stat-label">Requests HTTP</div>
          <div className="stat-value">{networkLog.length}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#9c27b0' }}>
          <div className="stat-label">WebSocket Frames</div>
          <div className="stat-value">{wsLog.length}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#ff9800' }}>
          <div className="stat-label">Logs del Sistema</div>
          <div className="stat-value">{logs.length}</div>
        </div>
      </div>

      <div style={{ color: '#888', fontSize: '13px', lineHeight: '1.8' }}>
        <p><strong style={{ color: '#e0e0e0' }}>Acerca del MCP:</strong></p>
        <p>El Model Context Protocol (MCP) permite la comunicación entre el navegador y servicios externos.</p>
        <p>Esta consola muestra toda la actividad de red, WebSocket y logs del sistema en tiempo real.</p>
        <p style={{ marginTop: '16px' }}><strong style={{ color: '#e0e0e0' }}>Características:</strong></p>
        <ul style={{ paddingLeft: '20px' }}>
          <li>Monitoreo de requests HTTP en tiempo real</li>
          <li>Captura de frames WebSocket (enviados/recibidos)</li>
          <li>Logs del sistema y eventos</li>
          <li>Información de la vista actual</li>
        </ul>
      </div>
    </>
  );

  const handleClearCurrent = () => {
    switch (activeTab) {
      case 'logs':
        clearLogs();
        break;
      case 'network':
        clearNetworkLog();
        break;
      case 'websocket':
        clearWsLog();
        break;
      default:
        break;
    }
  };

  return (
    <div className="dev-console-overlay" onClick={onClose}>
      <div className="dev-console" onClick={(e) => e.stopPropagation()}>
        <div className="console-header">
          <h2>
            <IoTerminal className="console-title-icon" />
            Consola de Desarrollador
          </h2>
          <div className="console-header-actions">
            {activeTab !== 'mcp' && (
              <button 
                className="console-action-btn" 
                onClick={handleClearCurrent}
                title="Limpiar"
              >
                <IoTrash />
              </button>
            )}
            <button className="console-action-btn" onClick={onClose} title="Cerrar">
              <IoClose />
            </button>
          </div>
        </div>

        <div className="console-tabs">
          <button 
            className={`console-tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <IoTerminal /> Logs
          </button>
          <button 
            className={`console-tab ${activeTab === 'network' ? 'active' : ''}`}
            onClick={() => setActiveTab('network')}
          >
            <IoGlobe /> Red ({networkLog.length})
          </button>
          <button 
            className={`console-tab ${activeTab === 'websocket' ? 'active' : ''}`}
            onClick={() => setActiveTab('websocket')}
          >
            <IoSwapVertical /> WebSocket ({wsLog.length})
          </button>
          <button 
            className={`console-tab ${activeTab === 'mcp' ? 'active' : ''}`}
            onClick={() => setActiveTab('mcp')}
          >
            <IoInformationCircle /> MCP Info
          </button>
        </div>

        <div className="console-content" ref={consoleContentRef}>
          {activeTab === 'logs' && renderLogsTab()}
          {activeTab === 'network' && renderNetworkTab()}
          {activeTab === 'websocket' && renderWebSocketTab()}
          {activeTab === 'mcp' && renderMcpTab()}
        </div>
      </div>
    </div>
  );
}

export default DevConsole;
