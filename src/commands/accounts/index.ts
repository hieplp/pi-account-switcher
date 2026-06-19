import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "../../runtime";
import { useAddAccountCommand } from "./add";
import { useEditAccountCommand } from "./edit";
import { useListAccountsTool } from "./list";
import { useOAuthImportCommand } from "./oauth";
import { useRemoveAccountCommand } from "./remove";
import { useSwitchAccountCommand } from "./switch";
import { useSubagentAccountCommand } from "./subagent";
import { usePeersCommand } from "./peers";
import { useSetSubagentAccountTool } from "./set-subagent-account";
import { useVerifyAccountsCommand } from "./verify";

const useAccountCommands = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  useAddAccountCommand(pi, runtime);
  useEditAccountCommand(pi, runtime);
  useListAccountsTool(pi, runtime);
  useOAuthImportCommand(pi, runtime);
  useRemoveAccountCommand(pi, runtime);
  useSwitchAccountCommand(pi, runtime);
  useSubagentAccountCommand(pi, runtime);
  useSetSubagentAccountTool(pi, runtime);
  usePeersCommand(pi, runtime);
  useVerifyAccountsCommand(pi, runtime);
};

export default useAccountCommands;
