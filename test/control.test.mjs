import assert from "node:assert/strict";
import test from "node:test";

import { parseStatus, velocityForControl } from "../dist/index.js";

test("drive controls use bounded planar commands", () => {
  assert.deepEqual(velocityForControl("forward"), { linearX: 0.35, linearY: 0, angularZ: 0 });
  assert.deepEqual(velocityForControl("back"), { linearX: -0.4, linearY: 0, angularZ: 0 });
  assert.deepEqual(velocityForControl("turn-right"), { linearX: 0.35, linearY: 0, angularZ: -0.65 });
});

test("status messages expose policy and mouth state", () => {
  assert.deepEqual(
    parseStatus({ data: JSON.stringify({ mode: "walk", enabled: true, policy: { mode: "walk" }, mouth: { opened: true } }) }),
    { mode: "walk", enabled: true, policyMode: "walk", mouthOpen: true },
  );
  assert.equal(parseStatus({ data: "not-json" }), null);
  assert.equal(parseStatus({}), null);
});
