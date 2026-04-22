const { app, BrowserWindow, BrowserView, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const os = require('os');

// ─── Core state ──────────────────────────────────────────────────────────────
let mainWindow;
let browserViews = {};
let currentViewId = null;

// ─── MCP / Control-server state ──────────────────────────────────────────────
let networkLog = [];          // HTTP request metadata ring buffer
let wsFrameLog = [];          // WebSocket frame ring buffer
let responseBodyCache = {};   // requestId → { url, body, mimeType } for /api/ calls
let extraHeaders = {};        // extra request headers injected by MCP client
const MAX_NETWORK = 1000;
const MAX_WS_FRAMES = 500;
const MAX_RESPONSE_CACHE = 300;
const controlToken = crypto.randomUUID();  // bearer token for control HTTP API
let controlPort = null;                    // assigned when control server starts

// ─── Browser data paths ──────────────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const browserDataPath = path.join(userDataPath, 'BrowserData');
if (!fs.existsSync(browserDataPath)) {
  fs.mkdirSync(browserDataPath, { recursive: true });
}

// ─── createWindow ─────────────────────────────────────────────────────────────
function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:browsersession',
    },
  });

  const ses = session.fromPartition('persist:browsersession');
  
  // Configurar permisos
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['notifications', 'geolocation', 'media', 'mediaKeySystem'];
    callback(allowed.includes(permission));
  });
  
  // Configurar User Agent para la sesión principal también
  ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.82 Safari/537.36');

  // Inject extra headers on every request in this session (for MCP header injection)
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, ...extraHeaders } });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('resize', updateBrowserViewBounds);
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  startControlServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── BrowserView helpers ──────────────────────────────────────────────────────
function updateBrowserViewBounds() {
  if (currentViewId && browserViews[currentViewId]) {
    const bounds = mainWindow.getContentBounds();
    // Dejar espacio para TabBar (36px) + NavigationBar (52px) = 88px
    // Pero el BrowserView debe estar DEBAJO de la interfaz, no cubrirla
    browserViews[currentViewId].setBounds({
      x: 0, 
      y: 88, // Esto está correcto
      width: bounds.width,
      height: bounds.height - 88,
    });
  }
}

// Nueva función para ocultar temporalmente el BrowserView
function hideBrowserView() {
  if (currentViewId && browserViews[currentViewId]) {
    mainWindow.removeBrowserView(browserViews[currentViewId]);
  }
}

// Nueva función para mostrar el BrowserView
function showBrowserView() {
  if (currentViewId && browserViews[currentViewId]) {
    mainWindow.addBrowserView(browserViews[currentViewId]);
    updateBrowserViewBounds();
  }
}

function createBrowserView(viewId, url) {
  if (browserViews[viewId]) return browserViews[viewId];

  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:browsersession',
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Deshabilitar características que pueden causar detección
      backgroundThrottling: false,
      offscreen: false,
    },
  });

  browserViews[viewId] = view;

  // Configurar un User Agent realista (Chrome actualizado para 2026)
  const chromeVersion = '134.0.6998.82';
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  view.webContents.setUserAgent(userAgent);

  // Agregar headers realistas para evitar detección
  view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    // Headers básicos de idioma y privacidad
    details.requestHeaders['Accept-Language'] = 'es-ES,es;q=0.9,en;q=0.8';
    details.requestHeaders['DNT'] = '1';
    
    // Headers de Chrome actualizados
    details.requestHeaders['sec-ch-ua'] = `"Chromium";v="134", "Google Chrome";v="134", "Not:A-Brand";v="99"`;
    details.requestHeaders['sec-ch-ua-mobile'] = '?0';
    details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
    
    // Headers adicionales importantes
    if (details.resourceType === 'mainFrame') {
      details.requestHeaders['Upgrade-Insecure-Requests'] = '1';
      details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
    } else if (details.resourceType === 'script') {
      details.requestHeaders['Accept'] = '*/*';
    } else if (details.resourceType === 'image') {
      details.requestHeaders['Accept'] = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
    }

    // Inyectar headers extra de MCP si existen
    if (Object.keys(extraHeaders).length > 0) {
      Object.assign(details.requestHeaders, extraHeaders);
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  view.webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('tab-loading', viewId, true);
  });

  view.webContents.on('did-stop-loading', () => {
    // Agregar un pequeño delay para simular comportamiento humano
    setTimeout(() => {
      mainWindow.webContents.send('tab-loading', viewId, false);
      const title = view.webContents.getTitle();
      const url = view.webContents.getURL();
      mainWindow.webContents.send('tab-updated', viewId, { title, url });
    }, 100 + Math.random() * 200);
  });

  view.webContents.on('page-title-updated', (event, title) => {
    mainWindow.webContents.send('tab-updated', viewId, { title });
  });

  attachDebugger(view, viewId);

  if (url) view.webContents.loadURL(url);

  return view;
}

