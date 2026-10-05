import { readFile } from "node:fs/promises";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AccountConfig, SecretSource } from "../types";
import { commonUtil } from "./common";
import { fileUtil } from "./files";
import { piCredentialUtil } from "./pi-credentials";
import { providerUtil } from "./providers";

export const accountUtil = {
  clearAccountEnv: async (
    account: AccountConfig,
    modelRegistry?: ModelRegistry,
    authProviderOverride?: string,
  ): Promise<void> => {
    // Clear the cross-process inheritance env var
    delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
    const authProvider = authProviderOverride ?? account.piAuth?.provider ?? providerUtil.normalizeProvider(account.provider);
    if (!account.piAuth && account.env) {
      for (const envName of Object.keys(account.env)) {
        delete process.env[envName];
      }
    }
    await removeRuntimeApiKey(modelRegistry, authProvider);
  },

  applyAccountEnv: async (
    account: AccountConfig,
    modelRegistry?: ModelRegistry,
    authProviderOverride?: string,
  ): Promise<string[]> => {
    if (account.piAuth) {
      const authProvider = authProviderOverride ?? account.piAuth.provider;
      await setStoredAuth(modelRegistry, authProvider, account.piAuth.entry);
      closeCachedSessions();
      return [];
    }

    const resolved = await accountUtil.resolveAccountEnv(account);
    return accountUtil.applyResolvedAccountEnv(account, resolved, modelRegistry, authProviderOverride);
  },

  resolveAccountEnv: async (account: AccountConfig): Promise<Array<[string, string]>> => {
    if (!account.env) return [];

    const resolvedEntries: Array<[string, string]> = [];
    for (const [envName, source] of Object.entries(account.env)) {
      const value = await accountUtil.resolveSecret(source);
      if (!value) throw new Error(`Resolved empty value for ${envName} in account ${account.id}`);
      resolvedEntries.push([envName, value]);
    }
    return resolvedEntries;
  },

  applyResolvedAccountEnv: async (
    account: AccountConfig,
    resolvedEntries: Array<[string, string]>,
    modelRegistry?: ModelRegistry,
    authProviderOverride?: string,
  ): Promise<string[]> => {
    const authProvider = authProviderOverride ?? providerUtil.normalizeProvider(account.provider);
    const applied: string[] = [];
    for (const [envName, value] of resolvedEntries) {
      process.env[envName] = value;
      applied.push(envName);
    }

    const firstValue = resolvedEntries[0]?.[1];
    if (firstValue) await piCredentialUtil.setRuntimeApiKey(modelRegistry, authProvider, firstValue);
    else await piCredentialUtil.removeRuntimeApiKey(modelRegistry, authProvider);

    return applied;
  },

  resolveSecret: async (source: SecretSource): Promise<string> => {
    if (typeof source === "string") {
      if (source.startsWith("op://")) return commonUtil.runOpRead(source);
      return source;
    }
    switch (source.type) {
      case "literal":
        return source.value;
      case "env": {
        const value = process.env[source.name];
        if (!value) throw new Error(`Environment variable ${source.name} is not set`);
        return value;
      }
      case "file":
        return (await readFile(fileUtil.expandHome(source.path), "utf8")).trim();
      case "command":
        return commonUtil.runCommand(source.command);
      case "op":
        return commonUtil.runOpRead(source.reference);
    }
  },
};

function normalizeDir(dir: string): string {
  return dir.replace(/\/$/, "");
}

/**
 * Check if an account has a specific directory.
 * Normalizes trailing slashes before comparison.
 */
export function hasDir<T extends { dirs?: string[] }>(account: T, dir: string): boolean {
  const dirs = account.dirs;
  if (!dirs || dirs.length === 0) return false;
  const normalized = normalizeDir(dir);
  return dirs.some((d) => normalizeDir(d) === normalized);
}

/**
 * Add a directory to an account.
 * Returns a new AccountConfig with the dir added, or null if the dir already exists.
 * Dirs are kept sorted for consistent display.
 */
export function addDirToAccount<T extends { id: string; label: string; provider: string; dirs?: string[] }>(
  account: T,
  dir: string,
): T | null {
  if (hasDir(account, dir)) return null;

  const existing = account.dirs ?? [];
  const newDirs = [...existing, dir].sort();
  return { ...account, dirs: newDirs };
}

/**
 * Remove a directory from an account.
 * Returns a new AccountConfig with the dir removed, or null if the dir does not exist.
 */
export function removeDirFromAccount<T extends { id: string; label: string; provider: string; dirs?: string[] }>(
  account: T,
  dir: string,
): T | null {
  const dirs = account.dirs;
  if (!dirs || dirs.length === 0) return null;

  const normalized = normalizeDir(dir);
  const filtered = dirs.filter((d) => normalizeDir(d) !== normalized);

  if (filtered.length === dirs.length) return null;
  if (filtered.length === 0) return { ...account, dirs: undefined };
  return { ...account, dirs: filtered };
}

async function setStoredAuth(
  modelRegistry: ModelRegistry | undefined,
  provider: string,
  entry: unknown,
): Promise<void> {
  await piCredentialUtil.setStoredCredential(modelRegistry, provider, entry as never);
}

async function removeRuntimeApiKey(modelRegistry: ModelRegistry | undefined, provider: string): Promise<void> {
  await piCredentialUtil.removeRuntimeApiKey(modelRegistry, provider);
}

function closeCachedSessions(): void {
  // Dynamic import so the module is not required at load time — @earendil-works/pi-ai
  // is a peerDependency provided by the pi agent host, not bundled with this package.
  import("@earendil-works/pi-ai")
    .then((piAi) => {
      const helpers = piAi as {
        cleanupSessionResources?: () => void;
        closeOpenAICodexWebSocketSessions?: () => void;
      };
      helpers.cleanupSessionResources?.();
      helpers.closeOpenAICodexWebSocketSessions?.();
    })
    .catch(() => {
      // pi-ai not available in this environment — skip session cleanup
    });
}
