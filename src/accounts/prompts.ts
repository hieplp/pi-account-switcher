import { CONFIG_PATH } from "../storage/paths.js";
import { normalizeProvider, normalizeProviderWithCustom, providerChoices, requiredEnvKeysForProvider } from "../providers/catalog.js";
import type { AccountConfig, ProviderConfig, SecretSource } from "../domain/types.js";
import type { AccountSwitcherUi } from "../shared/ui.js";
import { slugify } from "./format.js";

export const SECRET_SOURCE_CHOICES = {
	literal: "Paste API key now (stored in config)",
	env: "Read from existing environment variable",
	file: "Read from file",
	command: "Run shell command",
	op: "1Password op reference",
} as const;

export const SECRET_SOURCE_CHOICE_LABELS = Object.values(SECRET_SOURCE_CHOICES);

export async function promptForAccount(
	ctx: { ui: Pick<AccountSwitcherUi, "select" | "input" | "confirm" | "notify"> },
	customProviders: ProviderConfig[] = [],
): Promise<AccountConfig | undefined> {
	const providerChoice = await ctx.ui.select("Provider", providerChoices(customProviders));
	if (!providerChoice) return undefined;

	const provider = providerChoice === "custom" ? normalizeProvider((await ctx.ui.input("Custom provider", "provider-id")) ?? "") : normalizeProvider(providerChoice);
	if (!provider) throw new Error("Provider is required");

	const label = (await ctx.ui.input("Account label", `${provider} — Work`))?.trim();
	if (!label) throw new Error("Account label is required");

	const suggestedId = slugify(label);
	const id = (await ctx.ui.input("Account id", suggestedId))?.trim() || suggestedId;
	if (!id) throw new Error("Account id is required");

	const customProvider = findCustomProvider(provider, customProviders);
	const model = customProvider ? await promptForCustomProviderModel(ctx, customProvider) : undefined;
	const providerApiKeyOverride = customProvider ? await promptForCustomProviderApiKey(ctx, customProvider) : undefined;
	if (customProvider && (providerApiKeyOverride || customProvider.apiKey)) {
		return {
			id,
			label,
			provider,
			...(model ? { model } : {}),
			...(providerApiKeyOverride ? { providerApiKey: providerApiKeyOverride } : { usesProviderApiKey: true }),
		};
	}

	const envKeys = requiredEnvKeysForProvider(provider, customProviders);
	const envChoice = await ctx.ui.select("Credential env var", [...envKeys, "custom"]);
	if (!envChoice) return undefined;
	const envName = envChoice === "custom" ? (await ctx.ui.input("Env var name", "PROVIDER_API_KEY"))?.trim() : envChoice;
	if (!envName) throw new Error("Env var name is required");

	const sourceChoice = await ctx.ui.select("How should Pi load this credential?", SECRET_SOURCE_CHOICE_LABELS);
	if (!sourceChoice) return undefined;

	const source = await promptForSecretSource(ctx, sourceChoice);
	if (!source) return undefined;

	return {
		id,
		label,
		provider,
		...(model ? { model } : {}),
		env: { [envName]: source },
	};
}

async function promptForCustomProviderModel(
	ctx: { ui: Pick<AccountSwitcherUi, "select" | "input"> },
	provider: ProviderConfig,
): Promise<string | undefined> {
	const modelIds = (provider.models ?? []).map((model) => model.id);
	if (modelIds.length === 0) return blankToUndefined(await ctx.ui.input("Default model for this account (optional)", "gpt-4o"));
	const choice = await ctx.ui.select("Default model for this account", ["Use current model", ...modelIds, "custom"]);
	if (!choice || choice === "Use current model") return undefined;
	return choice === "custom" ? blankToUndefined(await ctx.ui.input("Model id", modelIds[0])) : choice;
}

async function promptForCustomProviderApiKey(
	ctx: { ui: Pick<AccountSwitcherUi, "input" | "confirm" | "notify"> },
	provider: ProviderConfig,
): Promise<SecretSource | undefined> {
	if (!provider.baseUrl && !provider.models && !provider.apiKey) return undefined;
	const value = (await ctx.ui.input("Account API key override (blank uses provider apiKey)", provider.apiKey ? "blank = provider apiKey" : "sk-..."))?.trim();
	if (!value) return undefined;
	const ok = await ctx.ui.confirm("Store API key in account config?", `This will write the API key to ${CONFIG_PATH} as plain text. Continue?`);
	if (!ok) return undefined;
	return { type: "literal", value };
}

function blankToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function findCustomProvider(provider: string, customProviders: ProviderConfig[]): ProviderConfig | undefined {
	const normalized = normalizeProviderWithCustom(provider, customProviders);
	return customProviders.find((candidate) => normalizeProvider(candidate.id) === normalized);
}

export async function promptForSecretSource(
	ctx: {
		ui: Pick<AccountSwitcherUi, "input" | "confirm" | "notify">;
	},
	choice: string,
): Promise<SecretSource | undefined> {
	if (choice === SECRET_SOURCE_CHOICES.literal) {
		const ok = await ctx.ui.confirm("Store API key in config?", `This will write the API key to ${CONFIG_PATH} as plain text. Continue?`);
		if (!ok) return undefined;
		const value = (await ctx.ui.input("API key", "sk-..."))?.trim();
		if (!value) throw new Error("API key is required");
		return { type: "literal", value };
	}

	if (choice === SECRET_SOURCE_CHOICES.env) {
		const name = (await ctx.ui.input("Source environment variable", "MY_API_KEY"))?.trim();
		if (!name) throw new Error("Source environment variable is required");
		return { type: "env", name };
	}

	if (choice === SECRET_SOURCE_CHOICES.file) {
		const path = (await ctx.ui.input("Secret file path", "~/.keys/provider-account.txt"))?.trim();
		if (!path) throw new Error("File path is required");
		return { type: "file", path };
	}

	if (choice === SECRET_SOURCE_CHOICES.command) {
		const command = (await ctx.ui.input("Command", "op read op://AI/Account/api-key"))?.trim();
		if (!command) throw new Error("Command is required");
		return { type: "command", command };
	}

	if (choice === SECRET_SOURCE_CHOICES.op) {
		const reference = (await ctx.ui.input("1Password reference", "op://AI/Account/api-key"))?.trim();
		if (!reference) throw new Error("1Password reference is required");
		return { type: "op", reference };
	}

	throw new Error(`Unknown credential source choice: ${choice}`);
}
