import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { PROVIDERS_PATH } from "./paths.js";
import { isBuiltInProviderId, normalizeProvider } from "../providers/catalog.js";
import type { ProviderCatalogConfig, ProviderConfig } from "../domain/types.js";
import { formatError } from "../shared/errors.js";

const jsonRecordSchema = z.record(z.string(), z.unknown());

const providerModelSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1).optional(),
		api: z.string().min(1).optional(),
		baseUrl: z.string().min(1).optional(),
		reasoning: z.boolean().optional(),
		input: z.array(z.enum(["text", "image"])).optional(),
		contextWindow: z.number().int().positive().optional(),
		maxTokens: z.number().int().positive().optional(),
		cost: z.object({ input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number() }).optional(),
		compat: jsonRecordSchema.optional(),
		thinkingLevelMap: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
		headers: z.record(z.string(), z.string()).optional(),
	})
	.passthrough();

const providerSchema = z
	.object({
		id: z.string().min(1).optional(),
		label: z.string().min(1).optional(),
		name: z.string().min(1).optional(),
		envKeys: z.array(z.string().min(1)).optional(),
		aliases: z.array(z.string().min(1)).optional(),
		piAuthProvider: z.string().min(1).optional(),
		baseUrl: z.string().min(1).optional(),
		api: z.string().min(1).optional(),
		apiKey: z.string().min(1).optional(),
		headers: z.record(z.string(), z.string()).optional(),
		authHeader: z.boolean().optional(),
		compat: jsonRecordSchema.optional(),
		models: z.array(providerModelSchema).optional(),
		modelOverrides: z.record(z.string(), providerModelSchema.partial()).optional(),
	})
	.passthrough();

const providerCatalogArraySchema = z.object({
	providers: z.array(providerSchema).default([]),
});

const providerCatalogRecordSchema = z.object({
	providers: z.record(z.string().min(1), providerSchema).default({}),
});

export async function loadProviderCatalog(path = PROVIDERS_PATH): Promise<ProviderCatalogConfig> {
	try {
		const raw = await readFile(path, "utf8");
		const json = JSON.parse(raw) as unknown;
		const parsed = parseProviderCatalog(json);
		validateProviderCatalog(parsed);
		return parsed;
	} catch (error) {
		if (isMissingFileError(error)) return { providers: [] };
		throw new Error(`Failed to load account switcher providers at ${path}: ${formatError(error)}`);
	}
}

export async function saveProviderCatalog(config: ProviderCatalogConfig, path = PROVIDERS_PATH): Promise<void> {
	validateProviderCatalog(config);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(serializeProviderCatalog(config), null, 2)}\n`, "utf8");
}

export async function addProvider(provider: ProviderConfig, path = PROVIDERS_PATH): Promise<ProviderCatalogConfig> {
	const config = await loadProviderCatalog(path);
	const next = { providers: [...config.providers, normalizeProviderConfig(provider)] };
	await saveProviderCatalog(next, path);
	return next;
}

export async function replaceProvider(originalId: string, provider: ProviderConfig, path = PROVIDERS_PATH): Promise<ProviderCatalogConfig> {
	const config = await loadProviderCatalog(path);
	const index = config.providers.findIndex((candidate) => normalizeProvider(candidate.id) === normalizeProvider(originalId));
	if (index === -1) throw new Error(`Custom provider not found: ${originalId}`);
	const nextProviders = [...config.providers];
	nextProviders[index] = normalizeProviderConfig(provider);
	const next = { providers: nextProviders };
	await saveProviderCatalog(next, path);
	return next;
}

export async function removeProvider(providerId: string, path = PROVIDERS_PATH): Promise<ProviderCatalogConfig> {
	const config = await loadProviderCatalog(path);
	const normalizedId = normalizeProvider(providerId);
	const nextProviders = config.providers.filter((provider) => normalizeProvider(provider.id) !== normalizedId);
	if (nextProviders.length === config.providers.length) throw new Error(`Custom provider not found: ${providerId}`);
	const next = { providers: nextProviders };
	await saveProviderCatalog(next, path);
	return next;
}

function parseProviderCatalog(json: unknown): ProviderCatalogConfig {
	const recordResult = providerCatalogRecordSchema.safeParse(json);
	if (recordResult.success && !Array.isArray((json as { providers?: unknown }).providers)) {
		return {
			providers: Object.entries(recordResult.data.providers).map(([id, provider]) => normalizeProviderConfig({ ...provider, id: provider.id ?? id })),
		};
	}
	const arrayResult = providerCatalogArraySchema.safeParse(json);
	if (!arrayResult.success) throw arrayResult.error;
	return {
		providers: arrayResult.data.providers.map((provider) => {
			if (!provider.id) throw new Error("Provider id is required");
			return normalizeProviderConfig(provider as ProviderConfig);
		}),
	};
}

function serializeProviderCatalog(config: ProviderCatalogConfig): { providers: Record<string, Omit<ProviderConfig, "id" | "label"> & { name?: string }> } {
	return {
		providers: Object.fromEntries(
			config.providers.map((provider) => {
				const { id, label, ...rest } = normalizeProviderConfig(provider);
				return [id, { ...rest, ...(label || rest.name ? { name: rest.name ?? label } : {}) }];
			}),
		),
	};
}

function validateProviderCatalog(config: ProviderCatalogConfig): void {
	const ids = new Set<string>();
	const names = new Set<string>();
	for (const provider of config.providers) {
		const normalized = normalizeProvider(provider.id);
		if (isBuiltInProviderId(normalized)) throw new Error(`Built-in provider cannot be redefined: ${provider.id}`);
		if (ids.has(normalized)) throw new Error(`Duplicate custom provider id: ${provider.id}`);
		ids.add(normalized);
		for (const name of unique([provider.id, ...(provider.aliases ?? [])].map(normalizeProvider))) {
			if (isBuiltInProviderId(name)) throw new Error(`Custom provider name conflicts with built-in provider: ${name}`);
			if (names.has(name)) throw new Error(`Duplicate custom provider name or alias: ${name}`);
			names.add(name);
		}
	}
}

function normalizeProviderConfig(provider: ProviderConfig): ProviderConfig {
	const id = normalizeProvider(provider.id);
	const envKeys = unique([...(provider.envKeys ?? []), ...(provider.apiKey && isLikelyEnvKey(provider.apiKey) ? [provider.apiKey] : [])]);
	const api = provider.api ?? (provider.baseUrl || provider.apiKey || provider.models ? "openai-completions" : undefined);
	return {
		...provider,
		id,
		label: provider.label ?? provider.name,
		api,
		aliases: unique((provider.aliases ?? []).map(normalizeProvider)).filter((alias) => alias !== id),
		envKeys,
	};
}

function isLikelyEnvKey(value: string): boolean {
	return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function unique(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
