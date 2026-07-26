import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { PiAuthEntry } from "../types/accounts";

/**
 * The subset of Pi's credential store this extension uses.
 *
 * Pi 0.80.8 removed `ModelRegistry.authStorage` and stopped exporting
 * `AuthStorage`. The live store is reachable through the model runtime instead,
 * but it is not part of Pi's public extension surface, so it is resolved
 * structurally rather than imported: that keeps this package compiling against
 * its declared peer range while working on current Pi, and lets each call site
 * degrade to a no-op instead of throwing when the shape changes again.
 *
 * Pi before 0.80.8 is still supported through `fromLegacy`, so this package
 * works either side of that break.
 */
export interface CredentialStoreLike {
  read(providerId: string): Promise<PiAuthEntry | undefined>;
  modify(
    providerId: string,
    fn: (current: PiAuthEntry | undefined) => Promise<PiAuthEntry | undefined>,
  ): Promise<PiAuthEntry | undefined>;
  delete(providerId: string): Promise<void>;
  setRuntimeApiKey(providerId: string, apiKey: string): void;
  removeRuntimeApiKey(providerId: string): void;
}

/** The `ModelRegistry.authStorage` surface Pi exposed before 0.80.8. */
interface LegacyAuthStorage {
  get(providerId: string): PiAuthEntry | undefined;
  set(providerId: string, entry: PiAuthEntry): void;
  remove(providerId: string): void;
  reload(): void;
  setRuntimeApiKey(providerId: string, apiKey: string): void;
  removeRuntimeApiKey(providerId: string): void;
}

/** Adapt the pre-0.80.8 synchronous store, preserving its explicit reload calls. */
const fromLegacy = (legacy: LegacyAuthStorage): CredentialStoreLike => ({
  read: async (providerId) => legacy.get(providerId),
  modify: async (providerId, fn) => {
    const next = await fn(legacy.get(providerId));
    if (next) {
      legacy.set(providerId, next);
      legacy.reload();
    }
    return next;
  },
  delete: async (providerId) => {
    legacy.remove(providerId);
    legacy.reload();
  },
  setRuntimeApiKey: (providerId, apiKey) => legacy.setRuntimeApiKey(providerId, apiKey),
  removeRuntimeApiKey: (providerId) => legacy.removeRuntimeApiKey(providerId),
});

export const credentialUtil = {
  /** Resolve the live credential store, or undefined when Pi does not expose one. */
  resolve: (modelRegistry?: ModelRegistry): CredentialStoreLike | undefined => {
    const registry = modelRegistry as unknown as
      | { runtime?: { credentials?: Partial<CredentialStoreLike> }; authStorage?: Partial<LegacyAuthStorage> }
      | undefined;
    const credentials = registry?.runtime?.credentials;
    if (typeof credentials?.modify === "function") return credentials as CredentialStoreLike;
    const legacy = registry?.authStorage;
    if (typeof legacy?.set === "function") return fromLegacy(legacy as LegacyAuthStorage);
    return undefined;
  },

  /** Persist a credential for a provider, replacing the removed `authStorage.set`. */
  set: async (credentials: CredentialStoreLike | undefined, providerId: string, entry: PiAuthEntry): Promise<void> => {
    await credentials?.modify(providerId, async () => entry);
  },
};
