#!/usr/bin/env node
// Match the Electron ABI used by native modules installed by postinstall.
const { spawnSync } = require("child_process");
const result = spawnSync(
  require("electron"),
  [
    "--import",
    "tsx",
    "--test",
    ...(process.argv.length > 2 ? process.argv.slice(2) : ["test/**/*.test.js"]),
  ],
  { stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
