import assert from 'node:assert/strict';
import test from 'node:test';
import { startHttpApi, openAiPrompt, resolveOpenAiModel } from '../http-api.mjs';

test('rejects tools and unknown models', () => {
  assert.equal(resolveOpenAiModel('chatgpt-web').vendorId, 'chatgpt');
  assert.equal(resolveOpenAiModel('claude-web').vendorId, 'claude');
  assert.equal(openAiPrompt([{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }]), 'b');
  assert.equal(
    openAiPrompt([
      { role: 'system', content: 'You are OpenCode.' },
      { role: 'user', content: 'hello' }
    ]),
    'You are OpenCode.\n\nhello'
  );
});

test('http api lists web models and splits auth vs response clocks', async () => {
  const clocks = [];
  const ensured = [];
  const created = [];
  const tabs = {
    listTabs: () => [{ id: 'tab-1', key: 'opencode:chatgpt:ses', vendorId: 'chatgpt' }],
    ensureTab: async (input) => {
      ensured.push(input);
      return 'tab-1';
    },
    createTab: async (input) => {
      created.push(input);
      return 'tab-claude';
    },
    getControllerById: () => ({
      runExclusive: async (fn) => fn(),
      ensureReady: async ({ timeoutMs }) => {
        clocks.push(['ready', timeoutMs]);
        return { promptVisible: true };
      },
      query: async ({ readyTimeoutMs, responseTimeoutMs }) => {
        clocks.push(['query', readyTimeoutMs, responseTimeoutMs]);
        return { text: 'hello' };
      }
    })
  };
  const server = await startHttpApi({
    host: '127.0.0.1',
    port: 0,
    token: 'secret',
    tabs,
    defaultTabId: 'tab-1',
    vendors: [
      { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
      { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' }
    ],
    onShow: async () => {}
  });
  const port = server.address().port;
  const headers = { authorization: 'Bearer secret', 'content-type': 'application/json' };
  const models = await fetch(`http://127.0.0.1:${port}/v1/models`, { headers }).then((r) => r.json());
  assert.deepEqual(models.data.map((m) => m.id), ['chatgpt-web', 'claude-web']);
  const tools = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...headers, 'x-session-affinity': 'ses_1' },
    body: JSON.stringify({
      model: 'chatgpt-web',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'x' } }]
    })
  });
  assert.equal(tools.status, 400);
  const ok = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...headers, 'x-session-affinity': 'ses_1' },
    body: JSON.stringify({
      model: 'chatgpt-web',
      messages: [{ role: 'user', content: 'hi' }],
      authTimeoutMs: 1111,
      timeoutMs: 2222
    })
  });
  const body = await ok.json();
  assert.equal(body.choices[0].message.content, 'hello');
  assert.ok(clocks.some((row) => row[0] === 'query' && row[1] === 1111 && row[2] === 2222));

  const claude = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { ...headers, 'x-session-affinity': 'claude_1' },
    body: JSON.stringify({
      model: 'claude-web',
      messages: [{ role: 'user', content: 'hi' }]
    })
  });
  assert.equal(claude.status, 200);
  assert.deepEqual(ensured.find((item) => item.vendorId === 'claude'), {
    key: 'opencode:claude:claude_1',
    name: 'Claude',
    show: true,
    url: 'https://claude.ai/new',
    vendorId: 'claude',
    vendorName: 'Claude'
  });

  const direct = await fetch(`http://127.0.0.1:${port}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-web',
      key: 'opencode:claude:direct_1',
      prompt: 'hi'
    })
  });
  assert.equal(direct.status, 200);

  const bare = await fetch(`http://127.0.0.1:${port}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: 'claude-web', prompt: 'hi' })
  });
  assert.equal(bare.status, 200);
  assert.deepEqual(created[0], {
    name: 'Claude',
    show: true,
    url: 'https://claude.ai/new',
    vendorId: 'claude',
    vendorName: 'Claude'
  });

  const mismatch = await fetch(`http://127.0.0.1:${port}/ensure-ready`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tabId: 'tab-1', vendorId: 'claude' })
  });
  assert.equal(mismatch.status, 409);
  server.close();
});
