const fs = require("fs");
const os = require("os");
const path = require("path");
const { getLinuxSessionInfo } = require("./linuxSession");

const SERVICE = "io.github.cosmicwispr.App";
const OBJECT = "/io/github/cosmicwispr/App";
const CONFIG_ID = "com.system76.CosmicSettings.Shortcuts/v1";
const SLOTS = new Set(["dictation", "voiceAgent", "translation", "meeting"]);
const MODIFIERS = {
  control: "Ctrl",
  ctrl: "Ctrl",
  commandorcontrol: "Ctrl",
  cmdorctrl: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  super: "Super",
  meta: "Super",
  win: "Super",
  command: "Super",
  cmd: "Super",
};
const KEYS = {
  space: "space",
  enter: "Return",
  escape: "Escape",
  tab: "Tab",
  backspace: "BackSpace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "Page_Up",
  pagedown: "Page_Down",
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  pause: "Pause",
  scrolllock: "Scroll_Lock",
};

function convertHotkey(hotkey) {
  if (typeof hotkey !== "string") throw new Error("Choose a keyboard shortcut.");
  const parts = hotkey.toLowerCase().split("+");
  const last = parts.pop();
  const key =
    KEYS[last] ||
    (/^f([1-9]|1\d|2[0-4])$/.test(last)
      ? last.toUpperCase()
      : /^[a-z0-9]$/.test(last)
        ? last
        : null);
  if (!key || parts.some((part) => !MODIFIERS[part])) {
    throw new Error("COSMIC shortcuts need a regular key, for example Ctrl+Alt+Space.");
  }
  const modifiers = [...new Set(parts.map((part) => MODIFIERS[part]))].sort();
  if (!modifiers.length && !/^F\d+$/.test(key)) {
    throw new Error("Use a modifier with this key to keep normal typing available.");
  }
  return { modifiers, key };
}

// Split a RON map at top-level commas. Keep each original entry intact so
// unrelated actions, comments, descriptions, and formatting survive an edit.
// Reject syntax we cannot preserve instead of replacing a user's configuration.
function splitEntries(source) {
  const entries = [];
  const stack = [];
  let start = -1;
  let end = -1;
  let quoted = false;
  let escaped = false;
  let lineComment = false;
  let blockDepth = 0;
  let clean = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i],
      next = source[i + 1];
    if (lineComment) {
      if (c === "\n") lineComment = false;
      clean += " ";
      continue;
    }
    if (blockDepth) {
      if (c === "/" && next === "*") {
        blockDepth++;
        i++;
      } else if (c === "*" && next === "/") {
        blockDepth--;
        i++;
      }
      clean += " ";
      continue;
    }
    if (quoted) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === "/" && next === "/") {
      lineComment = true;
      i++;
      clean += " ";
      continue;
    }
    if (c === "/" && next === "*") {
      blockDepth = 1;
      i++;
      clean += " ";
      continue;
    }
    if (c === "'" || (c === "r" && (next === '"' || next === "#"))) {
      throw new Error("Unsupported RON string syntax; configure this shortcut in COSMIC Settings.");
    }
    if (c === '"') {
      quoted = true;
      clean += c;
      continue;
    }
    if (start < 0) {
      if (/\s/.test(c)) continue;
      if (c !== "{") throw new Error("COSMIC shortcuts must be a RON map.");
      stack.push(c);
      start = i + 1;
      clean = "";
      continue;
    }
    if (end >= 0) {
      if (!/\s/.test(c)) throw new Error("Unexpected content after COSMIC shortcuts.");
      continue;
    }
    if ("{[(".includes(c)) stack.push(c);
    if ("}])".includes(c)) {
      const expected = { "}": "{", "]": "[", ")": "(" }[c];
      if (stack.pop() !== expected) throw new Error("Unbalanced COSMIC shortcuts.");
      if (!stack.length) {
        if (clean.trim()) entries.push({ raw: source.slice(start, i), clean });
        end = i;
        continue;
      }
    }
    if (c === "," && stack.length === 1) {
      if (clean.trim()) entries.push({ raw: source.slice(start, i), clean });
      start = i + 1;
      clean = "";
    } else clean += c;
  }
  if (end < 0 || quoted || blockDepth || stack.length)
    throw new Error("Incomplete COSMIC shortcuts.");
  return entries;
}

function entryBinding(entry) {
  const header = entry.clean.split(/\)\s*:/)[0];
  const mods = header.match(/\bmodifiers\s*:\s*\[([^\]]*)\]/);
  const key = header.match(/\bkey\s*:\s*"([^"\\]+)"/);
  if (!mods || /\bkeycode\s*:/.test(header)) {
    throw new Error("Unrecognized COSMIC binding; configure this shortcut in COSMIC Settings.");
  }
  return {
    modifiers: mods[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .sort(),
    key: key?.[1] || null,
  };
}

