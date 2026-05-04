import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountSwitcherContext } from "@/types";
import { COMMANDS } from "@/constants";
import { errorUtil } from "@/utils";
import { ModelCommand } from "./shared";

export const useListModelsCommand = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  new ListModelsCommand(pi, runtime).register();
};

class ListModelsCommand extends ModelCommand {
  constructor(pi: ExtensionAPI, runtime: AccountSwitcher) {
    super(pi, runtime, COMMANDS.models.list);
  }

  async handler(ctx: AccountSwitcherContext): Promise<void> {
    try {
      await this.runtime.load();

      const provider = ctx.model?.provider;
      if (!provider) {
        ctx.ui.notify("No active model.", "info");
        return;
      }

      const models = this.getModels(ctx, provider);
      if (models.length === 0) {
        ctx.ui.notify(`No models available for provider "${provider}".`, "info");
        return;
      }

      const currentId = ctx.model?.id;
      const model = await this.pick(ctx, `Models (${provider})`, models, (m) =>
        m.id === currentId ? `${m.id} ✓` : m.id,
      );
      if (!model) return;

      await this.runtime.applyModel(model, ctx);
      ctx.ui.notify(`Switched to ${model.id}.`, "info");
    } catch (e) {
      ctx.ui.notify(`Failed to list models: ${errorUtil.format(e)}`, "error");
    }
  }
}
