import * as piAi from "@mariozechner/pi-ai";
import { normalizeProvider } from "../providers/catalog.js";
import { setPiAuthEntry } from "../storage/pi-auth.js";
import { resolveAccountEnvValues } from "./secrets.js";
import type { AccountConfig } from "../domain/types.js";
import type { AccountSwitcherModelRegistry, AccountSwitcherUi } from "../shared/ui.js";

export async function reloadAfterOAuthSwitch(
	account: AccountConfig,
	ctx: {
		ui: Pick<AccountSwitcherUi, "notify">;
	},
): Promise<boolean> {
	if (!account.piAuth) return false;
	ctx.ui.notify("OAuth credentials were updated in Pi's live auth storage. The next model request should use this account without restarting Pi.", "info");
	return false;
}

export async function applyAccountCredentials(account: AccountConfig, modelRegistry?: AccountSwitcherModelRegistry): Promise<string> {
	const envValues = await resolveAccountEnvValues(account);
	for (const [envName, value] of Object.entries(envValues)) process.env[envName] = value;
	const appliedEnv = Object.keys(envValues);
	const runtimeAuthProvider = account.piAuth?.provider ?? normalizeProvider(account.provider);
	const singleEnvValue = Object.values(envValues)[0];
	if (singleEnvValue) modelRegistry?.authStorage?.setRuntimeApiKey?.(runtimeAuthProvider, singleEnvValue);
	else modelRegistry?.authStorage?.removeRuntimeApiKey?.(runtimeAuthProvider);

	if (account.piAuth) {
		// Update both disk and Pi's live in-memory AuthStorage. Writing auth.json alone
		// only takes effect after a process restart because the active model registry
		// keeps credentials in memory.
		await setPiAuthEntry(account.piAuth.provider, account.piAuth.entry);
		modelRegistry?.authStorage?.set?.(account.piAuth.provider, account.piAuth.entry);
		modelRegistry?.authStorage?.reload?.();

		closeCachedSessionsIfAvailable();
	}
	const parts = [];
	if (appliedEnv.length > 0) parts.push(appliedEnv.join(", "));
	if (account.piAuth) parts.push(`Pi OAuth: ${account.piAuth.provider}; cleared cached sessions`);
	return parts.join("; ") || "credentials applied";
}

function closeCachedSessionsIfAvailable(): void {
	const helpers = piAi as {
		cleanupSessionResources?: () => void;
		closeOpenAICodexWebSocketSessions?: () => void;
		resetOpenAICodexWebSocketDebugStats?: () => void;
	};
	helpers.cleanupSessionResources?.();
	helpers.closeOpenAICodexWebSocketSessions?.();
	helpers.resetOpenAICodexWebSocketDebugStats?.();
}
