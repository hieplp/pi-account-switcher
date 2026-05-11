import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { COMMANDS } from "@/constants";
import type { AccountSwitcherContext } from "@/types";
import { errorUtil } from "@/utils";
import { ProjectCommand } from "./shared";

export const useListProjectsCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new ListProjectsCommand(pi, runtime).register();
};

class ListProjectsCommand extends ProjectCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.projects.list);
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    try {
      const project = await this.loadAndSelectProject(ctx, "Project bindings");
      if (!project) return;

      await this.runtime.activateProject(project, ctx);
      ctx.ui.notify(`Activated project binding for ${project.path}.`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to list project bindings: ${errorUtil.format(error)}`, "error");
    }
  }
}
