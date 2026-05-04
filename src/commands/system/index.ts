import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { useResetCommand } from "./reset";

export default function useSystemCommands(pi: ExtensionAPI, runtime: AccountSwitcher) {
  useResetCommand(pi, runtime);
}
