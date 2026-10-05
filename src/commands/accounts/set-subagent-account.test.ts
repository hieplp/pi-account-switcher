import { afterEach, describe, expect, it, vi } from "vitest";
import { useSetSubagentAccountTool, SET_SUBAGENT_ACCOUNT_TOOL } from "./set-subagent-account";

describe("set_subagent_account tool", () => {
  function makeRuntime(accounts: any[]) {
    return { getAccounts: () => accounts } as any;
  }

  function captureTool() {
    const pi = { registerTool: vi.fn() } as any;
    return pi;
  }

  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, true])("rejects one-shot %s without changing any selectors", async (oneshot) => {
    vi.stubEnv("PI_ACCOUNT_SWITCHER_ACTIVE_ID", "parent");
    vi.stubEnv("PI_ACCOUNT_SWITCHER_CHILD_ID", "persistent");
    vi.stubEnv("PI_ACCOUNT_SWITCHER_NEXT_ID", "legacy");
    const pi = captureTool();
    useSetSubagentAccountTool(pi, makeRuntime([{ id: "child", label: "Child" }]));
    const result = await pi.registerTool.mock.calls[0][0].execute("test", { id: "child", oneshot });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("oneshot=false");
    expect(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID).toBe("parent");
    expect(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID).toBe("persistent");
    expect(process.env.PI_ACCOUNT_SWITCHER_NEXT_ID).toBe("legacy");
  });

  it("sets and clears persistent preference without changing parent identity", async () => {
    vi.stubEnv("PI_ACCOUNT_SWITCHER_ACTIVE_ID", "parent");
    vi.stubEnv("PI_ACCOUNT_SWITCHER_CHILD_ID", undefined);
    vi.stubEnv("PI_ACCOUNT_SWITCHER_NEXT_ID", "legacy");
    const pi = captureTool();
    useSetSubagentAccountTool(pi, makeRuntime([{ id: "child", label: "Child" }]));
    const execute = pi.registerTool.mock.calls[0][0].execute;
    await execute("test", { id: "child", oneshot: false });
    expect(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID).toBe("child");
    expect(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID).toBe("parent");
    const rejected = await execute("test", { id: "missing", oneshot: false });
    expect(rejected.isError).toBe(true);
    expect(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID).toBe("child");
    await execute("test", { id: "" });
    expect(process.env.PI_ACCOUNT_SWITCHER_CHILD_ID).toBeUndefined();
    expect(process.env.PI_ACCOUNT_SWITCHER_NEXT_ID).toBeUndefined();
    expect(process.env.PI_ACCOUNT_SWITCHER_ACTIVE_ID).toBe("parent");
  });

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
