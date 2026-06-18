import { describe, expect, it, vi } from "vitest";
import type { AccountSwitcherContext } from "@/types";

describe("DefaultAccountCommand", () => {
  const makeAccount = (id: string) => ({ id, label: id, provider: "anthropic" });

  it("activates the default account when configured", async () => {
    const accounts = [makeAccount("work"), makeAccount("personal")];
    const activateAccount = vi.fn().mockResolvedValue("via OAuth");
    const runtime = {
      getAccounts: () => accounts,
      getDefaultAccountId: vi.fn().mockResolvedValue("work"),
      activateAccount,
    } as any;

    const defaultId = await runtime.getDefaultAccountId();
    expect(defaultId).toBe("work");
    const target = runtime.getAccounts().find((a: any) => a.id === defaultId);
    expect(target).toBeDefined();
    await runtime.activateAccount(target, {} as AccountSwitcherContext);
    expect(activateAccount).toHaveBeenCalledWith(target, {});
  });

  it("errors when no defaultAccountId is configured", async () => {
    const runtime = {
      getDefaultAccountId: vi.fn().mockResolvedValue(undefined),
    } as any;
    const defaultId = await runtime.getDefaultAccountId();
    expect(defaultId).toBeUndefined();
  });

  it("errors when default account no longer exists", async () => {
    const runtime = {
      getAccounts: () => [makeAccount("a")],
      getDefaultAccountId: vi.fn().mockResolvedValue("deleted-account"),
    } as any;
    const defaultId = await runtime.getDefaultAccountId();
    expect(defaultId).toBe("deleted-account");
    const target = runtime.getAccounts().find((a: any) => a.id === defaultId);
    expect(target).toBeUndefined();
  });
});
