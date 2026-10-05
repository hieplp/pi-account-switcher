import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ProviderStore, useProviderStore } from "../storage";
import type { ProviderConfig, ProviderModelConfig } from "../types";
import { commonUtil } from "../utils";

export interface ProviderService {
  load(): Promise<void>;
  getProviders(): ProviderConfig[];
  addProvider(provider: ProviderConfig): Promise<void>;
  editProvider(original: ProviderConfig, updated: ProviderConfig): Promise<void>;
  removeProvider(provider: ProviderConfig): Promise<void>;
  registerProviders(providers: ProviderConfig[]): void;
  registerProvider(provider: ProviderConfig): void;
  /** Restore host registration and service bookkeeping, honoring successful catalog edits. */
  snapshotRegistration(id: string): () => void;
}

export function useProviderService(pi: ExtensionAPI, path: string): ProviderService {
  return new ProviderServiceImpl(pi, useProviderStore(path));
}

// ===============================================================================================
// Provider Service
// ===============================================================================================

class ProviderServiceImpl implements ProviderService {
  private providers: ProviderConfig[] = [];
  private readonly registered = new Map<string, ProviderConfig>();

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly store: ProviderStore,
  ) {}

  async load(): Promise<void> {
    const providers = await this.store.load();
    await this.withRestoration(() => this.reconcile(providers, this.providers));
    this.providers = providers;
  }

  getProviders(): ProviderConfig[] {
    return this.providers;
  }

  async addProvider(provider: ProviderConfig): Promise<void> {
    if (this.providers.some((p) => p.id === provider.id)) {
      throw new Error(`Provider already exists: ${provider.id}`);
    }
    await this.commit([...this.providers, provider]);
  }

  async editProvider(original: ProviderConfig, updated: ProviderConfig): Promise<void> {
    const index = this.providers.findIndex((p) => p.id === original.id);
    if (index === -1) throw new Error(`Provider not found: ${original.id}`);
    if (updated.id !== original.id && this.providers.some((p) => p.id === updated.id)) {
      throw new Error(`Provider already exists: ${updated.id}`);
    }
    const providers = [...this.providers];
    providers[index] = updated;
    await this.commit(providers);
  }

  async removeProvider(provider: ProviderConfig): Promise<void> {
    const index = this.providers.findIndex((p) => p.id === provider.id);
    if (index === -1) throw new Error(`Provider not found: ${provider.id}`);
    await this.commit(this.providers.filter((p) => p.id !== provider.id));
  }

  registerProviders(providers: ProviderConfig[]): void {
    providers.forEach((provider) => this.registerProvider(provider));
  }

  registerProvider(provider: ProviderConfig): void {
    const config = this.toPiProvider(provider);
    if (!config) {
      this.unregister(provider.id);
      return;
    }
    // Track attempted mutations too: Pi may reject after changing its catalog.
    this.registered.set(provider.id, provider);
    this.pi.registerProvider(provider.id, config as Parameters<ExtensionAPI["registerProvider"]>[1]);
  }

  snapshotRegistration(id: string): () => void {
    // This snapshot owns both the host mutation and `registered` bookkeeping.
    // Restoring only the host leaves rejected account keys available to reconciliation.
    // The catalog belongs to this service, so an account snapshot must never
    // resurrect a definition superseded by a successful live edit or removal.
    const baseline = this.registered.get(id);
    const catalog = JSON.stringify(this.providers.find((provider) => provider.id === id));
    return () => {
      const current = this.providers.find((provider) => provider.id === id);
      const restored = JSON.stringify(current) === catalog ? baseline : current;
      if (restored) this.registerProvider(restored);
      else this.unregister(id);
    };
  }

  private unregister(id: string): void {
    if (!this.registered.has(id)) return;
    this.pi.unregisterProvider(id);
    this.registered.delete(id);
  }

  private reconcile(providers: ProviderConfig[], catalog?: ProviderConfig[]): void {
    for (const id of this.registered.keys()) {
      if (!providers.some((provider) => provider.id === id)) this.unregister(id);
    }
    for (const provider of providers) {
      const previous = catalog?.find((p) => p.id === provider.id);
      // Preserve account-specific credentials on unchanged, unrelated registrations.
      if (previous && JSON.stringify(previous) === JSON.stringify(provider)) continue;
      this.registerProvider(provider);
    }
  }

  private restore(previous: ProviderConfig[], error: unknown): never {
    try {
      this.reconcile(previous);
    } catch (restorationError) {
      throw new AggregateError([error, restorationError], "Provider reconciliation failed; restoration also failed");
    }
    throw error;
  }

  private async withRestoration(action: () => void | Promise<void>): Promise<void> {
    const previous = [...this.registered.values()];
    try {
      await action();
    } catch (error) {
      this.restore(previous, error);
    }
  }

  private async commit(providers: ProviderConfig[]): Promise<void> {
    await this.withRestoration(async () => {
      this.reconcile(providers, this.providers);
      await this.store.save(providers);
      this.providers = providers;
    });
  }

  private toPiProvider(provider: ProviderConfig): Record<string, unknown> | undefined {
    if (
      !provider.baseUrl &&
      !provider.api &&
      !provider.apiKey &&
      !provider.models &&
      !provider.headers &&
      !provider.authHeader &&
      !provider.compat
    ) {
      return undefined;
    }

    return commonUtil.omitUndefined({
      name: provider.name ?? provider.label,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      api: provider.api,
      headers: provider.headers,
      authHeader: provider.authHeader,
      models: provider.models?.map((model) => this.toPiModel(provider, model)),
      modelOverrides: provider.modelOverrides,
      compat: provider.compat,
    });
  }

  private toPiModel(provider: ProviderConfig, model: ProviderModelConfig): Record<string, unknown> | undefined {
    return commonUtil.omitUndefined({
      ...model,
      api: model.api ?? provider.api,
      name: model.name ?? model.id,
      reasoning: model.reasoning ?? false,
      input: model.input ?? ["text"],
      contextWindow: model.contextWindow ?? 128000,
      maxTokens: model.maxTokens ?? 16384,
      cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: model.compat ?? provider.compat,
    });
  }
}
