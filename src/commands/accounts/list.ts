import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountSwitcherContext } from "@/types";
import type { AccountConfig } from "@/types";
import { COMMANDS } from "@/constants";
import { AccountCommand } from "./shared";

export const useListAccountsCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new ListAccountsCommand(pi, runtime).register();
};

/**
 * Format a list of accounts as structured text for agent consumption.
 * Output format: `id | label | provider | status` (one line per account, sorted by label).
 */
export function formatAccountList(accounts: AccountConfig[], active?: AccountConfig): string {
  if (accounts.length === 0) return "No accounts configured.";

  const sorted = [...accounts].sort((a, b) => a.label.localeCompare(b.label));
  return sorted
    .map((account) => {
      const status = active && active.id === account.id ? "active" : "inactive";
      return `${account.id} | ${account.label} | ${account.provider} | ${status}`;
    })
    .join("\n");
}

class ListAccountsCommand extends AccountCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.accounts.list);
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    try {
      await this.runtime.load();
      const accounts = this.runtime.getAccounts();
      const active = this.runtime.getActiveAccount();
      const output = formatAccountList(accounts, active);
      ctx.ui.notify(output, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to list accounts: ${String(error)}`, "error");
    }
  }
}
