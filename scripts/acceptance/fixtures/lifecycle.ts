import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import Runtime from '../../../src/runtime/account-switcher-runtime';
import { useResetCommand } from '../../../src/commands/system/reset';
import { join } from 'node:path';

export default async function (pi: ExtensionAPI) {
  const root = join(process.env.HOME!, '.pi/account-switcher');
  const paths = { accounts: join(root, 'accounts.json'), providers: join(root, 'providers.json'), state: join(root, 'state.json') };
  const runtime = new Runtime(pi, paths);
  await runtime.load();
  let reset: Parameters<ExtensionAPI['registerCommand']>[1]['handler'];
  useResetCommand({ ...pi, registerCommand: (_name, command) => { reset = command.handler; } }, runtime);
  pi.registerCommand('lifecycle', { description: 'Offline provider lifecycle acceptance', handler: async (args, ctx) => {
    const provider = runtime.getProviders().find(p => p.id === 'lifecycle-old' || p.id === 'lifecycle-new');
    if (args === 'rename') await runtime.editProvider(provider!, { ...provider!, id: 'lifecycle-new' });
    else if (args === 'remove') await runtime.removeProvider(provider!);
    else if (args === 'restore') await runtime.removeProvider(runtime.getProviders().find(p => p.id === 'openai')!);
    else if (args === 'reload') await runtime.load();
    else if (args === 'reset') await reset!('', { ...ctx, ui: { ...ctx.ui, confirm: async () => true, notify: (message, type) => { if (type === 'error') throw new Error(message); } } });
  } });
}
