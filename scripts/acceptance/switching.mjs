import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { ModelRuntime, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createJiti } from "@mariozechner/jiti";
const jiti = createJiti(import.meta.url);
const root = process.cwd();
const { default: Switcher } = await jiti.import(`${root}/src/runtime/account-switcher-runtime.ts`);
const { fileUtil } = await jiti.import(`${root}/src/utils/files.ts`);
const { piCredentialUtil } = await jiti.import(`${root}/src/utils/pi-credentials.ts`);
assert.equal(
  JSON.parse(await readFile(`${root}/node_modules/@earendil-works/pi-coding-agent/package.json`)).version,
  "1.0.2",
);
for (const oauth of [false, true])
  for (const boundary of [
    "credential",
    "stored-credential",
    "registration-retry",
    "registration-reconcile",
    "persistence",
    "model",
    "model-false",
    "secret",
    "restore",
    "success",
  ]) {
    const dir = await mkdtemp("/tmp/switching-");
    const runtime = await ModelRuntime.create({
      authPath: `${dir}/auth.json`,
      modelsPath: null,
      allowModelNetwork: false,
    });
    const registry = new ModelRegistry(runtime);
    let armed = false,
      selected,
      modelCalls = 0;
    const switcher = new Switcher(
      {
        registerProvider(id, config) {
          registry.registerProvider(id, config);
          if (armed && boundary.startsWith("registration")) {
            armed = false;
            throw new Error("injected registration");
          }
        },
        unregisterProvider: (id) => registry.unregisterProvider(id),
        async setModel(model) {
          selected = model;
          modelCalls++;
          if (armed && (boundary === "model" || boundary === "model-false")) {
            armed = false;
            if (boundary === "model-false") return false;
            throw new Error("injected model");
          }
          return true;
        },
      },
      { accounts: `${dir}/accounts.json`, providers: `${dir}/providers.json`, state: `${dir}/state.json` },
    );
    await switcher.load();
    const provider = {
      id: "switch-test",
      label: "Switch test",
      baseUrl: "https://invalid.example/v1",
      api: "openai-completions",
      apiKey: "fake-catalog",
      envKeys: [],
      models: [{ id: "next" }],
    };
    await switcher.addProvider(provider);
    const a = {
      id: "a",
      label: "A",
      provider: "openai",
      ...(oauth
        ? {
            piAuth: {
              provider: "openai",
              entry: { type: "oauth", access: "fake-access", refresh: "fake-refresh", expires: 4102444800000 },
            },
          }
        : { env: { SWITCH_FAKE: "fake-a" } }),
    };
    const b = {
      id: "b",
      label: "B",
      provider: "switch-test",
      providerApiKey: "fake-provider-b",
      env: { SWITCH_FAKE: "fake-b" },
      model: "next",
    };
    if (boundary === "stored-credential")
      b.piAuth = {
        provider: "openai",
        entry: { type: "oauth", access: "fake-next-access", refresh: "fake-next-refresh", expires: 4102444800000 },
      };
    await switcher.addAccount(a);
    await switcher.addAccount(b);
    const priorModel = registry.getAll().find((m) => m.provider === "openai");
    selected = priorModel;
    const ctx = {
      modelRegistry: registry,
      model: priorModel,
      ui: { setStatus() {}, notify() {}, select: async () => undefined },
    };
    await switcher.activateAccount(a, ctx);
    await runtime.setRuntimeApiKey("google", "fake-unrelated");
    const beforeState = await readFile(`${dir}/state.json`, "utf8");
    const beforeEnv = process.env.SWITCH_FAKE;
    const beforeStored = await piCredentialUtil.snapshotStoredCredential(registry, "openai");
    const beforeKey = await registry.getApiKeyForProvider("openai");
    const beforeRegistration = structuredClone(runtime.getRegisteredProviderConfig("switch-test"));
    const set = runtime.setRuntimeApiKey.bind(runtime);
    runtime.setRuntimeApiKey = async (...args) => {
      await set(...args);
      if (armed && (boundary === "credential" || boundary === "restore")) {
        if (boundary !== "restore") armed = false;
        throw new Error("injected committed key failure");
      }
    };
    const modify = runtime.credentials.store.modify.bind(runtime.credentials.store);
    runtime.credentials.store.modify = async (...args) => {
      if (armed && boundary === "restore") throw new Error("injected restoration failure");
      const result = await modify(...args);
      if (armed && boundary === "stored-credential") {
        armed = false;
        throw new Error("injected committed stored credential failure");
      }
      return result;
    };
    const write = fileUtil.writePrivateJson;
    let writes = 0;
    fileUtil.writePrivateJson = async (...args) => {
      // Reject persistence after model selection, not merely the first account write.
      if (armed && boundary === "persistence" && args[0] === `${dir}/state.json` && ++writes === 2) {
        armed = false;
        throw new Error("injected persistence");
      }
      return write(...args);
    };
    armed = true;
    try {
      if (boundary === "secret") b.env.SWITCH_FAKE = { type: "env", name: "ABSENT_SWITCH_SECRET" };
      if (boundary === "success") {
        await switcher.activateAccount(b, ctx);
        assert.equal(switcher.getActiveAccount().id, "b");
        assert.equal(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID, "b");
        assert.equal(process.env.SWITCH_FAKE, "fake-b");
        assert.equal(await registry.getApiKeyForProvider("switch-test"), "fake-b");
        assert.equal(runtime.getRegisteredProviderConfig("switch-test").apiKey, "fake-provider-b");
        assert.equal(selected.id, "next");
        const state = JSON.parse(await readFile(`${dir}/state.json`));
        assert.equal(state.sessions.default.activeAccountId, "b");
        assert.equal(state.sessions.default.activeModelId, "next");
        ctx.model = selected;
        a.model = priorModel.id;
        await switcher.activateAccount(a, ctx);
        assert.deepEqual(
          runtime.getRegisteredProviderConfig("switch-test"),
          beforeRegistration,
          "switching away removes account-specific registration",
        );
        assert.equal(selected.id, priorModel.id);
      } else {
        await assert.rejects(
          switcher.activateAccount(b, ctx),
          boundary === "restore"
            ? /restoration failed/
            : boundary === "model-false"
              ? /Pi refused/
              : boundary === "secret"
                ? /not set/
                : /injected/,
        );
        if (boundary !== "restore") {
          assert.equal(await registry.getApiKeyForProvider("openai"), beforeKey);
          assert.deepEqual(await piCredentialUtil.snapshotStoredCredential(registry, "openai"), beforeStored);
          assert.equal(await registry.getApiKeyForProvider("switch-test"), "fake-catalog");
          assert.equal(process.env.SWITCH_FAKE, beforeEnv);
          assert.equal(switcher.getActiveAccount().id, "a");
          assert.equal(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID, "a");
          assert.deepEqual(runtime.getRegisteredProviderConfig("switch-test"), beforeRegistration);
          assert.equal(await readFile(`${dir}/state.json`, "utf8"), beforeState);
          assert.equal(selected, priorModel);
          if (boundary === "persistence" || boundary.startsWith("model"))
            assert.equal(modelCalls, 2, "prior model restored after attempted selection");
          if (boundary.startsWith("registration")) {
            if (boundary === "registration-reconcile") {
              // A failed catalog reconciliation must not resurrect the rejected account key.
              armed = true;
              await assert.rejects(switcher.editProvider(provider, { ...provider, apiKey: "edited" }), /injected/);
              assert.deepEqual(
                runtime.getRegisteredProviderConfig("switch-test"),
                beforeRegistration,
                "failed reconciliation preserves catalog after rejected switch",
              );
            }
            await switcher.activateAccount(b, ctx);
            ctx.model = selected;
            a.model = priorModel.id;
            await switcher.activateAccount(a, ctx);
            assert.deepEqual(
              runtime.getRegisteredProviderConfig("switch-test"),
              beforeRegistration,
              "retry then switch away restores catalog, not rejected account registration",
            );
          }
        }
      }
      assert.equal(await registry.getApiKeyForProvider("google"), "fake-unrelated");
    } finally {
      fileUtil.writePrivateJson = write;
    }
    console.log(`Pi 1.0.2 public switching: ${oauth ? "OAuth-shaped" : "API-key"} prior / ${boundary}`);
    delete process.env.SWITCH_FAKE;
    delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
  }

