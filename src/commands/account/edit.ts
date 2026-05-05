import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { normalizeProvider, normalizeProviderWithCustom, providerChoices, requiredEnvKeysForProvider } from "../../providers/catalog.js";
import { SECRET_SOURCE_CHOICE_LABELS, promptForSecretSource } from "../../accounts/prompts.js";
import { selectAccount } from "../../accounts/select.js";
import type { AccountConfig, ProviderConfig } from "../../domain/types.js";
import type { AccountSwitcherRuntime } from "../../runtime/account-switcher.js";
import type { AccountSwitcherContext } from "../../shared/ui.js";
import { formatError } from "../../shared/errors.js";

export function registerAccountEditCommand(pi: ExtensionAPI, runtime: AccountSwitcherRuntime): void {
	pi.registerCommand("account-edit", {
		description: "Edit a configured account",
		handler: async (_args, ctx) => handleEditAccount(runtime, ctx),
	});
}

async function handleEditAccount(runtime: AccountSwitcherRuntime, ctx: AccountSwitcherContext): Promise<void> {
	try {
		await runtime.reloadConfig();
		if (runtime.accountCount === 0) {
			ctx.ui.notify("No accounts configured.", "info");
			return;
		}
		const original = await selectAccount(ctx.ui, "Edit account", runtime.accounts);
		if (!original) return;

		const account = await promptForAccountEdit(original, ctx, runtime.providers);
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
}

async function promptForAccountEdit(
	original: AccountConfig,
	ctx: AccountSwitcherContext,
	customProviders: ProviderConfig[] = [],
): Promise<AccountConfig | undefined> {
	const label = (await ctx.ui.input("Account label (blank keeps current)", original.label))?.trim() || original.label;
	const providerChoice = await ctx.ui.select("Provider", ["Keep current", ...providerChoices(customProviders)]);
	if (!providerChoice) return undefined;
	const provider = providerChoice === "Keep current" ? normalizeProvider(original.provider) : providerChoice === "custom" ? normalizeProvider((await ctx.ui.input("Custom provider", original.provider))?.trim() ?? "") : normalizeProvider(providerChoice);
	if (!provider) throw new Error("Provider is required");
	const id = (await ctx.ui.input("Account id (blank keeps current)", original.id))?.trim() || original.id;
	if (!id) throw new Error("Account id is required");

	let env = original.env;
	let piAuth = original.piAuth;
	let providerApiKey = original.providerApiKey;
	let usesProviderApiKey = original.usesProviderApiKey;
	let model = original.model;
	const customProvider = findCustomProvider(provider, customProviders);
	if (customProvider) {
		const modelAction = await ctx.ui.select("Default model", ["Keep current model", "Use current model", ...(customProvider.models ?? []).map((candidate) => candidate.id), "custom"]);
		if (!modelAction) return undefined;
		if (modelAction === "Use current model") model = undefined;
		else if (modelAction === "custom") model = (await ctx.ui.input("Model id", model ?? customProvider.models?.[0]?.id ?? "gpt-4o"))?.trim() || undefined;
		else if (modelAction !== "Keep current model") model = modelAction;
	}

	const credentialAction = await ctx.ui.select("Credentials", customProvider ? ["Keep current credentials", "Replace provider API key override", "Use provider apiKey", "Replace env credential", "Remove env credentials"] : ["Keep current credentials", "Replace env credential", "Remove env credentials"]);
	if (!credentialAction) return undefined;
	if (credentialAction === "Replace provider API key override") {
		const value = (await ctx.ui.input("Account API key override", "sk-..."))?.trim();
		if (!value) throw new Error("API key is required");
		providerApiKey = { type: "literal", value };
		usesProviderApiKey = false;
		env = undefined;
	} else if (credentialAction === "Use provider apiKey") {
		providerApiKey = undefined;
		usesProviderApiKey = true;
		env = undefined;
	} else if (credentialAction === "Replace env credential") {
		const envKeys = requiredEnvKeysForProvider(provider, customProviders);
		const envChoice = await ctx.ui.select("Credential env var", [...envKeys, "custom"]);
		if (!envChoice) return undefined;
		const envName = envChoice === "custom" ? (await ctx.ui.input("Env var name", Object.keys(original.env ?? {})[0] ?? "PROVIDER_API_KEY"))?.trim() : envChoice;
		if (!envName) throw new Error("Env var name is required");
		const sourceChoice = await ctx.ui.select("How should Pi load this credential?", SECRET_SOURCE_CHOICE_LABELS);
		if (!sourceChoice) return undefined;
		const source = await promptForSecretSource(ctx, sourceChoice);
		if (!source) return undefined;
		env = { [envName]: source };
		providerApiKey = undefined;
		usesProviderApiKey = false;
	} else if (credentialAction === "Remove env credentials") {
		env = undefined;
	}

	if (!env && !providerApiKey && !piAuth && customProvider?.apiKey) usesProviderApiKey = true;

	const next: AccountConfig = { id, label, provider };
	if (model) next.model = model;
	if (env && Object.keys(env).length > 0) next.env = env;
	if (providerApiKey) next.providerApiKey = providerApiKey;
	if (usesProviderApiKey) next.usesProviderApiKey = true;
	if (piAuth) next.piAuth = { ...piAuth, provider: normalizeProvider(piAuth.provider) };
	if (!next.env && !next.providerApiKey && !next.usesProviderApiKey && !next.piAuth && !customProvider?.apiKey) throw new Error("Account must define env credentials, providerApiKey, provider apiKey, or piAuth credentials");
	return next;
}

function findCustomProvider(provider: string, customProviders: ProviderConfig[]): ProviderConfig | undefined {
	const normalized = normalizeProviderWithCustom(provider, customProviders);
	return customProviders.find((candidate) => normalizeProvider(candidate.id) === normalized);
}
