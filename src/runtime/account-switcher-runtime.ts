import type AccountSwitcher from "./account-switcher";
import { piCredentialUtil } from "../utils/pi-credentials";
import { createHash } from "node:crypto";
import { ACCOUNTS_PATH, PROVIDERS_PATH, STATE_PATH } from "../constants";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountConfig, AccountSwitcherContext, PiAuthEntry, ProviderConfig } from "../types";
import type { AccountService, ModelService, PiAuthService, ProviderService } from "../services";
import { useAccountService, useModelService, usePiAuthService, useProviderService } from "../services";
import { accountUtil, findLongestMatchingDir, modelUtil, providerUtil, uiUtil } from "../utils";

function resolveAuthProvider(account: AccountConfig, providers: ProviderConfig[]): string {
  if (account.piAuth?.provider) return account.piAuth.provider;
  const provider = providerUtil.findProvider(account.provider, providers);
  return provider?.piAuthProvider ?? providerUtil.normalizeProvider(account.provider);
}

function resolveAccountProvider(account: AccountConfig, providers: ProviderConfig[]): string {
  return providerUtil.normalizeProviderWithCustom(resolveAuthProvider(account, providers), providers);
}

export default class AccountSwitcherRuntime implements AccountSwitcher {
  private accountService: AccountService;
  private modelService: ModelService;
  private piAuthService: PiAuthService;
  private providerService: ProviderService;
  private lastStatusLabel: string | undefined;
  private sessionKey: string | undefined;
  private accountRegistration:
    | { id: string; restore: () => void }
    | undefined;

  constructor(
    private readonly pi: Pick<ExtensionAPI, "registerProvider" | "setModel"> & Partial<Pick<ExtensionAPI, "unregisterProvider">>,
    private readonly paths?: { accounts: string; providers: string; state: string },
  ) {
    this.providerService = useProviderService(this.pi as ExtensionAPI, paths?.providers ?? PROVIDERS_PATH);
    this.accountService = useAccountService(paths?.accounts ?? ACCOUNTS_PATH, paths?.state ?? STATE_PATH);
    this.modelService = useModelService(this.pi);
    this.piAuthService = usePiAuthService();
  }

  /** Derive a stable session key from the session manager. */
  private getSessionKey(ctx: AccountSwitcherContext): string {
    try {
      const sm = (ctx as unknown as Record<string, unknown>).sessionManager as Record<string, unknown> | undefined;
      const sessionFile = typeof sm?.getSessionFile === "function" ? (sm.getSessionFile as () => string)() : undefined;
      if (sessionFile) return createHash("sha256").update(sessionFile).digest("hex").slice(0, 12);
    } catch {
      /* fall through */
    }
    return "default";
  }

  /** Find the account whose dirs contain the longest prefix of cwd. */
  private findAccountForCwd(cwd: string | undefined): AccountConfig | undefined {
    if (!cwd) return undefined;
    const id = findLongestMatchingDir(this.accountService.getAccounts(), cwd);
    return id ? this.accountService.getAccounts().find((a) => a.id === id) : undefined;
  }

  // ===============================================================================================
  // Core
  // ===============================================================================================

  async init(ctx: AccountSwitcherContext): Promise<void> {
    this.sessionKey = this.getSessionKey(ctx);
    this.accountService.setSessionKey(this.sessionKey);
    await this.load();

    // Cascade:
    // 0. Persistent child preference, then parent identity (inherited env)
    // 1. Session key state (handled inside accountService.load())
    // 2. CWD-based auto-select via dirs
    // 3. defaultAccountId from config
    let selected: AccountConfig | undefined;

    // Obsolete one-shot state cannot be safely consumed at child initialization.
    delete process.env.PI_ACCOUNT_SWITCHER_NEXT_ID;
    const childId = process.env.PI_ACCOUNT_SWITCHER_CHILD_ID;
    if (childId) selected = this.accountService.getAccounts().find((a) => a.id === childId);
    if (!selected) {
      const envId = process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
      if (envId) {
        selected = this.accountService.getAccounts().find((a) => a.id === envId);
      }
    }

    if (!selected) {
      // Step 1: session key state (restored by accountService.load())
      selected = this.accountService.getActiveAccount();
    }
    if (!selected) {
      // Step 2: CWD-based auto-select via dirs
      selected = this.findAccountForCwd(ctx.cwd);
    }
    if (!selected) {
      // Step 3: defaultAccountId from config
      const defaultId = await this.accountService.getDefaultAccountId();
      if (defaultId) {
        selected = this.accountService.getAccounts().find((a) => a.id === defaultId);
      }
    }
    if (selected) {
      await this.activateAccountTransaction(selected, ctx, false);
    }

    uiUtil.setAccountStatus(ctx.ui, selected?.label);
  }

