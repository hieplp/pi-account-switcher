import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcherContext } from "./types";
import { useAccountSwitcher, type AccountSwitcher } from "./runtime";
import { registerAllCommands } from "./commands";

async function accountSwitcher(pi: ExtensionAPI) {
  const runtime: AccountSwitcher = useAccountSwitcher(pi);

  pi.on("session_start", async (_, ctx) => {
    await runtime.init(ctx as AccountSwitcherContext);
  });

  // Re-assert account status on agent/turn lifecycle so it persists
  // across TUI redraws, reloads, and powerline updates.
  pi.on("agent_start", async (_, ctx) => {
    runtime.refreshStatus(ctx as AccountSwitcherContext);
  });

  pi.on("model_select", async (event, ctx) => {
    await runtime.onModelSelect(event.model.provider, ctx as AccountSwitcherContext);
  });
  registerAllCommands(pi, runtime);
}

export default accountSwitcher;
