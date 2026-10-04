import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatGPTController } from '../chatgpt-controller.mjs';
import selectors from '../selectors.json' with { type: 'json' };

function challengeReady() {
  return {
    blocked: false,
    promptVisible: true,
    readyState: 'complete',
    kind: null,
    indicators: {}
  };
}

function makeController(evaluateImpl) {
  const stats = {
    sendKeys: [],
    mouseDown: 0,
    requestSubmitEvals: 0
  };
  const page = {
    navigate: async () => {},
    getUrl: async () => 'https://chatgpt.com/',
    evaluate: async (js) => {
      if (String(js).includes('requestSubmit')) stats.requestSubmitEvals += 1;
      return await evaluateImpl(js, stats);
    },
    sendKey: async (key, opts = {}) => {
      stats.sendKeys.push({ key, modifiers: opts.modifiers || [] });
    },
    moveMouse: async () => {},
    mouseDown: async () => {
      stats.mouseDown += 1;
    },
    mouseUp: async () => {},
    insertText: async () => {}
  };
  const controller = new ChatGPTController({
    page,
    selectors,
    stateDir: process.cwd()
  });
  return { controller, stats };
}

function classifyEvaluate(js) {
  const src = String(js);
  if (src.includes('hasTurnstile')) return 'challenge';
  if (src.includes("error:'already_generating'")) return 'send_prepare';
  if (src.includes('composer_cleared_send_enabled')) return 'send_confirm';
  if (src.includes('el.focus()')) return 'type_prompt';
  return 'other';
}

test('send performs one button click and confirms via aria-disabled send', async () => {
  const { controller, stats } = makeController((js) => {
    const kind = classifyEvaluate(js);
    if (kind === 'challenge') return challengeReady();
    if (kind === 'type_prompt') return { ok: true, rect: { x: 0, y: 0, w: 300, h: 80 } };
    if (kind === 'send_prepare') {
      return { ok: true, action: 'click', rect: { x: 40, y: 40, w: 32, h: 32 }, host: 'chatgpt.com' };
    }
    if (kind === 'send_confirm') {
      return { status: 'confirmed', stopVisible: false, sendDisabled: true, promptLen: 4 };
    }
    return null;
  });

  await controller.send({ text: 'hi' });

  const enterSubmits = stats.sendKeys.filter((k) => k.key === 'Enter');
  assert.equal(enterSubmits.length, 0);
  assert.equal(stats.requestSubmitEvals, 0);
  assert.ok(stats.mouseDown >= 2);
});

test('send without a button uses one keyboard submit only', async () => {
  const { controller, stats } = makeController((js) => {
    const kind = classifyEvaluate(js);
    if (kind === 'challenge') return challengeReady();
    if (kind === 'type_prompt') return { ok: true, rect: { x: 0, y: 0, w: 300, h: 80 } };
    if (kind === 'send_prepare') return { ok: true, action: 'keyboard', host: 'chatgpt.com' };
    if (kind === 'send_confirm') return { status: 'confirmed', stopVisible: true, sendDisabled: false, promptLen: 0 };
    return null;
  });

  await controller.send({ text: 'hi' });

  const enterSubmits = stats.sendKeys.filter((k) => k.key === 'Enter');
  assert.equal(enterSubmits.length, 1);
  assert.deepEqual(enterSubmits[0].modifiers, []);
  assert.equal(stats.requestSubmitEvals, 0);
});

test('grok host keyboard submit uses one control/meta Enter combo', async () => {
  const isMac = process.platform === 'darwin';
  const { controller, stats } = makeController((js) => {
    const kind = classifyEvaluate(js);
    if (kind === 'challenge') return challengeReady();
    if (kind === 'type_prompt') return { ok: true, rect: { x: 0, y: 0, w: 300, h: 80 } };
    if (kind === 'send_prepare') return { ok: true, action: 'keyboard', host: 'https://grok.com/chat' };
    if (kind === 'send_confirm') return { status: 'confirmed', stopVisible: true, sendDisabled: false, promptLen: 0 };
    return null;
  });

  await controller.send({ text: 'hi' });

  const enterSubmits = stats.sendKeys.filter((k) => k.key === 'Enter');
  assert.equal(enterSubmits.length, 1);
  assert.deepEqual(enterSubmits[0].modifiers, [isMac ? 'meta' : 'control']);
});

test('ambiguous confirmation throws without a fallback submit', async () => {
  const { controller, stats } = makeController((js) => {
    const kind = classifyEvaluate(js);
    if (kind === 'challenge') return challengeReady();
    if (kind === 'type_prompt') return { ok: true, rect: { x: 0, y: 0, w: 300, h: 80 } };
    if (kind === 'send_prepare') {
      return { ok: true, action: 'click', rect: { x: 40, y: 40, w: 32, h: 32 }, host: 'chatgpt.com' };
    }
    if (kind === 'send_confirm') {
      return {
        status: 'ambiguous',
        reason: 'composer_cleared_send_enabled',
        stopVisible: false,
        sendDisabled: false,
        promptLen: 0
      };
    }
    return null;
  });

  await assert.rejects(() => controller.send({ text: 'hi' }), (err) => {
    assert.equal(err.message, 'send_confirmation_ambiguous');
    assert.equal(err.data?.attemptedAction?.type, 'click');
    return true;
  });

  const enterSubmits = stats.sendKeys.filter((k) => k.key === 'Enter');
  assert.equal(enterSubmits.length, 0);
  assert.equal(stats.requestSubmitEvals, 0);
});

test('unconfirmed send throws send_not_triggered without resubmitting', async () => {
  const { controller, stats } = makeController((js) => {
    const kind = classifyEvaluate(js);
    if (kind === 'challenge') return challengeReady();
    if (kind === 'type_prompt') return { ok: true, rect: { x: 0, y: 0, w: 300, h: 80 } };
    if (kind === 'send_prepare') {
      return { ok: true, action: 'click', rect: { x: 40, y: 40, w: 32, h: 32 }, host: 'chatgpt.com' };
    }
    if (kind === 'send_confirm') {
      return { status: 'pending', stopVisible: false, sendDisabled: false, promptLen: 2 };
    }
    return null;
  });

  await assert.rejects(() => controller.send({ text: 'hi' }), (err) => {
    assert.equal(err.message, 'send_not_triggered');
    assert.equal(err.data?.attemptedAction?.type, 'click');
    assert.equal(err.data?.timedOut, true);
    return true;
  });

  const enterSubmits = stats.sendKeys.filter((k) => k.key === 'Enter');
  assert.equal(enterSubmits.length, 0);
  assert.equal(stats.requestSubmitEvals, 0);
});

test('Claude uses its vendor selector profile', () => {
  const controller = new ChatGPTController({
    page: {},
    vendorId: 'claude',
    selectors
  });

  assert.equal(controller.vendorId, 'claude');
  assert.match(controller.selectors.promptTextarea, /chat-input/);
  assert.doesNotMatch(controller.selectors.assistantMessage, /data-is-streaming/);
  assert.equal(controller.selectors.streamingMessage, '[data-is-streaming="true"]');
});
