import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { useExportCommand } from "./export";
import { useImportCommand } from "./import";
import { useResetCommand } from "./reset";

export default function useSystemCommands(pi: ExtensionAPI, runtime: AccountSwitcher) {
  useResetCommand(pi, runtime);
  useExportCommand(pi, runtime);
  useImportCommand(pi, runtime);
}
