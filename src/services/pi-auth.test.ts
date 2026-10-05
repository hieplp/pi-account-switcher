import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-auth-service-"));
  vi.stubEnv("HOME", root);
  vi.stubEnv("PI_CODING_AGENT_DIR", join(root, "agent"));
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(root, { recursive: true, force: true });
});

test("default credential retrieval retains the home location without an override", async () => {
  delete process.env.PI_CODING_AGENT_DIR;
  await seed(join(root, ".pi", "agent"), "home-key");
  const { usePiAuthService } = await import("./pi-auth");
  expect(await usePiAuthService().getEntry("synthetic")).toEqual({
    type: "api_key",
    key: "home-key",
  });
});

test("explicit auth paths take precedence over the configured agent directory", async () => {
  await seed(join(root, "agent"), "override-key");
  await seed(join(root, "explicit"), "explicit-key");
  const { usePiAuthService } = await import("./pi-auth");
  expect(await usePiAuthService(join(root, "explicit", "auth.json")).getEntry("synthetic")).toEqual({
    type: "api_key",
    key: "explicit-key",
  });
});

test("configured agent directories support Pi's tilde expansion", async () => {
  vi.stubEnv("PI_CODING_AGENT_DIR", "~/custom-agent");
  await seed(join(root, "custom-agent"), "tilde-key");
  const { usePiAuthService } = await import("./pi-auth");
  expect(await usePiAuthService().getEntry("synthetic")).toEqual({
    type: "api_key",
    key: "tilde-key",
  });
});

async function seed(directory: string, key: string) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "auth.json"),
    JSON.stringify({
      synthetic: { type: "api_key", key },
    }),
  );
}

test("default credential retrieval uses the configured agent directory", async () => {
  await seed(join(root, "agent"), "override-key");
  await seed(join(root, ".pi", "agent"), "default-key");
  const { usePiAuthService } = await import("./pi-auth");
  expect(await usePiAuthService().getEntry("synthetic")).toEqual({
    type: "api_key",
    key: "override-key",
  });
});