function commandFor(slot) {
  if (!SLOTS.has(slot)) throw new Error("Unsupported COSMIC shortcut action.");
  return `dbus-send --session --type=method_call --dest=${SERVICE} ${OBJECT} ${SERVICE}.Activate string:${slot}`;
}

function ownsEntry(entry, slot) {
  return entry.clean.trim().endsWith(`: Spawn(${JSON.stringify(commandFor(slot))})`);
}

function sameBinding(a, b) {
  return a.key?.toLowerCase() === b.key?.toLowerCase() && a.modifiers.join() === b.modifiers.join();
}

function editConfig(source, defaults, slot, hotkey) {
  commandFor(slot);
  const entries = splitEntries(source);
  const retained = entries.filter((entry) => !ownsEntry(entry, slot));
  if (hotkey) {
    const binding = convertHotkey(hotkey);
    const conflict = [...retained, ...splitEntries(defaults)].find((entry) =>
      sameBinding(entryBinding(entry), binding)
    );
    if (conflict)
      throw new Error(`${hotkey} is already assigned in COSMIC Settings. Choose another shortcut.`);
    retained.push({
      raw: `\n    (modifiers: [${binding.modifiers.join(", ")}], key: ${JSON.stringify(binding.key)}, description: Some(${JSON.stringify(`Cosmic Wispr: ${slot}`)})): Spawn(${JSON.stringify(commandFor(slot))})`,
    });
  }
  if (!hotkey && retained.length === entries.length) return source;
  return `{${retained.map((entry) => `${entry.raw},`).join("")}\n}\n`;
}

function readOrEmpty(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "{}";
    throw error;
  }
}

class CosmicShortcutManager {
  constructor({
    configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    dataDirs = (process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":"),
  } = {}) {
    this.configPath = path.join(configHome, "cosmic", CONFIG_ID, "custom");
    this.defaultsPaths = [
      path.join(configHome, "cosmic", CONFIG_ID, "defaults"),
      ...dataDirs.map((dir) => path.join(dir, "cosmic", CONFIG_ID, "defaults")),
    ];
    this.callbacks = new Map();
    this.bus = null;
  }

  static isCosmic() {
    return process.platform === "linux" && getLinuxSessionInfo().isCosmic;
  }

  async init() {
    const dbus = require("@homebridge/dbus-native");
    this.bus = dbus.sessionBus();
    this.bus.connection.on("error", (error) =>
      require("./debugLogger").warn("COSMIC shortcut bus error", { error: error.message })
    );
    try {
      await new Promise((resolve, reject) => {
        this.bus.requestName(SERVICE, 4, (error, result) => {
          if (error || result !== 1)
            reject(error || new Error("Cosmic Wispr shortcut service is already running."));
          else resolve();
        });
      });
      this.bus.exportInterface(
        {
          Activate: (slot) => {
            this.callbacks.get(slot)?.();
          },
        },
        OBJECT,
        {
          name: SERVICE,
          methods: { Activate: ["s", ""] },
        }
      );
    } catch (error) {
      this.bus.connection.end();
      this.bus = null;
      throw error;
    }
  }

  writeBinding(slot, hotkey) {
    const source = readOrEmpty(this.configPath);
    const defaults = readOrEmpty(
      this.defaultsPaths.find((p) => fs.existsSync(p)) || this.defaultsPaths[0]
    );
    const updated = editConfig(source, defaults, slot, hotkey);
    if (updated === source) return;
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    if (
      fs.existsSync(this.configPath) &&
      !fs.existsSync(`${this.configPath}.cosmic-wispr-backup`)
    ) {
      fs.copyFileSync(
        this.configPath,
        `${this.configPath}.cosmic-wispr-backup`,
        fs.constants.COPYFILE_EXCL
      );
    }
    if (readOrEmpty(this.configPath) !== source)
      throw new Error("COSMIC shortcuts changed during this edit. Try again.");
    const temporary = `${this.configPath}.cosmic-wispr-${process.pid}`;
    try {
      fs.writeFileSync(temporary, updated, { mode: 0o600, flag: "wx" });
      fs.renameSync(temporary, this.configPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  register(slot, hotkey, callback) {
    this.writeBinding(slot, hotkey);
    this.callbacks.set(slot, callback);
  }

  unregister(slot) {
    this.writeBinding(slot, null);
    this.callbacks.delete(slot);
  }

  close() {
    try {
      for (const slot of this.callbacks.keys()) this.unregister(slot);
    } finally {
      this.bus?.connection.end();
      this.bus = null;
    }
  }
}

module.exports = { CosmicShortcutManager, convertHotkey, editConfig, splitEntries, commandFor };
