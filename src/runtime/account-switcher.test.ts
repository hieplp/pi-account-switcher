import { describe, expect, it } from "vitest";
import type { AccountConfig } from "../domain/types.js";
import { AccountSwitcherRuntime } from "./account-switcher.js";

const codexAuthEntry = { type: "oauth" as const, refresh: "refresh", access: "access", expires: Date.now() + 60_000 };

describe("AccountSwitcherRuntime provider matching", () => {
	it("keeps openai and openai-codex account scopes separate", () => {
		const openai: AccountConfig = { id: "openai-main", label: "OpenAI Main", provider: "openai" };
		const codex: AccountConfig = { id: "codex-main", label: "Codex Main", provider: "openai-codex", piAuth: { provider: "openai-codex", entry: codexAuthEntry } };
		const runtime = new AccountSwitcherRuntime();
		(runtime as any).config = { accounts: [openai, codex], switchMode: "env" };
		(runtime as any).providerCatalog = { providers: [] };

		expect(runtime.getAccountsForProvider("openai").map((account) => account.id)).toEqual(["openai-main"]);
		expect(runtime.getAccountsForProvider("openai-codex").map((account) => account.id)).toEqual(["codex-main"]);
	});

	it("looks up active openai-codex account by exact provider key", () => {
		const codex: AccountConfig = { id: "codex-main", label: "Codex Main", provider: "openai-codex", piAuth: { provider: "openai-codex", entry: codexAuthEntry } };
		const runtime = new AccountSwitcherRuntime();
		(runtime as any).providerCatalog = { providers: [] };
		(runtime as any).activeAccountByProvider.set("openai-codex", codex);

		expect(runtime.getActiveAccount("openai-codex")?.id).toBe("codex-main");
		expect(runtime.getActiveAccount("openai")).toBeUndefined();
	});
});
