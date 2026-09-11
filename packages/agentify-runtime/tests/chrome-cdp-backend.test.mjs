import assert from 'node:assert/strict';
import test from 'node:test';
import { ChromeCdpBrowserBackend, isLaunchPlaceholderUrl, resolveLaunchPageTargetId } from '../chrome-cdp-backend.mjs';

test('isLaunchPlaceholderUrl recognizes browser launch placeholders', () => {
  assert.equal(isLaunchPlaceholderUrl('about:blank'), true);
  assert.equal(isLaunchPlaceholderUrl('chrome://newtab/'), true);
  assert.equal(isLaunchPlaceholderUrl('edge://newtab/'), true);
  assert.equal(isLaunchPlaceholderUrl('https://chatgpt.com/'), false);
});

test('resolveLaunchPageTargetId prefers the launch placeholder page', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/json/list')) {
      return {
        ok: true,
        async json() {
          return [
            { id: 'page-chatgpt', type: 'page', url: 'https://chatgpt.com/' },
            { id: 'page-blank', type: 'page', url: 'about:blank' }
          ];
        }
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  try {
    assert.equal(await resolveLaunchPageTargetId(9222), 'page-blank');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createMockClient() {
  const calls = [];
  const client = {
    connected: true,
    ws: {},
    send(method, params = {}) {
      calls.push({ method, params });
      if (method === 'Target.attachToTarget') {
        return Promise.resolve({ sessionId: 'session-1' });
      }
      if (method === 'Browser.getWindowForTarget') {
        return Promise.resolve({ windowId: 1 });
      }
      if (method === 'Page.enable' || method === 'Runtime.enable' || method === 'DOM.enable') {
        return Promise.resolve({});
      }
      if (method === 'Page.addScriptToEvaluateOnNewDocument') {
        return Promise.resolve({});
      }
      if (method === 'Page.navigate') {
        return Promise.resolve({});
      }
      if (method === 'Browser.setWindowBounds') {
        return Promise.resolve({});
      }
      if (method === 'Page.bringToFront') {
        return Promise.resolve({});
      }
      if (method === 'Target.createTarget') {
        return Promise.resolve({ targetId: `created-${calls.filter((c) => c.method === 'Target.createTarget').length}` });
      }
      return Promise.resolve({});
    }
  };
  return { client, calls };
}

test('createSession claims the launch target once and opens later sessions in new windows', async () => {
  const backend = new ChromeCdpBrowserBackend({ stateDir: '/tmp/agentify-test', debugPort: 9222 });
  const { client, calls } = createMockClient();
  backend.started = true;
  backend.client = client;
  backend.pendingInitialTargetId = 'launch-target';

  await backend.createSession({
    url: 'https://chatgpt.com/',
    preferInitialBrowserTarget: true,
    show: true
  });
  assert.equal(
    calls.some((entry) => entry.method === 'Target.createTarget'),
    false,
    'first session must not create a new target'
  );
  assert.ok(
    calls.some((entry) => entry.method === 'Target.attachToTarget' && entry.params.targetId === 'launch-target')
  );
  assert.ok(
    calls.some((entry) => entry.method === 'Page.navigate' && entry.params.url === 'https://chatgpt.com/')
  );

  await backend.createSession({
    url: 'https://chatgpt.com/',
    preferInitialBrowserTarget: false,
    newWindow: true
  });
  const createCalls = calls.filter((entry) => entry.method === 'Target.createTarget');
  assert.equal(createCalls.length, 1);
  assert.deepEqual(createCalls[0].params, { url: 'https://chatgpt.com/', newWindow: true });
});

test('createSession does not retry Target.createTarget after a failure', async () => {
  const backend = new ChromeCdpBrowserBackend({ stateDir: '/tmp/agentify-test', debugPort: 9222 });
  let attempts = 0;
  backend.started = true;
  backend.client = {
    connected: true,
    ws: {},
    send(method) {
      if (method === 'Target.createTarget') {
        attempts += 1;
        return Promise.reject(new Error('cdp_timeout'));
      }
      return Promise.resolve({});
    }
  };

  await assert.rejects(
    () =>
      backend.createSession({
        url: 'https://chatgpt.com/',
        preferInitialBrowserTarget: false,
        newWindow: true
      }),
    /cdp_timeout/
  );
  assert.equal(attempts, 1);
});

test('createSession navigates a replacement initial-window target', async () => {
  const backend = new ChromeCdpBrowserBackend({ stateDir: '/tmp/agentify-test', debugPort: 9222 });
  const { client, calls } = createMockClient();
  backend.started = true;
  backend.client = client;

  await backend.createSession({ url: 'https://chatgpt.com/', preferInitialBrowserTarget: true });

  assert.ok(calls.some((entry) => entry.method === 'Target.createTarget' && entry.params.newWindow === false));
  assert.ok(calls.some((entry) => entry.method === 'Page.navigate' && entry.params.url === 'https://chatgpt.com/'));
});
