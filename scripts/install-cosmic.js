#!/usr/bin/env node
// Install a user-owned launcher for this checkout. No root or login changes.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { quoteExecPath } = require("../src/helpers/linuxAutostart");

if (process.platform !== "linux") throw new Error("This launcher is for Linux.");
const root = path.resolve(__dirname, "..");
if (!fs.existsSync(path.join(root, "src/dist/index.html")))
  throw new Error("Run npm run build:renderer first.");
const bin = path.join(os.homedir(), ".local", "bin");
const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const launcher = path.join(bin, "cosmic-wispr");
const desktop = path.join(data, "applications", "cosmic-wispr.desktop");
const quoteShell = (value) => `'${value.replace(/'/g, `'\\''`)}'`;
const script = `#!/bin/sh\n# Cosmic Wispr checkout launcher\nexec ${quoteShell(process.execPath)} ${quoteShell(path.join(root, "scripts/start-cosmic.js"))} "$@"\n`;
const entry = `[Desktop Entry]\nType=Application\nName=Cosmic Wispr\nComment=Speak, polish, and paste into your apps\nExec=${quoteExecPath(launcher)}\nIcon=${path.join(root, "src/assets/icon.png")}\nTerminal=false\nCategories=Utility;Audio;\nStartupWMClass=cosmic-wispr\n`;
for (const [file, text, mode] of [
  [launcher, script, 0o755],
  [desktop, entry, 0o644],
]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== text) {
    fs.copyFileSync(file, `${file}.backup-${Date.now()}`, fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(file, text, { mode });
  fs.chmodSync(file, mode);
}
console.log(`Installed Cosmic Wispr in your application launcher.\nLaunch: ${launcher}`);
