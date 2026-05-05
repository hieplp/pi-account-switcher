import type { AccountConfig } from "../domain/types.js";

export function formatAccountItem(account: AccountConfig, active: boolean): string {
	return `${active ? "✓ " : ""}${account.label} (${account.id})`;
}

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
