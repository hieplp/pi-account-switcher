import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ProviderConfig } from "../domain/types.js";

export function registerCustomModelProviders(pi: ExtensionAPI, providers: ProviderConfig[]): void {
	for (const provider of providers) registerCustomModelProvider(pi, provider);
}

export function registerCustomModelProvider(pi: ExtensionAPI, provider: ProviderConfig): void {
	const config = toPiProviderConfig(provider);
	if (!config) return;
	pi.registerProvider(provider.id, config as Parameters<ExtensionAPI["registerProvider"]>[1]);
}

export function unregisterCustomModelProvider(pi: ExtensionAPI, provider: ProviderConfig): void {
	pi.unregisterProvider(provider.id);
}

function toPiProviderConfig(provider: ProviderConfig): Record<string, unknown> | undefined {
	if (!provider.baseUrl && !provider.api && !provider.apiKey && !provider.models && !provider.headers && !provider.authHeader && !provider.compat) return undefined;
	return omitUndefined({
		name: provider.name ?? provider.label,
		baseUrl: provider.baseUrl,
		apiKey: provider.apiKey,
		api: provider.api,
		headers: provider.headers,
		authHeader: provider.authHeader,
		models: provider.models?.map((model) =>
			omitUndefined({
				...model,
				api: model.api ?? provider.api,
				name: model.name ?? model.id,
				reasoning: model.reasoning ?? false,
				input: model.input ?? ["text"],
				contextWindow: model.contextWindow ?? 128000,
				maxTokens: model.maxTokens ?? 16384,
				cost: model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				compat: model.compat ?? provider.compat,
			}),
		),
		modelOverrides: provider.modelOverrides,
		compat: provider.compat,
	});
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
