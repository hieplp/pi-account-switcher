import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountSwitcherContext, AccountConfig, ProviderConfig } from "@/types";
import { COMMANDS } from "@/constants";
import { commandUtil, errorUtil, providerUtil } from "@/utils";
import { AccountCommand } from "./shared";

/**
 * Filter accounts to those sharing the same auth provider as the active account,
 * excluding the active account itself.
 */
export function filterPeers(accounts: AccountConfig[], active: AccountConfig): AccountConfig[] {
  const normalize = (a: AccountConfig): string =>
    providerUtil.normalizeProvider(a.piAuth?.provider ?? a.provider);

  return accounts.filter((a) => normalize(a) === normalize(active) && a.id !== active.id);
}

export const usePeersCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new PeersCommand(pi, runtime).register();
};

class PeersCommand extends AccountCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, {
      name: "accounts:peers",
      description: "Switch to another account sharing the same provider",
    });
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    try {
      await this.runtime.load();

      const active = this.runtime.getActiveAccount();
      if (!active) {
        ctx.ui.notify(
          `No active account. Use ${commandUtil.name("accounts:switch")} to activate one first.`,
          "info",
        );
        return;
      }

      const peers = filterPeers(this.runtime.getAccounts(), active);
      if (peers.length === 0) {
        ctx.ui.notify(`No other accounts for provider "${active.provider}".`, "info");
        return;
      }

      const account = await this.pickGroupedAccount(ctx, peers, `Switch account (${active.provider})`);
      if (!account) return;

      const applied = await this.runtime.activateAccount(account, ctx);
      ctx.ui.notify(`Switched to ${account.label} (${applied}).`, "info");
    } catch (e) {
      ctx.ui.notify(`Failed to switch account: ${errorUtil.format(e)}`, "error");
    }
  }
}
