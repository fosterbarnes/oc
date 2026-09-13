import http from 'node:http';
import crypto from 'node:crypto';

function isLoopback(remoteAddress) {
  const a = String(remoteAddress || '');
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json',
    'cache-control': 'no-store, max-age=0',
    'access-control-allow-origin': 'http://127.0.0.1',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  });
  res.end(data);
}

async function parseBody(req, { maxBytes = 2_000_000 } = {}) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > maxBytes) throw new Error('body_too_large');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid_json');
  }
}

function authOk(req, token) {
  const hdr = String(req.headers.authorization || '');
  if (!hdr.startsWith('Bearer ')) return false;
  return hdr.slice('Bearer '.length).trim() === token;
}

function mapErrorToHttp(error) {
  const msg = String(error?.message || '');
  const mapped = {
    body_too_large: 413,
    invalid_json: 400,
    invalid_vendor: 400,
    missing_prompt: 400,
    prompt_too_large: 400,
    invalid_model: 400,
    invalid_messages: 400,
    unsupported_tools: 400,
    unsupported_content: 400,
    invalid_stream: 400,
    missing_session_affinity: 400,
    invalid_session_affinity: 400,
    missing_key: 400,
    missing_prompt_textarea: 409,
    type_failed: 409,
    already_generating: 409,
    send_confirmation_ambiguous: 409,
    send_not_triggered: 409,
    tab_busy: 409,
    key_vendor_mismatch: 409,
    tab_not_found: 404,
    tab_closed: 409,
    max_tabs_reached: 409,
    query_aborted: 409,
    timeout_waiting_for_prompt: 408,
    timeout_waiting_for_response: 408
  };
  if (mapped[msg]) return { code: mapped[msg], body: { error: msg, data: error?.data || null } };
  return null;
}

function positiveIntOr(value, fallback, max = Number.POSITIVE_INFINITY) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

async function runExclusive(controller, fn) {
  if (controller && typeof controller.runExclusive === 'function') return await controller.runExclusive(fn);
  return await fn();
}

function normalizeVendorToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function resolveVendor({ body, vendors = [] } = {}) {
  const raw = String(body?.vendorId || body?.model || '').trim();
  if (!raw) return null;
  const token = normalizeVendorToken(raw);
  const model = OPENAI_MODELS.find((item) => token === normalizeVendorToken(item.id));
  const found = vendors.find((item) => {
    return token && (token === normalizeVendorToken(item?.id) || token === normalizeVendorToken(item?.name) || model?.vendorId === item?.id);
  });
  if (!found) {
    const err = new Error('invalid_vendor');
    err.data = { vendor: raw };
    throw err;
  }
  return found;
}

function defaultVendor(vendors = []) {
  return vendors.find((item) => String(item?.id || '').trim() === 'chatgpt') || vendors[0] || null;
}

const OPENAI_MODELS = [
  { id: 'chatgpt-web', vendorId: 'chatgpt', name: 'ChatGPT Web' },
  { id: 'claude-web', vendorId: 'claude', name: 'Claude Web' }
];

export function resolveOpenAiModel(model) {
  const found = OPENAI_MODELS.find((item) => item.id === String(model || '').trim());
  if (found) return found;
  const err = new Error('invalid_model');
  err.data = { model: String(model || '').trim() };
  throw err;
}

function openAiMessageText(message) {
  if (!message || typeof message !== 'object') throw new Error('invalid_messages');
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) throw new Error('unsupported_content');
  const text = [];
  for (const part of message.content) {
    if (!part || typeof part !== 'object' || !['text', 'input_text'].includes(part.type)) {
      throw new Error('unsupported_content');
    }
    if (typeof part.text !== 'string') throw new Error('unsupported_content');
    text.push(part.text);
  }
  return text.join('');
}

export function openAiPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('invalid_messages');
  const system = [];
  for (const message of messages) {
    if (message?.role !== 'system') continue;
    const text = openAiMessageText(message);
    if (text.trim()) system.push(text.trim());
  }
  let user = '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    const prompt = openAiMessageText(message);
    if (prompt.trim()) {
      user = prompt;
      break;
    }
  }
  if (!user.trim()) throw new Error('missing_prompt');
  if (system.length === 0) return user;
  return `${system.join('\n\n')}\n\n${user}`;
}

export function openAiSessionKey(req, vendorId) {
  const affinity = String(req.headers['x-session-affinity'] || req.headers['x-session-id'] || '').trim();
  if (!affinity) throw new Error('missing_session_affinity');
  if (affinity.length > 200) throw new Error('invalid_session_affinity');
  return `opencode:${vendorId}:${affinity}`;
}

