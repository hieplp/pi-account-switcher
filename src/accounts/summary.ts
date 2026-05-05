import type { AccountConfig, SecretSource } from "../domain/types.js";
import { normalizeProvider } from "../providers/catalog.js";

export function summarizeAccount(account: AccountConfig): string {
	const parts = [`${account.label} — ${normalizeProvider(account.provider)} (${account.id})`];
	if (account.env) parts.push(`env: ${Object.keys(account.env).join(", ")}`);
	if (account.piAuth) parts.push(`Pi OAuth: ${account.piAuth.provider}`);
	return parts.join("; ");
}

export function credentialKind(account: AccountConfig): string {
	const kinds: string[] = [];
	if (account.env) {
		for (const source of Object.values(account.env)) kinds.push(secretSourceKind(source));
	}
	if (account.piAuth) kinds.push("piAuth");
	return kinds.join(", ") || "none";
}

export function secretSourceKind(source: SecretSource): string {
	if (typeof source === "string") return source.startsWith("op://") ? "op" : "literal";
	return source.type;
}
