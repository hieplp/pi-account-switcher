import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { describe, expect, it, beforeAll, vi } from "vitest";
import AccountSwitcherRuntime from "./account-switcher-runtime";
import { useAccountService } from "@/services";
import type { AccountSwitcherContext } from "@/types";

/** Build a minimal mock of AccountSwitcherContext for testing init(). */
function mockCtx(overrides: {
  cwd?: string;
  sessionFile?: string;
}): AccountSwitcherContext {
  const authStorage = { set: () => {}, reload: () => {}, setRuntimeApiKey: () => {}, removeRuntimeApiKey: () => {}, get: () => undefined };
  return {
    cwd: overrides.cwd ?? homedir(),
    hasUI: false,
    ui: {
      notify: () => {},
      setStatus: () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      select: async () => undefined,
      confirm: async () => false,
      input: async () => undefined,
      onTerminalInput: () => () => {},
    } as any,
    modelRegistry: { authStorage, find: () => undefined } as any,
    model: undefined,
    sessionManager:
      overrides.sessionFile !== undefined
        ? ({ getSessionFile: () => overrides.sessionFile } as any)
        : undefined,
  } as any;
}

describe("AccountSwitcherRuntime", () => {
  describe("init cascade", () => {
    it("uses session state when it exists (beats dir matching)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "personal",
        label: "Personal",
        provider: "opencode",
        dirs: ["/home/user/my-project"],
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.addAccount({
        id: "pxs",
        label: "PXS",
        provider: "opencode",
        dirs: ["/home/user/work-project"],
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.setDefaultAccountId("pxs");

      const { createHash } = await import("node:crypto");
      const sessionKey = createHash("sha256").update("session-mysession").digest("hex").slice(0, 12);
      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession(sessionKey, { activeAccountId: "pxs" });

      const pi = { registerProvider: () => {}, setModel: async () => true };
      const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
      const ctx = mockCtx({ cwd: "/home/user/my-project", sessionFile: "session-mysession" });
      await runtime.init(ctx);

      expect(runtime.getActiveAccount()?.id).toBe("pxs");
    });

    it("uses dir-matched account when no session state (dirs beat defaultAccountId)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "personal",
        label: "Personal",
        provider: "opencode",
        dirs: ["/home/user/my-project"],
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.addAccount({
        id: "pxs",
        label: "PXS",
        provider: "opencode",
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.setDefaultAccountId("pxs");

      const pi = { registerProvider: () => {}, setModel: async () => true };
      const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
      const ctx = mockCtx({ cwd: "/home/user/my-project" });
      await runtime.init(ctx);

      expect(runtime.getActiveAccount()?.id).toBe("personal");
    });

    it("falls back to defaultAccountId when no session state and no dir match", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "personal",
        label: "Personal",
        provider: "opencode",
        dirs: ["/home/user/my-project"],
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.addAccount({
        id: "pxs",
        label: "PXS",
        provider: "opencode",
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.setDefaultAccountId("pxs");

      const pi = { registerProvider: () => {}, setModel: async () => true };
      const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
      const ctx = mockCtx({});
      await runtime.init(ctx);

      expect(runtime.getActiveAccount()?.id).toBe("pxs");
    });

    it("leaves no active account when cascade exhausts all options", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "orphan",
        label: "Orphan",
        provider: "opencode",
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-i" } },
      });

      const pi = { registerProvider: () => {}, setModel: async () => true };
      const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
      const ctx = mockCtx({});
      await runtime.init(ctx);

      expect(runtime.getActiveAccount()).toBeUndefined();
    });

    it("env var (cascade step 0) activates matching account", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "work", label: "Work", provider: "anthropic",
        piAuth: { provider: "anthropic", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.addAccount({
        id: "personal", label: "Personal", provider: "opencode",
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });

      const oldEnv = process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
      process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = "personal";
      try {
        const pi = { registerProvider: () => {}, setModel: async () => true };
        const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
        const ctx = mockCtx({});
        await runtime.init(ctx);
        expect(runtime.getActiveAccount()?.id).toBe("personal");
      } finally {
        if (oldEnv === undefined) delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
        else process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = oldEnv;
      }
    });

    it("env var (cascade step 0) beats session state", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "env-acc", label: "Env", provider: "anthropic",
        piAuth: { provider: "anthropic", entry: { type: "api_key", key: "sk" } },
      });
      await setup.addAccount({
        id: "session-acc", label: "Session", provider: "opencode",
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk" } },
      });

      const { createHash } = await import("node:crypto");
      const sessionKey = createHash("sha256").update("session-beta").digest("hex").slice(0, 12);
      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession(sessionKey, { activeAccountId: "session-acc" });

      const oldEnv = process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
      process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = "env-acc";
      try {
        const pi = { registerProvider: () => {}, setModel: async () => true };
        const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
        const ctx = mockCtx({ cwd: "/somewhere", sessionFile: "session-beta" });
        await runtime.init(ctx);
        expect(runtime.getActiveAccount()?.id).toBe("env-acc");
      } finally {
        if (oldEnv === undefined) delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
        else process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = oldEnv;
      }
    });

    it("env var (cascade step 0) falls through when account does not exist", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "real-acc", label: "Real", provider: "anthropic",
        piAuth: { provider: "anthropic", entry: { type: "api_key", key: "sk" } },
      });
      await setup.setDefaultAccountId("real-acc");

      const oldEnv = process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
      process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = "ghost-acc";
      try {
        const pi = { registerProvider: () => {}, setModel: async () => true };
        const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
        const ctx = mockCtx({});
        await runtime.init(ctx);
        expect(runtime.getActiveAccount()?.id).toBe("real-acc");
      } finally {
        if (oldEnv === undefined) delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
        else process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = oldEnv;
      }
    });

    it("persists session state after init so subsequent init uses it directly", async () => {
      const dir = await mkdtemp(join(tmpdir(), "runtime-cascade-"));
      const accPath = join(dir, "accounts.json");
      const provPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accPath, statePath);
      await setup.addAccount({
        id: "personal",
        label: "Personal",
        provider: "opencode",
        dirs: ["/home/user/my-project"],
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-test" } },
      });
      await setup.addAccount({
        id: "pxs",
        label: "PXS",
        provider: "opencode",
        piAuth: { provider: "opencode", entry: { type: "api_key", key: "sk-t" } },
      });
      await setup.setDefaultAccountId("pxs");

      const pi = { registerProvider: () => {}, setModel: async () => true };
      const runtime = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
      const ctx1 = mockCtx({ cwd: "/home/user/my-project", sessionFile: "session-alpha" });
      await runtime.init(ctx1);
      expect(runtime.getActiveAccount()?.id).toBe("personal");

      const runtime2 = new AccountSwitcherRuntime(pi, { accounts: accPath, providers: provPath, state: statePath });
      const ctx2 = mockCtx({ cwd: "/somewhere/else", sessionFile: "session-alpha" });
      await runtime2.init(ctx2);

      expect(runtime2.getActiveAccount()?.id).toBe("personal");
    });
  });

  describe("onModelSelect", () => {
    it("does not switch when both accounts share the same provider", async () => {
      const dir = await mkdtemp(join(tmpdir(), "as-oms-"));
      const accountsPath = join(dir, "accounts.json");
      const providersPath = join(dir, "providers.json");
      const statePath = join(dir, "state.json");

      const accountService = useAccountService(accountsPath, statePath);
      await accountService.addAccount({
        id: "alice",
        label: "alice",
        provider: "opencode-go",
        env: { KEY: { type: "literal" as const, value: "alice" } },
      });
      await accountService.addAccount({
        id: "bob",
        label: "bob",
        provider: "opencode-go",
        env: { KEY: { type: "literal" as const, value: "bob" } },
      });
      await accountService.load();

      const pi = { registerProvider: vi.fn(), setModel: vi.fn().mockResolvedValue(true) };
      const runtime = new AccountSwitcherRuntime(pi as never, { accounts: accountsPath, providers: providersPath, state: statePath });
      const bobCtx = { ...mockCtx({}), model: { provider: "opencode-go" as const, id: "dummy", name: "dummy", api: "opencode", baseUrl: "https://api.opencode.ai", reasoning: false, input: ["text" as const], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 } };
      await runtime.load();
      await runtime.activateAccount({ id: "bob", label: "bob", provider: "opencode-go", env: { KEY: { type: "literal" as const, value: "bob" } } }, bobCtx);

      expect(runtime.getActiveAccount()?.id).toBe("bob");

      await runtime.onModelSelect("opencode-go", mockCtx({}));

      expect(runtime.getActiveAccount()?.id).toBe("bob");
    });
  });
});
