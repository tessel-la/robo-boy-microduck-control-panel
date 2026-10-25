import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import definition from '../dist/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const liveStatus = { data: JSON.stringify({ mode: 'walk', enabled: true, policy: { mode: 'walk' } }) };
async function setup(t, { deferred, fail = false, failPublish = false } = {}) {
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  const saved = { document: globalThis.document, window: globalThis.window };
  Object.assign(globalThis, { document: dom.window.document, window: dom.window });
  let connectionListener, viewportListener;
  const subscriptions = [], publications = [];
  const context = {
    ros: {
      subscribe: async (spec, receive) => {
        if (fail) throw new Error('subscription refused');
        const sub = { receive, removed: false, unsubscribe: async () => { sub.removed = true; } };
        subscriptions.push(sub);
        if (deferred) await deferred;
        return sub;
      },
      publish: async spec => {
        if (failPublish && spec.message.linear.x) throw new Error("control unavailable");
        publications.push(spec);
      }, callService: async () => ({ success: true }),
    },
    connection: { getSnapshot: () => ({ status: 'connected', generation: 1 }), subscribe: fn => { connectionListener = fn; return () => {}; } },
    viewport: { getSnapshot: () => ({ width: 390, height: 600, isActive: true }), subscribe: fn => { viewportListener = fn; return () => {}; } },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };
  const panel = definition.activate(context);
  const root = document.querySelector('main');
  panel.mount(root);
  await tick();
  t.after(() => { panel.unmount(); Object.assign(globalThis, saved); dom.window.close(); });
  return {
    panel, root, dom, publications, subscriptions,
    emit: value => subscriptions.at(-1).receive(value),
    connection: value => connectionListener(value),
    viewport: value => viewportListener({ width: 390, height: 600, ...value }),
    allowSubscription: () => { fail = false; },
    allowPublish: () => { failPublish = false; },
  };
}

test('inactive tiles unsubscribe, ignore late telemetry, and resubscribe when activated', async t => {
  const p = await setup(t);
  p.emit(liveStatus);
  p.panel.setActive(false);
  assert.equal(p.subscriptions[0].removed, true);
  p.emit(liveStatus);
  assert.equal(p.root.querySelector('[data-role="mode"]').textContent, '—');
  p.panel.setActive(true);
  await tick();
  assert.equal(p.subscriptions.length, 2);
  assert.equal(p.root.querySelector('[data-drive]').disabled, true);
  p.emit(liveStatus);
  assert.equal(p.root.querySelector('[data-drive]').disabled, false);
});

test('late subscription completion is released after deactivation', async t => {
  let resolve;
  const p = await setup(t, { deferred: new Promise(r => { resolve = r; }) });
  p.panel.setActive(false);
  resolve();
  await tick();
  assert.equal(p.subscriptions[0].removed, true);
});

test('failed subscriptions can be retried and drive stays disabled without telemetry', async t => {
  const p = await setup(t, { fail: true });
  assert.equal(p.root.querySelector('[data-drive]').disabled, true);
  assert.match(p.root.querySelector('[data-role="feedback"]').textContent, /Retry telemetry/);
  p.allowSubscription();
  p.root.querySelector('[data-action="retry"]').click();
  await tick();
  p.emit(liveStatus);
  assert.equal(p.root.querySelector('[data-drive]').disabled, false);
});

test('keyboard hold drives, release stops, and hidden viewports release telemetry', async t => {
  const p = await setup(t);
  p.emit(liveStatus);
  const button = p.root.querySelector('[data-drive="forward"]');
  button.dispatchEvent(new p.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(p.publications.at(-1).message.linear.x, 0.35);
  p.dom.window.dispatchEvent(new p.dom.window.KeyboardEvent('keyup', { key: ' ', cancelable: true }));
  await tick();
  assert.equal(p.publications.at(-1).message.linear.x, 0);
  p.viewport({ isActive: false });
  assert.equal(p.subscriptions[0].removed, true);
  assert.equal(button.disabled, true);
});

test('reconnect clears old telemetry and does not resume held motion', async t => {
  const p = await setup(t);
  p.emit(liveStatus);
  p.root.querySelector('[data-drive="forward"]').dispatchEvent(new p.dom.window.Event('pointerdown', { bubbles: true, cancelable: true }));
  await tick();
  p.connection({ status: 'connected', generation: 2 });
  await tick();
  assert.equal(p.subscriptions[0].removed, true);
  assert.equal(p.root.querySelector('[data-drive]').disabled, true);
  const count = p.publications.length;
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(p.publications.length, count);
});

test('stale status stops a held command and disables driving', async t => {
  const p = await setup(t);
  let now = 10000;
  t.mock.method(Date, 'now', () => now);
  p.emit(liveStatus);
  p.root.querySelector('[data-drive="forward"]').dispatchEvent(new p.dom.window.Event('pointerdown', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(p.publications.at(-1).message.linear.x, .35);
  now += 1600;
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(p.publications.at(-1).message.linear.x, 0);
  assert.equal(p.root.querySelector('[data-drive]').disabled, true);
});

test('explicit Stop sends zero even without a locally held direction', async t => {
  const p = await setup(t);
  p.root.querySelector('[data-action="stop"]').click();
  await tick();
  assert.equal(p.publications.at(-1).topic, '/cmd_vel');
  assert.equal(p.publications.at(-1).message.linear.x, 0);
});


test('a refused drive publish stops repeating and never resumes automatically', async t => {
  const p = await setup(t, { failPublish: true });
  p.emit(liveStatus);
  p.root.querySelector('[data-drive="forward"]').dispatchEvent(new p.dom.window.Event('pointerdown', { bubbles: true, cancelable: true }));
  await tick();
  assert.match(p.root.querySelector('[data-role="feedback"]').textContent, /Drive failed/);
  p.allowPublish();
  const count = p.publications.length;
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(p.publications.length, count);
  assert.ok(p.publications.every(spec => spec.message.linear.x === 0));
});