function openAiCompletion({ model, text }) {
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

function sendOpenAiStream(res, completion) {
  const choice = completion.choices[0];
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-store, max-age=0',
    connection: 'keep-alive'
  });
  res.write(`data: ${JSON.stringify({
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: completion.model,
    choices: [{ index: 0, delta: { role: 'assistant', content: choice.message.content }, finish_reason: null }]
  })}\n\n`);
  res.write(`data: ${JSON.stringify({
    id: completion.id,
    object: 'chat.completion.chunk',
    created: completion.created,
    model: completion.model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
  })}\n\n`);
  res.end('data: [DONE]\n\n');
}

function sendOpenAiStreamError(res, error) {
  const mapped = mapErrorToHttp(error);
  const body = mapped?.body || { error: 'internal_error', message: error?.message || String(error) };
  res.writeHead(mapped?.code || 500, { 'content-type': 'text/event-stream' });
  res.end(`data: ${JSON.stringify({ error: body })}\n\ndata: [DONE]\n\n`);
}

function listedTabMatchesVendor(tab, vendor) {
  if (!vendor) return true;
  const tabVendor = normalizeVendorToken(tab?.vendorId || '');
  const requestedVendor = normalizeVendorToken(vendor?.id || '');
  if (tabVendor && requestedVendor) return tabVendor === requestedVendor;
  const tabUrl = String(tab?.url || '').trim();
  const requestedUrl = String(vendor?.url || '').trim();
  return !!tabUrl && !!requestedUrl && (tabUrl.startsWith(requestedUrl) || requestedUrl.startsWith(tabUrl));
}

async function resolveTab({ tabs, defaultTabId, body, url, showTabsByDefault = true, createIfMissing = true, vendors = [] }) {
  const tabId = (body?.tabId ? String(body.tabId).trim() : '') || String(url.searchParams.get('tabId') || '').trim() || null;
  const key = (body?.key ? String(body.key).trim() : '') || null;
  const explicitVendor = resolveVendor({ body, vendors });
  const vendor = explicitVendor || defaultVendor(vendors);
  if (tabId) {
    const existing = (tabs.listTabs?.() || []).find((t) => t?.id === tabId);
    if (explicitVendor && existing && !listedTabMatchesVendor(existing, explicitVendor)) throw new Error('key_vendor_mismatch');
    return tabId;
  }
  if (key) {
    const existing = (tabs.listTabs?.() || []).find((t) => t?.key === key);
    if (existing?.id) {
      if (explicitVendor && !listedTabMatchesVendor(existing, explicitVendor)) throw new Error('key_vendor_mismatch');
      return existing.id;
    }
    if (!createIfMissing) throw new Error('tab_not_found');
    return await tabs.ensureTab({
      key,
      name: vendor?.name,
      show: showTabsByDefault,
      url: vendor?.url,
      vendorId: vendor?.id,
      vendorName: vendor?.name
    });
  }
  if (!explicitVendor) return defaultTabId;
  const existing = (tabs.listTabs?.() || []).find((t) => listedTabMatchesVendor(t, explicitVendor));
  if (existing?.id) return existing.id;
  if (!createIfMissing) throw new Error('tab_not_found');
  return await tabs.createTab({
    name: explicitVendor.name,
    show: showTabsByDefault,
    url: explicitVendor.url,
    vendorId: explicitVendor.id,
    vendorName: explicitVendor.name
  });
}

