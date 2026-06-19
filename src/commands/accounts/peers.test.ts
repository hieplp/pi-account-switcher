import { describe, expect, it } from "vitest";
import { filterPeers } from "./peers";
import type { AccountConfig } from "../../types";

describe("filterPeers", () => {
  const accounts = [
    { id: "a1", label: "Alpha", provider: "anthropic" },
    { id: "a2", label: "Alpha2", provider: "anthropic" },
    { id: "b1", label: "Beta", provider: "opencode" },
    { id: "b2", label: "Beta2", provider: "opencode" },
  ] as AccountConfig[];

  it("returns accounts with same provider, excluding active", () => {
    const peers = filterPeers(accounts, accounts[0]);
    expect(peers).toHaveLength(1);
    expect(peers[0].id).toBe("a2");
  });

  it("returns empty when no peers", () => {
    const peers = filterPeers([accounts[0], accounts[2]], accounts[0]);
    // a1=anthropic, b1=opencode → no other anthropic
    expect(peers).toHaveLength(0);
  });

  it("returns empty when only one account exists", () => {
    const peers = filterPeers([accounts[0]], accounts[0]);
    expect(peers).toHaveLength(0);
  });

  it("handles piAuth accounts (auth provider differs from account provider)", () => {
    const piAuthAccounts = [
      { id: "a1", label: "Alpha", provider: "github-copilot", piAuth: { provider: "anthropic", entry: { type: "api_key" as const, key: "sk-1" } } },
      { id: "a2", label: "Alpha2", provider: "github-copilot", piAuth: { provider: "anthropic", entry: { type: "api_key" as const, key: "sk-2" } } },
      { id: "b1", label: "Beta", provider: "opencode" },
    ] as AccountConfig[];

    const peers = filterPeers(piAuthAccounts, piAuthAccounts[0]);
    expect(peers).toHaveLength(1);
    expect(peers[0].id).toBe("a2");
  });
});
