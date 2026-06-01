import { createJiti } from "@mariozechner/jiti";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export default async function accountSwitcherBootstrap(pi: ExtensionAPI) {
  const srcDir = dirname(fileURLToPath(import.meta.url));

  // Resolve @earendil-works/* from the pi loader's context so the same
  // module instances are used (avoids duplicate singletons / instanceof mismatches).
  const loaderRequire = createRequire(import.meta.url);
  const resolveOrUndefined = (id: string): string | undefined => {
    try {
      return loaderRequire.resolve(id);
    } catch {
      return undefined;
    }
  };

  const piAiEntry = resolveOrUndefined("@earendil-works/pi-ai");
  const piCodingAgentEntry = resolveOrUndefined("@earendil-works/pi-coding-agent");
  const piAgentCoreEntry = resolveOrUndefined("@earendil-works/pi-agent-core");
  const piTuiEntry = resolveOrUndefined("@earendil-works/pi-tui");

  const alias: Record<string, string> = { "@": srcDir };
  if (piAiEntry) {
    alias["@earendil-works/pi-ai"] = piAiEntry;
    alias["@mariozechner/pi-ai"] = piAiEntry;
  }
  if (piCodingAgentEntry) {
    alias["@earendil-works/pi-coding-agent"] = piCodingAgentEntry;
    alias["@mariozechner/pi-coding-agent"] = piCodingAgentEntry;
  }
  if (piAgentCoreEntry) {
    alias["@earendil-works/pi-agent-core"] = piAgentCoreEntry;
    alias["@mariozechner/pi-agent-core"] = piAgentCoreEntry;
  }
  if (piTuiEntry) {
    alias["@earendil-works/pi-tui"] = piTuiEntry;
    alias["@mariozechner/pi-tui"] = piTuiEntry;
  }

  const jiti = createJiti(import.meta.url, { alias });

  const extension = await jiti.import<(pi: ExtensionAPI) => void | Promise<void>>("./index", {
    default: true,
  });

  await extension(pi);
}
