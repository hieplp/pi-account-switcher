import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { COMMANDS } from "@/constants";
import type { AccountSwitcherContext } from "@/types";
import { errorUtil } from "@/utils";
import { ProjectCommand } from "./shared";

export const useRemoveProjectCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new RemoveProjectCommand(pi, runtime).register();
};

class RemoveProjectCommand extends ProjectCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.projects.remove);
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    try {
      const project = await this.loadAndSelectProject(ctx, "Remove project binding");
      if (!project) return;

      const confirmed = await ctx.ui.confirm("Remove project binding?", `Remove binding for ${project.path}?`);
      if (!confirmed) return;

      await this.runtime.removeProject(project.path);
      ctx.ui.notify(`Removed project binding for ${project.path}.`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to remove project binding: ${errorUtil.format(error)}`, "error");
    }
  }
}
