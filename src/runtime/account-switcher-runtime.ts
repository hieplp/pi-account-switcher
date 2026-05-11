import AccountSwitcher from "./account-switcher";
import { ACCOUNTS_PATH, PROJECTS_PATH, PROVIDERS_PATH, STATE_PATH } from "@/constants";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountConfig, AccountSwitcherContext, PiAuthEntry, ProjectBinding, ProviderConfig } from "@/types";
import type { AccountService, ModelService, PiAuthService, ProjectService, ProviderService } from "@/services";
import {
  useAccountService,
  useModelService,
  usePiAuthService,
  useProjectService,
  useProviderService,
} from "@/services";
import { accountUtil, modelUtil, providerUtil, uiUtil } from "@/utils";

function resolveAuthProvider(account: AccountConfig, providers: ProviderConfig[]): string {
  if (account.piAuth?.provider) return account.piAuth.provider;
  const provider = providerUtil.findProvider(account.provider, providers);
  return provider?.piAuthProvider ?? providerUtil.normalizeProvider(account.provider);
}

export default class AccountSwitcherRuntime implements AccountSwitcher {
  private accountService: AccountService;
  private modelService: ModelService;
  private piAuthService: PiAuthService;
  private projectService: ProjectService;
  private providerService: ProviderService;

  constructor(private readonly pi: Pick<ExtensionAPI, "registerProvider" | "setModel">) {
    this.providerService = useProviderService(this.pi as ExtensionAPI, PROVIDERS_PATH);
    this.accountService = useAccountService(ACCOUNTS_PATH, STATE_PATH);
    this.modelService = useModelService(this.pi);
    this.piAuthService = usePiAuthService();
    this.projectService = useProjectService(PROJECTS_PATH);
  }

  // ===============================================================================================
  // Core
  // ===============================================================================================

  async init(ctx: AccountSwitcherContext): Promise<void> {
    await this.load();

    const project = this.projectService.findProjectForPath(process.cwd());
    if (project) {
      try {
        await this.activateProject(project, ctx);
        return;
      } catch (error) {
        ctx.ui.notify(
          `Failed to auto-switch project account: ${error instanceof Error ? error.message : error}`,
          "warning",
        );
      }
    }

    const active = this.accountService.getActiveAccount();
    uiUtil.setAccountStatus(ctx.ui, active?.label);

    // Re-apply saved account credentials so env vars and OAuth auth storage are
    // populated on session start, not only after the first explicit switch.
    if (active) {
      const providers = this.providerService.getProviders();
      await this.applyProviderApiKey(active, providers);
      await accountUtil.applyAccountEnv(active, ctx.modelRegistry, resolveAuthProvider(active, providers));
    }

    // Restore the last active model. modelRegistry.find returns undefined if the
    // model is no longer available (e.g. provider was removed), in which case we
    // leave Pi's default model selection untouched.
    const modelState = this.accountService.getActiveModelState();
    if (modelState) {
      const model = ctx.modelRegistry.find(modelState.provider, modelState.id);
      if (model) await this.modelService.applyModel(model, ctx);
    }
  }

  async load(): Promise<void> {
    await this.accountService.load();
    await this.providerService.load();
    await this.projectService.load();
  }

  async onModelSelect(model: Model<Api>, ctx: AccountSwitcherContext): Promise<void> {
    const matchingAccount = this.findAccountsByProvider(model.provider)[0];
    let activeAccount = this.accountService.getActiveAccount();
    if (matchingAccount && matchingAccount.id !== activeAccount?.id) {
      await this.activateAccount(matchingAccount, ctx);
      activeAccount = matchingAccount;
    }

    await this.updateCurrentProjectModel(model, activeAccount);
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
    return this.accountService.getAccounts().filter((a) => {
      const accountProvider = providerUtil.normalizeProviderWithCustom(resolveAuthProvider(a, providers), providers);
      return accountProvider === normalized;
    });
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

  async activateAccount(
    account: AccountConfig,
    ctx: AccountSwitcherContext,
    options: { pickModel?: boolean } = {},
  ): Promise<string> {
    const providers = this.providerService.getProviders();
    const providerApiKey = await this.applyProviderApiKey(account, providers);
    const result = await this.accountService.activateAccount(account, ctx, resolveAuthProvider(account, providers));

    // piAuth accounts authenticate via a separate provider (e.g. github-copilot),
    // so use that for model lookup rather than the account's own provider field.
    const accountProvider = providerUtil.normalizeProviderWithCustom(
      resolveAuthProvider(account, providers),
      providers,
    );
    const currentProvider = ctx.model
      ? providerUtil.normalizeProviderWithCustom(ctx.model.provider, providers)
      : undefined;

    // Skip model selection if the active model already belongs to the same provider.
    if (options.pickModel !== false && accountProvider !== currentProvider) {
      const model = await modelUtil.pickModel(ctx, account, providers);
      if (model) await this.applyModel(model, ctx);
    }

    return providerApiKey ? `provider apiKey (${providerApiKey})` : result;
  }

  // ===============================================================================================
  // Project
  // ===============================================================================================

  getProjects(): ProjectBinding[] {
    return this.projectService.getProjects();
  }

  async bindProject(input: {
    path: string;
    accountId: string;
    modelId?: string;
    modelProvider?: string;
    enabled?: boolean;
  }): Promise<ProjectBinding> {
    if (!this.findAccountById(input.accountId)) throw new Error(`Account not found: ${input.accountId}`);
    return this.projectService.bindProject(input);
  }

  async removeProject(path: string): Promise<void> {
    return this.projectService.removeProject(path);
  }

  async activateProject(project: ProjectBinding, ctx: AccountSwitcherContext): Promise<void> {
    const account = this.findAccountById(project.accountId);
    if (!account) throw new Error(`Project account not found: ${project.accountId}`);

    await this.activateAccount(account, ctx, { pickModel: false });

    if (project.modelId && project.modelProvider) {
      const model = ctx.modelRegistry.find(project.modelProvider, project.modelId);
      if (model) await this.applyModel(model, ctx);
    }
  }

  private async updateCurrentProjectModel(model: Model<Api>, activeAccount: AccountConfig | undefined): Promise<void> {
    const project = this.projectService.findProjectForPath(process.cwd());
    if (!project || !activeAccount) return;
    if (
      project.accountId === activeAccount.id &&
      project.modelId === model.id &&
      project.modelProvider === model.provider
    ) {
      return;
    }

    await this.projectService.bindProject({
      path: project.path,
      accountId: activeAccount.id,
      modelId: model.id,
      modelProvider: model.provider,
      enabled: project.enabled ?? true,
    });
  }

  private async applyProviderApiKey(account: AccountConfig, providers: ProviderConfig[]): Promise<string | undefined> {
    if (!account.providerApiKey && !account.usesProviderApiKey) return undefined;

    const provider = providerUtil.findProvider(account.provider, providers);
    if (!provider) throw new Error(`Custom provider not found for account ${account.id}: ${account.provider}`);

    if (account.providerApiKey) {
      const apiKey = await accountUtil.resolveSecret(account.providerApiKey);
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