export function startHttpApi({
  host = '127.0.0.1',
  port,
  token,
  tabs,
  defaultTabId,
  vendors = [],
  serverId,
  onShow,
  onShutdown,
  getStatus
}) {
  const tokenRef = typeof token === 'string' ? { current: token } : token;
  const activeQueries = new Map();

  const server = http.createServer(async (req, res) => {
    try {
      if (!isLoopback(req.socket?.remoteAddress)) return sendJson(res, 403, { error: 'forbidden' });
      if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
      const url = new URL(req.url || '/', `http://${host}`);
      if (url.pathname === '/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, serverId: serverId || null });
      if (!authOk(req, tokenRef.current)) return sendJson(res, 401, { error: 'unauthorized' });

      if (url.pathname === '/v1/models' && req.method === 'GET') {
        return sendJson(res, 200, {
          object: 'list',
          data: OPENAI_MODELS.map((model) => ({ id: model.id, object: 'model', created: 0, owned_by: 'agentify' }))
        });
      }

      if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
        const body = await parseBody(req, { maxBytes: 5_000_000 });
        const model = resolveOpenAiModel(body.model);
        if (!Array.isArray(body.messages)) throw new Error('invalid_messages');
        if ((Array.isArray(body.tools) && body.tools.length > 0) || (body.tool_choice && body.tool_choice !== 'none')) {
          throw new Error('unsupported_tools');
        }
        if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new Error('invalid_stream');
        const authTimeoutMs = positiveIntOr(body.authTimeoutMs, 30 * 60_000, 60 * 60_000);
        const responseTimeoutMs = positiveIntOr(body.timeoutMs, 10 * 60_000, 30 * 60_000);
        try {
          const address = server.address();
          const queryResponse = await fetch(`http://${host}:${address.port}/query`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${tokenRef.current}`
            },
            body: JSON.stringify({
              prompt: openAiPrompt(body.messages),
              vendorId: model.vendorId,
              key: openAiSessionKey(req, model.vendorId),
              source: 'opencode',
              readyTimeoutMs: authTimeoutMs,
              timeoutMs: responseTimeoutMs
            })
          });
          const queryData = await queryResponse.json().catch(() => ({}));
          if (!queryResponse.ok || queryData?.error) {
            const error = new Error(queryData?.error || `http_${queryResponse.status}`);
            error.data = queryData?.data || null;
            throw error;
          }
          const completion = openAiCompletion({ model: model.id, text: String(queryData.result?.text || '') });
          if (body.stream === true) return sendOpenAiStream(res, completion);
          return sendJson(res, 200, completion);
        } catch (error) {
          if (body.stream === true) return sendOpenAiStreamError(res, error);
          throw error;
        }
      }

      if (url.pathname === '/status' && req.method === 'GET') {
        const tabId = defaultTabId;
        const st = await getStatus?.({ tabId });
        return sendJson(res, 200, { ...st, activeQuery: activeQueries.get(tabId) || null, ok: true });
      }

      if (url.pathname === '/show' && req.method === 'POST') {
        const body = await parseBody(req);
        const tabId = await resolveTab({ tabs, defaultTabId, body, url, vendors, createIfMissing: true });
        await onShow?.({ tabId });
        return sendJson(res, 200, { ok: true, tabId });
      }

      if (url.pathname === '/ensure-ready' && req.method === 'POST') {
        const body = await parseBody(req);
        const timeoutMs = positiveIntOr(body.timeoutMs, 30 * 60_000, 60 * 60_000);
        const tabId = await resolveTab({ tabs, defaultTabId, body, url, vendors, createIfMissing: true });
        await onShow?.({ tabId });
        const controller = tabs.getControllerById(tabId);
        const st = await runExclusive(controller, async () => controller.ensureReady({ timeoutMs }));
        return sendJson(res, 200, { ok: true, tabId, state: st });
      }

      if (url.pathname === '/query' && req.method === 'POST') {
        const body = await parseBody(req, { maxBytes: 5_000_000 });
        const readyTimeoutMs = positiveIntOr(body.readyTimeoutMs, 30 * 60_000, 60 * 60_000);
        const timeoutMs = positiveIntOr(body.timeoutMs, 10 * 60_000, 30 * 60_000);
        const prompt = String(body.prompt || '');
        if (!prompt.trim()) throw new Error('missing_prompt');
        if (prompt.length > 200_000) throw new Error('prompt_too_large');
        const tabId = await resolveTab({ tabs, defaultTabId, body, url, vendors, createIfMissing: true });
        if (activeQueries.has(tabId)) throw new Error('tab_busy');
        activeQueries.set(tabId, { phase: 'query', startedAt: Date.now() });
        try {
          await onShow?.({ tabId });
          const controller = tabs.getControllerById(tabId);
          const result = await runExclusive(controller, async () =>
            controller.query({
              prompt,
              timeoutMs,
              readyTimeoutMs,
              responseTimeoutMs: timeoutMs
            })
          );
          return sendJson(res, 200, { ok: true, tabId, result });
        } finally {
          activeQueries.delete(tabId);
        }
      }

      if (url.pathname === '/query/stop' && req.method === 'POST') {
        const body = await parseBody(req);
        const tabId = await resolveTab({ tabs, defaultTabId, body, url, vendors, createIfMissing: false });
        const controller = tabs.getControllerById(tabId);
        await controller.requestStop?.({ reason: 'user_stop' });
        return sendJson(res, 200, { ok: true, tabId });
      }

      if (url.pathname === '/shutdown' && req.method === 'POST') {
        sendJson(res, 200, { ok: true });
        queueMicrotask(() => onShutdown?.());
        return;
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      const mapped = mapErrorToHttp(error);
      if (mapped) return sendJson(res, mapped.code, mapped.body);
      return sendJson(res, 500, { error: 'internal_error', message: error?.message || String(error), data: error?.data || null });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
