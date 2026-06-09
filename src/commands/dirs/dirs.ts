import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "../../runtime";
import type { AccountConfig, AccountSwitcherContext } from "../../types";
import { COMMANDS } from "../../constants";
import { BaseCommand } from "../base";
import { buildGroupedItems } from "../accounts/shared/select";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { Dirent } from "node:fs";

export const useDirsCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new DirsCommand(pi, runtime).register();
};

class DirsCommand extends BaseCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.accounts.dirs);
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    await this.runtime.load();
    const accounts = this.runtime.getAccounts();
    if (accounts.length === 0) {
      ctx.ui.notify("No accounts configured.", "info");
      return;
    }

    // Build entry options: auto-save if active account + CWD both exist
    const activeAccount = this.runtime.getActiveAccount();
    const canAutoSave = Boolean(ctx.cwd && activeAccount);
    const entryOptions = canAutoSave
      ? ["Auto-save current folder", "Select an account to configure"]
      : ["Select an account to configure"];

    const entry = await ctx.ui.select("Directory auto-select", entryOptions);
    if (!entry) return;

    if (entry === "Auto-save current folder") {
      await this.autoSave(ctx, activeAccount!);
      return;
    }

    // Manual: pick account → add/remove
    await this.manualConfig(ctx, accounts);
  }

  private async autoSave(ctx: AccountSwitcherContext, account: AccountConfig): Promise<void> {
    const cwd = ctx.cwd!;
    const resolved = cwd;

    // Check if already present
    const current = this.runtime.getAccounts().find((a) => a.id === account.id) ?? account;
    const dirs = current.dirs ?? [];

    if (dirs.includes(resolved)) {
      ctx.ui.notify(`Directory already configured for ${current.label}.`, "info");
      return;
    }

    const updated: AccountConfig = { ...current, dirs: [...dirs, resolved] };
    await this.runtime.editAccount(current, updated);
    ctx.ui.notify(`Added dir: ${resolved}`, "info");
  }

  private async manualConfig(ctx: AccountSwitcherContext, accounts: AccountConfig[]): Promise<void> {
    const account = await this.pickAccount(ctx, accounts);
    if (!account) return;

    await this.manageDirs(ctx, account);
  }

  private async pickAccount(
    ctx: AccountSwitcherContext,
    accounts: AccountConfig[],
  ): Promise<AccountConfig | undefined> {
    const items = buildGroupedItems(accounts, this.runtime.getProviders(), this.runtime.getActiveAccount()?.id);
    const labels: string[] = [];
    const values: Array<AccountConfig | null> = [];
    for (const item of items) {
      if (item.type === "header") {
        labels.push(item.provider);
        values.push(null);
        continue;
      }
      labels.push(`  ${this.isActiveAccount(item.account) ? `${item.account.label} (active)` : item.account.label}`);
      values.push(item.account);
    }
    return this.pickGrouped(ctx, "Pick account to configure dirs", labels, values);
  }

  private async manageDirs(ctx: AccountSwitcherContext, account: AccountConfig): Promise<void> {
    const current = this.runtime.getAccounts().find((a) => a.id === account.id) ?? account;
    const dirs = current.dirs ?? [];
    const dirsDisplay = dirs.length > 0 ? dirs.join(", ") : "(none)";
    ctx.ui.notify(`Account: ${current.label} | Dirs: ${dirsDisplay}`, "info");

    const options = ["Add directory", "Remove directory"];
    const action = await ctx.ui.select("Directory auto-select", options);
    if (!action) return;

    if (action === "Add directory") {
      const picked = await this.pickDirectory(ctx, homedir());
      if (!picked) return;
      const resolved = picked;
      if (dirs.includes(resolved)) {
        ctx.ui.notify(`Directory already configured for ${current.label}.`, "info");
        return;
      }
      const updated: AccountConfig = { ...current, dirs: [...dirs, resolved] };
      await this.runtime.editAccount(current, updated);
      ctx.ui.notify(`Added dir: ${resolved}`, "info");
      return;
    }

    if (action === "Remove directory") {
      if (dirs.length === 0) {
        ctx.ui.notify("No directories configured.", "info");
        return;
      }
      const selected = await ctx.ui.select("Remove directory", dirs);
      if (!selected) return;

      const updatedDirs = dirs.filter((d) => d !== selected);
      const updated: AccountConfig = { ...current, dirs: updatedDirs.length > 0 ? updatedDirs : undefined };
      await this.runtime.editAccount(current, updated);
      ctx.ui.notify(`Removed dir: ${selected}`, "info");
      return;
    }
  }

  private async pickDirectory(ctx: AccountSwitcherContext, startPath: string): Promise<string | undefined> {
    let currentPath = startPath;
    while (true) {
      const entries = this.listDirectories(currentPath);
      const displayPath = currentPath.replace(homedir(), "~");

      const options: Array<{ label: string; value: string }> = [
        { label: "✅ Select this directory", value: "__select__" },
        { label: "⬆  ..", value: "__up__" },
        ...entries.map((e) => ({ label: `${e}/`, value: e })),
      ];

      const labels = options.map((o) => o.label);
      const selected = await ctx.ui.select(`Navigate: ${displayPath}`, labels);
      if (!selected) return undefined;

      const option = options.find((o) => o.label === selected);
      if (!option) continue;

      if (option.value === "__select__") return currentPath;
      if (option.value === "__up__") {
        const parent = dirname(currentPath);
        if (parent === currentPath) continue; // at root, can't go up
        currentPath = parent;
        continue;
      }
      // Navigate into subdirectory
      currentPath = join(currentPath, option.value);
    }
  }

  private listDirectories(dirPath: string): string[] {
    const result: string[] = [];
    try {
      const entries: Dirent[] = require("fs").readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          result.push(entry.name);
        }
      }
    } catch {
      /* permission denied, return what we have */
    }
    return result.sort((a, b) => a.localeCompare(b));
  }
}
