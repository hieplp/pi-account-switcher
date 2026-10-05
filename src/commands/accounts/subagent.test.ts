import { afterEach, expect, it, vi } from "vitest";
import { useSubagentAccountCommand } from "./subagent";
import { uiUtil } from "../../utils";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each([true, false])("UI child preference choice %s preserves parent", async (confirmed) => {
  const account = { id: "child", label: "Child", provider: "anthropic" };
  vi.stubEnv("PI_ACCOUNT_SWITCHER_ACTIVE_ID", "parent");
  vi.stubEnv("PI_ACCOUNT_SWITCHER_CHILD_ID", "old-child");
  vi.stubEnv("PI_ACCOUNT_SWITCHER_NEXT_ID", "legacy");
  vi.spyOn(uiUtil, "filteredGroupedSelect").mockResolvedValue(account);
  const pi = { registerCommand: vi.fn() };
  const runtime = {
    load: vi.fn(),
    getAccounts: () => [account],
    getProviders: () => [],
    getActiveAccount: () => undefined,
  };
  useSubagentAccountCommand(pi as any, runtime as any);
  const ui = { confirm: vi.fn().mockResolvedValue(confirmed), notify: vi.fn() };
  await pi.registerCommand.mock.calls[0][1].handler("", { ui });
  expect(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID).toBe("parent");
  expect(process.env.PI_ACCOUNT_SWITCHER_NEXT_ID).toBe("legacy");
  expect(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID).toBe(confirmed ? "child" : "old-child");
  expect(ui.confirm).toHaveBeenCalledWith("Set persistent child account?", expect.stringContaining("until"));
});
