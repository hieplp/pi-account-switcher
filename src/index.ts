import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcherContext } from "@/types";
import { useAccountSwitcher, type AccountSwitcher } from "./runtime";
import { registerAllCommands } from "./commands";

async function accountSwitcher(pi: ExtensionAPI) {
  const runtime: AccountSwitcher = useAccountSwitcher(pi);

  pi.on("session_start", async (_, ctx) => {
    await runtime.init(ctx as AccountSwitcherContext);
  });

  pi.on("model_select", async (event, ctx) => {
    await runtime.onModelSelect(event.model.provider, ctx as AccountSwitcherContext);
  });

  registerAllCommands(pi, runtime);
}

export default accountSwitcher;
