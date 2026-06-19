import { describe, expect, it, vi } from "vitest";
import { usePiAuthStore, isOAuthEntry } from "./pi-auth";
import { readFile } from "node:fs/promises";
import type { PiAuthEntry } from "../types";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));
vi.mock("@/constants", () => ({
  PI_AUTH_PATH: "/mock/auth.json",
}));

const oauthEntry: PiAuthEntry = {
  type: "oauth",
  refresh: "rtoken",
  access: "atoken",
  expires: 9999999999,
};

const apiKeyEntry: PiAuthEntry = {
  type: "api_key",
  key: "sk-xxx",
};

describe("PiAuthStore.getEntry", () => {
  it("returns entry for known provider", async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ anthropic: oauthEntry }));
    const store = usePiAuthStore("/mock/auth.json");
    const result = await store.getEntry("anthropic");
    expect(result).toEqual(oauthEntry);
  });

  it("returns undefined for missing provider", async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ anthropic: oauthEntry }));
    const store = usePiAuthStore("/mock/auth.json");
    const result = await store.getEntry("openai");
    expect(result).toBeUndefined();
  });

  it("returns undefined when auth file does not exist", async () => {
    vi.mocked(readFile).mockRejectedValue({ code: "ENOENT" });
    const store = usePiAuthStore("/nonexistent.json");
    const result = await store.getEntry("anthropic");
    expect(result).toBeUndefined();
  });

  it("throws on non-ENOENT errors", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("permission denied"));
    const store = usePiAuthStore("/bad-perms.json");
    await expect(store.getEntry("anthropic")).rejects.toThrow("permission denied");
  });
});

describe("isOAuthEntry", () => {
  it("returns true for oauth type entry", () => {
    expect(isOAuthEntry(oauthEntry)).toBe(true);
  });

  it("returns false for api_key type entry", () => {
    expect(isOAuthEntry(apiKeyEntry)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isOAuthEntry(undefined)).toBe(false);
  });
});
