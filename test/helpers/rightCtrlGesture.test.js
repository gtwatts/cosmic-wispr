const test = require("node:test");
const assert = require("node:assert/strict");
const RightCtrlGesture = require("../../src/helpers/rightCtrlGesture");
function setup(overrides = {}) {
  let time = 0,
    id = 0;
  const timers = new Map(),
    events = [];
  const gesture = new RightCtrlGesture({
    start: () => events.push("start"),
    stop: () => events.push("stop"),
    cancel: () => events.push("cancel"),
    setTimer: (fn, delay) => {
      timers.set(++id, { fn, at: time + delay });
      return id;
    },
    clearTimer: (key) => timers.delete(key),
    ...overrides,
  });
  const advance = (ms) => {
    const end = time + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      time = next[1].at;
      next[1].fn();
    }
    time = end;
  };
  const tap = () => {
    gesture.input("DOWN");
    advance(50);
    gesture.input("UP");
  };
  return { gesture, events, advance, tap, timers };
}
test("hold starts once and release finishes", () => {
  const { gesture: g, events, advance } = setup();
  g.input("DOWN");
  advance(199);
  assert.deepEqual(events, []);
  advance(1);
  g.input("DOWN");
  advance(1000);
  g.input("UP");
  g.input("UP");
  assert.deepEqual(events, ["start", "stop"]);
});
test("a lone tap never opens the microphone", () => {
  const { tap, advance, events, gesture: g, timers } = setup();
  tap();
  advance(400);
  assert.equal(g.state, "idle");
  assert.deepEqual(events, []);
  assert.equal(timers.size, 0);
});
test("double tap latches, release stays recording, next tap finishes", () => {
  const { tap, advance, events, gesture: g } = setup();
  tap();
  advance(100);
  tap();
  assert.equal(g.state, "locked");
  advance(12000);
  assert.deepEqual(events, ["start"]);
  tap();
  assert.deepEqual(events, ["start", "stop"]);
});
test("slow taps are independent and a long second press acts as hold", () => {
  const { tap, advance, events, gesture: g } = setup();
  tap();
  advance(400);
  tap();
  advance(50);
  g.input("DOWN");
  advance(250);
  g.input("UP");
  assert.deepEqual(events, ["start", "stop"]);
});
test("Ctrl+C cancels a pending or held gesture without a paste", () => {
  for (const delay of [50, 250]) {
    const { gesture: g, advance, events } = setup();
    g.input("DOWN");
    advance(delay);
    g.input("CHORD");
    g.input("UP");
    advance(400);
    assert.deepEqual(events, delay < 200 ? [] : ["start", "cancel"]);
  }
});
test("Ctrl shortcuts preserve hands-free recording and the next clean tap finishes", () => {
  const { gesture: g, tap, advance, events } = setup();
  tap();
  tap();
  g.input("DOWN");
  g.input("CHORD");
  g.input("UP");
  advance(1000);
  assert.equal(g.state, "locked");
  assert.deepEqual(events, ["start"]);
  tap();
  assert.deepEqual(events, ["start", "stop"]);
});
test("typing between taps breaks the double tap; ordinary typing does not end hands-free", () => {
  const { tap, advance, events, gesture: g } = setup();
  tap();
  g.input("TAP_RESET");
  tap();
  advance(400);
  assert.deepEqual(events, []);
  tap();
  tap();
  g.input("TAP_RESET");
  assert.equal(g.state, "locked");
  assert.deepEqual(events, ["start"]);
});
test("disconnect, input reset, and screen lock cancel owned recordings", () => {
  for (const event of ["RESET", "UNAVAILABLE"]) {
    const { tap, events, gesture: g, timers } = setup();
    tap();
    tap();
    g.input(event);
    assert.deepEqual(events, ["start", "cancel"]);
    assert.equal(timers.size, 0);
  }
});
test("busy or onboarding gates prevent starting and safety timeout ends a long session", () => {
  const blocked = setup({ canStart: () => false });
  blocked.tap();
  blocked.tap();
  blocked.advance(1000);
  assert.deepEqual(blocked.events, []);
  const { tap, advance, events } = setup();
  tap();
  tap();
  advance(300000);
  assert.deepEqual(events, ["start", "stop"]);
});
test("Right Ctrl can stop fallback recording without cancelling it when used in a chord", () => {
  const { gesture: g, events, tap } = setup({ isRecording: () => true, canStart: () => false });
  g.input("DOWN");
  g.input("CHORD");
  g.input("UP");
  assert.deepEqual(events, []);
  tap();
  assert.deepEqual(events, ["stop"]);
});
test("renderer cancellation or fallback stop clears the gesture without a second cancel", () => {
  const { tap, events, gesture: g, timers } = setup();
  tap();
  tap();
  g.recordingEnded();
  assert.equal(g.state, "idle");
  assert.equal(timers.size, 0);
  assert.deepEqual(events, ["start"]);
  tap();
  tap();
  assert.deepEqual(events, ["start", "start"]);
});
