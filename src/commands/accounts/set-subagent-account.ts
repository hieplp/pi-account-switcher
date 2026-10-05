import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "../../runtime";

export const UNSUPPORTED_ONESHOT =
  "One-shot child account selection is unsupported with this launcher on Pi 1.0.2. Use oneshot=false for a persistent child preference, then clear it explicitly after the desired launches.";

export const SET_SUBAGENT_ACCOUNT_TOOL = "set_subagent_account";

export const useSetSubagentAccountTool = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  pi.registerTool({
    name: SET_SUBAGENT_ACCOUNT_TOOL,
    label: "Set Subagent Account",
    description:
      "Set the account for spawned subagents. Does not affect the current session. " +
      "One-shot selection (including omitted oneshot) is unsupported on Pi 1.0.2 and rejects without mutation. " +
      "With oneshot=false, the override persists until cleared. " +
      "Provide the account ID from list_accounts. Pass empty string to clear.",
    promptSnippet: "Set the account for subagents",
    promptGuidelines: [
      "Use set_subagent_account before spawning a subagent when it needs a specific account.",
      "One-shot selection is unsupported. Explicitly pass oneshot=false for persistent selection.",
      "With oneshot=false: all subsequent subagents use this account until cleared.",
      "Use list_accounts first to discover available account IDs.",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Account ID to use for subagents. Empty string to clear." }),
      oneshot: Type.Optional(
        Type.Boolean({
          default: true,
          description: "True or omitted rejects as unsupported. Pass false to persist until explicitly cleared.",
        }),
      ),
    }),
    execute: async (_toolCallId, params: { id: string; oneshot?: boolean }, _signal, _onUpdate, _ctx) => {
      const isOneShot = params.oneshot !== false;

      if (!params.id) {
        delete process.env.PI_ACCOUNT_SWITCHER_NEXT_ID;
        delete process.env.PI_ACCOUNT_SWITCHER_CHILD_ID;
        return {
          content: [
            { type: "text", text: "Subagent override cleared. Subagents will inherit the parent's active account." },
          ],
          details: {},
        };
      }

      if (isOneShot) {
        return { content: [{ type: "text", text: UNSUPPORTED_ONESHOT }], isError: true, details: {} };
      }

      const accounts = runtime.getAccounts();
      const match = accounts.find((a) => a.id === params.id);
      if (!match) {
        return {
          content: [
            {
              type: "text",
              text: `Account not found: "${params.id}". Use the list_accounts tool to see available accounts.`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      process.env.PI_ACCOUNT_SWITCHER_CHILD_ID = params.id;
      return {
        content: [
          {
            type: "text",
            text: `Persistent override set to: ${match.label} (${params.id}). All subagents will use this account until cleared.`,
          },
        ],
        details: {},
      };
    },
  });
};
