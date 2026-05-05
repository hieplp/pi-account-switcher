import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { STATE_PATH } from "./paths.js";
import type { AccountSwitcherState } from "../domain/types.js";
import { normalizeProvider } from "../providers/catalog.js";

const DEFAULT_STATE: AccountSwitcherState = { selected: {} };

export async function loadState(path = STATE_PATH): Promise<AccountSwitcherState> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw) as Partial<AccountSwitcherState>;
		return { selected: parsed.selected ?? {} };
	} catch (error) {
		if (isMissingFileError(error)) return structuredClone(DEFAULT_STATE);
		throw error;
	}
}

export async function saveState(state: AccountSwitcherState, path = STATE_PATH): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function saveSelectedAccount(provider: string, accountId: string): Promise<void> {
	const state = await loadState();
	state.selected[provider] = accountId;
	await saveState(state);
}

export async function removeSelectedAccount(accountId: string): Promise<string[]> {
	const state = await loadState();
	const removedProviders: string[] = [];
	for (const [provider, selectedAccountId] of Object.entries(state.selected)) {
		if (selectedAccountId === accountId) {
			delete state.selected[provider];
			removedProviders.push(provider);
		}
	}
	if (removedProviders.length > 0) await saveState(state);
	return removedProviders;
}

export async function replaceSelectedAccount(
	originalId: string,
	nextId: string,
	originalProvider: string,
	nextProvider: string,
): Promise<string[]> {
	const state = await loadState();
	const changedProviders: string[] = [];
	const normalizedOriginalProvider = normalizeProvider(originalProvider);
	const normalizedNextProvider = normalizeProvider(nextProvider);

	for (const [provider, selectedAccountId] of Object.entries(state.selected)) {
		if (selectedAccountId !== originalId) continue;

		const normalizedProvider = normalizeProvider(provider);
		if (normalizedProvider === normalizedOriginalProvider && normalizedOriginalProvider !== normalizedNextProvider) {
			delete state.selected[provider];
			state.selected[normalizedNextProvider] = nextId;
			changedProviders.push(provider, normalizedNextProvider);
		} else if (selectedAccountId !== nextId) {
			state.selected[provider] = nextId;
			changedProviders.push(provider);
		}
	}

	if (changedProviders.length > 0) await saveState(state);
	return [...new Set(changedProviders)];
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
