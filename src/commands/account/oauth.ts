import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { slugify } from "../../accounts/format.js";
import type { AccountConfig } from "../../domain/types.js";
import { formatError } from "../../shared/errors.js";
import { PI_AUTH_PATH } from "../../storage/paths.js";
import { getPiAuthEntry, isOAuthAuthEntry } from "../../storage/pi-auth.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import { saveDuplicateSafe } from "./add.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";

export function registerAccountOAuthCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-oauth-import", {
		description: "Import the currently logged-in Pi /login OAuth credentials as a switchable account",
		handler: async (_args, ctx) => handleAccountOAuthImport(runtime, ctx),
	});
}

async function handleAccountOAuthImport(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		const providerChoice = await ctx.ui.select("Provider already logged in with Pi /login", ["anthropic", "openai-codex", "github-copilot", "google-antigravity", "custom"]);
		if (!providerChoice) return;
		const provider = providerChoice === "custom" ? (await ctx.ui.input("Pi auth provider id", "provider-id"))?.trim() : providerChoice;
		if (!provider) throw new Error("Provider is required");

		const entry = await getPiAuthEntry(provider);
		if (!entry) {
			ctx.ui.notify(`No Pi auth entry found for ${provider}. Run built-in /login ${provider} first, then run /account-oauth-import.`, "error");
			return;
		}
		if (!isOAuthAuthEntry(entry)) {
			const ok = await ctx.ui.confirm("Import non-OAuth auth entry?", `${provider} exists in ${PI_AUTH_PATH}, but it is not marked as OAuth. Import anyway?`);
			if (!ok) return;
		}

		const label = (await ctx.ui.input("Account label", `${provider} — Account`))?.trim();
		if (!label) throw new Error("Account label is required");
		const id = (await ctx.ui.input("Account id", slugify(label)))?.trim() || slugify(label);
		if (!id) throw new Error("Account id is required");

		await runtime.reloadConfig();
		const account: AccountConfig = { id, label, provider, piAuth: { provider, entry } };
		const saved = await saveDuplicateSafe(account, runtime, ctx);
		if (!saved) return;
		ctx.ui.notify(`Imported OAuth account ${saved.label}. Use /account ${provider} to switch back to it later.`, "info");
	} catch (error) {
		ctx.ui.notify(`OAuth import failed: ${formatError(error)}`, "error");
	}
}
