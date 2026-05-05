import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerAccountCommands } from "./commands/register.js";
import { AccountSwitcherRuntime } from "./runtime/account-switcher.js";
import { registerCustomModelProviders } from "./providers/registration.js";

export default async function accountSwitcher(pi: ExtensionAPI) {
	const runtime = new AccountSwitcherRuntime(pi);
	await runtime.reloadConfig();
	registerCustomModelProviders(pi, runtime.providers);

	pi.on("session_start", async (_event, ctx) => {
		await runtime.reloadConfig();
		await runtime.restoreSavedAccounts(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		runtime.setCurrentProvider(event.model.provider, ctx);
	});

	registerAccountCommands(pi, runtime);
}
