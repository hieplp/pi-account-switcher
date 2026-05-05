import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcherRuntime } from "../runtime/account-switcher.js";
import { registerAccountCommands as registerAccountCommandGroup } from "./account/index.js";
import { registerProviderCommands } from "./provider/index.js";

export function registerAccountCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	registerAccountCommandGroup(pi, runtime);
	registerProviderCommands(pi, runtime);
}
