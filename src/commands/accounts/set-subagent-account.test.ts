import { describe, expect, it, vi } from "vitest";
import { useSetSubagentAccountTool, SET_SUBAGENT_ACCOUNT_TOOL } from "./set-subagent-account";

describe("set_subagent_account tool", () => {
  function makeRuntime(accounts: any[]) {
    return { getAccounts: () => accounts } as any;
  }

  function captureTool() {
    const pi = { registerTool: vi.fn() } as any;
    return pi;
  }

  it("registers the tool with correct name", () => {
    const pi = captureTool();
    useSetSubagentAccountTool(pi, makeRuntime([]));
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    expect(pi.registerTool.mock.calls[0][0].name).toBe(SET_SUBAGENT_ACCOUNT_TOOL);
  });

  it("has id and oneshot parameters", () => {
    const pi = captureTool();
    useSetSubagentAccountTool(pi, makeRuntime([]));
    const params = pi.registerTool.mock.calls[0][0].parameters;
    expect(params.properties?.id).toBeDefined();
    expect(params.properties?.oneshot).toBeDefined();
  });
});
