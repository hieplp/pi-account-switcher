import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("restores API-key and OAuth-shaped sessions through the public Pi 1.0.2 runtime failure matrix", async () => {
  const home = await mkdtemp(join(tmpdir(), "switch-acceptance-"));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ["scripts/acceptance/switching.mjs"], {
      env: { PATH: process.env.PATH, HOME: home, PI_CODING_AGENT_DIR: join(home, ".pi/agent"), PI_OFFLINE: "1" },
    });
    expect(stdout.match(/public switching:/g)).toHaveLength(20);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}, 60_000);