for (const mutation of ["edit", "rename", "remove", "reset"]) {
  const dir = await mkdtemp("/tmp/combined-lifecycle-");
  const runtime = await ModelRuntime.create({
    authPath: `${dir}/auth.json`,
    modelsPath: null,
    allowModelNetwork: false,
  });
  const registry = new ModelRegistry(runtime);
  const switcher = new Switcher(
    {
      registerProvider: (id, config) => registry.registerProvider(id, config),
      unregisterProvider: (id) => registry.unregisterProvider(id),
      setModel: async () => true,
    },
    { accounts: `${dir}/accounts.json`, providers: `${dir}/providers.json`, state: `${dir}/state.json` },
  );
  await switcher.load();
  const provider = {
    id: "combined",
    apiKey: "catalog",
    baseUrl: "https://invalid.example",
    api: "openai-completions",
    models: [{ id: "model" }],
  };
  await switcher.addProvider(provider);
  const account = { id: "custom", label: "Custom", provider: "combined", providerApiKey: "account" };
  const away = { id: "away", label: "Away", provider: "openai", env: { COMBINED_KEY: "away" } };
  await switcher.addAccount(account);
  await switcher.addAccount(away);
  await switcher.activateAccount(account, {
    modelRegistry: registry,
    model: registry.find("combined", "model"),
    ui: { setStatus() {} },
  });
  if (mutation === "edit" || mutation === "rename")
    await switcher.editProvider(provider, {
      ...provider,
      id: mutation === "rename" ? "renamed" : provider.id,
      apiKey: "edited",
    });
  else if (mutation === "remove") {
    await switcher.removeAccount(account);
    await switcher.removeProvider(provider);
  } else {
    // Reloading an emptied saved catalog is the factory-reset reconciliation seam.
    await writeFile(`${dir}/providers.json`, JSON.stringify({ providers: [] }));
    await switcher.loadProviderCatalog();
  }
  await switcher.activateAccount(away, {
    modelRegistry: registry,
    model: registry.find("openai", "gpt-4"),
    ui: { setStatus() {} },
  });
  assert.equal(
    registry.getRegisteredProviderConfig("combined")?.apiKey,
    mutation === "edit" ? "edited" : undefined,
    mutation,
  );
  if (mutation === "rename") assert.equal(registry.getRegisteredProviderConfig("renamed")?.apiKey, "edited");
  delete process.env.COMBINED_KEY;
  delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
  console.log(`Pi 1.0.2 combined active-provider lifecycle and switch: ${mutation}`);
}
