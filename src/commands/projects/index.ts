import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { useBindProjectCommand } from "./bind";
import { useListProjectsCommand } from "./list";
import { useRemoveProjectCommand } from "./remove";
import { useUnbindProjectCommand } from "./unbind";

export default function useProjectCommands(pi: ExtensionAPI, runtime: AccountSwitcher) {
  useBindProjectCommand(pi, runtime);
  useListProjectsCommand(pi, runtime);
  useUnbindProjectCommand(pi, runtime);
  useRemoveProjectCommand(pi, runtime);
}
