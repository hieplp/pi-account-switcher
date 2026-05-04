import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { STATE_PATH } from "./paths.js";
import type { AccountSwitcherState } from "./types.js";

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

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
