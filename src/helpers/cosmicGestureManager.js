const fs = require("fs");
const net = require("net");
const path = require("path");
const { app } = require("electron");
const { getLinuxSessionInfo } = require("./linuxSession");
const RightCtrlGesture = require("./rightCtrlGesture");
const SOCKET_PATH = "/run/cosmic-wispr/right-ctrl.sock";

class CosmicGestureManager {
  constructor(windowManager, { socketPath = SOCKET_PATH } = {}) {
    this.windowManager = windowManager;
    this.socketPath = socketPath;
    this.supported = process.platform === "linux" && getLinuxSessionInfo().isCosmic;
    this.settingsPath = path.join(app.getPath("userData"), "cosmic-gestures.json");
    this.enabled = true;
    try {
      this.enabled = JSON.parse(fs.readFileSync(this.settingsPath, "utf8")).enabled !== false;
    } catch {}
    this.ready = false;
    this.socket = null;
    this.retry = null;
    this.stopped = true;
    this.gesture = new RightCtrlGesture({
      canStart: () =>
        !windowManager.hotkeyManager.isInListeningMode() &&
        windowManager._isOnboardingInputAllowed("dictation") &&
        !windowManager.isDictationProcessing() &&
        !windowManager._isDictatingToggle &&
        !windowManager._assistantPanelOpen,
      isRecording: () =>
        windowManager._isDictatingToggle && !windowManager.hotkeyManager.isInListeningMode(),
      start: () => windowManager.sendStartDictation(),
      stop: () => windowManager.sendStopDictation(),
      cancel: () => windowManager.sendCancelDictation(),
    });
  }
  status() {
    return {
      supported: this.supported,
      installed: fs.existsSync(this.socketPath),
      enabled: this.enabled,
      ready: this.ready,
    };
  }
  start() {
    if (!this.supported || !this.enabled || !this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  connect() {
    if (this.stopped) return;
    const socket = net.createConnection(this.socketPath);
    this.socket = socket;
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 4096) {
        socket.destroy();
        return;
      }
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (line === "READY") {
          this.gesture.reset();
          this.ready = true;
          continue;
        }
        if (line === "UNAVAILABLE") this.ready = false;
        if (this.ready || line === "UNAVAILABLE" || line === "RESET") {
          this.gesture.input(line);
        }
      }
    });
    socket.on("error", () => {}); // Status UI and the existing shortcut cover an absent helper.
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      this.gesture.reset();
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), 5000);
    });
  }
  setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new Error("Expected an enabled state.");
    fs.writeFileSync(this.settingsPath, JSON.stringify({ enabled }) + "\n", { mode: 0o600 });
    this.enabled = enabled;
    if (enabled) this.start();
    else this.stop();
    return this.status();
  }
  stop() {
    this.stopped = true;
    this.ready = false;
    clearTimeout(this.retry);
    this.retry = null;
    this.gesture.reset();
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }
}
module.exports = CosmicGestureManager;
