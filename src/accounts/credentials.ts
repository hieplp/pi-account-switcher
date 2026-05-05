import * as piAi from "@mariozechner/pi-ai";
import { setPiAuthEntry } from "../storage/pi-auth.js";
import { applyAccountEnv } from "./secrets.js";
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
	const appliedEnv = await applyAccountEnv(account);
	if (account.piAuth) {
		// Update both disk and Pi's live in-memory AuthStorage. Writing auth.json alone
		// only takes effect after a process restart because the active model registry
		// keeps credentials in memory.
		await setPiAuthEntry(account.piAuth.provider, account.piAuth.entry);
		modelRegistry?.authStorage?.set?.(account.piAuth.provider, account.piAuth.entry as any);
		modelRegistry?.authStorage?.reload?.();

		if (account.piAuth.provider === "openai-codex") {
			closeOpenAICodexWebSocketSessionsIfAvailable();
		}
	}
	const parts = [];
	if (appliedEnv.length > 0) parts.push(appliedEnv.join(", "));
	if (account.piAuth) parts.push(`Pi OAuth: ${account.piAuth.provider}${account.piAuth.provider === "openai-codex" ? "; closed cached Codex websocket" : ""}`);
	return parts.join("; ") || "credentials applied";
}

function closeOpenAICodexWebSocketSessionsIfAvailable(): void {
	const helpers = piAi as {
		closeOpenAICodexWebSocketSessions?: () => void;
		resetOpenAICodexWebSocketDebugStats?: () => void;
	};
	helpers.closeOpenAICodexWebSocketSessions?.();
	helpers.resetOpenAICodexWebSocketDebugStats?.();
}
