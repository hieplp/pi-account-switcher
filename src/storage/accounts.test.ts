import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { useAccountStore } from "./accounts";

describe("AccountStore", () => {
  it("persists accounts with owner-only permissions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
    const path = join(dir, "accounts.json");
    const store = useAccountStore(path);

    await store.addAccount({
      id: "work",
      label: "Work",
      provider: "anthropic",
      env: { ANTHROPIC_API_KEY: { type: "literal", value: "secret" } },
    });

    expect(await store.load()).toHaveLength(1);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("rejects duplicate account ids on add", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
    const path = join(dir, "accounts.json");
    const store = useAccountStore(path);

    await store.addAccount({ id: "work", label: "Work", provider: "anthropic", env: { KEY: "one" } });
    await expect(
      store.addAccount({ id: "work", label: "Other", provider: "openai", env: { KEY: "two" } }),
    ).rejects.toThrow(/Account already exists: work/);
  });

  it("rejects duplicate account ids on replace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
    const path = join(dir, "accounts.json");
    const store = useAccountStore(path);

    await store.addAccount({ id: "work", label: "Work", provider: "anthropic", env: { KEY: "one" } });
    await store.addAccount({ id: "personal", label: "Personal", provider: "anthropic", env: { KEY: "two" } });

    await expect(
      store.replaceAccount("work", { id: "personal", label: "Renamed", provider: "anthropic", env: { KEY: "three" } }),
    ).rejects.toThrow(/Account already exists: personal/);
  });

  describe("defaultAccountId", () => {
    it("persists and reads defaultAccountId in config", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "work",
        label: "Work",
        provider: "anthropic",
        env: { KEY: "one" },
      });
      await store.addAccount({
        id: "personal",
        label: "Personal",
        provider: "openai",
        env: { KEY: "two" },
      });

      // Set default
      await store.setDefaultAccountId("personal");
      const config = await store.loadConfig();
      expect(config.defaultAccountId).toBe("personal");

      // Reload from fresh store — defaultAccountId persists
      const store2 = useAccountStore(path);
      const config2 = await store2.loadConfig();
      expect(config2.defaultAccountId).toBe("personal");
    });

    it("accounts without defaultAccountId are valid", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "solo",
        label: "Solo",
        provider: "anthropic",
        env: { KEY: "secret" },
      });

      const config = await store.loadConfig();
      expect(config.defaultAccountId).toBeUndefined();
      expect(config.accounts).toHaveLength(1);
    });

    it("setDefaultAccountId rejects non-existent account id", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "real",
        label: "Real",
        provider: "anthropic",
        env: { KEY: "secret" },
      });

      await expect(store.setDefaultAccountId("nonexistent")).rejects.toThrow(/Account not found: nonexistent/);
    });

    it("loadConfig returns full config shape", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "test",
        label: "Test",
        provider: "anthropic",
        env: { KEY: "secret" },
      });
      await store.setDefaultAccountId("test");

      const config = await store.loadConfig();
      expect(config).toHaveProperty("accounts");
      expect(config).toHaveProperty("defaultAccountId");
      expect(config.accounts[0].id).toBe("test");
    });
  });

  describe("stateCleanupDays", () => {
    it("persists and reads stateCleanupDays in config", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "test",
        label: "Test",
        provider: "anthropic",
        env: { KEY: "secret" },
      });

      // Simulate writing stateCleanupDays to config via direct JSON manipulation
      const { readFile, writeFile } = await import("node:fs/promises");
      const raw = JSON.parse(await readFile(path, "utf8"));
      raw.stateCleanupDays = 7;
      await writeFile(path, JSON.stringify(raw));

      const config = await store.loadConfig();
      expect(config.stateCleanupDays).toBe(7);
    });

    it("defaults to 30 when stateCleanupDays is not set", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "test",
        label: "Test",
        provider: "anthropic",
        env: { KEY: "secret" },
      });

      const config = await store.loadConfig();
      expect(config.stateCleanupDays).toBe(30);
    });

    it("accepts custom values like 7 and 90", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");

      // Write config with stateCleanupDays = 90
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, JSON.stringify({
        accounts: [{
          id: "test",
          label: "Test",
          provider: "anthropic",
          env: { KEY: { type: "literal", value: "secret" } }
        }],
        stateCleanupDays: 90
      }));

      const store = useAccountStore(path);
      const config = await store.loadConfig();
      expect(config.stateCleanupDays).toBe(90);
    });

    it("persists stateCleanupDays when saving accounts", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "accounts.json");
      const store = useAccountStore(path);

      await store.addAccount({
        id: "test",
        label: "Test",
        provider: "anthropic",
        env: { KEY: "secret" },
      });

      // Write config with stateCleanupDays = 14
      const { readFile, writeFile } = await import("node:fs/promises");
      let raw = JSON.parse(await readFile(path, "utf8"));
      raw.stateCleanupDays = 14;
      await writeFile(path, JSON.stringify(raw));

      // Add another account - should preserve stateCleanupDays
      await store.addAccount({
        id: "test2",
        label: "Test2",
        provider: "openai",
        env: { KEY: "secret2" },
      });

      const config = await store.loadConfig();
      expect(config.stateCleanupDays).toBe(14);
    });
  });
});
