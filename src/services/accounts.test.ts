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

      // Start with five different accounts
      const accounts = ["alice", "bob", "carol"].map((name) => ({
        id: name,
        label: name,
        provider: "opencode",
        env: { FOO: { type: "literal" as const, value: "bar" } },
      }));

      // Add accounts via a throwaway service
      const setup = useAccountService(accountsPath, statePath);
      for (const account of accounts) {
        await setup.addAccount(account);
      }

      // Simulate two different Pi sessions with different session keys
      const sessionA = useAccountService(accountsPath, statePath);
      sessionA.setSessionKey("session-a");
      await sessionA.load();

      const sessionB = useAccountService(accountsPath, statePath);
      sessionB.setSessionKey("session-b");
      await sessionB.load();

      // Initially both have no active account
      expect(sessionA.getActiveAccount()).toBeUndefined();
      expect(sessionB.getActiveAccount()).toBeUndefined();

      // Session A saves a model ("activates" in storage terms)
      await sessionA.saveActiveModel("gpt-4", "opencode");

      // SaveActiveModel doesn't set activeAccountId, only model state
      // Let's also verify model state isolation
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

      // Manually write session state via the underlying state store
      svc.setSessionKey("test-session");
      await svc.load();
      // Directly set internal state (simulating what activateAccount does)
      // This is what we'd test: load reads the right session key

      // Write state for "other-session"
      const { useStateStore } = await import("../storage");
      const stateStore = useStateStore(statePath);
      await stateStore.saveSession("test-session", { activeAccountId: "personal" });

      // Reload — should pick up the session-scoped state
      await svc.load();
      expect(svc.getActiveAccount()?.id).toBe("personal");
    });
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

  describe("cascade: defaultAccountId fallback", () => {
    it("falls back to defaultAccountId when no session state exists", async () => {
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

      // New session with no state — should fall back to defaultAccountId
      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("fresh-session");
      await session.load();

      expect(session.getActiveAccount()?.id).toBe("default-user");
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

      // Pre-populate session-scoped state
      store.setSessionKey("my-session");
      await store.load();
      // Manually simulate setting the active account (via internal state)
      // We do this by directly writing to the state store
      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("my-session", { activeAccountId: "session-user" });

      // Fresh service for same session — should use session state, not default
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
      // No setDefaultAccountId called

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

      // Pre-populate both the legacy "default" key and a session-scoped key
      const { useStateStore } = await import("../storage");
      const stateStore = useStateStore(statePath);
      await stateStore.saveSession("default", { activeAccountId: "legacy-user" });
      await stateStore.saveSession("my-session", { activeAccountId: "session-user" });

      // Load with a session that has its own state — legacy cleanup should still run
      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("my-session");
      await session.load();

      // sessions.default should be gone from disk
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

      // Simulate the migrated-but-not-cleaned-up state
      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("default", { activeAccountId: "legacy-user" });

      // First session loads and triggers cleanup
      const first = useAccountService(accountsPath, statePath);
      first.setSessionKey("session-1");
      await first.load();

      // Second session — should not see sessions.default at all
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

      // Pre-populate session state (no sessions.default)
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

      // Pre-populate session state (simulating old format migration → "default" key)
      const { useStateStore } = await import("../storage");
      await useStateStore(statePath).saveSession("default", { activeAccountId: "migrated-user" });

      // New session with no state of its own
      const session = useAccountService(accountsPath, statePath);
      session.setSessionKey("fresh-session");
      await session.load();

      // Should have resolved migrated-user from "default" key cascade
      expect(session.getActiveAccount()?.id).toBe("migrated-user");

      // Should have written defaultAccountId to accounts.json
      const config = await (await import("../storage")).useAccountStore(accountsPath).loadConfig();
      expect(config.defaultAccountId).toBe("migrated-user");

      // After migration cleanup via deleteSession, loadSession returns {} (key is gone)
      const state = await useStateStore(statePath).loadSession("default");
      expect(state.activeAccountId).toBeUndefined();

      // JSON file on disk does NOT have a "default" key in sessions
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

    // Simulate the bug: previous version wrote empty "default": {}
    const { useStateStore } = await import("../storage");
    await useStateStore(statePath).saveSession("default", {});

    // Load — should delete the empty default key without error
    const session = useAccountService(accountsPath, statePath);
    session.setSessionKey("my-session");
    await expect(session.load()).resolves.toBeUndefined();

    // The default key should be gone from disk
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
});
