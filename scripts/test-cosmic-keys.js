#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cosmic-keys-test-"));
try {
  const binary = path.join(directory, "test");
  let result = spawnSync(
    "gcc",
    [
      "-O2",
      "-Wall",
      "-Wextra",
      "-Werror",
      path.resolve(__dirname, "../test/native/cosmic-right-ctrl.test.c"),
      "-lsystemd",
      "-o",
      binary,
    ],
    { stdio: "inherit" }
  );
  if (result.status === 0) result = spawnSync(binary, [], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
