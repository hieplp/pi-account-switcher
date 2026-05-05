import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PI_AUTH_PATH } from "./paths.js";
import type { PiAuthEntry } from "../domain/types.js";

export type PiAuthFile = Record<string, PiAuthEntry>;

export async function loadPiAuth(path = PI_AUTH_PATH): Promise<PiAuthFile> {
	try {
		const raw = await readFile(path, "utf8");
		return JSON.parse(raw) as PiAuthFile;
	} catch (error) {
		if (isMissingFileError(error)) return {};
		throw error;
	}
}

export async function savePiAuth(auth: PiAuthFile, path = PI_AUTH_PATH): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function getPiAuthEntry(provider: string): Promise<PiAuthEntry | undefined> {
	const auth = await loadPiAuth();
	return auth[provider];
}

export async function setPiAuthEntry(provider: string, entry: PiAuthEntry): Promise<void> {
	const auth = await loadPiAuth();
	auth[provider] = entry;
	await savePiAuth(auth);
}

export function isOAuthAuthEntry(entry: PiAuthEntry | undefined): boolean {
	return entry?.type === "oauth";
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
