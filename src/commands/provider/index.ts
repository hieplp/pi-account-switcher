import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import { registerProviderAddCommand } from "./add.js";
import { registerProviderEditCommand } from "./edit.js";
import { registerProvidersListCommand } from "./list.js";
import { registerProviderRemoveCommand } from "./remove.js";

export function registerProviderCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	registerProvidersListCommand(pi, runtime);
	registerProviderAddCommand(pi, runtime);
	registerProviderEditCommand(pi, runtime);
	registerProviderRemoveCommand(pi, runtime);
}
