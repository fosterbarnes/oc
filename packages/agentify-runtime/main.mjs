#!/usr/bin/env node
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { ChatGPTController } from './chatgpt-controller.mjs';
import { createBrowserBackend, resolveChromeExecutablePath, resolveChromeDebugPort } from './browser-backend.mjs';
import { startHttpApi } from './http-api.mjs';
import { TabManager } from './tab-manager.mjs';
import { defaultStateDir, ensureToken, writeState } from './state.mjs';
import { cleanupRuntimeResources, registerShutdownSignals, createGracefulShutdown } from './shutdown.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function freePort() {
  const requested = Number(process.env.AGENTIFY_RUNTIME_PORT || argValue('--port') || 0);
  if (requested > 0) return requested;
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on('error', reject);
  });
}

async function loadSelectors() {
  return JSON.parse(await fs.readFile(path.join(__dirname, 'selectors.json'), 'utf8'));
}

async function loadVendors() {
  const parsed = JSON.parse(await fs.readFile(path.join(__dirname, 'vendors.json'), 'utf8'));
  return (parsed.vendors || []).filter((v) => v.status === 'supported');
}

const stateDir = String(argValue('--state-dir') || process.env.AGENTIFY_RUNTIME_STATE_DIR || defaultStateDir());
const host = '127.0.0.1';
const selectors = await loadSelectors();
const vendors = await loadVendors();
const token = process.env.AGENTIFY_RUNTIME_TOKEN || await ensureToken(stateDir);
const port = await freePort();
const chromeDebugPort = resolveChromeDebugPort() || (port + 1);
const executablePath = resolveChromeExecutablePath({ env: process.env })
  || (await fs.access(EDGE).then(() => EDGE).catch(() => null));

const browserBackend = await createBrowserBackend({
  kind: 'chrome-cdp',
  stateDir,
  chromeExecutablePath: executablePath,
  chromeDebugPort,
  chromeProfileName: 'Default'
});
await browserBackend.start();

const tabs = new TabManager({
  browserBackend,
  maxTabs: 8,
  createController: ({ page, vendorId, vendorName }) => new ChatGPTController({
    page,
    selectors,
    vendorId,
    vendorName,
    stateDir,
    onBlocked: async () => {
      try {
        await page.bringToFront?.();
      } catch {}
    }
  }),
  onNeedsAttention: async ({ tabId }) => {
    try {
      await tabs.getWindowById(tabId).show();
    } catch {}
  }
});

const serverId = randomUUID();
const defaultTabId = null;
let server;

async function quit() {
  await cleanupRuntimeResources({
    closeServer: (done) => server?.close(done),
    disposeBrowserBackend: () => browserBackend.dispose?.() || browserBackend.close?.()
  });
  process.exit(0);
}

server = await startHttpApi({
  host,
  port,
  token,
  tabs,
  defaultTabId,
  vendors,
  serverId,
  onShow: async ({ tabId }) => {
    await tabs.getWindowById(tabId).show();
  },
  onShutdown: quit,
  getStatus: async ({ tabId }) => {
    if (!tabId) return { ok: true };
    const controller = tabs.getControllerById(tabId);
    return controller.getStatus?.() || { ok: true, tabId };
  }
});

await writeState({ port, pid: process.pid, serverId, host }, stateDir);
const shutdown = createGracefulShutdown({
  closeServer: (done) => server.close(done),
  disposeBrowserBackend: () => browserBackend.dispose?.(),
  quitApp: () => process.exit(0)
});
registerShutdownSignals({ requestQuit: () => shutdown.requestQuit() });

process.stdout.write(JSON.stringify({ ok: true, port, host, pid: process.pid }) + '\n');
