import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { closeOpenAICodexWebSocketSessions, resetOpenAICodexWebSocketDebugStats } from "@mariozechner/pi-ai";
import { addAccount, loadConfig, ensureExampleConfig } from "./config.js";
import { CONFIG_PATH, PI_AUTH_PATH } from "./paths.js";
import { COMMON_PROVIDERS, normalizeProvider, providerMatches, requiredEnvKeysForProvider } from "./providers.js";
import { getPiAuthEntry, isOAuthAuthEntry, setPiAuthEntry } from "./pi-auth.js";
import { applyAccountEnv } from "./secrets.js";
import { loadState, saveSelectedAccount } from "./state.js";
import type { AccountConfig, AccountSwitcherConfig, SecretSource } from "./types.js";

export default function accountSwitcher(pi: ExtensionAPI) {
	let config: AccountSwitcherConfig = { accounts: [], switchMode: "env" };
	let currentProvider: string | undefined;
	const activeAccountByProvider = new Map<string, AccountConfig>();

	async function reloadConfig(): Promise<void> {
		config = await loadConfig();
	}

	async function restoreSavedAccounts(ctx: { ui: { setStatus: (key: string, value: string) => void; notify: (message: string, kind?: "error" | "info" | "warning") => void } }) {
		const state = await loadState();
		for (const [provider, accountId] of Object.entries(state.selected)) {
			const account = config.accounts.find((candidate) => candidate.id === accountId && providerMatches(candidate.provider, provider));
			if (!account) continue;
			try {
				await applyAccountCredentials(account);
				activeAccountByProvider.set(normalizeProvider(provider), account);
			} catch (error) {
				ctx.ui.notify(`Failed to restore account ${account.label}: ${formatError(error)}`, "error");
			}
		}
		updateStatus(ctx);
	}

	function updateStatus(ctx: { ui: { setStatus: (key: string, value: string) => void } }) {
		const provider = currentProvider ? normalizeProvider(currentProvider) : undefined;
		const account = provider ? activeAccountByProvider.get(provider) : undefined;
		ctx.ui.setStatus("account", account ? `👤 ${account.label}` : "👤 no account");
	}

	pi.on("session_start", async (_event, ctx) => {
		await reloadConfig();
		await restoreSavedAccounts(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		currentProvider = event.model.provider;
		updateStatus(ctx);
	});

	pi.registerCommand("account", {
		description: "Pick and activate an account/API key for the current provider",
		handler: async (args, ctx) => {
			await reloadConfig();

			const requestedProvider = args.trim() || currentProvider || getProviderFromContext(ctx);
			if (!requestedProvider) {
				ctx.ui.notify("No active provider detected. Try /account anthropic or /account openai.", "error");
				return;
			}

			const provider = normalizeProvider(requestedProvider);
			const accounts = config.accounts.filter((account) => providerMatches(account.provider, provider));

			if (accounts.length === 0) {
				ctx.ui.notify(`No accounts configured for ${provider}. Edit ${CONFIG_PATH}.`, "error");
				return;
			}

			const items = accounts.map((account) => formatAccountItem(account, activeAccountByProvider.get(provider)?.id === account.id));
			const selected = await ctx.ui.select(`Pick account for ${provider}`, items);
			if (!selected) return;

			const selectedIndex = items.indexOf(selected);
			const account = accounts[selectedIndex];
			if (!account) return;

			try {
				const applied = await applyAccountCredentials(account, ctx.modelRegistry);
				activeAccountByProvider.set(provider, account);
				currentProvider = provider;
				await saveSelectedAccount(provider, account.id);
				updateStatus(ctx);
				ctx.ui.notify(`Switched ${provider} to ${account.label} (${applied}).`, "info");
				if (await reloadAfterOAuthSwitch(account, ctx)) return;
			} catch (error) {
				ctx.ui.notify(`Failed to switch account: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("accounts", {
		description: "List configured account switcher accounts",
		handler: async (_args, ctx) => {
			await reloadConfig();
			if (config.accounts.length === 0) {
				ctx.ui.notify(`No accounts configured. Create ${CONFIG_PATH}.`, "info");
				return;
			}

			const items = config.accounts.map((account) => {
				const provider = normalizeProvider(account.provider);
				const active = activeAccountByProvider.get(provider)?.id === account.id ? "✓ " : "";
				return `${active}${account.label} — ${provider} (${account.id})`;
			});
			await ctx.ui.select("Configured accounts", items);
		},
	});

	pi.registerCommand("account-current", {
		description: "Show the active account for the current provider",
		handler: async (_args, ctx) => {
			const provider = currentProvider ? normalizeProvider(currentProvider) : normalizeProvider(getProviderFromContext(ctx) ?? "");
			const account = provider ? activeAccountByProvider.get(provider) : undefined;
			ctx.ui.notify(account ? `Current ${provider} account: ${account.label} (${account.id})` : "No active account selected.", "info");
		},
	});

	pi.registerCommand("account-add", {
		description: "Add a new provider account from inside Pi",
		handler: async (_args, ctx) => {
			try {
				const account = await promptForAccount(ctx);
				if (!account) return;

				config = await addAccount(account);
				ctx.ui.notify(`Added account ${account.label} to ${CONFIG_PATH}.`, "info");

				const activate = await ctx.ui.confirm("Activate now?", `Switch ${normalizeProvider(account.provider)} to ${account.label} now?`);
				if (activate) {
					const provider = normalizeProvider(account.provider);
					const applied = await applyAccountCredentials(account, ctx.modelRegistry);
					activeAccountByProvider.set(provider, account);
					currentProvider = provider;
					await saveSelectedAccount(provider, account.id);
					updateStatus(ctx);
					ctx.ui.notify(`Activated ${account.label} (${applied}).`, "info");
					if (await reloadAfterOAuthSwitch(account, ctx)) return;
				}
			} catch (error) {
				ctx.ui.notify(`Failed to add account: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-login", {
		description: "Login by adding an account/API key from inside Pi",
		handler: async (_args, ctx) => {
			// Same UX as /account-add. Kept as a friendlier alias for users who think in terms of login.
			try {
				const account = await promptForAccount(ctx);
				if (!account) return;
				config = await addAccount(account);
				const provider = normalizeProvider(account.provider);
				const applied = await applyAccountCredentials(account, ctx.modelRegistry);
				activeAccountByProvider.set(provider, account);
				currentProvider = provider;
				await saveSelectedAccount(provider, account.id);
				updateStatus(ctx);
				ctx.ui.notify(`Logged in as ${account.label} (${applied}).`, "info");
				if (await reloadAfterOAuthSwitch(account, ctx)) return;
			} catch (error) {
				ctx.ui.notify(`Login failed: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-oauth-import", {
		description: "Import the currently logged-in Pi /login OAuth credentials as a switchable account",
		handler: async (_args, ctx) => {
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

				const account: AccountConfig = {
					id,
					label,
					provider,
					piAuth: { provider, entry },
				};

				config = await addAccount(account);
				ctx.ui.notify(`Imported OAuth account ${label}. Use /account ${provider} to switch back to it later.`, "info");
			} catch (error) {
				ctx.ui.notify(`OAuth import failed: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-debug", {
		description: "Show account switcher debug info without exposing secrets",
		handler: async (_args, ctx) => {
			await reloadConfig();
			const provider = currentProvider ? normalizeProvider(currentProvider) : normalizeProvider(getProviderFromContext(ctx) ?? "");
			const active = provider ? activeAccountByProvider.get(provider) : undefined;
			const authEntry = provider ? await getPiAuthEntry(provider) : undefined;
			ctx.ui.notify(
				[
					`model provider: ${provider || "unknown"}`,
					`active account: ${active ? `${active.label} (${active.id})` : "none"}`,
					`accounts configured: ${config.accounts.length}`,
					`pi auth entry for provider: ${authEntry ? String(authEntry.type ?? "unknown") : "missing"}`,
					`auth file: ${PI_AUTH_PATH}`,
				].join("\n"),
				"info",
			);
		},
	});

	pi.registerCommand("account-reload", {
		description: "Reload account switcher config from disk",
		handler: async (_args, ctx) => {
			try {
				await reloadConfig();
				ctx.ui.notify(`Reloaded ${config.accounts.length} account(s) from ${CONFIG_PATH}.`, "info");
			} catch (error) {
				ctx.ui.notify(`Failed to reload config: ${formatError(error)}`, "error");
			}
		},
	});

	pi.registerCommand("account-init", {
		description: "Create an example account switcher config if missing",
		handler: async (_args, ctx) => {
			await ensureExampleConfig();
			await reloadConfig();
			ctx.ui.notify(`Config ready at ${CONFIG_PATH}. Edit it with your accounts, then run /account-reload.`, "info");
		},
	});
}

async function reloadAfterOAuthSwitch(
	account: AccountConfig,
	ctx: {
		ui: {
			notify: (message: string, kind?: "error" | "info" | "warning") => void;
		};
	},
): Promise<boolean> {
	if (!account.piAuth) return false;
	ctx.ui.notify("OAuth credentials were updated in Pi's live auth storage. The next model request should use this account without restarting Pi.", "info");
	return false;
}

async function applyAccountCredentials(
	account: AccountConfig,
	modelRegistry?: {
		authStorage?: {
			set?: (provider: string, credential: any) => void;
			reload?: () => void;
		};
	},
): Promise<string> {
	const appliedEnv = await applyAccountEnv(account);
	if (account.piAuth) {
		// Update both disk and Pi's live in-memory AuthStorage. Writing auth.json alone
		// only takes effect after a process restart because the active model registry
		// keeps credentials in memory.
		await setPiAuthEntry(account.piAuth.provider, account.piAuth.entry);
		modelRegistry?.authStorage?.set?.(account.piAuth.provider, account.piAuth.entry as any);
		modelRegistry?.authStorage?.reload?.();

		if (account.piAuth.provider === "openai-codex") {
			closeOpenAICodexWebSocketSessions();
			resetOpenAICodexWebSocketDebugStats();
		}
	}
	const parts = [];
	if (appliedEnv.length > 0) parts.push(appliedEnv.join(", "));
	if (account.piAuth) parts.push(`Pi OAuth: ${account.piAuth.provider}${account.piAuth.provider === "openai-codex" ? "; closed cached Codex websocket" : ""}`);
	return parts.join("; ") || "credentials applied";
}

async function promptForAccount(ctx: {
	ui: {
		select: (title: string, items: string[]) => Promise<string | undefined>;
		input: (title: string, placeholder?: string) => Promise<string | undefined>;
		confirm: (title: string, message: string) => Promise<boolean>;
		notify: (message: string, kind?: "error" | "info" | "warning") => void;
	};
}): Promise<AccountConfig | undefined> {
	const providerChoice = await ctx.ui.select("Provider", [...COMMON_PROVIDERS]);
	if (!providerChoice) return undefined;

	const provider = providerChoice === "custom" ? normalizeProvider((await ctx.ui.input("Custom provider", "provider-id")) ?? "") : normalizeProvider(providerChoice);
	if (!provider) throw new Error("Provider is required");

	const label = (await ctx.ui.input("Account label", `${provider} — Work`))?.trim();
	if (!label) throw new Error("Account label is required");

	const suggestedId = slugify(label);
	const id = (await ctx.ui.input("Account id", suggestedId))?.trim() || suggestedId;
	if (!id) throw new Error("Account id is required");

	const envKeys = requiredEnvKeysForProvider(provider);
	const envChoice = await ctx.ui.select("Credential env var", [...envKeys, "custom"]);
	if (!envChoice) return undefined;
	const envName = envChoice === "custom" ? (await ctx.ui.input("Env var name", "PROVIDER_API_KEY"))?.trim() : envChoice;
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

	return {
		id,
		label,
		provider,
		env: { [envName]: source },
	};
}

async function promptForSecretSource(
	ctx: {
		ui: {
			input: (title: string, placeholder?: string) => Promise<string | undefined>;
			confirm: (title: string, message: string) => Promise<boolean>;
			notify: (message: string, kind?: "error" | "info" | "warning") => void;
		};
	},
	choice: string,
): Promise<SecretSource | undefined> {
	if (choice.startsWith("Paste")) {
		const ok = await ctx.ui.confirm("Store API key in config?", `This will write the API key to ${CONFIG_PATH} as plain text. Continue?`);
		if (!ok) return undefined;
		const value = (await ctx.ui.input("API key", "sk-..."))?.trim();
		if (!value) throw new Error("API key is required");
		return { type: "literal", value };
	}

	if (choice.startsWith("Read from existing environment")) {
		const name = (await ctx.ui.input("Source environment variable", "MY_API_KEY"))?.trim();
		if (!name) throw new Error("Source environment variable is required");
		return { type: "env", name };
	}

	if (choice.startsWith("Read from file")) {
		const path = (await ctx.ui.input("Secret file path", "~/.keys/provider-account.txt"))?.trim();
		if (!path) throw new Error("File path is required");
		return { type: "file", path };
	}

	if (choice.startsWith("Run shell command")) {
		const command = (await ctx.ui.input("Command", "op read op://AI/Account/api-key"))?.trim();
		if (!command) throw new Error("Command is required");
		return { type: "command", command };
	}

	const reference = (await ctx.ui.input("1Password reference", "op://AI/Account/api-key"))?.trim();
	if (!reference) throw new Error("1Password reference is required");
	return { type: "op", reference };
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function formatAccountItem(account: AccountConfig, active: boolean): string {
	return `${active ? "✓ " : ""}${account.label} (${account.id})`;
}

function getProviderFromContext(ctx: unknown): string | undefined {
	const maybe = ctx as { model?: { provider?: string } };
	return maybe.model?.provider;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
