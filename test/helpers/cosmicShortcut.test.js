const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CosmicShortcutManager,
  convertHotkey,
  editConfig,
  splitEntries,
  commandFor,
} = require("../../src/helpers/cosmicShortcut");
const { getLinuxSessionInfo } = require("../../src/helpers/linuxSession");

test("COSMIC is identified independently of wlroots desktops", () => {
  const session = getLinuxSessionInfo({
    XDG_CURRENT_DESKTOP: "COSMIC",
    WAYLAND_DISPLAY: "wayland-1",
    DISPLAY: ":1",
    SWAYSOCK: "/stale/sway.sock",
    HYPRLAND_INSTANCE_SIGNATURE: "stale",
  });
  assert.equal(session.isCosmic, true);
  assert.equal(session.isWlroots, false);
  assert.equal(
    getLinuxSessionInfo({ XDG_CURRENT_DESKTOP: "cosmic-gnome", XDG_SESSION_TYPE: "x11" }).isCosmic,
    false
  );
});

test("COSMIC accepts a useful shortcut and rejects typing keys or shell syntax", () => {
  assert.deepEqual(convertHotkey("Control+Alt+Space"), {
    modifiers: ["Alt", "Ctrl"],
    key: "space",
  });
  assert.deepEqual(convertHotkey("Super+Shift+F12"), { modifiers: ["Shift", "Super"], key: "F12" });
  for (const hotkey of [
    "Control+Super",
    "a",
    "Space",
    "Control+a;rm",
    "Control+Alt+",
    "Alt+MouseButton4",
  ])
    assert.throws(() => convertHotkey(hotkey));
});

test("install, update and remove preserve other actions with nested RON and comments", () => {
  const other =
    '\n    // my terminal\n    (modifiers: [Super], key: "t", description: Some("Work, [terminal]")): Spawn("terminal --title \\"My work\\""),';
  const source = `{${other}\n}`;
  const installed = editConfig(source, "{}", "dictation", "Control+Alt+Space");
  assert.ok(installed.includes(other));
  assert.equal(splitEntries(installed).length, 2);
  const updated = editConfig(installed, "{}", "dictation", "Control+Alt+d");
  assert.equal(splitEntries(updated).length, 2);
  assert.ok(!updated.includes('key: "space"'));
  assert.ok(updated.includes(commandFor("dictation")));
  const removed = editConfig(updated, "{}", "dictation", null);
  assert.ok(removed.includes(other));
  assert.equal(splitEntries(removed).length, 1);
  assert.equal(editConfig(removed, "{}", "dictation", null), removed);
});

test("rejects conflicts with user shortcuts, system defaults, and another Wispr action", () => {
  const conflict = '{ (modifiers: [Ctrl, Alt], key: "space"): System(Launcher), }';
  assert.throws(
    () => editConfig(conflict, "{}", "dictation", "Control+Alt+Space"),
    /already assigned/
  );
  assert.throws(
    () => editConfig("{}", conflict, "dictation", "Control+Alt+Space"),
    /already assigned/
  );
  const other = editConfig("{}", "{}", "voiceAgent", "Control+Alt+Space");
  assert.throws(
    () => editConfig(other, "{}", "dictation", "Control+Alt+Space"),
    /already assigned/
  );
});

test("malformed or unsupported config is not overwritten", () => {
  for (const source of [
    "not a map",
    "{ broken",
    '{ (modifiers: []): Spawn("unfinished) }',
    "{} trailing",
    "{ /* unclosed",
    "{ (modifiers: [], keycode: Some(12)): Disable, }",
  ]) {
    assert.throws(() => editConfig(source, "{}", "dictation", "Control+Alt+Space"));
  }
});

test("file registration backs up originals and a failed replacement retains the active shortcut", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cosmic-shortcuts-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manager = new CosmicShortcutManager({ configHome: dir, dataDirs: [] });
  fs.mkdirSync(path.dirname(manager.configPath), { recursive: true });
  const original = '{ (modifiers: [Super], key: "t"): Spawn("terminal"), }';
  fs.writeFileSync(manager.configPath, original);
  const callback = () => {};
  manager.register("dictation", "Control+Alt+Space", callback);
  const registered = fs.readFileSync(manager.configPath, "utf8");
  assert.equal(fs.readFileSync(`${manager.configPath}.cosmic-wispr-backup`, "utf8"), original);
  assert.throws(() => manager.register("dictation", "Super+t", () => {}), /already assigned/);
  assert.equal(fs.readFileSync(manager.configPath, "utf8"), registered);
  assert.equal(manager.callbacks.get("dictation"), callback);
  manager.close();
  assert.equal(splitEntries(fs.readFileSync(manager.configPath, "utf8")).length, 1);
});
