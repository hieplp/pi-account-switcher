import { afterEach, describe, expect, it } from "vitest";
import { resolveSecret } from "./secrets.js";

const ENV_NAME = "PI_ACCOUNT_SWITCHER_TEST_SECRET";

describe("resolveSecret", () => {
	afterEach(() => {
		delete process.env[ENV_NAME];
	});

	it("throws when an env secret source is missing", async () => {
		await expect(resolveSecret({ type: "env", name: ENV_NAME })).rejects.toThrow(`Environment variable ${ENV_NAME} is not set`);
	});

	it("throws when an env secret source is empty", async () => {
		process.env[ENV_NAME] = "";
		await expect(resolveSecret({ type: "env", name: ENV_NAME })).rejects.toThrow(`Environment variable ${ENV_NAME} is empty`);
	});

	it("resolves a non-empty env secret source", async () => {
		process.env[ENV_NAME] = "sk-test";
		await expect(resolveSecret({ type: "env", name: ENV_NAME })).resolves.toBe("sk-test");
	});
});
