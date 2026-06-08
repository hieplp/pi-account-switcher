import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { useStateStore } from "./state";

describe("StateStore", () => {
  describe("session-scoped state", () => {
    it("stores and loads state per session key", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");
      const store = useStateStore(path);

      await store.saveSession("session-a", { activeAccountId: "alice" });
      await store.saveSession("session-b", { activeAccountId: "bob" });

      const a = await store.loadSession("session-a");
      expect(a.activeAccountId).toBe("alice");

      const b = await store.loadSession("session-b");
      expect(b.activeAccountId).toBe("bob");
    });

    it("returns empty object for unknown session key", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");
      const store = useStateStore(path);

      const state = await store.loadSession("nonexistent");
      expect(state.activeAccountId).toBeUndefined();
      expect(state.activeModelId).toBeUndefined();
    });

    it("isolates writes to different session keys", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");
      const store = useStateStore(path);

      // Overwrite session-b without touching session-a
      await store.saveSession("session-a", { activeAccountId: "alice" });
      await store.saveSession("session-b", { activeAccountId: "bob" });
      await store.saveSession("session-b", { activeAccountId: "bob-v2", activeModelId: "claude" });

      expect((await store.loadSession("session-a")).activeAccountId).toBe("alice");
      expect((await store.loadSession("session-b")).activeAccountId).toBe("bob-v2");
    });

    it("persists across store instances", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");

      const storeA = useStateStore(path);
      await storeA.saveSession("persist-test", { activeAccountId: "persisted" });

      const storeB = useStateStore(path);
      expect((await storeB.loadSession("persist-test")).activeAccountId).toBe("persisted");
    });
  });

  describe("legacy migration", () => {
    it("migrates flat state.json on load", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");

      // Write old-style flat format
      await writeFile(path, JSON.stringify({ activeAccountId: "legacy-user", activeModelId: "gpt-4", activeModelProvider: "openai" }));

      const store = useStateStore(path);
      const appState = await store.load();

      // Should be migrated to session-keyed format under "default"
      expect(appState.sessions.default?.activeAccountId).toBe("legacy-user");
      expect(appState.sessions.default?.activeModelId).toBe("gpt-4");
      expect(appState.sessions.default?.activeModelProvider).toBe("openai");
    });

    it("loadSession reads migrated legacy state as 'default'", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");

      await writeFile(path, JSON.stringify({ activeAccountId: "legacy-user" }));

      const store = useStateStore(path);
      const state = await store.loadSession("default");
      expect(state.activeAccountId).toBe("legacy-user");
    });

    it("preserves new format alongside migrated legacy (no double migration)", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "state.json");

      // First write old style, trigger migration
      await writeFile(path, JSON.stringify({ activeAccountId: "legacy" }));
      const store = useStateStore(path);
      await store.load(); // triggers migration read

      // Now write a new session — should keep "default" from migration
      await store.saveSession("my-session", { activeAccountId: "new-session" });
      const raw = JSON.parse(await readFile(path, "utf8"));

      expect(raw.sessions.default.activeAccountId).toBe("legacy");
      expect(raw.sessions["my-session"].activeAccountId).toBe("new-session");
    });
  });

  describe("empty / missing file", () => {
    it("returns empty sessions when file does not exist", async () => {
      const dir = await mkdtemp(join(tmpdir(), "account-switcher-"));
      const path = join(dir, "nonexistent.json");
      const store = useStateStore(path);

      const appState = await store.load();
      expect(appState.sessions).toEqual({});

      const sessionState = await store.loadSession("anything");
      expect(sessionState.activeAccountId).toBeUndefined();
    });
  });
});
