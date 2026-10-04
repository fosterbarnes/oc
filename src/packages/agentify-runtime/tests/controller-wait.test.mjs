import assert from 'node:assert/strict';
import test from 'node:test';
import { isGenerating } from '../chatgpt-controller.mjs';

test('generating requires a visible enabled stop and a disabled send', () => {
  assert.equal(isGenerating({ stop: true, send: false, sendEnabled: false }), true);
  assert.equal(isGenerating({ stop: true, send: true, sendEnabled: true }), false);
  assert.equal(isGenerating({ stop: false, send: false, sendEnabled: false }), false);
  assert.equal(isGenerating({ stop: true, send: false, sendEnabled: false, vendorId: 'claude' }), false);
  assert.equal(isGenerating({ streaming: true, send: true, sendEnabled: true, vendorId: 'claude' }), true);
});