function switchToView(viewId) {
  if (currentViewId === viewId && browserViews[viewId]) return;

  // Remover la vista actual
  if (currentViewId && browserViews[currentViewId]) {
    mainWindow.removeBrowserView(browserViews[currentViewId]);
  }

  // Crear la vista si no existe
  if (!browserViews[viewId]) createBrowserView(viewId);

  // Agregar la nueva vista
  mainWindow.addBrowserView(browserViews[viewId]);
  
  currentViewId = viewId;
  updateBrowserViewBounds();
}

// ─── CDP Debugger (per BrowserView) ──────────────────────────────────────────
function attachDebugger(view, viewId) {
  const dbg = view.webContents.debugger;
  if (dbg.isAttached()) return;

  try {
    dbg.attach('1.3');
    dbg.sendCommand('Network.enable');

    // Inyectar script anti-detección ANTES de que carguen los scripts de la página
    dbg.sendCommand('Page.enable').catch(() => {});
    
    // Script 1: Configuración inicial crítica (debe ejecutarse PRIMERO)
    dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        // === ANTI-DETECCIÓN CLOUDFLARE ===
        // === ANTI-DETECCIÓN CLOUDFLARE ===
        
        // CRÍTICO: Cloudflare verifica estas propiedades primero
        
        // 1. Webdriver - DEBE ser false, no undefined
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: false,
          enumerable: true
        });

        // 2. Eliminar TODAS las propiedades CDP/Automation
        const propsToDelete = [
          '__webdriver_evaluate',
          '__selenium_evaluate',
          '__webdriver_script_function',
          '__webdriver_script_func',
          '__webdriver_script_fn',
          '__fxdriver_evaluate',
          '__driver_unwrapped',
          '__webdriver_unwrapped',
          '__driver_evaluate',
          '__selenium_unwrapped',
          '__fxdriver_unwrapped',
          '_Selenium_IDE_Recorder',
          '_selenium',
          'calledSelenium',
          '$cdc_asdjflasutopfhvcZLmcfl_',
          '$chrome_asyncScriptInfo',
          '__$webdriverAsyncExecutor',
          'webdriver',
          '__webdriverFunc',
          'domAutomation',
          'domAutomationController',
        ];
        
        propsToDelete.forEach(prop => {
          try {
            delete window[prop];
            delete document[prop];
            delete navigator[prop];
          } catch(e) {}
        });
        
        // Eliminar propiedades CDC dinámicamente
        Object.getOwnPropertyNames(window).forEach(prop => {
          if (prop.includes('cdc_') || prop.includes('__selenium') || prop.includes('__webdriver')) {
            try { delete window[prop]; } catch(e) {}
          }
        });

        // 3. Chrome object COMPLETO (Cloudflare lo verifica extensivamente)
        if (!window.chrome) {
          window.chrome = {};
        }
        
        // Runtime API
        window.chrome.runtime = {
          connect: function() { 
            return { 
              onMessage: { 
                addListener: function(){}, 
                removeListener: function(){},
                hasListener: function(){ return false; }
              }, 
              postMessage: function(){},
              disconnect: function(){},
              onDisconnect: { addListener: function(){}, removeListener: function(){} }
            }; 
          },
          sendMessage: function(extensionId, message, options, callback) {
            if (typeof callback === 'function') {
              setTimeout(() => callback(), 0);
            }
          },
          onMessage: { 
            addListener: function(){}, 
            removeListener: function(){},
            hasListener: function(){ return false; }
          },
          id: undefined,
          getManifest: function(){ return undefined; },
          getURL: function(path){ return undefined; }
        };
        
        // LoadTimes (deprecado pero Cloudflare lo verifica)
        window.chrome.loadTimes = function() {
          const now = Date.now() / 1000;
          return {
            commitLoadTime: now - Math.random() * 0.5,
            connectionInfo: 'h2',
            finishDocumentLoadTime: now - Math.random() * 0.3,
            finishLoadTime: now - Math.random() * 0.2,
            firstPaintAfterLoadTime: 0,
            firstPaintTime: now - Math.random() * 0.4,
            navigationType: 'Other',
            npnNegotiatedProtocol: 'h2',
            requestTime: now - Math.random() * 1,
            startLoadTime: now - Math.random() * 0.8,
            wasAlternateProtocolAvailable: false,
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true,
          };
        };
        
        // CSI
        window.chrome.csi = function() {
          const now = Date.now();
          return { 
            onloadT: now, 
            pageT: now / 1000, 
            startE: now - Math.random() * 1000, 
            tran: 15 
          };
        };
        
        // App
        window.chrome.app = { 
          isInstalled: false,
          getDetails: function(){ return null; },
          getIsInstalled: function(){ return false; },
          runningState: function(){ return 'cannot_run'; },
          InstallState: { 
            DISABLED: 'disabled', 
            INSTALLED: 'installed', 
            NOT_INSTALLED: 'not_installed' 
          }, 
          RunningState: { 
            CANNOT_RUN: 'cannot_run', 
            READY_TO_RUN: 'ready_to_run', 
            RUNNING: 'running' 
          } 
        };

        // 4. Plugins - MUY IMPORTANTE para Cloudflare
        const makePluginArray = (arr) => {
          const pa = Object.create(PluginArray.prototype);
          arr.forEach((p, i) => { 
            pa[i] = p;
            Object.defineProperty(pa[i], 'length', { value: p.length, writable: false });
          });
          Object.defineProperty(pa, 'length', { 
            get: () => arr.length,
            enumerable: true,
            configurable: false
          });
          pa.item = function(i) { return arr[i] || null; };
          pa.namedItem = function(n) { return arr.find(p => p.name === n) || null; };
          pa.refresh = function() {};
          return pa;
        };
        
        const plugins = [
          { 
            name: 'PDF Viewer', 
            filename: 'internal-pdf-viewer', 
            description: 'Portable Document Format', 
            length: 1, 
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null } 
          },
          { 
            name: 'Chrome PDF Viewer', 
            filename: 'internal-pdf-viewer', 
            description: 'Portable Document Format', 
            length: 1, 
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null } 
          },
          { 
            name: 'Chromium PDF Viewer', 
            filename: 'internal-pdf-viewer', 
            description: 'Portable Document Format', 
            length: 1, 
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null } 
          },
          { 
            name: 'Microsoft Edge PDF Viewer', 
            filename: 'internal-pdf-viewer', 
            description: 'Portable Document Format', 
            length: 1, 
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null } 
          },
          { 
            name: 'WebKit built-in PDF', 
            filename: 'internal-pdf-viewer', 
            description: 'Portable Document Format', 
            length: 1, 
            0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null } 
          }
        ];
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => makePluginArray(plugins),
          enumerable: true,
          configurable: true,
        });
        
        // MimeTypes también
        Object.defineProperty(navigator, 'mimeTypes', {
          get: () => {
            const mt = Object.create(MimeTypeArray.prototype);
            mt[0] = { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: plugins[0] };
            Object.defineProperty(mt, 'length', { get: () => 1 });
            mt.item = (i) => mt[i] || null;
            mt.namedItem = (n) => mt[0].type === n ? mt[0] : null;
            return mt;
          },
          enumerable: true,
          configurable: true,
        });

        // 5. Languages
        Object.defineProperty(navigator, 'languages', {
          get: () => Object.freeze(['es-ES', 'es', 'en-US', 'en']),
          enumerable: true,
          configurable: true,
        });
        
        Object.defineProperty(navigator, 'language', {
          get: () => 'es-ES',
          enumerable: true,
          configurable: true,
        });

        // 6. Permissions API
        const originalPermissionsQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = function(params) {
          if (params.name === 'notifications') {
            return Promise.resolve({ 
              state: Notification.permission,
              onchange: null,
              addEventListener: function(){},
              removeEventListener: function(){}
            });
          }
          return originalPermissionsQuery.call(window.navigator.permissions, params);
        };

        // 7. User Agent limpio
        const originalUA = navigator.userAgent;
        Object.defineProperty(navigator, 'userAgent', {
          get: () => originalUA.replace(/Electron\\/[\\d.]+ /, '').replace(/\\s+/g, ' ').trim(),
          enumerable: true,
          configurable: true,
        });
        
        Object.defineProperty(navigator, 'appVersion', {
          get: () => navigator.userAgent.replace('Mozilla/', ''),
          enumerable: true,
          configurable: true,
        });

        // 8. Hardware realista con variación
        Object.defineProperty(navigator, 'hardwareConcurrency', { 
          get: () => 8,
          enumerable: true,
          configurable: true 
        });
        
        Object.defineProperty(navigator, 'deviceMemory', { 
          get: () => 8,
          enumerable: true,
          configurable: true 
        });

        // 9. Connection API
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50 + Math.floor(Math.random() * 50),
            downlink: 10,
            saveData: false,
            onchange: null,
            addEventListener: function(){},
            removeEventListener: function(){},
            dispatchEvent: function(){ return true; }
          }),
          enumerable: true,
          configurable: true,
        });

        // 10. Battery API
        if (!navigator.getBattery) {
          navigator.getBattery = function() {
            return Promise.resolve({
              charging: true,
              chargingTime: 0,
              dischargingTime: Infinity,
              level: 0.95 + Math.random() * 0.05,
              onchargingchange: null,
              onchargingtimechange: null,
              ondischargingtimechange: null,
              onlevelchange: null,
              addEventListener: function(){},
              removeEventListener: function(){},
              dispatchEvent: function(){ return true; }
            });
          };
        }

        // 11. Screen properties realistas
        Object.defineProperty(screen, 'availWidth', { get: () => screen.width });
        Object.defineProperty(screen, 'availHeight', { get: () => screen.height - 40 });
        Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
        Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

        // 12. Window properties
        Object.defineProperty(window, 'outerWidth', { 
          get: () => window.innerWidth,
          configurable: true 
        });
        Object.defineProperty(window, 'outerHeight', { 
          get: () => window.innerHeight + 85,
          configurable: true 
        });

        // 13. Notification API
        if (window.Notification) {
          const OriginalNotification = window.Notification;
          Object.defineProperty(window, 'Notification', {
            get: () => OriginalNotification,
            enumerable: true,
            configurable: false
          });
        }

        // 14. toString() de funciones nativas
        const originalToString = Function.prototype.toString;
        const originalCall = Function.prototype.call;
        
        Function.prototype.toString = function() {
          if (this === navigator.permissions.query) {
            return 'function query() { [native code] }';
          }
          if (this === window.chrome.runtime.sendMessage) {
            return 'function sendMessage() { [native code] }';
          }
          if (this === navigator.getBattery) {
            return 'function getBattery() { [native code] }';
          }
          return originalCall.call(originalToString, this);
        };

        // 15. Ocultar automation en prototype chain
        delete Object.getPrototypeOf(navigator).webdriver;
        
        // 16. Performance timing realista
        if (window.performance && window.performance.timing) {
          const timing = window.performance.timing;
          const now = Date.now();
          const offset = now - 1000 - Math.random() * 500;
          
          Object.defineProperty(timing, 'navigationStart', { value: offset, writable: false });
          Object.defineProperty(timing, 'fetchStart', { value: offset + 5, writable: false });
          Object.defineProperty(timing, 'domainLookupStart', { value: offset + 10, writable: false });
          Object.defineProperty(timing, 'domainLookupEnd', { value: offset + 15, writable: false });
          Object.defineProperty(timing, 'connectStart', { value: offset + 15, writable: false });
          Object.defineProperty(timing, 'connectEnd', { value: offset + 50, writable: false });
          Object.defineProperty(timing, 'requestStart', { value: offset + 55, writable: false });
          Object.defineProperty(timing, 'responseStart', { value: offset + 200, writable: false });
          Object.defineProperty(timing, 'responseEnd', { value: offset + 400, writable: false });
        }

        // 17. Iframe detection bypass
        Object.defineProperty(window, 'top', {
          get: function() { return window; },
          set: function() {},
          configurable: false
        });

        // 18. Error stack traces limpios
        const OriginalError = window.Error;
        window.Error = function(...args) {
          const err = new OriginalError(...args);
          if (err.stack) {
            err.stack = err.stack.replace(/\\s+at __puppeteer_evaluation_script__[\\s\\S]*/g, '');
          }
          return err;
        };
        window.Error.prototype = OriginalError.prototype;

        // 19. Canvas fingerprint - agregar ruido mínimo
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
          const context = this.getContext('2d');
          if (context) {
            const imageData = context.getImageData(0, 0, this.width, this.height);
            // Agregar ruido imperceptible (1 pixel)
            if (imageData.data.length > 0) {
              imageData.data[0] = imageData.data[0] ^ (Math.random() > 0.5 ? 1 : 0);
            }
            context.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, arguments);
        };

        // 20. WebGL fingerprint - agregar variación mínima
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
            return 'Intel Inc.';
          }
          if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, arguments);
        };

        // 21. MouseEvent y PointerEvent realistas
        const originalMouseEvent = window.MouseEvent;
        window.MouseEvent = function(type, eventInitDict) {
          const event = new originalMouseEvent(type, eventInitDict);
          // Cloudflare verifica que los eventos tengan isTrusted
          Object.defineProperty(event, 'isTrusted', { get: () => true });
          return event;
        };

        // 22. Fecha y timezone consistentes
        const originalDate = Date;
        const timezoneOffset = new originalDate().getTimezoneOffset();
        Date.prototype.getTimezoneOffset = function() {
          return timezoneOffset;
        };

        console.log('[Anti-Detection] Cloudflare bypass initialized');
      `
    }).catch(() => {});

    dbg.on('message', async (event, method, params) => {
      if (method === 'Network.requestWillBeSent') {
        const entry = {
          requestId: params.requestId,
          timestamp: Date.now(),
          type: params.type,
          url: params.request.url,
          method: params.request.method,
          requestHeaders: params.request.headers,
          postData: params.request.postData || null,
          viewId,
        };
        networkLog.push(entry);
        if (networkLog.length > MAX_NETWORK) networkLog.shift();

      } else if (method === 'Network.responseReceived') {
        for (let i = networkLog.length - 1; i >= 0; i--) {
          if (networkLog[i].requestId === params.requestId) {
            networkLog[i].status = params.response.status;
            networkLog[i].responseHeaders = params.response.headers;
            networkLog[i].mimeType = params.response.mimeType;
            break;
          }
        }

      } else if (method === 'Network.loadingFinished') {
        // Auto-capture response bodies for API calls
        const entry = networkLog.find(e => e.requestId === params.requestId);
        if (entry && entry.url && entry.url.includes('/api/')) {
          try {
            const rb = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
            const cacheKeys = Object.keys(responseBodyCache);
            if (cacheKeys.length >= MAX_RESPONSE_CACHE) delete responseBodyCache[cacheKeys[0]];
            responseBodyCache[params.requestId] = {
              url: entry.url,
              method: entry.method,
              status: entry.status,
              mimeType: entry.mimeType,
              body: rb.base64Encoded ? Buffer.from(rb.body, 'base64').toString('utf8').slice(0, 8000) : (rb.body || '').slice(0, 8000),
              ts: Date.now(),
            };
          } catch (_) {}
        }

      } else if (method === 'Network.webSocketCreated') {
        wsFrameLog.push({ type: 'created', requestId: params.requestId, url: params.url, timestamp: Date.now(), viewId });
        if (wsFrameLog.length > MAX_WS_FRAMES) wsFrameLog.shift();

      } else if (method === 'Network.webSocketFrameReceived') {
        wsFrameLog.push({ type: 'received', requestId: params.requestId, payload: params.response.payloadData, timestamp: Date.now(), viewId });
        if (wsFrameLog.length > MAX_WS_FRAMES) wsFrameLog.shift();

      } else if (method === 'Network.webSocketFrameSent') {
        wsFrameLog.push({ type: 'sent', requestId: params.requestId, payload: params.response.payloadData, timestamp: Date.now(), viewId });
        if (wsFrameLog.length > MAX_WS_FRAMES) wsFrameLog.shift();
      }
    });

    dbg.on('detach', (event, reason) => {
      console.warn(`[BrowAI] CDP detached from view ${viewId}: ${reason}`);
    });

  } catch (e) {
    console.warn(`[BrowAI] CDP attach failed for view ${viewId}:`, e.message);
  }
}

// ─── IPC handlers (browser UI) ───────────────────────────────────────────────
ipcMain.handle('create-view', (event, viewId, url) => {
  createBrowserView(viewId, url);
  return true;
});

ipcMain.handle('switch-view', (event, viewId) => {
  switchToView(viewId);
  return true;
});

ipcMain.handle('navigate-to', (event, viewId, url) => {
  if (!browserViews[viewId]) createBrowserView(viewId, url);
  else browserViews[viewId].webContents.loadURL(url);
  if (currentViewId === viewId) switchToView(viewId);
  return true;
});

ipcMain.handle('close-view', (event, viewId) => {
  if (browserViews[viewId]) {
    if (currentViewId === viewId) {
      mainWindow.removeBrowserView(browserViews[viewId]);
      currentViewId = null;
    }
    browserViews[viewId].webContents.destroy();
    delete browserViews[viewId];
  }
  return true;
});

ipcMain.handle('navigate-back', (event, viewId) => {
  if (browserViews[viewId]?.webContents.canGoBack()) {
    browserViews[viewId].webContents.goBack();
    return true;
  }
  return false;
});

ipcMain.handle('navigate-forward', (event, viewId) => {
  if (browserViews[viewId]?.webContents.canGoForward()) {
    browserViews[viewId].webContents.goForward();
    return true;
  }
  return false;
});

ipcMain.handle('reload-page', (event, viewId) => {
  if (browserViews[viewId]) { browserViews[viewId].webContents.reload(); return true; }
  return false;
});

ipcMain.handle('can-go-back', (event, viewId) =>
  browserViews[viewId]?.webContents.canGoBack() || false);

ipcMain.handle('can-go-forward', (event, viewId) =>
  browserViews[viewId]?.webContents.canGoForward() || false);

// ─── Cookie IPC handlers ──────────────────────────────────────────────────────
ipcMain.handle('get-cookies', async (event, url) => {
  const ses = session.fromPartition('persist:browsersession');
  return ses.cookies.get(url ? { url } : {});
});

ipcMain.handle('set-cookie', async (event, cookieDetails) => {
  const ses = session.fromPartition('persist:browsersession');
  await ses.cookies.set(cookieDetails);
  return true;
});

ipcMain.handle('clear-cookies', async () => {
  const ses = session.fromPartition('persist:browsersession');
  await ses.clearStorageData({ storages: ['cookies'] });
  return true;
});

// ─── Cache IPC handlers ───────────────────────────────────────────────────────
ipcMain.handle('clear-cache', async () => {
  const ses = session.fromPartition('persist:browsersession');
  await ses.clearCache();
  await ses.clearStorageData({
    storages: ['appcache', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
  });
  return true;
});

ipcMain.handle('get-cache-size', async () => {
  const ses = session.fromPartition('persist:browsersession');
  return ses.getCacheSize();
});

// ─── Persistent data IPC handlers ────────────────────────────────────────────
ipcMain.handle('save-data', (event, key, data) => {
  try {
    fs.writeFileSync(path.join(browserDataPath, `${key}.json`), JSON.stringify(data, null, 2));
    return true;
  } catch (e) { return false; }
});

ipcMain.handle('load-data', (event, key) => {
  try {
    const p = path.join(browserDataPath, `${key}.json`);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  } catch (e) { return null; }
});

// ─── Download IPC handlers ────────────────────────────────────────────────────
ipcMain.handle('setup-downloads', () => {
  const ses = session.fromPartition('persist:browsersession');
  ses.on('will-download', (event, item) => {
    const fileName = item.getFilename();
    mainWindow.webContents.send('download-started', {
      fileName, totalBytes: item.getTotalBytes(), url: item.getURL(),
    });
    item.on('updated', (event, state) => {
      if (state === 'progressing' && !item.isPaused()) {
        const received = item.getReceivedBytes();
        const total = item.getTotalBytes();
        mainWindow.webContents.send('download-progress', {
          fileName, state: 'progressing', progress: (received / total) * 100, received, total,
        });
      } else {
        mainWindow.webContents.send('download-progress', { fileName, state });
      }
    });
    item.once('done', (event, state) => {
      if (state === 'completed') {
        mainWindow.webContents.send('download-completed', { fileName, path: item.getSavePath() });
      } else {
        mainWindow.webContents.send('download-failed', { fileName, state });
      }
    });
  });
  return true;
});

// ─── MCP IPC handlers ─────────────────────────────────────────────────────────
ipcMain.handle('execute-js', async (event, viewId, script) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return { error: 'view not found' };
  try {
    const result = await browserViews[id].webContents.executeJavaScript(script, true);
    return { result };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('screenshot', async (event, viewId) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return null;
  const img = await browserViews[id].webContents.capturePage();
  return img.toPNG().toString('base64');
});

ipcMain.handle('set-extra-headers', (event, headers) => {
  extraHeaders = { ...extraHeaders, ...headers };
  return true;
});

ipcMain.handle('clear-extra-headers', () => { extraHeaders = {}; return true; });

ipcMain.handle('get-network-log', () => networkLog);
ipcMain.handle('clear-network-log', () => { networkLog = []; return true; });
ipcMain.handle('get-ws-log', () => wsFrameLog);
ipcMain.handle('clear-ws-log', () => { wsFrameLog = []; return true; });

ipcMain.handle('get-page-source', async (event, viewId) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return null;
  return browserViews[id].webContents.executeJavaScript('document.documentElement.outerHTML', true);
});

ipcMain.handle('get-current-info', (event, viewId) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return null;
  return {
    viewId: id,
    url: browserViews[id].webContents.getURL(),
    title: browserViews[id].webContents.getTitle(),
  };
});

ipcMain.handle('list-views', () =>
  Object.keys(browserViews).map(id => ({
    viewId: Number(id),
    url: browserViews[id].webContents.getURL(),
    title: browserViews[id].webContents.getTitle(),
    active: Number(id) === currentViewId,
  }))
);

ipcMain.handle('wait-for-navigation', (event, viewId, timeout) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return false;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeout || 15000);
    browserViews[id].webContents.once('did-finish-load', () => { clearTimeout(t); resolve(true); });
  });
});

ipcMain.handle('devtools-command', async (event, viewId, cdpMethod, cdpParams) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return { error: 'view not found' };
  try {
    const dbg = browserViews[id].webContents.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    const result = await dbg.sendCommand(cdpMethod, cdpParams || {});
    return { result };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('get-response-body', async (event, viewId, requestId) => {
  const id = viewId || currentViewId;
  if (!browserViews[id]) return { error: 'view not found' };
  try {
    const dbg = browserViews[id].webContents.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    return await dbg.sendCommand('Network.getResponseBody', { requestId });
  } catch (e) {
    return { error: e.message };
  }
});

// Handlers para controlar la visibilidad del BrowserView
ipcMain.handle('hide-browser-view', () => {
  hideBrowserView();
  return true;
});

ipcMain.handle('show-browser-view', () => {
  showBrowserView();
  return true;
});

// ─── HTTP Control Server ──────────────────────────────────────────────────────
function startControlServer() {
  const server = http.createServer(async (req, res) => {
    // Block non-localhost origins
    const origin = req.headers['origin'] || '';
    if (origin && !origin.startsWith('http://127.0.0.1') && !origin.startsWith('http://localhost')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    // Bearer token auth
    if (req.headers['authorization'] !== `Bearer ${controlToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }

    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let params = {};
      if (body) try { params = JSON.parse(body); } catch {}

      try {
        const urlPath = new URL(req.url, `http://127.0.0.1`).pathname;
        let result;
        const ses = session.fromPartition('persist:browsersession');

        switch (urlPath) {
          case '/health':
            result = { ok: true, views: Object.keys(browserViews).length, currentViewId }; break;

          case '/navigate': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) createBrowserView(id, params.url);
            else browserViews[id].webContents.loadURL(params.url);
            if (currentViewId === id) switchToView(id);
            result = { ok: true, viewId: id }; break;
          }

          case '/execute': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            try {
              const r = await browserViews[id].webContents.executeJavaScript(params.script, true);
              result = { ok: true, result: r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/screenshot': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const img = await browserViews[id].webContents.capturePage();
            result = { ok: true, png: img.toPNG().toString('base64'), mimeType: 'image/png' }; break;
          }

          case '/source': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const html = await browserViews[id].webContents.executeJavaScript('document.documentElement.outerHTML', true);
            result = { ok: true, source: html }; break;
          }

          case '/cookies': {
            const cookies = await ses.cookies.get(params.url ? { url: params.url } : {});
            result = { ok: true, cookies }; break;
          }

          case '/set-cookie':
            await ses.cookies.set(params);
            result = { ok: true }; break;

          case '/clear-cookies':
            await ses.clearStorageData({ storages: ['cookies'] });
            result = { ok: true }; break;

          case '/network-log':
            result = { ok: true, entries: networkLog }; break;

          case '/clear-network-log':
            networkLog = [];
            result = { ok: true }; break;

          case '/api-responses': {
            // Return captured API response bodies, optionally filtered
            let entries = Object.values(responseBodyCache);
            if (params.filter) entries = entries.filter(e => e.url.includes(params.filter));
            if (params.method) entries = entries.filter(e => e.method === params.method.toUpperCase());
            entries.sort((a, b) => b.ts - a.ts);
            const limit = params.limit || 100;
            result = { ok: true, count: entries.length, entries: entries.slice(0, limit) };
            break;
          }

          case '/clear-api-responses':
            responseBodyCache = {};
            result = { ok: true }; break;

          case '/dump-storage': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const storageScript = `(() => {
              const ls = {}, ss = {};
              try { for (let i=0;i<localStorage.length;i++){const k=localStorage.key(i);ls[k]=localStorage.getItem(k);} } catch(e){}
              try { for (let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);ss[k]=sessionStorage.getItem(k);} } catch(e){}
              const windowState = {};
              ['__NEXT_DATA__','__SC_DATA__','__INITIAL_STATE__','__REDUX_STATE__','__APP_STATE__',
               '__STORE__','initialDynamic','__WS_CONFIG__'].forEach(k => {
                if (window[k] !== undefined) try { windowState[k] = JSON.parse(JSON.stringify(window[k])); } catch(e){}
              });
              const meta = {};
              document.querySelectorAll('meta[name],meta[property]').forEach(m => {
                meta[m.name||m.getAttribute('property')] = m.content;
              });
              const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
              return { localStorage: ls, sessionStorage: ss, windowState, meta, scriptSrcs: scripts.slice(0,50) };
            })()`;
            try {
              const r = await browserViews[id].webContents.executeJavaScript(storageScript, true);
              result = { ok: true, ...r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/scan-js-endpoints': {
            // Fetch all loaded JS files and grep for API endpoint patterns
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const scanScript = `(async () => {
              const scripts = [...document.querySelectorAll('script[src]')]
                .map(s => s.src)
                .filter(s => s && !s.includes('google') && !s.includes('analytics') && !s.includes('sentry'));
              const endpoints = new Set();
              const patterns = [
                /['"](\/api\/[^'"?#\s]{3,80})['"]/g,
                /fetch\(['"](\/[^'"?#\s]{5,80})['"]/g,
                /axios\.[a-z]+\(['"](\/[^'"?#\s]{5,80})['"]/g,
                /\btarget:\s*['"](\/api\/[^'"]{3,60})['"]/g,
                /['"](https?:\/\/[^'"]*\/api\/[^'"?#\s]{3,80})['"]/g,
              ];
              const limit = ${params.limit || 8};
              for (const src of scripts.slice(0, limit)) {
                try {
                  const r = await fetch(src);
                  const text = await r.text();
                  patterns.forEach(re => {
                    let m;
                    const freshRe = new RegExp(re.source, re.flags);
                    while ((m = freshRe.exec(text)) !== null) {
                      if (m[1] && m[1].length > 4) endpoints.add(m[1]);
                    }
                  });
                } catch(e) {}
              }
              return { scriptsScanned: Math.min(scripts.length, limit), totalScripts: scripts.length, endpoints: [...endpoints].sort() };
            })()`;
            try {
              const r = await browserViews[id].webContents.executeJavaScript(scanScript, true);
              result = { ok: true, ...r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/fuzz-idor': {
            // Fuzz a URL template {ID} with a list of user IDs from the page context
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const { urlTemplate, ids, method = 'GET', body: fuzzBody } = params;
            if (!urlTemplate || !ids || !ids.length) { result = { error: 'urlTemplate and ids required' }; break; }
            const fuzzScript = `(async () => {
              const template = ${JSON.stringify(urlTemplate)};
              const ids = ${JSON.stringify(ids)};
              const results = [];
              for (const fuzzId of ids) {
                const url = template.replace('{ID}', fuzzId);
                try {
                  const r = await fetch(url, {
                    method: ${JSON.stringify(method)},
                    credentials: 'include',
                    headers: { 'front-version': '11.6.46', 'Content-Type': 'application/json' },
                    ${fuzzBody ? `body: ${JSON.stringify(fuzzBody)},` : ''}
                  });
                  let body = null;
                  try { const t = await r.text(); body = t.slice(0, 500); } catch(e) {}
                  results.push({ id: fuzzId, url, status: r.status, body });
                } catch(e) {
                  results.push({ id: fuzzId, url, error: e.message });
                }
              }
              return results;
            })()`;
            try {
              const r = await browserViews[id].webContents.executeJavaScript(fuzzScript, true);
              result = { ok: true, results: r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/ws-scan-channels': {
            // Connect to a Centrifugo WS and test a list of channels for authorization
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const { wsUrl, token, channels, waitMs = 10000 } = params;
            if (!wsUrl || !token || !channels) { result = { error: 'wsUrl, token, channels required' }; break; }
            const scanScript = `(() => {
              const wsUrl = ${JSON.stringify(wsUrl)};
              const token = ${JSON.stringify(token)};
              const channels = ${JSON.stringify(channels)};
              const waitMs = ${waitMs};
              return new Promise(resolve => {
                const ws = new WebSocket(wsUrl + '?cf_protocol_version=v2');
                let id = 1; const map = {}; const subs = {}; const events = [];
                ws.onopen = () => ws.send(JSON.stringify({ connect: { token, name: 'browai' }, id: id++ }));
                ws.onmessage = e => {
                  if (e.data === '{}') { ws.send('{}'); return; }
                  const m = JSON.parse(e.data);
                  if (m.connect && !m.error) {
                    channels.forEach(ch => { const i = id++; map[i] = ch; ws.send(JSON.stringify({ subscribe: { channel: ch }, id: i })); });
                  }
                  if (m.id && map[m.id]) subs[map[m.id]] = m.error ? 'DENIED:' + m.error.code : 'GRANTED';
                  if (m.push) events.push({ ts: new Date().toISOString(), channel: m.push.channel, data: m.push.pub?.data });
                };
                ws.onerror = () => resolve({ error: 'ws_connect_failed' });
                setTimeout(() => { ws.close(); resolve({ subs, events }); }, waitMs);
              });
            })()`;
            try {
              const r = await browserViews[id].webContents.executeJavaScript(scanScript, true);
              result = { ok: true, ...r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/ws-log':
            result = { ok: true, frames: wsFrameLog }; break;

          case '/clear-ws-log':
            wsFrameLog = [];
            result = { ok: true }; break;

          case '/set-headers':
            extraHeaders = { ...extraHeaders, ...params.headers };
            result = { ok: true, active: extraHeaders }; break;

          case '/clear-headers':
            extraHeaders = {};
            result = { ok: true }; break;

          case '/info': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            result = { ok: true, viewId: id, url: browserViews[id].webContents.getURL(), title: browserViews[id].webContents.getTitle() }; break;
          }

          case '/tabs':
            result = {
              ok: true,
              tabs: Object.keys(browserViews).map(id => ({
                viewId: Number(id),
                url: browserViews[id].webContents.getURL(),
                title: browserViews[id].webContents.getTitle(),
                active: Number(id) === currentViewId,
              })),
            }; break;

          case '/new-tab': {
            const tabId = Date.now();
            createBrowserView(tabId, params.url || 'about:blank');
            switchToView(tabId);
            mainWindow.webContents.send('mcp-new-tab', tabId, params.url || 'about:blank');
            result = { ok: true, viewId: tabId }; break;
          }

          case '/close-tab': {
            const id = params.viewId;
            if (browserViews[id]) {
              if (currentViewId === id) { mainWindow.removeBrowserView(browserViews[id]); currentViewId = null; }
              browserViews[id].webContents.destroy();
              delete browserViews[id];
            }
            result = { ok: true }; break;
          }

          case '/switch-tab':
            switchToView(params.viewId);
            result = { ok: true }; break;

          case '/wait-navigation': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            const loaded = await new Promise((resolve) => {
              const t = setTimeout(() => resolve(false), params.timeout || 15000);
              browserViews[id].webContents.once('did-finish-load', () => { clearTimeout(t); resolve(true); });
            });
            result = { ok: true, loaded }; break;
          }

          case '/response-body': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            try {
              const dbg = browserViews[id].webContents.debugger;
              if (!dbg.isAttached()) dbg.attach('1.3');
              const r = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
              result = { ok: true, ...r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/devtools': {
            const id = params.viewId || currentViewId;
            if (!browserViews[id]) { result = { error: 'view not found' }; break; }
            try {
              const dbg = browserViews[id].webContents.debugger;
              if (!dbg.isAttached()) dbg.attach('1.3');
              const r = await dbg.sendCommand(params.method, params.params || {});
              result = { ok: true, result: r };
            } catch (e) { result = { error: e.message }; }
            break;
          }

          case '/back': {
            const id = params.viewId || currentViewId;
            const ok = browserViews[id]?.webContents.canGoBack() || false;
            if (ok) browserViews[id].webContents.goBack();
            result = { ok }; break;
          }

          case '/forward': {
            const id = params.viewId || currentViewId;
            const ok = browserViews[id]?.webContents.canGoForward() || false;
            if (ok) browserViews[id].webContents.goForward();
            result = { ok }; break;
          }

          case '/reload': {
            const id = params.viewId || currentViewId;
            if (browserViews[id]) browserViews[id].webContents.reload();
            result = { ok: !!browserViews[id] }; break;
          }

          default:
            res.writeHead(404);
            res.end(JSON.stringify({ error: `Unknown endpoint: ${urlPath}` }));
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });

  server.listen(0, '127.0.0.1', () => {
    controlPort = server.address().port;
    console.log(`[BrowAI] Control API on http://127.0.0.1:${controlPort}`);
    // Write connection info to temp file so MCP server can find us
    const info = { port: controlPort, token: controlToken, pid: process.pid };
    const infoPath = path.join(os.tmpdir(), 'browai-control.json');
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
    console.log(`[BrowAI] Connection info → ${infoPath}`);
  });

  server.on('error', e => console.error('[BrowAI] Control server error:', e.message));
}
