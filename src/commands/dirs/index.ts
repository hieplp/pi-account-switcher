import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import { useDirsCommand } from "./dirs";

const useDirsCommands = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  useDirsCommand(pi, runtime);
};

export default useDirsCommands;
