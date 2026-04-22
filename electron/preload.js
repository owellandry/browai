const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Tab navigation ──────────────────────────────────────────────────────
  createView: (viewId, url) => ipcRenderer.invoke('create-view', viewId, url),
  switchView: (viewId) => ipcRenderer.invoke('switch-view', viewId),
  navigateTo: (viewId, url) => ipcRenderer.invoke('navigate-to', viewId, url),
  closeView: (viewId) => ipcRenderer.invoke('close-view', viewId),
  navigateBack: (viewId) => ipcRenderer.invoke('navigate-back', viewId),
  navigateForward: (viewId) => ipcRenderer.invoke('navigate-forward', viewId),
  reloadPage: (viewId) => ipcRenderer.invoke('reload-page', viewId),
  canGoBack: (viewId) => ipcRenderer.invoke('can-go-back', viewId),
  canGoForward: (viewId) => ipcRenderer.invoke('can-go-forward', viewId),

  // ─── Tab events ───────────────────────────────────────────────────────────
  onTabUpdated: (cb) => ipcRenderer.on('tab-updated', (event, viewId, data) => cb(viewId, data)),
  onTabLoading: (cb) => ipcRenderer.on('tab-loading', (event, viewId, loading) => cb(viewId, loading)),
  onMcpNewTab: (cb) => ipcRenderer.on('mcp-new-tab', (event, viewId, url) => cb(viewId, url)),

  // ─── Cookies & cache ─────────────────────────────────────────────────────
  getCookies: (url) => ipcRenderer.invoke('get-cookies', url),
  setCookie: (details) => ipcRenderer.invoke('set-cookie', details),
  clearCookies: () => ipcRenderer.invoke('clear-cookies'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),

  // ─── Persistent data ──────────────────────────────────────────────────────
  saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
  loadData: (key) => ipcRenderer.invoke('load-data', key),

  // ─── Downloads ────────────────────────────────────────────────────────────
  setupDownloads: () => ipcRenderer.invoke('setup-downloads'),
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (event, data) => cb(data)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (event, data) => cb(data)),
  onDownloadCompleted: (cb) => ipcRenderer.on('download-completed', (event, data) => cb(data)),
  onDownloadFailed: (cb) => ipcRenderer.on('download-failed', (event, data) => cb(data)),

  // ─── MCP / Security testing tools ────────────────────────────────────────
  executeJs: (viewId, script) => ipcRenderer.invoke('execute-js', viewId, script),
  screenshot: (viewId) => ipcRenderer.invoke('screenshot', viewId),
  setExtraHeaders: (headers) => ipcRenderer.invoke('set-extra-headers', headers),
  clearExtraHeaders: () => ipcRenderer.invoke('clear-extra-headers'),
  getNetworkLog: () => ipcRenderer.invoke('get-network-log'),
  clearNetworkLog: () => ipcRenderer.invoke('clear-network-log'),
  getWsLog: () => ipcRenderer.invoke('get-ws-log'),
  clearWsLog: () => ipcRenderer.invoke('clear-ws-log'),
  getPageSource: (viewId) => ipcRenderer.invoke('get-page-source', viewId),
  getCurrentInfo: (viewId) => ipcRenderer.invoke('get-current-info', viewId),
  listViews: () => ipcRenderer.invoke('list-views'),
  waitForNavigation: (viewId, timeout) => ipcRenderer.invoke('wait-for-navigation', viewId, timeout),
  devtoolsCommand: (viewId, method, params) => ipcRenderer.invoke('devtools-command', viewId, method, params),
  getResponseBody: (viewId, requestId) => ipcRenderer.invoke('get-response-body', viewId, requestId),
  
  // Control de BrowserView
  hideBrowserView: () => ipcRenderer.invoke('hide-browser-view'),
  showBrowserView: () => ipcRenderer.invoke('show-browser-view'),
});
