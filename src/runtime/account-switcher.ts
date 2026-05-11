import type { Api, Model } from "@earendil-works/pi-ai";
import type { AccountConfig, AccountSwitcherContext, PiAuthEntry, ProjectBinding, ProviderConfig } from "@/types";

export default interface AccountSwitcher {
  // Core
  init(ctx: AccountSwitcherContext): Promise<void>;
  load(): Promise<void>;
  onModelSelect(model: Model<Api>, ctx: AccountSwitcherContext): Promise<void>;

  // Pi Auth
  getPiAuthEntry(provider: string): Promise<PiAuthEntry | undefined>;
  isOAuthEntry(entry: PiAuthEntry | undefined): boolean;

  // Account
  getAccounts(): AccountConfig[];
  findAccountById(id: string): AccountConfig | undefined;
  findAccountsByProvider(provider: string): AccountConfig[];
  getActiveAccount(): AccountConfig | undefined;
  addAccount(account: AccountConfig): Promise<void>;
  editAccount(original: AccountConfig, updated: AccountConfig): Promise<void>;
  removeAccount(account: AccountConfig): Promise<void>;
  activateAccount(
    account: AccountConfig,
    ctx: AccountSwitcherContext,
    options?: { pickModel?: boolean },
  ): Promise<string>;

  // Project
  getProjects(): ProjectBinding[];
  bindProject(input: {
    path: string;
    accountId: string;
    modelId?: string;
    modelProvider?: string;
    enabled?: boolean;
  }): Promise<ProjectBinding>;
  removeProject(path: string): Promise<void>;
  activateProject(project: ProjectBinding, ctx: AccountSwitcherContext): Promise<void>;

  // Model
  applyModel(model: Model<Api>, ctx: AccountSwitcherContext): Promise<void>;

  // Provider
  getProviders(): ProviderConfig[];
  registerProvider(provider: ProviderConfig): void;
  addProvider(config: ProviderConfig): Promise<void>;
  editProvider(original: ProviderConfig, updated: ProviderConfig): Promise<void>;
  removeProvider(provider: ProviderConfig): Promise<void>;
}
