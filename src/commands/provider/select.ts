import { normalizeProvider } from "../../providers/catalog.js";
import type { ProviderConfig } from "../../domain/types.js";

export async function selectCustomProvider(
	ui: { select: (title: string, items: string[]) => Promise<string | undefined>; notify: (message: string, kind?: "error" | "info" | "warning") => void },
	title: string,
	providers: ProviderConfig[],
): Promise<ProviderConfig | undefined> {
	if (providers.length === 0) {
		ui.notify(`No custom providers configured. Use /provider-add first.`, "info");
		return undefined;
	}
	const items = providers.map((provider) => `${provider.label ?? provider.id} (${provider.id})`);
	const selected = await ui.select(title, items);
	if (!selected) return undefined;
	return providers[items.indexOf(selected)];
}

export function removedProviderNames(original: ProviderConfig, next: ProviderConfig): string[] {
	const originalNames = [original.id, ...(original.aliases ?? [])].map(normalizeProvider);
	const nextNames = new Set([next.id, ...(next.aliases ?? [])].map(normalizeProvider));
	return originalNames.filter((name) => !nextNames.has(name));
}
