import { describe, expect, it } from "vitest";
import { formatAccountList } from "./list";
import type { AccountConfig } from "@/types";

describe("formatAccountList", () => {
  const accounts = [
    { id: "acc-a", label: "Alpha", provider: "anthropic", env: { KEY: "val" } },
    { id: "acc-z", label: "Zeta", provider: "opencode-go", piAuth: { provider: "opencode-go", entry: { type: "api_key" as const, key: "sk-" } } },
    { id: "acc-m", label: "Beta", provider: "google" },
  ] as AccountConfig[];

  const active = { id: "acc-a", label: "Alpha", provider: "anthropic" } as AccountConfig;

  it("outputs one line per account sorted by label", () => {
    const result = formatAccountList(accounts, undefined);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^acc-a/);
    expect(lines[1]).toMatch(/^acc-m/);
    expect(lines[2]).toMatch(/^acc-z/);
  });

  it("marks active account", () => {
    const result = formatAccountList(accounts, active);
    expect(result).toContain("acc-a | Alpha | anthropic | active");
    expect(result).toContain("acc-z | Zeta | opencode-go | inactive");
  });

  it("marks all inactive when no active account", () => {
    const result = formatAccountList(accounts, undefined);
    for (const line of result.split("\n")) {
      expect(line).toMatch(/inactive$/);
    }
  });

  it("handles empty accounts list", () => {
    const result = formatAccountList([], undefined);
    expect(result).toBe("No accounts configured.");
  });
});
