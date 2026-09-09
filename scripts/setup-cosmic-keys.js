#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");
const result = spawnSync(
  "pkexec",
  ["/usr/bin/python3", path.join(__dirname, "install-cosmic-keys.py")],
  { stdio: "inherit" }
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
