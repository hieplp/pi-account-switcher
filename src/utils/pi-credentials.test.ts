import { expect, it } from "vitest";
import { piCredentialUtil } from "./pi-credentials";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

it("restores the independent runtime key even when stored credential recovery fails", async () => {
  const overrides = new Map([["openai", "parent"]]);
  const registry = {
    runtime: {
      credentials: {
        overrides,
        store: {
          read: async () => ({ type: "api_key", key: "stored" }),
          modify: async () => {
            throw new Error("store unavailable");
          },
        },
      },
      setRuntimeApiKey: async (id: string, key: string) => {
        overrides.set(id, key);
      },
    },
  } as unknown as ModelRegistry;
  const restore = await piCredentialUtil.snapshotContext(registry, ["openai"]);
  overrides.set("openai", "target");
  await expect(restore()).rejects.toThrow("Credential restoration failed");
  expect(piCredentialUtil.snapshotRuntimeApiKey(registry, "openai")).toBe("parent");
});
