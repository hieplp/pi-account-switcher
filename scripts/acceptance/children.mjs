// Real pinned launcher execute seam; children run this offline probe, never a model request.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createJiti } from "@mariozechner/jiti";
import { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { ModelRuntime } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";

const repo = resolve(import.meta.dirname, "../..");
const jiti = createJiti(import.meta.url);
const AccountSwitcherRuntime = await jiti.import(join(repo, "src/runtime/account-switcher-runtime.ts"), {
  default: true,
});
const { useAccountService } = await jiti.import(join(repo, "src/services/accounts.ts"));
const { useSetSubagentAccountTool } = await jiti.import(join(repo, "src/commands/accounts/set-subagent-account.ts"));
const child = process.argv.includes("--mode");
const root = child ? process.env.HOME : mkdtempSync(join(tmpdir(), "child-acceptance-"));
if (!child) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, {
    HOME: root,
    PATH: "/usr/local/bin:/usr/bin:/bin",
    PI_CODING_AGENT_DIR: join(root, "agent"),
  });
}
const work = child ? mkdtempSync(join(root, "child-")) : join(root, "parent");
mkdirSync(work, { recursive: true });
const paths = {
  accounts: join(work, "accounts.json"),
  providers: join(work, "providers.json"),
  state: join(work, "state.json"),
};
const service = useAccountService(paths.accounts, paths.state);
for (const id of ["parent", "other-parent", "child"])
  await service.addAccount({ id, label: id, provider: "anthropic", env: { ANTHROPIC_API_KEY: `synthetic-${id}` } });
const modelRuntime = await ModelRuntime.create({
  authPath: join(work, "auth.json"),
  modelsPath: join(work, "models.json"),
});
const ctx = {
  cwd: work,
  sessionManager: { getSessionFile: () => join(work, "session.json") },
  modelRegistry: new ModelRegistry(modelRuntime),
  model: modelRuntime.getModels("anthropic")[0],
  ui: { notify() {}, setStatus() {}, custom: async () => undefined, select: async () => undefined },
};
const runtime = new AccountSwitcherRuntime({ registerProvider() {}, setModel: async () => true }, paths);
if (child) {
  await runtime.init(ctx);
  const selected = runtime.getActiveAccount()?.id;
  const credential = await ctx.modelRegistry.getApiKeyForProvider("anthropic");
  console.log(
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              selected,
              credential,
              pid: process.pid,
              preference: process.env.PI_ACCOUNT_SWITCHER_CHILD_ID,
            }),
          },
        ],
        stopReason: "end",
      },
    }),
  );
} else {
  try {
    assert.equal(
      JSON.parse(readFileSync(join(repo, "node_modules/@earendil-works/pi-coding-agent/package.json"))).version,
      "1.0.2",
    );
    const launcherPath = join(repo, "scripts/acceptance/fixtures/subagent/index.ts");
    assert.equal(
      createHash("sha256").update(readFileSync(launcherPath)).digest("hex"),
      "4facaa61c9c781748dd000eb5d2ec0a75289986d1a6e11ce13971ca5653dc252",
    );
    const factory = await jiti.import(launcherPath, { default: true });
    let launcher, selector;
    factory({
      registerTool(t) {
        launcher = t;
      },
    });
    useSetSubagentAccountTool(
      {
        registerTool(t) {
          selector = t;
        },
      },
      runtime,
    );
    mkdirSync(join(root, ".pi/agents"), { recursive: true });
    writeFileSync(join(root, ".pi/agents/probe.md"), "---\nname: probe\ndescription: Offline runtime probe\n---\n");
    await runtime.load();
    await runtime.activateAccount(
      runtime.getAccounts().find((a) => a.id === "parent"),
      ctx,
    );
    const select = (params) => selector.execute("acceptance", params);
    const single = { agent: "probe", task: "emit" };
    const dispatch = (args) =>
      launcher.execute(
        "acceptance",
        { agentScope: "project", confirmProjectAgents: false, ...args },
        undefined,
        undefined,
        { cwd: root, hasUI: false },
      );
    const records = (result) =>
      result.details.results.map((r) => {
        assert.equal(r.exitCode, 0, r.stderr);
        return JSON.parse(r.messages[0].content[0].text);
      });
    const expectChildren = (result, id) => {
      const values = records(result);
      for (const value of values) {
        assert.equal(value.selected, id);
        assert.equal(value.credential, `synthetic-${id}`);
        assert.equal(value.preference, process.env.PI_ACCOUNT_SWITCHER_CHILD_ID);
        assert.notEqual(value.pid, process.pid);
      }
      assert.equal(new Set(values.map((v) => v.pid)).size, values.length);
    };
    const snapshot = () =>
      JSON.stringify({
        env: process.env,
        active: runtime.getActiveAccount(),
        state: readFileSync(paths.state, "utf8"),
      });
    process.env.PI_ACCOUNT_SWITCHER_NEXT_ID = "other-parent"; // obsolete state must never win in children
    for (const oneshot of [undefined, true]) {
      const before = snapshot();
      const rejected = await select({ id: "child", oneshot });
      assert.equal(rejected.isError, true);
      assert.match(rejected.content[0].text, /unsupported.*oneshot=false/);
      assert.equal(snapshot(), before);
    }
    await select({ id: "child", oneshot: false });
    expectChildren(await dispatch(single), "child");
    expectChildren(await dispatch(single), "child");
    expectChildren(await dispatch({ chain: [single, single] }), "child");
    expectChildren(await dispatch({ tasks: [single, single] }), "child");
    const beforeReject = snapshot();
    assert.equal((await dispatch({ agent: "missing", task: "reject" })).isError, true);
    assert.equal(snapshot(), beforeReject);
    expectChildren(await dispatch(single), "child"); // retry
    await runtime.activateAccount(
      runtime.getAccounts().find((a) => a.id === "other-parent"),
      ctx,
    );
    assert.equal(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID, "child");
    expectChildren(await dispatch(single), "child");
    const stateBeforeClear = readFileSync(paths.state, "utf8");
    await select({ id: "" });
    assert.equal(process.env.PI_ACCOUNT_SWITCHER_NEXT_ID, undefined);
    assert.equal(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID, undefined);
    assert.equal(runtime.getActiveAccount().id, "other-parent");
    assert.equal(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID, "other-parent");
    assert.equal(readFileSync(paths.state, "utf8"), stateBeforeClear);
    assert.equal(await ctx.modelRegistry.getApiKeyForProvider("anthropic"), "synthetic-other-parent");
    expectChildren(await dispatch(single), "other-parent");
    console.log(
      "PASS: real launcher separate-process sequential/chain/parallel/rejection/retry; one-shot rejection; persistent/parent switching/clear; Pi 1.0.2 effective credentials",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
