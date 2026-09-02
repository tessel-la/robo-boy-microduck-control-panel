import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import definition from "../dist/index.js";

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

test("mounts and sends policy, mouth, jump, and drive commands", async () => {
  const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const publications = [];
  const services = [];
  let statusListener;
  let unsubscribed = false;
  const context = {
    panelId: definition.id,
    instanceId: "microduck-test",
    capabilities: ["ros"],
    ros: {
      getTopics: async () => [],
      selectTopic: async () => { throw new Error("not used"); },
      subscribe: async (options, listener) => {
        assert.equal(options.topic, "/locomotion/status");
        statusListener = listener;
        return { unsubscribe: async () => { unsubscribed = true; } };
      },
      publish: async (options) => { publications.push(options); },
      callService: async (options) => { services.push(options); return { success: true, message: "ok" }; },
    },
    storage: null,
    network: null,
    runtime: { target: "web" },
    connection: { getSnapshot: () => ({ status: "connected", generation: 1 }), subscribe: () => () => {} },
    viewport: { getSnapshot: () => ({ width: 640, height: 480, isIntersecting: true, isDocumentVisible: true, isActive: true }), subscribe: () => () => {}, requestFullscreen: async () => {} },
    theme: { getSnapshot: () => ({ colorScheme: "dark", tokens: {} }), subscribe: () => () => {} },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  try {
    const instance = await definition.activate(context);
    const container = document.querySelector("main");
    instance.mount(container);
    await nextTask();
    statusListener({ data: JSON.stringify({ mode: "walk", enabled: true, policy: { mode: "walk" }, mouth: { opened: false } }) });
    assert.equal(container.querySelector('[data-role="policy"]').textContent, "walk");

    container.querySelector('[data-motion="sit"]').click();
    container.querySelector('[data-mouth="open"]').click();
    container.querySelector('[data-action="jump"]').click();
    await nextTask();
    assert.equal(publications[0].topic, "/locomotion/policy_cmd");
    assert.deepEqual(publications[0].message, { data: "sit" });
    assert.equal(services[0].service, "/locomotion/mouth");
    assert.deepEqual(services[0].request, { data: true });
    assert.equal(services[1].service, "/locomotion/jump");

    container.querySelector('[data-drive="forward"]').dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    await nextTask();
    dom.window.dispatchEvent(new dom.window.Event("pointerup"));
    await nextTask();
    assert.ok(publications.some((item) => item.topic === "/cmd_vel" && item.message.linear.x === 0.35));
    assert.ok(publications.some((item) => item.topic === "/cmd_vel" && item.message.linear.x === 0));

    instance.unmount();
    await nextTask();
    assert.equal(unsubscribed, true);
    assert.equal(container.childElementCount, 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    dom.window.close();
  }
});
