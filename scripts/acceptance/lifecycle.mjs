import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentSessionServices, createAgentSessionFromServices, SessionManager } from '@earendil-works/pi-coding-agent';

const home = await mkdtemp(join(tmpdir(), 'pi-lifecycle-'));
process.env.HOME = home;
process.env.PI_CODING_AGENT_DIR = join(home, '.pi/agent');
const agentDir = process.env.PI_CODING_AGENT_DIR;
const store = join(home, '.pi/account-switcher');
await mkdir(agentDir, { recursive: true });
await mkdir(store, { recursive: true });
const custom = id => ({ id, baseUrl: 'http://127.0.0.1:1', api: 'openai-completions', apiKey: 'synthetic-key', models: [{ id: 'offline-model' }] });
const accounts = JSON.stringify({ accounts: [] });
const state = JSON.stringify({ sessions: {} });
await writeFile(join(store, 'accounts.json'), accounts);
await writeFile(join(store, 'state.json'), state);
await writeFile(join(store, 'providers.json'), JSON.stringify({ providers: [custom('lifecycle-old'), custom('unrelated')] }));
await writeFile(join(agentDir, 'auth.json'), '{}');
await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ extensions: ['/work/scripts/acceptance/fixtures/lifecycle.ts'] }));
let session;
try {
  const services = await createAgentSessionServices({ cwd: home, agentDir, resourceLoaderOptions: { noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true } });
  assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
  const models = provider => services.modelRuntime.getModels().filter(m => m.provider === provider);
  const builtin = models('openai');
  const builtinAuth = await services.modelRuntime.getAuth('openai');
  assert.ok(builtin.length > 0);
  ({ session } = await createAgentSessionFromServices({ services, sessionManager: SessionManager.inMemory(home), tools: [] }));
  const errors = [];
  await session.bindExtensions({ onError: error => errors.push(error) });
  assert.ok(models('lifecycle-old').length);
  await session.prompt('/lifecycle rename');
  assert.equal(models('lifecycle-old').length, 0, 'rename removes stale ID');
  assert.ok(models('lifecycle-new').length);
  assert.equal((await services.modelRuntime.getAvailable()).some(m => m.provider === 'lifecycle-old'), false);
  assert.ok((await services.modelRuntime.getAvailable()).some(m => m.provider === 'lifecycle-new'));
  assert.deepEqual(JSON.parse(await readFile(join(store, 'providers.json'), 'utf8')).providers.map(p => p.id), ['lifecycle-new', 'unrelated']);
  await session.prompt('/lifecycle remove');
  assert.equal(models('lifecycle-new').length, 0);
  assert.ok(models('unrelated').length);
  // Reload the public runtime against a changed saved catalog, like factory reset.
  await writeFile(join(store, 'providers.json'), JSON.stringify({ providers: [custom('openai'), custom('unrelated')] }));
  // A separate command loads the edited catalog without restarting Pi.
  await session.prompt('/lifecycle reload');
  assert.deepEqual(models('openai').map(m => m.id), ['offline-model']);
  await session.prompt('/lifecycle restore');
  assert.deepEqual(models('openai'), builtin, 'removing override restores exact built-in catalog');
  assert.deepEqual(await services.modelRuntime.getAuth('openai'), builtinAuth);
  assert.equal(await readFile(join(store, 'accounts.json'), 'utf8'), accounts);
  assert.equal(await readFile(join(store, 'state.json'), 'utf8'), state);
  await session.prompt('/lifecycle reset');
  assert.equal(models('unrelated').length, 0);
  assert.deepEqual(models('openai'), builtin);
  assert.deepEqual(errors, []);
  for (const file of ['providers.json', 'accounts.json', 'state.json']) {
    await assert.rejects(readFile(join(store, file)), { code: 'ENOENT' });
  }
  assert.equal(await readFile(join(agentDir, 'auth.json'), 'utf8'), '{}');
  console.log('Pi 1.0.2 live rename/remove/reset/built-in restoration: passed offline');
} finally { session?.dispose(); await rm(home, { recursive: true, force: true }); }
