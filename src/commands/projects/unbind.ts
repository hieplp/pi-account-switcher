import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { COMMANDS } from "@/constants";
import type { AccountSwitcherContext } from "@/types";
import { errorUtil } from "@/utils";
import { ProjectCommand } from "./shared";

export const useUnbindProjectCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new UnbindProjectCommand(pi, runtime).register();
};

class UnbindProjectCommand extends ProjectCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.projects.unbind);
  }

  async handler(ctx: AccountSwitcherContext, args?: string): Promise<void> {
    try {
      await this.runtime.load();
      const path = this.currentProjectPath(args);
      await this.runtime.removeProject(path);
      ctx.ui.notify(`Removed project binding for ${path}.`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to unbind project: ${errorUtil.format(error)}`, "error");
    }
  }
}
