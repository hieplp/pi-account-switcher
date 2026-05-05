import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { access } from "node:fs/promises";
import { selectAccount } from "../../accounts/select.js";
import { secretSourceKind } from "../../accounts/summary.js";
import { resolveSecret } from "../../accounts/secrets.js";
import type { AccountConfig, SecretSource } from "../../domain/types.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";
import { formatError } from "../../shared/errors.js";

export function registerAccountTestCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-test", {
		description: "Validate configured account credentials without printing secrets",
		handler: async (_args, ctx) => handleTestAccount(runtime, ctx),
	});
}

async function handleTestAccount(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		if (runtime.accountCount === 0) {
			ctx.ui.notify("No accounts configured.", "info");
			return;
		}
		const account = await selectAccount(ctx.ui, "Test account", runtime.accounts);
		if (!account) return;
		const results = await testAccount(account);
		const failed = results.filter((result) => !result.ok);
		const detail = results.map((result) => `${result.ok ? "✓" : "✗"} ${result.name}: ${result.message}`).join("; ");
		ctx.ui.notify(`${failed.length === 0 ? "Account test passed" : "Account test failed"}: ${detail}`, failed.length === 0 ? "info" : "error");
	} catch (error) {
		ctx.ui.notify(`Failed to test account: ${formatError(error)}`, "error");
	}
}

async function testAccount(account: AccountConfig): Promise<Array<{ name: string; ok: boolean; message: string }>> {
	const results: Array<{ name: string; ok: boolean; message: string }> = [];
	for (const [name, source] of Object.entries(account.env ?? {})) {
		results.push(await testSecretSource(name, source));
	}
	if (account.providerApiKey) {
		results.push(await testSecretSource("providerApiKey", account.providerApiKey));
	}
	if (account.piAuth) {
		const ok = Boolean(account.piAuth.provider && account.piAuth.entry && Object.keys(account.piAuth.entry).length > 0);
		results.push({ name: "piAuth", ok, message: ok ? `present for ${account.piAuth.provider}` : "missing provider or entry" });
	}
	if (results.length === 0) results.push({ name: "credentials", ok: false, message: "none configured" });
	return results;
}

async function testSecretSource(name: string, source: SecretSource): Promise<{ name: string; ok: boolean; message: string }> {
	try {
		if (typeof source !== "string" && source.type === "file") await access(expandHome(source.path));
		const value = await resolveSecret(source);
		return { name, ok: value.length > 0, message: value.length > 0 ? `${secretSourceKind(source)} resolved non-empty value` : `${secretSourceKind(source)} resolved empty value` };
	} catch {
		return { name, ok: false, message: `${secretSourceKind(source)} failed to resolve` };
	}
}

function expandHome(path: string): string {
	if (path === "~") return process.env.HOME ?? path;
	if (path.startsWith("~/")) return `${process.env.HOME ?? "~"}${path.slice(1)}`;
	return path;
}
