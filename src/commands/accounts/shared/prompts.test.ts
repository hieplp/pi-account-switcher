import { describe, expect, it, vi } from "vitest";
import { AccountConfigBuilder } from "./prompts";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { PiAuthEntry } from "../../../types";

function mockUi(overrides?: Partial<ExtensionUIContext>): ExtensionUIContext {
  return {
    input: vi.fn(),
    select: vi.fn().mockResolvedValue(undefined),
    filteredSelect: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(false),
    notify: vi.fn(),
    list: vi.fn(),
    spinner: vi.fn(),
    ...overrides,
  } as unknown as ExtensionUIContext;
}

describe("AccountConfigBuilder", () => {
  describe("withId", () => {
    it("auto-generates ID from label in add mode", async () => {
      const ui = mockUi();
      const builder = new AccountConfigBuilder(ui, [], []);
      // Simulate label being set (as withLabel would do)
      builder["config"] = { label: "Claude — Work", provider: "anthropic" };

      await builder.withId();

      const result = builder["config"];
      expect(result.id).toBe("claude-work");
      // Should NOT have called the prompt
      expect(ui.input).not.toHaveBeenCalled();
    });

    it("does not overwrite existing id in edit mode", async () => {
      const ui = mockUi();
      const builder = new AccountConfigBuilder(ui, [], []);
      builder["config"] = { id: "claude-personal", label: "Claude — Personal", provider: "anthropic" };

      await builder.withId();

      expect(builder["config"].id).toBe("claude-personal");
      expect(ui.input).not.toHaveBeenCalled();
    });

    it("falls back to prompt when label produces empty slug", async () => {
      const ui = mockUi({ ...mockUi(), input: vi.fn().mockResolvedValue("fallback-id") });
      const builder = new AccountConfigBuilder(ui, [], []);
      builder["config"] = { label: "!!!", provider: "anthropic" };

      await builder.withId();

      expect(builder["config"].id).toBe("fallback-id");
    });
  });

  describe("withCredentials OAuth", () => {
    it("calls getOAuthEntry for OAuth-capable providers", async () => {
      const getOAuthEntry = vi.fn<(_: string) => Promise<PiAuthEntry | undefined>>();
      const ui = mockUi({
        select: vi.fn().mockResolvedValue("anthropic"),
        confirm: vi.fn().mockResolvedValue(true),
      });
      const builder = new AccountConfigBuilder(ui, [], [], getOAuthEntry);
      builder["config"] = { provider: "anthropic" };

      await builder.withCredentials();

      expect(getOAuthEntry).toHaveBeenCalledWith("anthropic");
    });

    it("sets piAuth with full entry when OAuth is accepted", async () => {
      const mockEntry: PiAuthEntry = {
        type: "oauth",
        refresh: "test-refresh",
        access: "test-access",
        expires: 9999999999,
      };
      const getOAuthEntry = vi.fn<(_: string) => Promise<PiAuthEntry | undefined>>().mockResolvedValue(mockEntry);
      const ui = mockUi({
        select: vi.fn().mockResolvedValue("anthropic"),
        confirm: vi.fn().mockResolvedValue(true),
      });
      const builder = new AccountConfigBuilder(ui, [], [], getOAuthEntry);
      builder["config"] = { provider: "anthropic" };

      await builder.withCredentials();

      expect(builder["config"].piAuth).toEqual({ provider: "anthropic", entry: mockEntry });
    });
  });
});
