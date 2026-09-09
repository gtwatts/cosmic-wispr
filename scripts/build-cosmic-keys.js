#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "resources/bin/cosmic-right-ctrl");
fs.mkdirSync(path.dirname(output), { recursive: true });
const result = spawnSync(
  "gcc",
  [
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    path.join(root, "resources/cosmic-right-ctrl.c"),
    "-lsystemd",
    "-o",
    output,
  ],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
