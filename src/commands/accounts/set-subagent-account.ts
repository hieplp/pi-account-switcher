import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";

export const SET_SUBAGENT_ACCOUNT_TOOL = "set_subagent_account";

export const useSetSubagentAccountTool = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  pi.registerTool({
    name: SET_SUBAGENT_ACCOUNT_TOOL,
    label: "Set Subagent Account",
    description:
      "Set the account to use for the next spawned subagent, without affecting the current session. " +
      "Provide the account ID from list_accounts. The next subagent will use this account's credentials and model. " +
      "Pass an empty string to clear the override and let subagents inherit the parent's active account.",
    promptSnippet: "Set the account for the next subagent",
    promptGuidelines: [
      "Use set_subagent_account before spawning a subagent when you need it to use a specific account.",
      "Use list_accounts first to discover available account IDs.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Account ID to use for the next subagent. Empty string to clear the override." }),
    }),
    execute: async (_toolCallId, params: { id: string }, _signal, _onUpdate, _ctx) => {
      if (!params.id) {
        delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
        return {
          content: [{ type: "text", text: "Subagent account override cleared. Subagents will inherit the parent's active account." }],
        };
      }

      const accounts = runtime.getAccounts();
      const match = accounts.find((a) => a.id === params.id);
      if (!match) {
        return {
          content: [{ type: "text", text: `Account not found: "${params.id}". Use the list_accounts tool to see available accounts.` }],
          isError: true,
        };
      }

      process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = params.id;
      return {
        content: [{ type: "text", text: `Subagent account set to: ${match.label} (${params.id}). Next subagent spawned will use this account.` }],
      };
    },
  });
};
