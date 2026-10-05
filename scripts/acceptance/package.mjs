import assert from 'node:assert/strict';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { readFile } from 'node:fs/promises';
const host = JSON.parse(await readFile('/work/node_modules/@earendil-works/pi-coding-agent/package.json', 'utf8'));
assert.equal(host.version, '1.0.2');
const loader = new DefaultResourceLoader({
  cwd: '/work', agentDir: process.env.PI_CODING_AGENT_DIR,
  settingsManager: SettingsManager.create('/work', process.env.PI_CODING_AGENT_DIR),
  noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
});
await loader.reload();
const result = loader.getExtensions();
assert.deepEqual(result.errors, []);
assert.deepEqual(result.warnings, []);
assert.equal(result.extensions.length, 1);
console.log('Pi 1.0.2 normal package discovery/loading: one extension, zero errors/warnings');
