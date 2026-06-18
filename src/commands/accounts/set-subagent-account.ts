import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";

export const SET_SUBAGENT_ACCOUNT_TOOL = "set_subagent_account";

export const useSetSubagentAccountTool = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  pi.registerTool({
    name: SET_SUBAGENT_ACCOUNT_TOOL,
    label: "Set Subagent Account",
    description:
      "Set the account for spawned subagents. Does not affect the current session. " +
      "By default (oneshot=true), the override applies only to the next subagent and is consumed. " +
      "With oneshot=false, the override persists until cleared. " +
      "Provide the account ID from list_accounts. Pass empty string to clear.",
    promptSnippet: "Set the account for subagents",
    promptGuidelines: [
      "Use set_subagent_account before spawning a subagent when it needs a specific account.",
      "With oneshot=true (default): the next subagent uses this account, then reverts.",
      "With oneshot=false: all subsequent subagents use this account until cleared.",
      "Use list_accounts first to discover available account IDs.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Account ID to use for subagents. Empty string to clear." }),
      oneshot: Type.Optional(Type.Boolean({ default: true, description: "If true (default), applies only to the next subagent. If false, persists until cleared." })),
    }),
    execute: async (_toolCallId, params: { id: string; oneshot?: boolean }, _signal, _onUpdate, _ctx) => {
      const isOneShot = params.oneshot !== false;

      if (!params.id) {
        delete process.env.PI_ACCOUNT_SWITCHER_NEXT_ID;
        delete process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID;
        return {
          content: [{ type: "text", text: "Subagent override cleared. Subagents will inherit the parent's active account." }],
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

      if (isOneShot) {
        process.env.PI_ACCOUNT_SWITCHER_NEXT_ID = params.id;
        return {
          content: [{ type: "text", text: `One-shot set to: ${match.label} (${params.id}). The next subagent will use this account, then revert.` }],
        };
      }

      process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID = params.id;
      return {
        content: [{ type: "text", text: `Persistent override set to: ${match.label} (${params.id}). All subagents will use this account until cleared.` }],
      };
    },
  });
};
