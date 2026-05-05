import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import { registerAccountAddCommands } from "./add.js";
import { registerAccountListCommands } from "./list.js";
import { registerAccountEditCommand } from "./edit.js";
import { registerAccountRemoveCommand } from "./remove.js";
import { registerAccountTestCommand } from "./test.js";
import { registerAccountOAuthCommand } from "./oauth.js";
import { registerAccountSwitchCommand } from "./switch.js";
import { registerAccountSystemCommands } from "./system.js";

export function registerAccountCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	registerAccountSwitchCommand(pi, runtime);
	registerAccountListCommands(pi, runtime);
	registerAccountAddCommands(pi, runtime);
	registerAccountRemoveCommand(pi, runtime);
	registerAccountEditCommand(pi, runtime);
	registerAccountTestCommand(pi, runtime);
	registerAccountOAuthCommand(pi, runtime);
	registerAccountSystemCommands(pi, runtime);
}
