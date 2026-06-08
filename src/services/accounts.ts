import { type AccountStore, useAccountStore, type StateStore, useStateStore } from "../storage";
import type { AccountConfig, AccountSwitcherContext, ProviderConfig } from "../types";
import { accountUtil, providerUtil, uiUtil } from "../utils";

export interface AccountService {
  load(): Promise<void>;
  setSessionKey(sessionKey: string): void;
  getAccounts(): AccountConfig[];
  findAccountsByProvider(provider: string, providers: ProviderConfig[]): AccountConfig[];
  getActiveAccount(): AccountConfig | undefined;
  addAccount(account: AccountConfig): Promise<void>;
  editAccount(original: AccountConfig, updated: AccountConfig): Promise<void>;
  removeAccount(account: AccountConfig): Promise<void>;
  activateAccount(account: AccountConfig, ctx: AccountSwitcherContext, authProvider?: string): Promise<string>;
  getActiveModelState(): { id: string; provider: string } | undefined;
  saveActiveModel(id: string, provider: string): Promise<void>;
  setDefaultAccountId(id: string): Promise<void>;
  getDefaultAccountId(): Promise<string | undefined>;
}

export function useAccountService(accountsPath: string, statePath?: string): AccountService {
  return new AccountServiceImpl(useAccountStore(accountsPath), useStateStore(statePath));
}

// ===============================================================================================
// Account Service
// ===============================================================================================

class AccountServiceImpl implements AccountService {
  private accounts: AccountConfig[] = [];
  private activeAccountId: string | undefined;
  private activeModelId: string | undefined;
  private activeModelProvider: string | undefined;
  private sessionKey: string | undefined;

  constructor(
    private readonly store: AccountStore,
    private readonly stateStore: StateStore,
  ) {}

  setSessionKey(sessionKey: string): void {
    this.sessionKey = sessionKey;
  }

  async load(): Promise<void> {
    this.accounts = await this.store.load();
    const key = this.sessionKey ?? "default";
    const state = await this.stateStore.loadSession(key);

    // Cascade:
    // 1. Session key state
    // 2. "default" key (legacy backwards compat for existing state.json)
    // 3. defaultAccountId from config
    if (state.activeAccountId) {
      this.activeAccountId = state.activeAccountId;
      this.activeModelId = state.activeModelId;
      this.activeModelProvider = state.activeModelProvider;
    } else if (key !== "default") {
      const fallback = await this.stateStore.loadSession("default");
      if (fallback.activeAccountId) {
        this.activeAccountId = fallback.activeAccountId;
        this.activeModelId = state.activeModelId ?? fallback.activeModelId;
        this.activeModelProvider = state.activeModelProvider ?? fallback.activeModelProvider;
      } else {
        // Step 3: fall back to config-level defaultAccountId
        const defaultId = await this.getDefaultAccountId();
        if (defaultId && this.accounts.some((a) => a.id === defaultId)) {
          this.activeAccountId = defaultId;
        }
      }
    }
  }

  getAccounts(): AccountConfig[] {
    return this.accounts;
  }

  findAccountsByProvider(provider: string, providers: ProviderConfig[]): AccountConfig[] {
    const normalized = providerUtil.normalizeProviderWithCustom(provider, providers);
    return this.accounts.filter(
      (account) => providerUtil.normalizeProviderWithCustom(account.provider, providers) === normalized,
    );
  }

  getActiveAccount(): AccountConfig | undefined {
    return this.accounts.find((a) => a.id === this.activeAccountId);
  }

  getActiveModelState(): { id: string; provider: string } | undefined {
    if (!this.activeModelId || !this.activeModelProvider) return undefined;
    return { id: this.activeModelId, provider: this.activeModelProvider };
  }

  async saveActiveModel(id: string, provider: string): Promise<void> {
    this.activeModelId = id;
    this.activeModelProvider = provider;
    await this.flushState();
  }

  async addAccount(account: AccountConfig): Promise<void> {
    this.accounts = await this.store.addAccount(account);
  }

  async editAccount(original: AccountConfig, updated: AccountConfig): Promise<void> {
    this.accounts = await this.store.replaceAccount(original.id, updated);
    if (this.activeAccountId === original.id) {
      this.activeAccountId = updated.id;
      await this.flushState();
    }
  }

  async removeAccount(account: AccountConfig): Promise<void> {
    this.accounts = await this.store.removeAccount(account.id);
    if (this.activeAccountId === account.id) {
      this.activeAccountId = undefined;
      await this.flushState();
    }
  }

  async activateAccount(account: AccountConfig, ctx: AccountSwitcherContext, authProvider?: string): Promise<string> {
    const previous = this.getActiveAccount();
    let applied: string[] = [];
    if (account.piAuth) {
      if (previous) await accountUtil.clearAccountEnv(previous, ctx.modelRegistry);
      applied = await accountUtil.applyAccountEnv(account, ctx.modelRegistry, authProvider);
    } else {
      const resolved = await accountUtil.resolveAccountEnv(account);
      if (previous) await accountUtil.clearAccountEnv(previous, ctx.modelRegistry);
      applied = accountUtil.applyResolvedAccountEnv(account, resolved, ctx.modelRegistry, authProvider);
    }
    this.activeAccountId = account.id;
    await this.flushState();
    uiUtil.setAccountStatus(ctx.ui, account.label);
    if (account.piAuth) return "via OAuth";
    return applied.length > 0 ? applied.join(", ") : "";
  }

  async setDefaultAccountId(id: string): Promise<void> {
    await this.store.setDefaultAccountId(id);
  }

  async getDefaultAccountId(): Promise<string | undefined> {
    const config = await this.store.loadConfig();
    return config.defaultAccountId;
  }

  private async flushState(): Promise<void> {
    await this.stateStore.saveSession(this.sessionKey ?? "default", {
      activeAccountId: this.activeAccountId,
      activeModelId: this.activeModelId,
      activeModelProvider: this.activeModelProvider,
    });
  }
}
