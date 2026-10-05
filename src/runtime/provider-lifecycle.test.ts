import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import Runtime from './account-switcher-runtime';

it('reports reconciliation failures and preserves saved providers and unrelated runtime state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'provider-lifecycle-'));
  const paths = { accounts: join(root, 'accounts.json'), providers: join(root, 'providers.json'), state: join(root, 'state.json') };
  const live = new Set<string>();
  const keys = new Map<string, string | undefined>();
  let failRegistration = false;
  let failRemoval = false;
  let failRestoration = false;
  const runtime = new Runtime({
    setModel: async () => true,
    registerProvider: (provider, config?: { apiKey?: string }) => {
      const id = typeof provider === 'string' ? provider : provider.id;
      live.add(id);
      keys.set(id, config?.apiKey);
      if (id === 'replacement' && failRegistration) throw new Error('registration rejected');
      if (id === 'original' && failRestoration) throw new Error('restoration rejected');
    },
    unregisterProvider: (id: string) => {
      if (failRemoval) throw new Error('removal rejected');
      live.delete(id);
    },
  }, paths);
  const provider = { id: 'original', baseUrl: 'http://127.0.0.1:1' };
  try {
    await runtime.load();
    await runtime.addProvider(provider);
    await runtime.addProvider({ ...provider, id: 'unrelated' });
    runtime.registerProvider({ ...provider, id: 'unrelated', apiKey: 'synthetic-active-account-key' });
    await runtime.editProvider(provider, { ...provider, label: 'Updated label' });
    expect(keys.get('unrelated')).toBe('synthetic-active-account-key');
    const before = await readFile(paths.providers, 'utf8');
    failRegistration = true;
    await expect(runtime.editProvider(provider, { ...provider, id: 'replacement' })).rejects.toThrow('registration rejected');
    expect([...live].sort()).toEqual(['original', 'unrelated']);
    expect(runtime.getProviders().map(p => p.id)).toEqual(['original', 'unrelated']);
    expect(await readFile(paths.providers, 'utf8')).toBe(before);
    failRemoval = true;
    await expect(runtime.removeProvider(provider)).rejects.toThrow('removal rejected');
    expect(await readFile(paths.providers, 'utf8')).toBe(before);
    expect([...live].sort()).toEqual(['original', 'unrelated']);
    failRemoval = false;
    failRestoration = true;
    await expect(runtime.editProvider(provider, { ...provider, id: 'replacement' })).rejects.toThrow('restoration also failed');
    expect(await readFile(paths.providers, 'utf8')).toBe(before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
