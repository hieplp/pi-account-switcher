import { normalizeProvider } from "../../providers/catalog.js";
import type { ProviderConfig } from "../../domain/types.js";

type ProviderPromptContext = {
	ui: {
		input: (title: string, placeholder?: string) => Promise<string | undefined>;
		confirm: (title: string, message: string) => Promise<boolean>;
	};
};

export async function promptForProvider(ctx: ProviderPromptContext, original: ProviderConfig | undefined): Promise<ProviderConfig | undefined> {
	const id = normalizeProvider((await ctx.ui.input("Provider id", original?.id ?? "my-provider"))?.trim() ?? "");
	if (!id) throw new Error("Provider id is required");
	const label = (await ctx.ui.input("Provider label", original?.label ?? original?.name ?? id))?.trim() || id;
	const baseUrl = blankToUndefined(await ctx.ui.input("Base URL (blank for account-only provider)", original?.baseUrl ?? "https://api.example.com/v1"));
	let api = blankToUndefined(await ctx.ui.input("Pi API type", original?.api ?? "openai-completions"));
	const apiKey = blankToUndefined(await ctx.ui.input("Pi apiKey env var/name or raw key", original?.apiKey ?? `${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`));
	const envKeys = parseCsv((await ctx.ui.input("Env key suggestions (comma-separated)", (original?.envKeys ?? (apiKey ? [apiKey] : ["PROVIDER_API_KEY"])).join(", "))) ?? "");
	const aliases = parseCsv((await ctx.ui.input("Aliases (comma-separated, optional)", (original?.aliases ?? []).join(", "))) ?? "").map(normalizeProvider);
	const models = parseJsonArray(await ctx.ui.input("Models JSON array (optional)", original?.models ? JSON.stringify(original.models) : ""), "models");
	if (!api && (baseUrl || apiKey || models)) api = "openai-completions";
	const compat = parseJsonRecord(await ctx.ui.input("Compat JSON object (optional)", original?.compat ? JSON.stringify(original.compat) : ""), "compat");
	const addPiAuth = await ctx.ui.confirm("Configure Pi OAuth provider id?", "Only choose yes if this provider maps to a Pi /login auth entry.");
	const piAuthProvider = addPiAuth ? (await ctx.ui.input("Pi auth provider id", original?.piAuthProvider ?? id))?.trim() : original?.piAuthProvider;
	return { id, label, name: label, envKeys, aliases, ...(baseUrl ? { baseUrl } : {}), ...(api ? { api } : {}), ...(apiKey ? { apiKey } : {}), ...(models ? { models } : {}), ...(compat ? { compat } : {}), ...(piAuthProvider ? { piAuthProvider } : {}) };
}

function parseCsv(value: string): string[] {
	return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];
}

function blankToUndefined(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseJsonArray(value: string | undefined, field: string): any[] | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	const parsed = JSON.parse(trimmed);
	if (!Array.isArray(parsed)) throw new Error(`${field} must be a JSON array`);
	return parsed;
}

function parseJsonRecord(value: string | undefined, field: string): Record<string, unknown> | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	const parsed = JSON.parse(trimmed);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${field} must be a JSON object`);
	return parsed as Record<string, unknown>;
}
