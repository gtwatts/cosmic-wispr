#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
if (!fs.existsSync(path.join(root, "src/dist/index.html"))) {
  console.error("Build Cosmic Wispr first with npm run build:renderer.");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [path.join(root, "scripts/run-electron.js"), ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      OPENWHISPR_CHANNEL: "production",
      COSMIC_WISPR_LAUNCHER: path.join(require("os").homedir(), ".local/bin/cosmic-wispr"),
    },
  }
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
