import { readFile } from "node:fs/promises";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import type { AccountConfig, SecretSource } from "../domain/types.js";

const exec = promisify(execCallback);

export async function applyAccountEnv(account: AccountConfig): Promise<string[]> {
	if (!account.env) return [];
	const applied: string[] = [];
	for (const [envName, source] of Object.entries(account.env)) {
		const value = await resolveSecret(source);
		if (!value) throw new Error(`Resolved empty value for ${envName} in account ${account.id}`);
		process.env[envName] = value;
		applied.push(envName);
	}
	return applied;
}

export async function resolveSecret(source: SecretSource): Promise<string> {
	if (typeof source === "string") return resolveStringSource(source);

	switch (source.type) {
		case "literal":
			return source.value;
		case "env":
			return process.env[source.name] ?? "";
		case "file":
			return (await readFile(expandHome(source.path), "utf8")).trim();
		case "command":
			return runCommand(source.command);
		case "op":
			return runCommand(`op read ${shellQuote(source.reference)}`);
	}
}

async function resolveStringSource(value: string): Promise<string> {
	// Convenience: treat 1Password refs as op references; otherwise literal.
	if (value.startsWith("op://")) return runCommand(`op read ${shellQuote(value)}`);
	return value;
}

async function runCommand(command: string): Promise<string> {
	const { stdout } = await exec(command, {
		timeout: 15_000,
		maxBuffer: 1024 * 1024,
		env: process.env,
	});
	return stdout.trim();
}

function expandHome(path: string): string {
	if (path === "~") return process.env.HOME ?? path;
	if (path.startsWith("~/")) return `${process.env.HOME ?? "~"}${path.slice(1)}`;
	return path;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
