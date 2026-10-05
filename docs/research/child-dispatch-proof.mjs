// Offline public launcher execute seam. Child is a JSON emitter, NOT Pi/provider execution.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

if (process.argv.includes('--mode')) {
  const selected = process.env.PI_ACCOUNT_SWITCHER_NEXT_ID || process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
  delete process.env.PI_ACCOUNT_SWITCHER_NEXT_ID;
  console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ selected, pid: process.pid }) }], stopReason: 'end' } }));
} else {
  const host = process.argv[2];
  const launcher = process.argv[3];
  assert.ok(host && launcher, 'Usage: node child-dispatch-proof.mjs ABS_PI_PACKAGE_DIR ABS_LAUNCHER_INDEX');
  assert.equal(JSON.parse(readFileSync(join(host, 'package.json'))).version, '1.0.2');
  console.log('launcher sha256:', createHash('sha256').update(readFileSync(launcher)).digest('hex'));
  const root = mkdtempSync(join(tmpdir(), 'child-dispatch-proof-'));
  // Never pass the calling session environment/credentials into the emitter children.
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, { HOME: root, PI_CODING_AGENT_DIR: join(root, 'agent'), PATH: '/usr/bin:/bin', PI_ACCOUNT_SWITCHER_ACTIVE_ID: 'fake-parent', PI_ACCOUNT_SWITCHER_NEXT_ID: 'fake-once' });
  try {
    mkdirSync(join(root, '.pi', 'agents'), { recursive: true });
    writeFileSync(join(root, '.pi', 'agents', 'probe.md'), '---\nname: probe\ndescription: Offline emitter\n---\n');
    const require = createRequire(join(host, 'package.json'));
    const { createJiti } = require('jiti');
    const alias = { '@earendil-works/pi-coding-agent': join(host, 'dist/index.js') };
    for (const name of ['@earendil-works/pi-ai', '@earendil-works/pi-tui', 'typebox']) {
      const packageDir = join(host, 'node_modules', name);
      const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json')));
      alias[name] = join(packageDir, pkg.module || pkg.main || 'build/index.mjs');
    }
    const factory = await createJiti(import.meta.url, { alias }).import(launcher, { default: true });
    let tool;
    factory({ registerTool(value) { tool = value; } });
    const call = (args) => tool.execute('proof', { agentScope: 'project', confirmProjectAgents: false, ...args }, undefined, undefined, { cwd: root, hasUI: false });
    const values = (result) => result.details.results.map(r => JSON.parse(r.messages[0].content[0].text));
    const single = { agent: 'probe', task: 'emit' };
    const rejected = await call({ agent: 'missing', task: 'reject' });
    assert.equal(rejected.isError, true);
    assert.equal(process.env.PI_ACCOUNT_SWITCHER_NEXT_ID, 'fake-once');
    const retry = values(await call(single));
    const sequential = values(await call(single));
    assert.equal(retry[0].selected, 'fake-once');
    assert.equal(sequential[0].selected, 'fake-once');
    const competing = (await Promise.all([call(single), call(single)])).flatMap(values);
    assert.deepEqual(competing.map(v => v.selected), ['fake-once', 'fake-once']);
    assert.notEqual(competing[0].pid, competing[1].pid);
    const parallel = values(await call({ tasks: [single, single] }));
    const chain = values(await call({ chain: [single, single] }));
    assert.deepEqual([...parallel, ...chain].map(v => v.selected), Array(4).fill('fake-once'));
    assert.equal(process.env.PI_ACCOUNT_SWITCHER_NEXT_ID, 'fake-once');
    delete process.env.PI_ACCOUNT_SWITCHER_NEXT_ID;
    process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = 'fake-persistent';
    assert.deepEqual(values(await call({ tasks: [single, single] })).map(v => v.selected), ['fake-persistent', 'fake-persistent']);
    process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = 'fake-parent';
    assert.equal(values(await call(single))[0].selected, 'fake-parent');
    console.log('PASS: rejection retains; retry/sequential/competition/parallel/chain duplicate one-shot; persistent and fallback inherited.');
  } finally { rmSync(root, { recursive: true, force: true }); }
}
