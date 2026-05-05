import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { access } from "node:fs/promises";
import { normalizeProvider, COMMON_PROVIDERS, requiredEnvKeysForProvider } from "../providers/catalog.js";
import { promptForSecretSource } from "../accounts/prompts.js";
import { selectAccount } from "../accounts/select.js";
import { secretSourceKind, summarizeAccount } from "../accounts/summary.js";
import { resolveSecret } from "../accounts/secrets.js";
import type { AccountConfig, SecretSource } from "../domain/types.js";
import type { AccountSwitcherRuntime } from "../runtime/account-switcher.js";
import { formatError } from "../shared/errors.js";

export function registerAccountManageCommands(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-remove", {
		description: "Delete a configured account",
		handler: async (_args, ctx) => {
			try {
				await runtime.reloadConfig();
				if (runtime.accountCount === 0) {
					ctx.ui.notify("No accounts configured.", "info");
					return;
				}
				const account = await selectAccount(ctx.ui, "Remove account", runtime.accounts);
				if (!account) return;
				const confirmed = await ctx.ui.confirm("Delete account?", `Delete ${summarizeAccount(account)}? Secrets will not be shown.`);
				if (!confirmed) return;
				const clearedProviders = await runtime.removeConfiguredAccount(account);
				runtime.updateStatus(ctx);
				const stateNote = clearedProviders.length > 0 ? ` Cleared saved selection for ${clearedProviders.join(", ")}.` : "";
				ctx.ui.notify(`Removed account ${account.label}.${stateNote}`, "info");
			} catch (error) {
				ctx.ui.notify(`Failed to remove account: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-edit", {
		description: "Edit a configured account",
		handler: async (_args, ctx) => {
			try {
				await runtime.reloadConfig();
				if (runtime.accountCount === 0) {
					ctx.ui.notify("No accounts configured.", "info");
					return;
				}
				const original = await selectAccount(ctx.ui, "Edit account", runtime.accounts);
				if (!original) return;

				const account = await promptForAccountEdit(original, ctx);
				if (!account) return;

				const duplicate = runtime.accounts.find((candidate) => candidate.id === account.id && candidate.id !== original.id);
				if (duplicate) throw new Error(`Account id already exists: ${account.id}`);

				const providerChanged = normalizeProvider(original.provider) !== normalizeProvider(account.provider);
				const activeProviders = [normalizeProvider(original.provider)].filter((provider) => runtime.getActiveAccount(provider)?.id === original.id);
				if ((original.id !== account.id || providerChanged) && activeProviders.length > 0) {
					const ok = await ctx.ui.confirm("Update active account selection?", `This account is currently selected for ${activeProviders.join(", ")}. Update saved state to ${normalizeProvider(account.provider)} / ${account.id}?`);
					if (!ok) return;
				}

				await runtime.replaceConfiguredAccount(original, account);
				runtime.updateStatus(ctx);
				ctx.ui.notify(`Saved account ${account.label}.`, "info");
			} catch (error) {
				ctx.ui.notify(`Failed to edit account: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-test", {
		description: "Validate configured account credentials without printing secrets",
		handler: async (_args, ctx) => {
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
		},
	});
}

async function promptForAccountEdit(
	original: AccountConfig,
	ctx: { ui: { select: (title: string, items: string[]) => Promise<string | undefined>; input: (title: string, placeholder?: string) => Promise<string | undefined>; confirm: (title: string, message: string) => Promise<boolean>; notify: (message: string, kind?: "error" | "info" | "warning") => void } },
): Promise<AccountConfig | undefined> {
	const label = (await ctx.ui.input("Account label (blank keeps current)", original.label))?.trim() || original.label;
	const providerChoice = await ctx.ui.select("Provider", ["Keep current", ...COMMON_PROVIDERS]);
	if (!providerChoice) return undefined;
	const provider = providerChoice === "Keep current" ? normalizeProvider(original.provider) : providerChoice === "custom" ? normalizeProvider((await ctx.ui.input("Custom provider", original.provider))?.trim() ?? "") : normalizeProvider(providerChoice);
	if (!provider) throw new Error("Provider is required");
	const id = (await ctx.ui.input("Account id (blank keeps current)", original.id))?.trim() || original.id;
	if (!id) throw new Error("Account id is required");

	let env = original.env;
	let piAuth = original.piAuth;
	const credentialAction = await ctx.ui.select("Credentials", ["Keep current credentials", "Replace env credential", "Remove env credentials"]);
	if (!credentialAction) return undefined;
	if (credentialAction === "Replace env credential") {
		const envKeys = requiredEnvKeysForProvider(provider);
		const envChoice = await ctx.ui.select("Credential env var", [...envKeys, "custom"]);
		if (!envChoice) return undefined;
		const envName = envChoice === "custom" ? (await ctx.ui.input("Env var name", Object.keys(original.env ?? {})[0] ?? "PROVIDER_API_KEY"))?.trim() : envChoice;
		if (!envName) throw new Error("Env var name is required");
		const sourceChoice = await ctx.ui.select("How should Pi load this credential?", [
			"Paste API key now (stored in config)",
			"Read from existing environment variable",
			"Read from file",
			"Run shell command",
			"1Password op reference",
		]);
		if (!sourceChoice) return undefined;
		const source = await promptForSecretSource(ctx, sourceChoice);
		if (!source) return undefined;
		env = { [envName]: source };
	} else if (credentialAction === "Remove env credentials") {
		env = undefined;
	}

	const next: AccountConfig = { id, label, provider };
	if (env && Object.keys(env).length > 0) next.env = env;
	if (piAuth) next.piAuth = { ...piAuth, provider: normalizeProvider(piAuth.provider) };
	if (!next.env && !next.piAuth) throw new Error("Account must define env credentials or piAuth credentials");
	return next;
}

async function testAccount(account: AccountConfig): Promise<Array<{ name: string; ok: boolean; message: string }>> {
	const results: Array<{ name: string; ok: boolean; message: string }> = [];
	for (const [name, source] of Object.entries(account.env ?? {})) {
		results.push(await testSecretSource(name, source));
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
