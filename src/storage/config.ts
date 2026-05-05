import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { CONFIG_PATH } from "./paths.js";
import type { AccountConfig, AccountSwitcherConfig } from "../domain/types.js";
import { formatError } from "../shared/errors.js";

const secretSourceSchema = z.union([
	z.string().min(1),
	z.object({ type: z.literal("literal"), value: z.string().min(1) }),
	z.object({ type: z.literal("env"), name: z.string().min(1) }),
	z.object({ type: z.literal("file"), path: z.string().min(1) }),
	z.object({ type: z.literal("command"), command: z.string().min(1) }),
	z.object({ type: z.literal("op"), reference: z.string().min(1) }),
]);

const piAuthEntrySchema = z.union([
	z.object({ type: z.literal("api_key"), key: z.string().min(1) }),
	z.object({ type: z.literal("oauth"), refresh: z.string().min(1), access: z.string().min(1), expires: z.number() }).passthrough(),
]);

const accountSchema = z
	.object({
		id: z.string().min(1),
		label: z.string().min(1),
		provider: z.string().min(1),
		model: z.string().min(1).optional(),
		env: z.record(z.string().min(1), secretSourceSchema).optional(),
		providerApiKey: secretSourceSchema.optional(),
		usesProviderApiKey: z.boolean().optional(),
		piAuth: z
			.object({
				provider: z.string().min(1),
				entry: piAuthEntrySchema,
			})
			.optional(),
	})
	.refine((account) => (account.env && Object.keys(account.env).length > 0) || account.providerApiKey || account.usesProviderApiKey || account.piAuth, {
		message: "Account must define env credentials, providerApiKey, provider apiKey, or piAuth credentials",
	});

const configSchema = z.object({
	accounts: z.array(accountSchema).default([]),
	switchMode: z.literal("env").optional().default("env"),
});

export async function loadConfig(path = CONFIG_PATH): Promise<AccountSwitcherConfig> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = configSchema.parse(JSON.parse(raw));
		validateConfig(parsed);
		return parsed;
	} catch (error) {
		if (isMissingFileError(error)) return { accounts: [], switchMode: "env" };
		throw new Error(`Failed to load account switcher config at ${path}: ${formatError(error)}`);
	}
}

export async function saveConfig(config: AccountSwitcherConfig, path = CONFIG_PATH): Promise<void> {
	validateConfig(config);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function addAccount(account: AccountConfig, path = CONFIG_PATH): Promise<AccountSwitcherConfig> {
	const config = await loadConfig(path);
	const next: AccountSwitcherConfig = {
		...config,
		accounts: [...config.accounts, account],
	};
	await saveConfig(next, path);
	return next;
}

export async function replaceAccount(originalId: string, account: AccountConfig, path = CONFIG_PATH): Promise<AccountSwitcherConfig> {
	const config = await loadConfig(path);
	const index = config.accounts.findIndex((candidate) => candidate.id === originalId);
	if (index === -1) throw new Error(`Account not found: ${originalId}`);
	const nextAccounts = [...config.accounts];
	nextAccounts[index] = account;
	const next: AccountSwitcherConfig = { ...config, accounts: nextAccounts };
	await saveConfig(next, path);
	return next;
}

export async function removeAccount(accountId: string, path = CONFIG_PATH): Promise<AccountSwitcherConfig> {
	const config = await loadConfig(path);
	const nextAccounts = config.accounts.filter((account) => account.id !== accountId);
	if (nextAccounts.length === config.accounts.length) throw new Error(`Account not found: ${accountId}`);
	const next: AccountSwitcherConfig = { ...config, accounts: nextAccounts };
	await saveConfig(next, path);
	return next;
}

export async function ensureExampleConfig(path = CONFIG_PATH): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	try {
		await readFile(path, "utf8");
		return;
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
	}

	const example: AccountSwitcherConfig = {
		switchMode: "env",
		accounts: [
			{
				id: "claude-work",
				label: "Claude — Work",
				provider: "anthropic",
				env: {
					ANTHROPIC_API_KEY: { type: "env", name: "ANTHROPIC_WORK_API_KEY" },
				},
			},
		],
	};
	await writeFile(path, `${JSON.stringify(example, null, 2)}\n`, "utf8");
}

function validateConfig(config: AccountSwitcherConfig): void {
	const ids = new Set<string>();
	for (const account of config.accounts) {
		if (ids.has(account.id)) throw new Error(`Duplicate account id: ${account.id}`);
		ids.add(account.id);
		if ((!account.env || Object.keys(account.env).length === 0) && !account.providerApiKey && !account.usesProviderApiKey && !account.piAuth) {
			throw new Error(`Account ${account.id} must define env credentials, providerApiKey, provider apiKey, or piAuth credentials`);
		}
	}
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
