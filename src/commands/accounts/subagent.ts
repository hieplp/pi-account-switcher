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
      description: "Set the account to use for the next spawned subagent (one-shot or persistent)",
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

      // Ask about oneshot (default: yes)
      const oneshot = await ctx.ui.confirm(
        "Apply to next subagent only?",
        "Yes = one-shot (next subagent only). No = persistent (all subagents until changed).",
      );

      const varName = oneshot !== false ? "PI_ACCOUNT_SWITCHER_NEXT_ID" : "PI_ACCOUNT_SWITCHER_ACTIVE_ID";
      process.env[varName] = account.id;

      ctx.ui.notify(
        `Subagent account set to: ${account.label} (${oneshot !== false ? "next subagent only" : "persistent"}).`,
        "info",
      );
    } catch (e) {
      ctx.ui.notify(`Failed to set subagent account: ${errorUtil.format(e)}`, "error");
    }
  }
}