  refreshStatus(ctx: AccountSwitcherContext): void {
    const active = this.accountService.getActiveAccount();
    const label = active?.label;
    if (label === this.lastStatusLabel) return;
    this.lastStatusLabel = label;
    uiUtil.setAccountStatus(ctx.ui, label);
  }

  /** Register saved definitions without loading or activating any account. */
  async loadProviderCatalog(): Promise<void> {
    await this.providerService.load();
  }

  async load(): Promise<void> {
    await this.loadProviderCatalog();
    await this.accountService.load();
  }

  async onModelSelect(provider: string, ctx: AccountSwitcherContext): Promise<void> {
    const providers = this.providerService.getProviders();
    const normalizedProvider = providerUtil.normalizeProviderWithCustom(provider, providers);
    const activeAccount = this.accountService.getActiveAccount();

    // If the active account already belongs to this provider, keep it.
    if (activeAccount && resolveAccountProvider(activeAccount, providers) === normalizedProvider) {
      return;
    }

    const matchingAccount = this.findAccountsByProvider(provider)[0];
    if (matchingAccount && matchingAccount.id !== activeAccount?.id) {
      await this.activateAccount(matchingAccount, ctx);
    }
  }

  // ===============================================================================================
  // Pi Auth
  // ===============================================================================================

  async getPiAuthEntry(provider: string): Promise<PiAuthEntry | undefined> {
    return this.piAuthService.getEntry(provider);
  }

  isOAuthEntry(entry: PiAuthEntry | undefined): boolean {
    return this.piAuthService.isOAuthEntry(entry);
  }

  // ===============================================================================================
  // Account
  // ===============================================================================================

  getAccounts(): AccountConfig[] {
    return this.accountService.getAccounts();
  }

  findAccountById(id: string): AccountConfig | undefined {
    return this.accountService.getAccounts().find((a) => a.id === id);
  }

  findAccountsByProvider(provider: string): AccountConfig[] {
    const providers = this.providerService.getProviders();
    const normalized = providerUtil.normalizeProviderWithCustom(provider, providers);
    return this.accountService.getAccounts().filter((a) => resolveAccountProvider(a, providers) === normalized);
  }

  getActiveAccount(): AccountConfig | undefined {
    return this.accountService.getActiveAccount();
  }

  async addAccount(account: AccountConfig): Promise<void> {
    return this.accountService.addAccount(account);
  }

  async editAccount(original: AccountConfig, updated: AccountConfig): Promise<void> {
    return this.accountService.editAccount(original, updated);
  }

  async removeAccount(account: AccountConfig): Promise<void> {
    return this.accountService.removeAccount(account);
  }

  async activateAccount(account: AccountConfig, ctx: AccountSwitcherContext): Promise<string> {
    return this.activateAccountTransaction(account, ctx, true);
  }

