import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { COMMANDS } from "@/constants";
import type { AccountSwitcherContext } from "@/types";
import { errorUtil } from "@/utils";
import { ProjectCommand } from "./shared";

export const useBindProjectCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new BindProjectCommand(pi, runtime).register();
};

class BindProjectCommand extends ProjectCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.projects.bind);
  }

  async handler(ctx: AccountSwitcherContext, args?: string): Promise<void> {
    try {
      await this.runtime.load();

      const activeAccount = this.runtime.getActiveAccount();
      if (!activeAccount) {
        ctx.ui.notify("No active account. Switch to an account first, then bind the project.", "info");
        return;
      }

      const path = this.currentProjectPath(args);
      const includeModel = ctx.model
        ? await ctx.ui.confirm(
            "Bind active model too?",
            `Also restore ${ctx.model.provider}/${ctx.model.id} for this project?`,
          )
        : false;

      const binding = await this.runtime.bindProject({
        path,
        accountId: activeAccount.id,
        modelId: includeModel ? ctx.model?.id : undefined,
        modelProvider: includeModel ? ctx.model?.provider : undefined,
        enabled: true,
      });

      ctx.ui.notify(`Bound ${binding.path} to ${activeAccount.label}.`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to bind project: ${errorUtil.format(error)}`, "error");
    }
  }
}
