import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { addAccount, loadConfig } from "./config.js";

async function tempConfigPath(): Promise<string> {
	return join(await mkdtemp(join(tmpdir(), "pi-account-switcher-config-")), "accounts.json");
}

describe("account config storage", () => {
	it("allows custom provider accounts that use provider-level apiKey", async () => {
		const path = await tempConfigPath();
		await addAccount({ id: "dev", label: "Dev", provider: "nexai", usesProviderApiKey: true }, path);

		const config = await loadConfig(path);
		expect(config.accounts[0]).toEqual(expect.objectContaining({ provider: "nexai", usesProviderApiKey: true }));
	});

	it("allows custom provider accounts with providerApiKey only", async () => {
		const path = await tempConfigPath();
		await addAccount({ id: "dev", label: "Dev", provider: "nexai", providerApiKey: { type: "literal", value: "sk-test" } }, path);

		const config = await loadConfig(path);
		expect(config.accounts[0]).toEqual(expect.objectContaining({ provider: "nexai", providerApiKey: { type: "literal", value: "sk-test" } }));
	});
});
