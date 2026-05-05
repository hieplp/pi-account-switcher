import { CONFIG_PATH } from "../storage/paths.js";
import { COMMON_PROVIDERS, normalizeProvider, requiredEnvKeysForProvider } from "../providers/catalog.js";
import type { AccountConfig, SecretSource } from "../domain/types.js";
import type { AccountSwitcherUi } from "../shared/ui.js";
import { slugify } from "./format.js";

export async function promptForAccount(ctx: { ui: Pick<AccountSwitcherUi, "select" | "input" | "confirm" | "notify"> }): Promise<AccountConfig | undefined> {
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
		ui: Pick<AccountSwitcherUi, "input" | "confirm" | "notify">;
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
