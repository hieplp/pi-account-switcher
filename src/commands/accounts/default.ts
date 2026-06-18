import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountSwitcherContext } from "@/types";
import { errorUtil } from "@/utils";
import { AccountCommand } from "./shared";

export const useDefaultAccountCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new DefaultAccountCommand(pi, runtime).register();
};

class DefaultAccountCommand extends AccountCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, {
      name: "accounts:default",
      description: "Activate the configured default account",
    });
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    try {
      await this.runtime.load();

      const defaultId = await this.runtime.getDefaultAccountId();
      if (!defaultId) {
        ctx.ui.notify(
          "No default account configured. Use accounts:add to create one or accounts:switch to select an account.",
          "info",
        );
        return;
      }

      const account = this.runtime.getAccounts().find((a) => a.id === defaultId);
      if (!account) {
        ctx.ui.notify(
          `Default account "${defaultId}" not found. It may have been deleted. Use accounts:switch to select another account.`,
          "error",
        );
        return;
      }

      const applied = await this.runtime.activateAccount(account, ctx);
      ctx.ui.notify(`Switched to default account: ${account.label} (${applied}).`, "info");
    } catch (e) {
      ctx.ui.notify(`Failed to activate default account: ${errorUtil.format(e)}`, "error");
    }
  }
}
