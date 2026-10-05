import type { Credential } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

type LegacyAuthStorage = {
  has?(provider: string): boolean;
  get?(provider: string): Credential | undefined;
  set(provider: string, entry: Credential): void;
  remove?(provider: string): void;
  reload?(): void;
  setRuntimeApiKey?(provider: string, apiKey: string): void;
  removeRuntimeApiKey?(provider: string): void;
};

type RuntimeCredentialStore = {
  // Pi 1.0.2 has no public override snapshot API; keep this compatibility boundary here.
  read?(provider: string): Promise<Credential | undefined>;
  store?: RuntimeCredentialStore;
  overrides?: Map<string, string>;
  modify?(provider: string, update: () => Promise<Credential | undefined>): Promise<Credential | undefined>;
  delete?(provider: string): Promise<void>;
};

type CompatibleModelRuntime = {
  credentials?: RuntimeCredentialStore;
  refresh?(): Promise<unknown>;
  setRuntimeApiKey?(provider: string, apiKey: string): Promise<void>;
  removeRuntimeApiKey?(provider: string): Promise<void>;
};

type CompatibleModelRegistry = {
  authStorage?: LegacyAuthStorage;
  /**
   * Pi 1.0.2 ModelRegistry compatibility boundary.
   *
   * Pi exposes public request/auth helpers but no extension snapshot API for the
   * stored/runtime credential layers. Keep version-specific access isolated here;
   * acceptance tests exercise the exact host implementation offline.
   */
  runtime?: CompatibleModelRuntime;
};

export type StoredCredentialSnapshot =
  | { hadCredential: true; credential: Credential }
  | { hadCredential: false; credential?: undefined };

export const piCredentialUtil = {
  /** Snapshot both layers: effective read() alone hides stored OAuth behind runtime keys. */
  async snapshotContext(modelRegistry: ModelRegistry | undefined, providers: string[]): Promise<() => Promise<void>> {
    if (!modelRegistry) return async () => {};
    const runtime = (modelRegistry as unknown as CompatibleModelRegistry).runtime;
    const credentials = runtime?.credentials;
    if (!credentials?.store || !credentials.overrides) {
      throw new Error("Pi 1.0.2 credential snapshot API is unavailable");
    }
    const store = credentials.store;
    const snapshots = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        stored: await store.read?.(provider),
        key: credentials.overrides?.get(provider),
      })),
    );
    return async () => {
      const errors: unknown[] = [];
      for (const { provider, stored, key } of snapshots) {
        try {
          if (stored) await store.modify?.(provider, async () => stored);
          else await store.delete?.(provider);
        } catch (error) {
          errors.push(error);
        }
        try {
          if (key === undefined) await this.removeRuntimeApiKey(modelRegistry, provider);
          else await this.setRuntimeApiKey(modelRegistry, provider, key);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Credential restoration failed");
    };
  },

  snapshotRuntimeApiKey(modelRegistry: ModelRegistry, provider: string): string | undefined {
    const compatible = modelRegistry as unknown as CompatibleModelRegistry;
    const overrides = compatible.runtime?.credentials?.overrides;
    if (!overrides) throw new Error("This Pi version does not expose runtime API-key snapshots");
    return overrides.get(provider);
  },

  async setStoredCredential(
    modelRegistry: ModelRegistry | undefined,
    provider: string,
    credential: Credential,
  ): Promise<void> {
    if (!modelRegistry) return;
    const compatible = modelRegistry as unknown as CompatibleModelRegistry;

    // Pi <=0.74 exposed AuthStorage directly on ModelRegistry.
    if (compatible.authStorage) {
      compatible.authStorage.set(provider, credential);
      compatible.authStorage.reload?.();
      return;
    }

    const runtime = compatible.runtime;
    if (runtime?.credentials?.modify) {
      await runtime.credentials.modify(provider, async () => credential);
      await runtime.refresh?.();
      return;
    }

    throw new Error("This Pi version does not expose a compatible credential store");
  },

  async snapshotStoredCredential(modelRegistry: ModelRegistry, provider: string): Promise<StoredCredentialSnapshot> {
    const compatible = modelRegistry as unknown as CompatibleModelRegistry;

    if (compatible.authStorage?.get) {
      const credential = compatible.authStorage.get(provider);
      return compatible.authStorage.has?.(provider) || credential
        ? { hadCredential: true, credential: credential as Credential }
        : { hadCredential: false };
    }

    const credentials = compatible.runtime?.credentials;
    const credential = await (credentials?.store ?? credentials)?.read?.(provider);
    return credential ? { hadCredential: true, credential } : { hadCredential: false };
  },

  async removeStoredCredential(modelRegistry: ModelRegistry, provider: string): Promise<void> {
    const compatible = modelRegistry as unknown as CompatibleModelRegistry;

    if (compatible.authStorage?.remove) {
      compatible.authStorage.remove(provider);
      compatible.authStorage.reload?.();
      return;
    }

    const runtime = compatible.runtime;
    if (runtime?.credentials?.delete) {
      await runtime.credentials.delete(provider);
      await runtime.refresh?.();
      return;
    }

    throw new Error("This Pi version does not expose a compatible credential store");
  },

  async setRuntimeApiKey(modelRegistry: ModelRegistry | undefined, provider: string, apiKey: string): Promise<void> {
    if (!modelRegistry) return;
    const compatible = modelRegistry as unknown as CompatibleModelRegistry;

    if (compatible.authStorage?.setRuntimeApiKey) {
      compatible.authStorage.setRuntimeApiKey(provider, apiKey);
      return;
    }

    const setRuntimeApiKey = compatible.runtime?.setRuntimeApiKey;
    if (setRuntimeApiKey) {
      await setRuntimeApiKey.call(compatible.runtime, provider, apiKey);
      return;
    }

    throw new Error("This Pi version does not expose runtime API-key overrides");
  },

  async removeRuntimeApiKey(modelRegistry: ModelRegistry | undefined, provider: string): Promise<void> {
    if (!modelRegistry) return;
    const compatible = modelRegistry as unknown as CompatibleModelRegistry;

    if (compatible.authStorage?.removeRuntimeApiKey) {
      compatible.authStorage.removeRuntimeApiKey(provider);
      return;
    }

    const removeRuntimeApiKey = compatible.runtime?.removeRuntimeApiKey;
    if (removeRuntimeApiKey) {
      await removeRuntimeApiKey.call(compatible.runtime, provider);
    }
  },
};
