import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { addProvider, loadProviderCatalog } from "./providers.js";

async function tempProvidersPath(): Promise<string> {
	return join(await mkdtemp(join(tmpdir(), "pi-account-switcher-providers-")), "providers.json");
}

describe("provider storage", () => {
	it("loads Pi models.json-style provider objects", async () => {
		const path = await tempProvidersPath();
		await writeFile(
			path,
			JSON.stringify({
				providers: {
					chiasegpu: {
						baseUrl: "https://llm.chiasegpu.vn/v1",
						api: "openai-completions",
						apiKey: "CHIASEGPU_API_KEY",
						compat: { supportsUsageInStreaming: false, maxTokensField: "max_tokens" },
						models: [{ id: "claude-sonnet", name: "Claude Sonnet" }],
					},
				},
			}),
		);

		const config = await loadProviderCatalog(path);

		expect(config.providers).toEqual([
			expect.objectContaining({
				id: "chiasegpu",
				baseUrl: "https://llm.chiasegpu.vn/v1",
				api: "openai-completions",
				apiKey: "CHIASEGPU_API_KEY",
				envKeys: ["CHIASEGPU_API_KEY"],
				models: [expect.objectContaining({ id: "claude-sonnet" })],
			}),
		]);
	});

	it("defaults model-capable providers to openai-completions when api is omitted", async () => {
		const path = await tempProvidersPath();
		await addProvider({ id: "nexai", baseUrl: "https://nexai.test/v1", apiKey: "sk-test", models: [{ id: "gpt-5.5", name: "GPT 5.5" }] }, path);

		const config = await loadProviderCatalog(path);
		expect(config.providers[0]?.api).toBe("openai-completions");
	});

	it("ignores an alias that is the same as the provider id", async () => {
		const path = await tempProvidersPath();
		await addProvider({ id: "nexai", aliases: ["nexai"] }, path);

		const config = await loadProviderCatalog(path);
		expect(config.providers[0]?.aliases).toEqual([]);
	});

	it("saves providers as Pi models.json-style provider objects", async () => {
		const path = await tempProvidersPath();
		await addProvider({ id: "wokushop", label: "WokuShop", baseUrl: "https://llm.wokushop.com/v1", api: "openai-completions", apiKey: "WOKUSHOP_API_KEY", envKeys: ["WOKUSHOP_API_KEY"], models: [{ id: "gpt-5.2", name: "GPT-5.2" }] }, path);

		const saved = JSON.parse(await readFile(path, "utf8"));
		expect(saved).toEqual({
			providers: {
				wokushop: expect.objectContaining({
					name: "WokuShop",
					baseUrl: "https://llm.wokushop.com/v1",
					api: "openai-completions",
					apiKey: "WOKUSHOP_API_KEY",
					models: [{ id: "gpt-5.2", name: "GPT-5.2" }],
				}),
			},
		});
	});
});
