import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { ModelRuntime, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { createJiti } from '@mariozechner/jiti';
const host = JSON.parse(await readFile('/work/node_modules/@earendil-works/pi-coding-agent/package.json', 'utf8'));
assert.equal(host.version, '1.0.2');
const jiti = createJiti(import.meta.url);
const { default: AccountSwitcherRuntime } = await jiti.import('/work/src/runtime/account-switcher-runtime.ts');
const dir = await mkdtemp('/tmp/cleanup-');
const runtime = await ModelRuntime.create({ authPath: `${dir}/auth.json`, modelsPath: null, allowModelNetwork: false });
const registry = new ModelRegistry(runtime);
const switcher = new AccountSwitcherRuntime({ registerProvider() {}, async setModel() { return true; } }, {
  accounts: `${dir}/accounts.json`, providers: `${dir}/providers.json`, state: `${dir}/state.json`,
});
await switcher.load();
await switcher.addProvider({ id: 'custom', label: 'Custom', piAuthProvider: 'openai', envKeys: [] });
const a = { id: 'a', label: 'A', provider: 'custom', env: { CLEANUP_FAKE_KEY: 'fake-a' } };
const b = { id: 'b', label: 'B', provider: 'anthropic', env: { CLEANUP_OTHER_KEY: 'fake-b' } };
await switcher.addAccount(a);
await switcher.addAccount(b);
const ctx = { modelRegistry: registry, ui: { setStatus() {}, select: async () => undefined }, model: undefined };
await runtime.setRuntimeApiKey('google', 'fake-unrelated');
ctx.model = { id: 'fake', provider: 'openai' };
await switcher.activateAccount(a, ctx);
assert.equal(await registry.getApiKeyForProvider('openai'), 'fake-a');
ctx.model = { id: 'fake', provider: 'anthropic' };
await switcher.activateAccount(b, ctx);
assert.equal(await registry.getApiKeyForProvider('openai'), undefined, 'switching away removes effective override');
assert.equal(await registry.getApiKeyForProvider('anthropic'), 'fake-b');
assert.equal(await registry.getApiKeyForProvider('google'), 'fake-unrelated');
// Replacing an account at the same effective provider must not remove the new key.
const shared = { id: 'shared', label: 'Shared', provider: 'custom', env: { CLEANUP_FAKE_KEY: 'fake-shared' } };
const empty = { id: 'empty', label: 'Empty', provider: 'custom', usesProviderApiKey: true };
const oauth = { id: 'oauth', label: 'OAuth-shaped', provider: 'custom', piAuth: {
  provider: 'openai', entry: { type: 'oauth', access: 'fake-access', refresh: 'fake-refresh', expires: 4102444800000 },
} };
for (const account of [shared, empty, oauth]) await switcher.addAccount(account);
ctx.model = { id: 'fake', provider: 'openai' };
await switcher.activateAccount(a, ctx);
await switcher.activateAccount(shared, ctx);
assert.equal(await registry.getApiKeyForProvider('openai'), 'fake-shared');
await switcher.activateAccount(empty, ctx);
assert.equal(await registry.getApiKeyForProvider('openai'), undefined);
await switcher.activateAccount(a, ctx);
assert.equal(await registry.getApiKeyForProvider('openai'), 'fake-a', 'absent previous credentials do not block activation');
await switcher.activateAccount(oauth, ctx);
const { piCredentialUtil } = await jiti.import('/work/src/utils/pi-credentials.ts');
assert.deepEqual(await piCredentialUtil.snapshotStoredCredential(registry, 'openai'), {
  hadCredential: true, credential: oauth.piAuth.entry,
});
ctx.model = { id: 'fake', provider: 'anthropic' };
await switcher.activateAccount(b, ctx);
assert.equal(await registry.getApiKeyForProvider('google'), 'fake-unrelated');
// Cleanup preserves imported stored OAuth credentials; only runtime overrides are transient.
assert.deepEqual(await piCredentialUtil.snapshotStoredCredential(registry, 'openai'), {
  hadCredential: true, credential: oauth.piAuth.entry,
});
console.log('Pi 1.0.2 public account runtime: distinct/shared targets, absent credentials, OAuth-shaped storage, unrelated providers preserved');