  private async activateAccountTransaction(
    account: AccountConfig,
    ctx: AccountSwitcherContext,
    selectModel: boolean,
  ): Promise<string> {
    const providers = this.providerService.getProviders();
    // Resolve all secrets before touching registrations, credentials or environment.
    const resolvedEnv = await accountUtil.resolveAccountEnv(account);
    const resolvedProviderKey = account.providerApiKey
      ? await accountUtil.resolveSecret(account.providerApiKey)
      : undefined;
    if (account.providerApiKey && !resolvedProviderKey)
      throw new Error(`Resolved empty providerApiKey for account ${account.id}`);
    const previous = this.getActiveAccount();
    const previousModel = ctx.model;
    const envNames = new Set([
      "PI_ACCOUNT_SWITCHER_ACTIVE_ID",
      ...Object.keys(previous?.env ?? {}),
      ...Object.keys(account.env ?? {}),
    ]);
    const environment = new Map([...envNames].map((name) => [name, process.env[name]]));
    const restoreSelection = await this.accountService.snapshotSelection();
    const restoreCredentials = await piCredentialUtil.snapshotContext(ctx.modelRegistry, [
      ...new Set([
        resolveAuthProvider(account, providers),
        ...(previous ? [this.accountService.getActiveAuthProvider() ?? resolveAuthProvider(previous, providers)] : []),
      ]),
    ]);
    const providerId = providerUtil.findProvider(account.provider, providers)?.id;
    const oldRegistration = this.accountRegistration;
    const registrationIds = new Set([
      ...(oldRegistration ? [oldRegistration.id] : []),
      ...(providerId && (account.providerApiKey || account.usesProviderApiKey) ? [providerId] : []),
    ]);
    // ProviderService owns both host registration and its reconciliation bookkeeping.
    const registrations = [...registrationIds].map((id) => this.providerService.snapshotRegistration(id));
    let modelAttempted = false;
    try {
      if (oldRegistration) oldRegistration.restore();
      this.accountRegistration = undefined;
      if (providerId && (account.providerApiKey || account.usesProviderApiKey)) {
        this.accountRegistration = { id: providerId, restore: this.providerService.snapshotRegistration(providerId) };
      }
      const appliedProviderId = await this.applyProviderApiKey(account, providers, resolvedProviderKey);
      const result = await this.accountService.activateAccount(
        account,
        ctx,
        resolveAuthProvider(account, providers),
        resolvedEnv,
      );

      // Persist the active account ID for subagent (cross-process) inheritance
      process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = account.id;

      // piAuth accounts authenticate via a separate provider (e.g. github-copilot),
      // so use that for model lookup rather than the account's own provider field.
      const accountProvider = resolveAccountProvider(account, providers);
      const currentProvider = ctx.model
        ? providerUtil.normalizeProviderWithCustom(ctx.model.provider, providers)
        : undefined;

      // Skip model selection if the active model already belongs to the same provider.
      if (selectModel && accountProvider !== currentProvider) {
        const model = await modelUtil.pickModel(ctx, account, providers, accountProvider);
        if (!model) throw new Error(`No model selected for account ${account.id}`);
        modelAttempted = true;
        await this.applyModel(model, ctx);
      } else if (selectModel) {
        // Same provider — persist current model for full session tracking
        if (ctx.model) {
          await this.accountService.saveActiveModel(ctx.model.id, ctx.model.provider);
        }
      }

      return appliedProviderId ? `provider apiKey (${appliedProviderId})` : result;
    } catch (cause) {
      const errors: unknown[] = [];
      const attempt = async (restore: () => void | Promise<void>) => {
        try {
          await restore();
        } catch (error) {
          errors.push(error);
        }
      };
      for (const [name, value] of environment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      this.accountRegistration = oldRegistration;
      for (const restoreRegistration of registrations) {
        await attempt(restoreRegistration);
      }
      await attempt(restoreCredentials);
      await attempt(restoreSelection);
      if (modelAttempted && previousModel) {
        await attempt(async () => {
          if (!(await this.pi.setModel(previousModel))) throw new Error("Prior model restoration rejected");
        });
      }
      await attempt(() => uiUtil.setAccountStatus(ctx.ui, previous?.label));
      if (errors.length)
        throw new AggregateError(
          [cause, ...errors],
          "Account switch failed; restoration failed (session may be inconsistent)",
        );
      throw cause;
    }
  }

  private async applyProviderApiKey(
    account: AccountConfig,
    providers: ProviderConfig[],
    resolvedKey?: string,
  ): Promise<string | undefined> {
    if (!account.providerApiKey && !account.usesProviderApiKey) return undefined;

    const provider = providerUtil.findProvider(account.provider, providers);
    if (!provider) throw new Error(`Custom provider not found for account ${account.id}: ${account.provider}`);

    if (account.providerApiKey) {
      const apiKey = resolvedKey ?? (await accountUtil.resolveSecret(account.providerApiKey));
      if (!apiKey) throw new Error(`Resolved empty providerApiKey for account ${account.id}`);
      this.providerService.registerProvider({ ...provider, apiKey });
      return provider.id;
    }

    this.providerService.registerProvider(provider);
    return provider.id;
  }

  // ===============================================================================================
  // Model
  // ===============================================================================================

  async applyModel(model: Model<Api>, ctx: AccountSwitcherContext): Promise<void> {
    await this.modelService.applyModel(model, ctx);
    await this.accountService.saveActiveModel(model.id, model.provider);
  }

  // ===============================================================================================
  // Provider
  // ===============================================================================================

  getProviders(): ProviderConfig[] {
    return this.providerService.getProviders();
  }

  registerProvider(provider: ProviderConfig): void {
    this.providerService.registerProvider(provider);
  }

  async addProvider(provider: ProviderConfig): Promise<void> {
    return this.providerService.addProvider(provider);
  }

  async editProvider(original: ProviderConfig, updated: ProviderConfig): Promise<void> {
    return this.providerService.editProvider(original, updated);
  }

  async removeProvider(provider: ProviderConfig): Promise<void> {
    const providers = this.providerService.getProviders();
    const dependents = this.accountService.findAccountsByProvider(provider.id, providers);
    if (dependents.length > 0) {
      const names = dependents.map((a) => `"${a.label ?? a.id}"`).join(", ");
      throw new Error(`Cannot remove: ${names} ${dependents.length === 1 ? "uses" : "use"} this provider`);
    }
    return this.providerService.removeProvider(provider);
  }
}
