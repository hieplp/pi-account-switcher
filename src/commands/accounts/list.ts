import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AccountSwitcher } from "@/runtime";
import type { AccountConfig } from "@/types";

/** Tool name for agent-facing account discovery */
export const LIST_ACCOUNTS_TOOL = "list_accounts";

/**
 * Format a list of accounts as structured text for agent consumption.
 * Output format: `id | label | provider | status` (one line per account, sorted by label).
 */
export function formatAccountList(accounts: AccountConfig[], active?: AccountConfig): string {
  if (accounts.length === 0) return "No accounts configured.";

  const sorted = [...accounts].sort((a, b) => a.label.localeCompare(b.label));
  return sorted
    .map((account) => {
      const status = active && active.id === account.id ? "active" : "inactive";
      return `${account.id} | ${account.label} | ${account.provider} | ${status}`;
    })
    .join("\n");
}

export const useListAccountsTool = (pi: ExtensionAPI, runtime: AccountSwitcher) => {
  pi.registerTool({
    name: LIST_ACCOUNTS_TOOL,
    label: "List Accounts",
    description:
      "List all configured accounts. Returns ID, label, provider, and active/inactive status for each account. " +
      "Use the ID with accounts:switch <id> to activate a specific account.",
    promptSnippet: "List my configured accounts",
    promptGuidelines: [
      "Use list_accounts when the user asks what accounts are configured or wants to switch accounts.",
      "The output shows one line per account: id | label | provider | status.",
    ],
    parameters: Type.Object({}),
    execute: async (_toolCallId, _params, _signal, _onUpdate, _ctx) => {
      await runtime.load();
      const accounts = runtime.getAccounts();
      const active = runtime.getActiveAccount();
      const output = formatAccountList(accounts, active);
      return {
        content: [{ type: "text", text: output }],
      };
    },
  });
};
