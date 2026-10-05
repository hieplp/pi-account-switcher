import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "../../runtime";
import type { AccountSwitcherContext } from "../../types";
import { errorUtil } from "../../utils";
import { AccountCommand } from "./shared";

export const useSubagentAccountCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new SubagentAccountCommand(pi, runtime).register();
};

class SubagentAccountCommand extends AccountCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, {
      name: "accounts:subagent",
      description: "Set a persistent child account preference (one-shot is unsupported)",
    });
  }

  async handler(ctx: AccountSwitcherContext, args?: string): Promise<void> {
    try {
      await this.runtime.load();
      const accounts = this.runtime.getAccounts();

      if (accounts.length === 0) {
        ctx.ui.notify("No accounts configured.", "info");
        return;
      }

      // Interactive: pick an account
      const account = await this.pickGroupedAccount(ctx, accounts, "Account for subagent");
      if (!account) return;

      const confirmed = await ctx.ui.confirm(
        "Set persistent child account?",
        "All inheriting children will use this account until the preference is cleared.",
      );
      if (!confirmed) return;
      process.env.PI_ACCOUNT_SWITCHER_CHILD_ID = account.id;

      ctx.ui.notify(`Subagent account set to: ${account.label} (persistent).`, "info");
    } catch (e) {
      ctx.ui.notify(`Failed to set subagent account: ${errorUtil.format(e)}`, "error");
    }
  }
}
