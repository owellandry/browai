#!/usr/bin/env node
/**
 * BrowAI MCP Server
 * ─────────────────
 * Exposes the BrowAI Electron browser as MCP tools via stdio JSON-RPC 2.0.
 * Reads connection info from %TEMP%/browai-control.json (written by Electron at startup).
 *
 * Usage:
 *   1. Start the BrowAI Electron app (npm run electron:dev or production build)
 *   2. Run: node mcp-server/index.mjs
 *
 * No external dependencies required.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── Load Electron control server connection info ─────────────────────────────
const INFO_PATH = path.join(os.tmpdir(), 'browai-control.json');

function loadControlInfo() {
  try {
    const raw = fs.readFileSync(INFO_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

let controlInfo = loadControlInfo();

async function api(endpoint, body = null) {
  if (!controlInfo) {
    controlInfo = loadControlInfo();
    if (!controlInfo) throw new Error('BrowAI is not running. Start the Electron app first.');
  }
  const url = `http://127.0.0.1:${controlInfo.port}${endpoint}`;
  const opts = {
    method: body !== null ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${controlInfo.token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Control API ${endpoint} returned ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'navigate',
    description: 'Navigate the browser to a URL. Creates a new tab if viewId is not specified.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to navigate to (must include https://)' },
        viewId: { type: 'number', description: 'Tab/view ID (optional, uses active tab if omitted)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_page_info',
    description: 'Get the current URL, title, and viewId of the active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number', description: 'Tab/view ID (optional)' },
      },
    },
  },
  {
    name: 'list_tabs',
    description: 'List all open browser tabs with their URLs and titles.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'new_tab',
    description: 'Open a new browser tab, optionally navigating to a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open (optional)' },
      },
    },
  },
  {
    name: 'switch_tab',
    description: 'Switch the browser to a different tab.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number', description: 'Tab/view ID to switch to' },
      },
      required: ['viewId'],
    },
  },
  {
    name: 'close_tab',
    description: 'Close a browser tab.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number', description: 'Tab/view ID to close' },
      },
      required: ['viewId'],
    },
  },
  {
    name: 'wait_for_navigation',
    description: 'Wait until the current page finishes loading.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number' },
        timeout: { type: 'number', description: 'Max wait in ms (default: 15000)' },
      },
    },
  },
  {
    name: 'execute_js',
    description: 'Execute JavaScript in the browser page context and return the result. Cannot read HttpOnly cookies.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'JavaScript code to execute' },
        viewId: { type: 'number', description: 'Tab/view ID (optional)' },
      },
      required: ['script'],
    },
  },
  {
    name: 'get_page_source',
    description: 'Get the full HTML source of the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number' },
      },
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current browser view.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number' },
      },
    },
  },
  {
    name: 'get_cookies',
    description: 'Get all browser cookies, optionally filtered by URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Filter cookies for this URL (optional)' },
      },
    },
  },
  {
    name: 'set_cookie',
    description: 'Set a cookie in the browser session. Useful for injecting session tokens for testing.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL the cookie is associated with (e.g. https://stripchat.com)' },
        name: { type: 'string' },
        value: { type: 'string' },
        domain: { type: 'string', description: 'Cookie domain (optional)' },
        path: { type: 'string', description: 'Cookie path (default: /)' },
        secure: { type: 'boolean' },
        httpOnly: { type: 'boolean' },
        expirationDate: { type: 'number', description: 'Unix timestamp for expiration (optional)' },
      },
      required: ['url', 'name', 'value'],
    },
  },
  {
    name: 'clear_cookies',
    description: 'Clear all browser cookies from the session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_headers',
    description: 'Set extra HTTP request headers to be injected on all subsequent requests. Useful for adding custom auth headers or testing header injection.',
    inputSchema: {
      type: 'object',
      properties: {
        headers: {
          type: 'object',
          description: 'Key-value pairs of headers to inject (e.g. {"X-Custom-Header": "value"})',
        },
      },
      required: ['headers'],
    },
  },
  {
    name: 'clear_headers',
    description: 'Remove all extra injected request headers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_network_log',
    description: 'Get the captured HTTP network request log (URL, method, status, headers). Use to inspect API calls made by the page.',
    inputSchema: {
      type: 'object',
      properties: {
        filter_url: { type: 'string', description: 'Filter entries by URL substring (optional)' },
        limit: { type: 'number', description: 'Max entries to return (default: 50)' },
      },
    },
  },
  {
    name: 'clear_network_log',
    description: 'Clear the network request log.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_ws_log',
    description: 'Get captured WebSocket frame log (sent/received frames). Essential for analyzing Centrifugo/WebSocket protocols.',
    inputSchema: {
      type: 'object',
      properties: {
        filter_url: { type: 'string', description: 'Filter by WebSocket URL substring (optional)' },
        type: { type: 'string', enum: ['sent', 'received', 'created'], description: 'Filter by frame type (optional)' },
        limit: { type: 'number', description: 'Max frames to return (default: 50)' },
      },
    },
  },
  {
    name: 'clear_ws_log',
    description: 'Clear the WebSocket frame log.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_response_body',
    description: 'Retrieve the response body for a specific network request by its requestId (from get_network_log).',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'requestId from network log entry' },
        viewId: { type: 'number' },
      },
      required: ['requestId'],
    },
  },
  {
    name: 'devtools_command',
    description: 'Send a raw Chrome DevTools Protocol (CDP) command. Advanced use for custom inspection.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'CDP method, e.g. "Network.getCookies"' },
        params: { type: 'object', description: 'CDP params object (optional)' },
        viewId: { type: 'number' },
      },
      required: ['method'],
    },
  },
  {
    name: 'navigate_back',
    description: 'Navigate the browser back.',
    inputSchema: { type: 'object', properties: { viewId: { type: 'number' } } },
  },
  {
    name: 'navigate_forward',
    description: 'Navigate the browser forward.',
    inputSchema: { type: 'object', properties: { viewId: { type: 'number' } } },
  },
  {
    name: 'reload',
    description: 'Reload the current page.',
    inputSchema: { type: 'object', properties: { viewId: { type: 'number' } } },
  },
  // ─── Security testing shortcuts ───────────────────────────────────────────
  {
    name: 'extract_csrf_token',
    description: 'Extract CSRF token and related config from the current Stripchat/sc-apps.com page by calling /api/front/v3/config/initial-dynamic via fetch in the page context.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number' },
      },
    },
  },
  {
    name: 'extract_session_data',
    description: 'Extract all session-related data from the current page: cookies, localStorage, sessionStorage, and key window variables.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: { type: 'number' },
      },
    },
  },
  {
    name: 'fetch_in_browser',
    description: 'Make an HTTP fetch request from inside the browser page (uses the page\'s cookies, CSRF tokens, and origin). Returns response status + body. Ideal for testing API endpoints with real auth.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], description: 'HTTP method (default: GET)' },
        headers: { type: 'object', description: 'Additional headers (optional)' },
        body: { type: 'string', description: 'Request body as JSON string (optional)' },
        viewId: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'dump_storage',
    description: 'Dump all client-side storage: localStorage, sessionStorage, window.__NEXT_DATA__, initialDynamic, meta tags, and all loaded script URLs. Essential for finding hidden API configs, tokens, and app state.',
    inputSchema: {
      type: 'object',
      properties: { viewId: { type: 'number' } },
    },
  },
  {
    name: 'get_api_responses',
    description: 'Get automatically captured API response bodies. BrowAI captures responses for all /api/ calls automatically — use this to see what data is returned by any API endpoint visited during browsing. Filter by URL substring.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'URL substring filter (optional)' },
        method: { type: 'string', description: 'Filter by HTTP method (GET, POST, etc.) (optional)' },
        limit: { type: 'number', description: 'Max entries to return (default: 100)' },
      },
    },
  },
  {
    name: 'clear_api_responses',
    description: 'Clear the API response body cache.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'scan_js_endpoints',
    description: 'Scan all JavaScript files loaded by the current page and extract API endpoint patterns using regex. Finds hidden/undocumented API routes.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of JS files to scan (default: 8)' },
        viewId: { type: 'number' },
      },
    },
  },
  {
    name: 'fuzz_idor',
    description: 'Fuzz a URL template with multiple user IDs to find IDOR vulnerabilities. Use {ID} as the placeholder in the URL. Returns status codes for each tested ID — 200s from other users = IDOR confirmed.',
    inputSchema: {
      type: 'object',
      properties: {
        urlTemplate: { type: 'string', description: 'URL with {ID} placeholder, e.g. /api/front/v2/users/{ID}/profile' },
        ids: { type: 'array', items: { type: 'string' }, description: 'List of user IDs to test' },
        method: { type: 'string', description: 'HTTP method (default: GET)' },
        body: { type: 'string', description: 'Request body JSON string (for POST/PUT)' },
        viewId: { type: 'number' },
      },
      required: ['urlTemplate', 'ids'],
    },
  },
  {
    name: 'ws_scan_channels',
    description: 'Connect to a Centrifugo WebSocket endpoint and test a batch of channel names for authorization. Reports GRANTED/DENIED for each channel and captures live events. The fastest way to map Centrifugo IDOR attack surface.',
    inputSchema: {
      type: 'object',
      properties: {
        wsUrl: { type: 'string', description: 'WebSocket URL, e.g. wss://websocket-sp-v6.stripchat.com' },
        token: { type: 'string', description: 'Centrifugo JWT token' },
        channels: { type: 'array', items: { type: 'string' }, description: 'Channel names to test' },
        waitMs: { type: 'number', description: 'Time to listen for events after subscribing (default: 10000ms)' },
        viewId: { type: 'number' },
      },
      required: ['wsUrl', 'token', 'channels'],
    },
  },
];

// ─── Tool implementations ─────────────────────────────────────────────────────
async function callTool(name, args) {
  switch (name) {
    case 'navigate': {
      const r = await api('/navigate', { url: args.url, viewId: args.viewId });
      return `Navigated to ${args.url} (viewId: ${r.viewId})`;
    }

    case 'get_page_info': {
      const r = await api('/info', { viewId: args.viewId });
      return JSON.stringify(r, null, 2);
    }

    case 'list_tabs': {
      const r = await api('/tabs', {});
      if (!r.tabs.length) return 'No open tabs.';
      return r.tabs.map(t => `[${t.active ? 'ACTIVE' : '      '}] viewId:${t.viewId}  ${t.url}  "${t.title}"`).join('\n');
    }

    case 'new_tab': {
      const r = await api('/new-tab', { url: args.url });
      return `New tab opened (viewId: ${r.viewId})${args.url ? ` → ${args.url}` : ''}`;
    }

    case 'switch_tab': {
      await api('/switch-tab', { viewId: args.viewId });
      return `Switched to tab ${args.viewId}`;
    }

    case 'close_tab': {
      await api('/close-tab', { viewId: args.viewId });
      return `Closed tab ${args.viewId}`;
    }

    case 'wait_for_navigation': {
      const r = await api('/wait-navigation', { viewId: args.viewId, timeout: args.timeout });
      return r.loaded ? 'Page finished loading.' : 'Timed out waiting for navigation.';
    }

    case 'execute_js': {
      const r = await api('/execute', { script: args.script, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      return typeof r.result === 'object' ? JSON.stringify(r.result, null, 2) : String(r.result ?? '(null)');
    }

    case 'get_page_source': {
      const r = await api('/source', { viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      // Truncate if massive
      const src = r.source || '';
      return src.length > 50000 ? src.slice(0, 50000) + '\n... (truncated)' : src;
    }

    case 'screenshot': {
      const r = await api('/screenshot', { viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      // Return as base64 image content
      return { type: 'image', data: r.png, mimeType: 'image/png' };
    }

    case 'get_cookies': {
      const r = await api('/cookies', { url: args.url });
      if (!r.cookies.length) return 'No cookies found.';
      return r.cookies.map(c =>
        `${c.name}=${c.value.slice(0, 40)}${c.value.length > 40 ? '...' : ''}  domain:${c.domain}  httpOnly:${c.httpOnly}  secure:${c.secure}`
      ).join('\n');
    }

    case 'set_cookie': {
      await api('/set-cookie', args);
      return `Cookie "${args.name}" set on ${args.url}`;
    }

    case 'clear_cookies': {
      await api('/clear-cookies', {});
      return 'All cookies cleared.';
    }

    case 'set_headers': {
      const r = await api('/set-headers', { headers: args.headers });
      return `Headers set. Active: ${JSON.stringify(r.active)}`;
    }

    case 'clear_headers': {
      await api('/clear-headers', {});
      return 'Extra headers cleared.';
    }

    case 'get_network_log': {
      const r = await api('/network-log', {});
      let entries = r.entries || [];
      if (args.filter_url) entries = entries.filter(e => e.url.includes(args.filter_url));
      const limit = args.limit || 50;
      entries = entries.slice(-limit);
      if (!entries.length) return 'No network entries found.';
      return entries.map(e => {
        let line = `[${e.status || '---'}] ${e.method || '?'} ${e.url}\n  type:${e.type}  reqId:${e.requestId}  t:${new Date(e.timestamp).toISOString()}`;
        if (e.postData) line += `\n  postData: ${e.postData.slice(0, 300)}`;
        return line;
      }).join('\n');
    }

    case 'clear_network_log': {
      await api('/clear-network-log', {});
      return 'Network log cleared.';
    }

    case 'get_ws_log': {
      const r = await api('/ws-log', {});
      let frames = r.frames || [];
      if (args.filter_url) frames = frames.filter(f => (f.url || '').includes(args.filter_url));
      if (args.type) frames = frames.filter(f => f.type === args.type);
      const limit = args.limit || 50;
      frames = frames.slice(-limit);
      if (!frames.length) return 'No WebSocket frames found.';
      return frames.map(f => {
        const ts = new Date(f.timestamp).toISOString();
        if (f.type === 'created') return `[WS CREATED] ${ts}  ${f.url}  reqId:${f.requestId}`;
        return `[WS ${f.type.toUpperCase()}] ${ts}  reqId:${f.requestId}  payload:${(f.payload || '').slice(0, 200)}`;
      }).join('\n');
    }

    case 'clear_ws_log': {
      await api('/clear-ws-log', {});
      return 'WS frame log cleared.';
    }

    case 'get_response_body': {
      const r = await api('/response-body', { requestId: args.requestId, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      const body = r.body || '';
      return r.base64Encoded ? `[base64 encoded, length: ${body.length}]` : body.slice(0, 10000);
    }

    case 'devtools_command': {
      const r = await api('/devtools', { method: args.method, params: args.params, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      return JSON.stringify(r.result, null, 2);
    }

    case 'navigate_back': {
      const r = await api('/back', { viewId: args.viewId });
      return r.ok ? 'Navigated back.' : 'Cannot go back.';
    }

    case 'navigate_forward': {
      const r = await api('/forward', { viewId: args.viewId });
      return r.ok ? 'Navigated forward.' : 'Cannot go forward.';
    }

    case 'reload': {
      const r = await api('/reload', { viewId: args.viewId });
      return r.ok ? 'Page reloaded.' : 'No active view to reload.';
    }

    // ─── Security shortcuts ──────────────────────────────────────────────────
    case 'extract_csrf_token': {
      const script = `(async () => {
        try {
          const r = await fetch('/api/front/v3/config/initial-dynamic', {
            credentials: 'include',
            headers: { 'front-version': '11.6.46' }
          });
          const d = await r.json();
          const keys = ['csrfToken', 'csrfTimestamp', 'jwtToken', 'websocket', 'websocketApps',
            'cometAuth', 'sessionHash', 'userHash', 'user', 'flags'];
          return Object.fromEntries(keys.filter(k => d[k] !== undefined).map(k => [k, d[k]]));
        } catch(e) { return { error: e.message }; }
      })()`;
      const r = await api('/execute', { script, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      return JSON.stringify(r.result, null, 2);
    }

    case 'extract_session_data': {
      const script = `(() => {
        const cookies = document.cookie;
        let ls = {};
        let ss = {};
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); } } catch(e) {}
        try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss[k] = sessionStorage.getItem(k); } } catch(e) {}
        const winKeys = ['initialDynamic', '__NEXT_DATA__', '__SC_DATA__', 'REDUX_STATE', 'APP_STATE'].filter(k => window[k] !== undefined);
        return { cookies, localStorage: ls, sessionStorage: ss, windowVars: Object.fromEntries(winKeys.map(k => [k, window[k]])) };
      })()`;
      const r = await api('/execute', { script, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      return JSON.stringify(r.result, null, 2);
    }

    case 'fetch_in_browser': {
      const { url: fetchUrl, method = 'GET', headers = {}, body: reqBody } = args;
      const script = `(async () => {
        try {
          const opts = {
            method: ${JSON.stringify(method)},
            credentials: 'include',
            headers: { 'front-version': '11.6.46', ...${JSON.stringify(headers)} },
          };
          ${reqBody ? `opts.body = ${JSON.stringify(reqBody)};` : ''}
          const r = await fetch(${JSON.stringify(fetchUrl)}, opts);
          const text = await r.text();
          let json;
          try { json = JSON.parse(text); } catch {}
          return { status: r.status, ok: r.ok, headers: Object.fromEntries(r.headers.entries()), body: json || text.slice(0, 5000) };
        } catch(e) { return { error: e.message }; }
      })()`;
      const r = await api('/execute', { script, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      return JSON.stringify(r.result, null, 2);
    }

    case 'dump_storage': {
      const r = await api('/dump-storage', { viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      return JSON.stringify(r, null, 2);
    }

    case 'get_api_responses': {
      const r = await api('/api-responses', { filter: args.filter, method: args.method, limit: args.limit });
      if (!r.entries || !r.entries.length) return 'No API responses captured yet. Navigate to pages to fill the cache.';
      return `${r.count} entries captured. Showing ${r.entries.length}:\n\n` +
        r.entries.map(e =>
          `[${e.status || '?'}] ${e.method} ${e.url}\n${JSON.stringify(e.body || '').slice(0, 1000)}`
        ).join('\n\n---\n\n');
    }

    case 'clear_api_responses': {
      await api('/clear-api-responses', {});
      return 'API response cache cleared.';
    }

    case 'scan_js_endpoints': {
      const r = await api('/scan-js-endpoints', { limit: args.limit, viewId: args.viewId });
      if (r.error) return `Error: ${r.error}`;
      if (!r.endpoints || !r.endpoints.length) return `Scanned ${r.scriptsScanned}/${r.totalScripts} JS files — no API endpoints found.`;
      return `Found ${r.endpoints.length} endpoints in ${r.scriptsScanned}/${r.totalScripts} JS files:\n\n` +
        r.endpoints.join('\n');
    }

    case 'fuzz_idor': {
      const r = await api('/fuzz-idor', {
        urlTemplate: args.urlTemplate,
        ids: args.ids,
        method: args.method,
        body: args.body,
        viewId: args.viewId,
      });
      if (r.error) return `Error: ${r.error}`;
      const results = r.results || [];
      const grouped = { 200: [], 403: [], 404: [], other: [] };
      results.forEach(e => {
        const k = e.status === 200 ? 200 : e.status === 403 ? 403 : e.status === 404 ? 404 : 'other';
        grouped[k].push(e);
      });
      let out = `IDOR Fuzz Results for: ${args.urlTemplate}\n\n`;
      if (grouped[200].length) out += `✅ 200 OK (POTENTIAL IDOR — ${grouped[200].length}):\n` + grouped[200].map(e => `  ${e.id}: ${e.url}\n  ${JSON.stringify(e.body || '').slice(0, 300)}`).join('\n') + '\n\n';
      if (grouped[403].length) out += `🔒 403 FORBIDDEN (${grouped[403].length}): ${grouped[403].map(e => e.id).join(', ')}\n\n`;
      if (grouped[404].length) out += `❌ 404 NOT FOUND (${grouped[404].length}): ${grouped[404].map(e => e.id).join(', ')}\n\n`;
      if (grouped.other.length) out += `⚠️ OTHER (${grouped.other.length}):\n` + grouped.other.map(e => `  ${e.id}: status=${e.status} ${e.error || ''}`).join('\n');
      return out;
    }

    case 'ws_scan_channels': {
      const r = await api('/ws-scan-channels', {
        wsUrl: args.wsUrl,
        token: args.token,
        channels: args.channels,
        waitMs: args.waitMs,
        viewId: args.viewId,
      });
      if (r.error) return `Error: ${r.error}`;
      const subs = r.subs || {};
      const events = r.events || [];
      const granted = Object.entries(subs).filter(([, v]) => v === 'GRANTED').map(([k]) => k);
      const denied = Object.entries(subs).filter(([, v]) => v !== 'GRANTED').map(([k, v]) => `${k}: ${v}`);
      let out = `WebSocket Channel Scan Results\n${'─'.repeat(50)}\n\n`;
      out += `✅ GRANTED (${granted.length}):\n${granted.map(c => `  ${c}`).join('\n') || '  none'}\n\n`;
      out += `🔒 DENIED (${denied.length}):\n${denied.map(c => `  ${c}`).join('\n') || '  none'}\n\n`;
      if (events.length) {
        out += `📡 Live Events Captured (${events.length}):\n`;
        out += events.map(e => `  [${e.ts}] ${e.channel}: ${JSON.stringify(e.data || '').slice(0, 500)}`).join('\n');
      } else {
        out += `📡 No live events captured during wait window.`;
      }
      return out;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC 2.0 over stdio ─────────────────────────────────────────────
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

let inputBuffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  inputBuffer += chunk;
  const lines = inputBuffer.split('\n');
  inputBuffer = lines.pop(); // keep incomplete line

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const { id, method, params } = msg;

    // Notifications (no id, no response needed)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') { /* no-op */ }
      continue;
    }

    try {
      switch (method) {
        case 'initialize':
          sendResult(id, {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'browai-mcp', version: '1.0.0' },
          });
          // Send initialized notification
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          break;

        case 'tools/list':
          sendResult(id, { tools: TOOLS });
          break;

        case 'tools/call': {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          try {
            const output = await callTool(toolName, toolArgs);
            if (output && typeof output === 'object' && output.type === 'image') {
              sendResult(id, {
                content: [{ type: 'image', data: output.data, mimeType: output.mimeType }],
                isError: false,
              });
            } else {
              sendResult(id, {
                content: [{ type: 'text', text: String(output) }],
                isError: false,
              });
            }
          } catch (e) {
            sendResult(id, {
              content: [{ type: 'text', text: `Error: ${e.message}` }],
              isError: true,
            });
          }
          break;
        }

        default:
          sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      sendError(id, -32603, e.message);
    }
  }
});

process.stdin.on('end', () => process.exit(0));

process.stderr.write('[BrowAI MCP] Server started — waiting for BrowAI Electron app...\n');
process.stderr.write(`[BrowAI MCP] Control info path: ${INFO_PATH}\n`);

// Try to verify connection at startup
api('/health', {}).then(r => {
  process.stderr.write(`[BrowAI MCP] Connected to BrowAI (port ${controlInfo.port}, ${r.views} view(s) open)\n`);
}).catch(e => {
  process.stderr.write(`[BrowAI MCP] Warning: BrowAI not yet reachable (${e.message}) — tools will retry on use\n`);
});
