import { describe, expect, it, vi } from "vitest";
import { credentialUtil } from "./credentials";
import type { PiAuthEntry } from "../types/accounts";

const entry: PiAuthEntry = { type: "oauth", refresh: "r", access: "a", expires: 1 };

describe("credentialUtil.resolve", () => {
  it("returns undefined when no store is exposed", () => {
    expect(credentialUtil.resolve(undefined)).toBeUndefined();
    expect(credentialUtil.resolve({} as never)).toBeUndefined();
  });

  it("prefers the runtime credential store on Pi 0.80.8+", async () => {
    const modify = vi.fn();
    const credentials = credentialUtil.resolve({ runtime: { credentials: { modify } } } as never);

    await credentialUtil.set(credentials, "anthropic", entry);

    expect(modify).toHaveBeenCalledTimes(1);
    expect(modify.mock.calls[0][0]).toBe("anthropic");
  });

  it("adapts the legacy authStorage on Pi before 0.80.8", async () => {
    const legacy = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      remove: vi.fn(),
      reload: vi.fn(),
      setRuntimeApiKey: vi.fn(),
      removeRuntimeApiKey: vi.fn(),
    };
    const credentials = credentialUtil.resolve({ authStorage: legacy } as never);

    await credentialUtil.set(credentials, "anthropic", entry);
    expect(legacy.set).toHaveBeenCalledWith("anthropic", entry);
    expect(legacy.reload).toHaveBeenCalledTimes(1);

    await credentials?.delete("anthropic");
    expect(legacy.remove).toHaveBeenCalledWith("anthropic");
    expect(legacy.reload).toHaveBeenCalledTimes(2);

    credentials?.setRuntimeApiKey("anthropic", "key");
    expect(legacy.setRuntimeApiKey).toHaveBeenCalledWith("anthropic", "key");

    credentials?.removeRuntimeApiKey("anthropic");
    expect(legacy.removeRuntimeApiKey).toHaveBeenCalledWith("anthropic");
  });

  it("reads through the legacy store", async () => {
    const legacy = { get: vi.fn(() => entry), set: vi.fn(), remove: vi.fn(), reload: vi.fn() };
    const credentials = credentialUtil.resolve({ authStorage: legacy } as never);

    await expect(credentials?.read("anthropic")).resolves.toBe(entry);
  });
});
