import { AccountConfig } from "./accounts";

export interface AccountSwitcherConfig {
  accounts: AccountConfig[];
  switchMode?: "env";
  /** Config-level fallback account when no session state or dirs match. */
  defaultAccountId?: string;
  /** Number of days after which inactive sessions are eligible for GC. Default: 30. */
  stateCleanupDays?: number;
}