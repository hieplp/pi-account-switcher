import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAccountCommands } from "./commands/register.js";
import { AccountSwitcherRuntime } from "./runtime/account-switcher.js";

export default function accountSwitcher(pi: ExtensionAPI) {
	const runtime = new AccountSwitcherRuntime();

	pi.on("session_start", async (_event, ctx) => {
		await runtime.reloadConfig();
		await runtime.restoreSavedAccounts(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		runtime.setCurrentProvider(event.model.provider, ctx);
	});

	registerAccountCommands(pi, runtime);
}
