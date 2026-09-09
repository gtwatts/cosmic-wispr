const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  net = require("node:net");
const { once } = require("node:events");
const Module = require("node:module");

test("socket gestures cancel on lock/disconnect and disabling releases the helper", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cosmic-gesture-manager-"));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return { app: { getPath: () => directory } };
    return original.call(this, request, parent, isMain);
  };
  let Manager;
  try {
    Manager = require("../../src/helpers/cosmicGestureManager");
  } finally {
    Module._load = original;
  }
  const socketPath = path.join(directory, "keys.sock");
  const server = net.createServer();
  server.listen(socketPath);
  await once(server, "listening");
  const events = [];
  const wm = {
    hotkeyManager: { isInListeningMode: () => false },
    _isOnboardingInputAllowed: () => true,
    isDictationProcessing: () => false,
    sendStartDictation: () => events.push("start"),
    sendStopDictation: () => events.push("stop"),
    sendCancelDictation: () => events.push("cancel"),
  };
  const manager = new Manager(wm, { socketPath });
  manager.supported = true;
  let peer;
  t.after(async () => {
    manager.stop();
    peer?.destroy();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const connected = once(server, "connection");
  manager.start();
  [peer] = await connected;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
  peer.write("REA");
  await tick();
  assert.equal(manager.ready, false);
  peer.write("DY\nDOWN\nUP\nDOWN\nUP\n");
  await tick();
  assert.equal(manager.ready, true);
  assert.deepEqual(events, ["start"]);
  peer.write("UNAVAILABLE\nDOWN\nUP\nDOWN\nUP\n");
  await tick();
  assert.equal(manager.ready, false);
  assert.deepEqual(events, ["start", "cancel"]);
  peer.write("READY\nDOWN\nUP\nDOWN\nUP\n");
  await tick();
  peer.destroy();
  await tick();
  assert.deepEqual(events, ["start", "cancel", "start", "cancel"]);
  manager.setEnabled(false);
  assert.equal(manager.status().enabled, false);
  assert.equal(manager.retry, null);
  assert.equal(JSON.parse(fs.readFileSync(manager.settingsPath)).enabled, false);
});
