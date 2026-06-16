import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { useAccountService } from "./accounts";

describe("AccountService", () => {
  describe("session-scoped state", () => {
    it("isolates active account per session key", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const accounts = ["alice", "bob", "carol"].map((name) => ({
        id: name,
        label: name,
        provider: "opencode",
        env: { FOO: { type: "literal" as const, value: "bar" } },
      }));

      const setup = useAccountService(accountsPath, statePath);
      for (const account of accounts) {
        await setup.addAccount(account);
      }

      const sessionA = useAccountService(accountsPath, statePath);
      sessionA.setSessionKey("session-a");
      await sessionA.load();

      const sessionB = useAccountService(accountsPath, statePath);
      sessionB.setSessionKey("session-b");
      await sessionB.load();

      expect(sessionA.getActiveAccount()).toBeUndefined();
      expect(sessionB.getActiveAccount()).toBeUndefined();

      await sessionA.saveActiveModel("gpt-4", "opencode");

      expect(sessionA.getActiveModelState()).toEqual({ id: "gpt-4", provider: "opencode" });
      expect(sessionB.getActiveModelState()).toBeUndefined();
    });

    it("loads session-scoped activeAccountId from state", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const svc = useAccountService(accountsPath, statePath);

      await svc.addAccount({
        id: "personal",
        label: "Personal",
        provider: "opencode",
        env: { KEY: { type: "literal" as const, value: "secret" } },
      });

      svc.setSessionKey("test-session");
      await svc.load();

      const { useStateStore } = await import("../storage");
      const stateStore = useStateStore(statePath);
      await stateStore.saveSession("test-session", { activeAccountId: "personal" });

      await svc.load();
      expect(svc.getActiveAccount()?.id).toBe("personal");
    });
  });
    it("saves model state when activating account with same provider", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const svc = useAccountService(accountsPath, statePath);
      await svc.addAccount({
        id: "same-provider",
        label: "Same Provider",
        provider: "anthropic",
        env: { KEY: { type: "literal" as const, value: "secret" } },
      });

      svc.setSessionKey("test-session");
      await svc.load();

      // Simulate same-provider model: ctx.model already matches the account's provider
      await svc.saveActiveModel("claude-sonnet-4-20250514", "anthropic");

      const modelState = svc.getActiveModelState();
      expect(modelState).toEqual({ id: "claude-sonnet-4-20250514", provider: "anthropic" });
    });


  describe("dirs field on accounts", () => {
    it("accepts accounts with dirs", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const svc = useAccountService(accountsPath);

      await svc.addAccount({
        id: "work",
        label: "Work",
        provider: "opencode",
        env: { KEY: { type: "literal" as const, value: "secret" } },
        dirs: ["/home/user/Development/Work", "/home/user/Projects/Client"],
      });

      const loaded = await (await import("../storage")).useAccountStore(accountsPath).load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].dirs).toEqual(["/home/user/Development/Work", "/home/user/Projects/Client"]);
    });

    it("allows accounts without dirs", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const svc = useAccountService(accountsPath);

      await svc.addAccount({
        id: "personal",
        label: "Personal",
        provider: "opencode",
        env: { KEY: { type: "literal" as const, value: "secret" } },
      });

      const loaded = await (await import("../storage")).useAccountStore(accountsPath).load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].dirs).toBeUndefined();
    });
  });

  describe("cascade: defaultAccountId fallback (via runtime.init, not load)", () => {
    it("load() does not fall back to defaultAccountId — only session state", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const store = useAccountService(accountsPath, statePath);
      await store.addAccount({
        id: "default-user",
        label: "Default",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "secret" } },
      });
      await store.setDefaultAccountId("default-user");

      // load() now only loads session state — no fallback to defaultAccountId.
      // The full cascade (session → dirs → defaultAccountId) runs in runtime.init().
      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("fresh-session");
      await session.load();

      // No session state → no active account from load() alone
      expect(session.getActiveAccount()).toBeUndefined();
    });

    it("session state takes priority over defaultAccountId", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const store = useAccountService(accountsPath, statePath);
      await store.addAccount({
        id: "default-user",
        label: "Default",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "secret" } },
      });
      await store.addAccount({
        id: "session-user",
        label: "Session",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "secret" } },
      });
      await store.setDefaultAccountId("default-user");

      store.setSessionKey("my-session");
      await store.load();
      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("my-session", { activeAccountId: "session-user" });

      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("my-session");
      await session.load();

      expect(session.getActiveAccount()?.id).toBe("session-user");
    });

    it("no session state and no defaultAccountId leaves no active account", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const store = useAccountService(accountsPath, statePath);
      await store.addAccount({
        id: "orphan",
        label: "Orphan",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "secret" } },
      });

      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("new-session");
      await session.load();

      expect(session.getActiveAccount()).toBeUndefined();
    });
  });

  describe("always-run legacy cleanup", () => {
    it("deletes sessions.default when session has its own state and sessions.default exists", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accountsPath, statePath);
      await setup.addAccount({
        id: "legacy-user",
        label: "Legacy",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "x" } },
      });
      await setup.addAccount({
        id: "session-user",
        label: "Session",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "x" } },
      });

      const { useStateStore } = await import("../storage");
      const stateStore = useStateStore(statePath);
      await stateStore.saveSession("default", { activeAccountId: "legacy-user" });
      await stateStore.saveSession("my-session", { activeAccountId: "session-user" });

      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("my-session");
      await session.load();

      const { readFile } = await import("node:fs/promises");
      const raw = JSON.parse(await readFile(statePath, "utf8"));
      expect(Object.keys(raw.sessions)).not.toContain("default");
    });

    it("after cleanup, fresh load with new session key does NOT see sessions.default", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accountsPath, statePath);
      await setup.addAccount({
        id: "legacy-user",
        label: "Legacy",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "x" } },
      });

      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("default", { activeAccountId: "legacy-user" });

      const first = useAccountService(accountsPath, statePath);
      first.setSessionKey("session-1");
      await first.load();

      const second = useAccountService(accountsPath, statePath);
      second.setSessionKey("session-2");
      await second.load();

      const { readFile } = await import("node:fs/promises");
      const raw = JSON.parse(await readFile(statePath, "utf8"));
      expect(Object.keys(raw.sessions)).not.toContain("default");
    });

    it("no sessions.default present causes no errors and state is unchanged", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const setup = useAccountService(accountsPath, statePath);
      await setup.addAccount({
        id: "user-a",
        label: "User A",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "x" } },
      });
      await setup.addAccount({
        id: "user-b",
        label: "User B",
        provider: "opencode",
        env: { KEY: { type: "literal", value: "x" } },
      });

      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("my-session", { activeAccountId: "user-a" });

      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("my-session");
      await expect(session.load()).resolves.toBeUndefined();
      expect(session.getActiveAccount()?.id).toBe("user-a");
    });
  });

  describe("migration with deleteSession", () => {
    it("migrates defaultAccountId and cleans up sessions.default via deleteSession", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const store = useAccountService(accountsPath, statePath);
      await store.addAccount({
        id: "migrated-user",
        label: "Migrated",
        provider: "opencode",
        env: { KEY: { type: "literal" as const, value: "secret" } },
      });

      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("default", { activeAccountId: "migrated-user" });

      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("fresh-session");
      await session.load();

      expect(session.getActiveAccount()?.id).toBe("migrated-user");

      const config = await (await import("../storage")).useAccountStore(accountsPath).loadConfig();
      expect(config.defaultAccountId).toBe("migrated-user");

      const state = await useStateStore(statePath).loadSession("default");
      expect(state.activeAccountId).toBeUndefined();

      const { readFile } = await import("node:fs/promises");
      const raw = JSON.parse(await readFile(statePath, "utf8"));
      expect(Object.keys(raw.sessions)).not.toContain("default");
    });
  });

  it("deletes empty sessions.default key from previous buggy run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
    const accountsPath = join(dir, "accounts.json");
    const statePath = join(dir, "state.json");

    const store = useAccountService(accountsPath, statePath);
    await store.addAccount({
      id: "user",
      label: "User",
      provider: "opencode",
      env: { KEY: { type: "literal" as const, value: "x" } },
    });

    const { useStateStore } = await import("../storage");
    await useStateStore(statePath).saveSession("default", {});

    const session = useAccountService(accountsPath, statePath);
    session.setSessionKey("my-session");
    await expect(session.load()).resolves.toBeUndefined();

    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(statePath, "utf8"));
    expect(Object.keys(raw.sessions)).not.toContain("default");
  });

  describe("model state isolation per session", () => {
    it("each session has independent model state", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const accounts = ["a", "b", "c"].map((name) => ({
        id: name,
        label: name,
        provider: "opencode",
        env: { KEY: { type: "literal" as const, value: "bar" } },
      }));
      const setup = useAccountService(accountsPath, statePath);
      for (const account of accounts) await setup.addAccount(account);

      const sessionA = useAccountService(accountsPath, statePath);
      sessionA.setSessionKey("model-session-A");
      await sessionA.load();
      await sessionA.saveActiveModel("claude-3-5", "anthropic");

      const sessionB = useAccountService(accountsPath, statePath);
      sessionB.setSessionKey("model-session-B");
      await sessionB.load();
      await sessionB.saveActiveModel("gpt-4o", "openai");

      expect(sessionA.getActiveModelState()).toEqual({ id: "claude-3-5", provider: "anthropic" });
      expect(sessionB.getActiveModelState()).toEqual({ id: "gpt-4o", provider: "openai" });
    });
  });

  describe("stateCleanupDays wiring", () => {
    it("applies custom stateCleanupDays from config to state store", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const { writeFile } = await import("node:fs/promises");
      await writeFile(accountsPath, JSON.stringify({
        accounts: [{
          id: "test",
          label: "Test",
          provider: "anthropic",
          env: { KEY: { type: "literal", value: "secret" } }
        }],
        stateCleanupDays: 7
      }));

      const staleTimestamp = new Date(Date.now() - 60 * 86400000).toISOString();
      await writeFile(statePath, JSON.stringify({
        sessions: {
          "stale-session": { activeAccountId: "test", lastActive: staleTimestamp }
        }
      }));

      const svc = useAccountService(accountsPath, statePath);
      svc.setSessionKey("test-session");
      await svc.load();

      await svc.saveActiveModel("claude", "anthropic");

      const { readFile: rf } = await import("node:fs/promises");
      const raw = JSON.parse(await rf(statePath, "utf8"));
      expect(raw.sessions["stale-session"]).toBeUndefined();
    });

    it("defaults to 30 days when config has no stateCleanupDays", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const accountsPath = join(dir, "accounts.json");
      const statePath = join(dir, "state.json");

      const { writeFile } = await import("node:fs/promises");
      await writeFile(accountsPath, JSON.stringify({
        accounts: [{
          id: "test",
          label: "Test",
          provider: "anthropic",
          env: { KEY: { type: "literal", value: "secret" } }
        }]
      }));

      const recentTimestamp = new Date(Date.now() - 20 * 86400000).toISOString();
      await writeFile(statePath, JSON.stringify({
        sessions: {
          "20-day-old-session": { activeAccountId: "test", lastActive: recentTimestamp }
        }
      }));

      const svc = useAccountService(accountsPath, statePath);
      svc.setSessionKey("test-session");
      await svc.load();

      await svc.saveActiveModel("claude-2", "anthropic");

      const { readFile: rf } = await import("node:fs/promises");
      const raw = JSON.parse(await rf(statePath, "utf8"));
      expect(raw.sessions["20-day-old-session"]).toBeDefined();
    });
  });
});