import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createAgentSessionServices, createAgentSessionFromServices, SessionManager } from '@earendil-works/pi-coding-agent';

// Each fixture gets a fresh process: extension paths are resolved at module load.
if (!process.argv[2]) {
  for (const fixture of ['empty', 'populated']) {
    const home = await mkdtemp(join(tmpdir(), 'pi-initialization-'));
    try {
      const result = spawnSync(process.execPath, [import.meta.filename, fixture], {
        env: { PATH: process.env.PATH, HOME: home, PI_CODING_AGENT_DIR: join(home, '.pi/agent') },
        encoding: 'utf8', timeout: 60000,
      });
      process.stdout.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
      assert.equal(result.status, 0, `${fixture} initialization failed: ${result.error ?? ''}`);
    } finally { await rm(home, { recursive: true, force: true }); }
  }
} else {
  const populated = process.argv[2] === 'populated';
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const store = join(process.env.HOME, '.pi/account-switcher');
  await mkdir(agentDir, { recursive: true });
  await mkdir(store, { recursive: true });
  const providers = populated ? [{ id: 'acceptance-catalog', baseUrl: 'http://127.0.0.1:1', api: 'openai-completions', apiKey: 'synthetic-catalog-key', models: [{ id: 'startup-model' }] }] : [];
  await writeFile(join(store, 'providers.json'), JSON.stringify({ providers }));
  await writeFile(join(store, 'accounts.json'), JSON.stringify({ accounts: [{ id: 'saved-account', label: 'Synthetic account', provider: 'acceptance-catalog', providerApiKey: { type: 'literal', value: 'synthetic-account-key' } }, { id: 'other-account', label: 'Other synthetic account', provider: 'acceptance-catalog', providerApiKey: { type: 'literal', value: 'synthetic-other-key' } }], defaultAccountId: 'saved-account' }));
  await writeFile(join(store, 'state.json'), JSON.stringify({ sessions: {} }));
  await writeFile(join(agentDir, 'auth.json'), '{}');
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({ packages: ['/work'], defaultProvider: 'acceptance-catalog', defaultModel: 'startup-model' }));
  const snapshot = async () => Promise.all(['providers.json', 'accounts.json', 'state.json'].map(name => readFile(join(store, name), 'utf8')));
  const before = await snapshot();
  const envBefore = { ...process.env };
  const services = await createAgentSessionServices({ cwd: '/work', agentDir, resourceLoaderOptions: { noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true } });
  assert.deepEqual(services.diagnostics, []);
  assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
  assert.equal(services.resourceLoader.getExtensions().extensions.length, 1);
  assert.equal(!!services.modelRuntime.getModel('acceptance-catalog', 'startup-model'), populated);
  assert.equal((await services.modelRuntime.getAvailable()).some(model => model.provider === 'acceptance-catalog'), populated);
  assert.deepEqual(await snapshot(), before, 'catalog registration must not write account selection');
  assert.deepEqual({ ...process.env }, envBefore, 'catalog registration must not activate identity or credentials');
  assert.equal(await readFile(join(agentDir, 'auth.json'), 'utf8'), '{}');

  // CLI listing uses the same normal startup path, not a hand-built registry.
  const listing = spawnSync('/work/node_modules/.bin/pi', ['--list-models', 'acceptance-catalog'], { env: process.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(listing.status, 0, listing.stderr);
  assert.equal(listing.stdout.includes('startup-model'), populated, listing.stdout);
  assert.deepEqual(await snapshot(), before);

  if (populated) {
    const { session } = await createAgentSessionFromServices({ services, sessionManager: SessionManager.inMemory('/work'), tools: [] });
    try {
      assert.equal(session.model?.provider, 'acceptance-catalog');
      assert.equal(session.model?.id, 'startup-model');
      assert.deepEqual(await snapshot(), before, 'initial model selection precedes account activation');
      assert.equal(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID, undefined);
      const initialAuth = await services.modelRuntime.getAuth('acceptance-catalog');
      assert.ok(JSON.stringify(initialAuth).includes('synthetic-catalog-key'));
      assert.ok(!JSON.stringify(initialAuth).includes('synthetic-account-key'));
      const errors = [];
      await session.bindExtensions({ onError: error => errors.push(error) });
      assert.deepEqual(errors, []);
      assert.equal(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID, 'saved-account');
      assert.ok(JSON.stringify(await services.modelRuntime.getAuth('acceptance-catalog')).includes('synthetic-account-key'));
      assert.equal(session.model?.id, 'startup-model');
      await session.prompt('/accounts:switch other-account');
      assert.equal(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID, 'other-account');
      assert.ok(JSON.stringify(await services.modelRuntime.getAuth('acceptance-catalog')).includes('synthetic-other-key'));
      const savedState = JSON.parse(await readFile(join(store, 'state.json'), 'utf8'));
      assert.ok(Object.values(savedState.sessions).some(state => state.activeAccountId === 'other-account'));
    } finally { session.dispose(); }
  }
  console.log(`Pi 1.0.2 ${process.argv[2]} catalog: pre-session listing, no catalog activation${populated ? '; initial selection, session activation and account switching verified' : ''}`);
}
