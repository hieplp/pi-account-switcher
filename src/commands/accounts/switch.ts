import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountSwitcherContext } from "@/types";
import { COMMANDS } from "@/constants";
import { errorUtil } from "@/utils";
import { AccountCommand } from "./shared";

export const useSwitchAccountCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new SwitchAccountCommand(pi, runtime).register();
};

class SwitchAccountCommand extends AccountCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.accounts.switch);
  }

  async handler(ctx: AccountSwitcherContext, args?: string): Promise<void> {
    try {
      await this.runtime.load();

      // With args: activate by ID directly (agent-facing, any provider)
      if (args) {
        const account = this.runtime.getAccounts().find((a) => a.id === args.trim());
        if (!account) {
          ctx.ui.notify(`Account not found: "${args.trim()}". Use the list_accounts tool to see available accounts.`, "error");
          return;
        }
        const applied = await this.runtime.activateAccount(account, ctx);
        ctx.ui.notify(`Switched to ${account.label} (${applied}).`, "info");
        return;
      }

      // Without args: interactive picker from all accounts
      const accounts = this.runtime.getAccounts();
      if (accounts.length === 0) {
        ctx.ui.notify("No accounts configured. Use accounts:add to create one.", "info");
        return;
      }

      const account = await this.pickGroupedAccount(ctx, accounts, "Pick account to activate");
      if (!account) return;

      const applied = await this.runtime.activateAccount(account, ctx);
      ctx.ui.notify(`Switched to ${account.label} (${applied}).`, "info");
    } catch (e) {
      ctx.ui.notify(`Failed to switch account: ${errorUtil.format(e)}`, "error");
    }
  }
}
