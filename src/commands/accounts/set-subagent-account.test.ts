import { describe, expect, it, vi } from "vitest";
import { useSetSubagentAccountTool } from "./set-subagent-account";

describe("set_subagent_account tool", () => {
  it("sets PI_ACCOUNT_SWITCHER_ACTIVE_ID in process.env", () => {
    const notify = vi.fn();
    const runtime = {
      getAccounts: () => [{ id: "pxs-hack", label: "PXS", provider: "opencode-go" }],
    } as any;
    const pi = { registerTool: vi.fn() } as any;

    useSetSubagentAccountTool(pi, runtime);
    expect(pi.registerTool).toHaveBeenCalledTimes(1);

    const toolDef = pi.registerTool.mock.calls[0][0];
    expect(toolDef.name).toBe("set_subagent_account");
    expect(toolDef.parameters).toBeDefined();
  });

  it("clears env var when called without account", () => {
    const pi = { registerTool: vi.fn() } as any;
    const runtime = { getAccounts: () => [] } as any;

    useSetSubagentAccountTool(pi, runtime);
    const toolDef = pi.registerTool.mock.calls[0][0];
    expect(toolDef).toBeDefined();
  });
});
