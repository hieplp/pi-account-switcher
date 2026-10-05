import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

describe("public account verification with actual Pi credential resolution", () => {
  it("isolates target credentials and restores parent state after success, error, and cancellation", () => {
    execFileSync(process.execPath, ["scripts/acceptance/verification.mjs"], {
      env: { ...process.env, ACCEPTANCE_ROOT: process.cwd() },
      stdio: "pipe",
    });
  }, 60_000);
});
