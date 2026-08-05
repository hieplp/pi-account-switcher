import { describe, expect, it, vi } from "vitest";
import { accountUtil, hasDir, addDirToAccount, removeDirFromAccount } from "./accounts";
import { commonUtil } from "./common";

describe("accountUtil", () => {
  it("resolves all env secrets before mutating process.env", async () => {
    const before = process.env.ACCOUNT_SWITCHER_TEST_KEY;
    process.env.ACCOUNT_SWITCHER_TEST_KEY = "old";

    try {
      await expect(
        accountUtil.applyAccountEnv({
          id: "broken",
          label: "Broken",
          provider: "anthropic",
          env: {
            ACCOUNT_SWITCHER_TEST_KEY: "new",
            ACCOUNT_SWITCHER_MISSING_KEY: { type: "env", name: "ACCOUNT_SWITCHER_DOES_NOT_EXIST" },
          },
        }),
      ).rejects.toThrow(/ACCOUNT_SWITCHER_DOES_NOT_EXIST/);

      expect(process.env.ACCOUNT_SWITCHER_TEST_KEY).toBe("old");
    } finally {
      if (before === undefined) delete process.env.ACCOUNT_SWITCHER_TEST_KEY;
      else process.env.ACCOUNT_SWITCHER_TEST_KEY = before;
    }
  });

  it("stores OAuth credentials through the legacy ModelRegistry auth storage", async () => {
    const authStorage = { set: vi.fn(), reload: vi.fn() };
    const entry = { type: "oauth", access: "token", refresh: "refresh", expires: 123 } as const;

    await accountUtil.applyAccountEnv(
      { id: "work", label: "Work", provider: "openai-codex", piAuth: { provider: "openai-codex", entry } },
      { authStorage } as never,
    );

    expect(authStorage.set).toHaveBeenCalledWith("openai-codex", entry);
    expect(authStorage.reload).toHaveBeenCalledOnce();
  });

  it("stores OAuth credentials through the Pi 0.83 ModelRuntime", async () => {
    const modify = vi.fn(async (_provider: string, update: () => Promise<unknown>) => update());
    const refresh = vi.fn(async () => undefined);
    const entry = { type: "oauth", access: "token", refresh: "refresh", expires: 123 } as const;

    await accountUtil.applyAccountEnv(
      { id: "work", label: "Work", provider: "openai-codex", piAuth: { provider: "openai-codex", entry } },
      { runtime: { credentials: { modify }, refresh } } as never,
    );

    expect(modify).toHaveBeenCalledWith("openai-codex", expect.any(Function));
    expect(await modify.mock.calls[0]![1]()).toEqual(entry);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("applies resolved env entries after successful resolution", () => {
    const authStorage = {
      setRuntimeApiKey: vi.fn(),
      removeRuntimeApiKey: vi.fn(),
    };

    const before = process.env.ACCOUNT_SWITCHER_TEST_KEY;
    try {
      const applied = accountUtil.applyResolvedAccountEnv(
        { id: "work", label: "Work", provider: "Claude" },
        [["ACCOUNT_SWITCHER_TEST_KEY", "new"]],
        { authStorage } as never,
      );

      expect(applied).toEqual(["ACCOUNT_SWITCHER_TEST_KEY"]);
      expect(process.env.ACCOUNT_SWITCHER_TEST_KEY).toBe("new");
      expect(authStorage.setRuntimeApiKey).toHaveBeenCalledWith("anthropic", "new");
    } finally {
      if (before === undefined) delete process.env.ACCOUNT_SWITCHER_TEST_KEY;
      else process.env.ACCOUNT_SWITCHER_TEST_KEY = before;
    }
  });
});

describe("resolveSecret", () => {
  it("returns a plain string as-is", async () => {
    expect(await accountUtil.resolveSecret("my-api-key")).toBe("my-api-key");
  });

  it("passes op:// strings to runOpRead", async () => {
    vi.spyOn(commonUtil, "runOpRead").mockResolvedValue("op-value");
    expect(await accountUtil.resolveSecret("op://vault/item/field")).toBe("op-value");
    expect(commonUtil.runOpRead).toHaveBeenCalledWith("op://vault/item/field");
  });

  it("resolves literal type to its value", async () => {
    expect(await accountUtil.resolveSecret({ type: "literal", value: "xyz" })).toBe("xyz");
  });

  it("reads env type from process.env", async () => {
    process.env.TEST_ACCT_KEY = "env-val";
    try {
      expect(await accountUtil.resolveSecret({ type: "env", name: "TEST_ACCT_KEY" })).toBe("env-val");
    } finally {
      delete process.env.TEST_ACCT_KEY;
    }
  });

  it("throws when env type var is not set", async () => {
    await expect(accountUtil.resolveSecret({ type: "env", name: "DOES_NOT_EXIST_XYZ" })).rejects.toThrow(
      /DOES_NOT_EXIST_XYZ/,
    );
  });

  it("resolves command type via runCommand", async () => {
    vi.spyOn(commonUtil, "runCommand").mockResolvedValue("cmd-output");
    expect(await accountUtil.resolveSecret({ type: "command", command: "echo hi" })).toBe("cmd-output");
  });

  it("resolves op type via runOpRead", async () => {
    vi.spyOn(commonUtil, "runOpRead").mockResolvedValue("op-ref-value");
    expect(await accountUtil.resolveSecret({ type: "op", reference: "op://v/i/f" })).toBe("op-ref-value");
  });
});

describe("resolveAccountEnv", () => {
  it("returns empty array when account has no env", async () => {
    expect(await accountUtil.resolveAccountEnv({ id: "a", label: "A", provider: "test" })).toEqual([]);
  });
});

describe("clearAccountEnv", () => {
  it("deletes env keys from process.env", async () => {
    process.env.TEST_CLEAR_KEY = "val";
    process.env.TEST_OTHER = "keep";
    try {
      await accountUtil.clearAccountEnv({
        id: "a",
        label: "A",
        provider: "test",
        env: { TEST_CLEAR_KEY: "val" },
      });
      expect(process.env.TEST_CLEAR_KEY).toBeUndefined();
      expect(process.env.TEST_OTHER).toBe("keep");
    } finally {
      delete process.env.TEST_CLEAR_KEY;
      delete process.env.TEST_OTHER;
    }
  });

  it("calls removeRuntimeApiKey through legacy auth storage", async () => {
    const removeRuntimeApiKey = vi.fn();
    await accountUtil.clearAccountEnv({ id: "a", label: "A", provider: "anthropic" }, {
      authStorage: { removeRuntimeApiKey },
    } as never);
    expect(removeRuntimeApiKey).toHaveBeenCalledWith("anthropic");
  });

  it("calls removeRuntimeApiKey through the Pi 0.83 ModelRuntime", async () => {
    const removeRuntimeApiKey = vi.fn(async () => undefined);
    await accountUtil.clearAccountEnv({ id: "a", label: "A", provider: "anthropic" }, {
      runtime: { removeRuntimeApiKey },
    } as never);
    expect(removeRuntimeApiKey).toHaveBeenCalledWith("anthropic");
  });
});

describe("hasDir / addDirToAccount / removeDirFromAccount", () => {
  const base = { id: "w", label: "W", provider: "test", dirs: undefined as string[] | undefined };

  it("hasDir returns false when account has no dirs", () => {
    expect(hasDir(base, "/any")).toBe(false);
  });

  it("hasDir returns true when dir is present", () => {
    expect(hasDir({ ...base, dirs: ["/project"] }, "/project")).toBe(true);
  });

  it("hasDir normalizes trailing slashes", () => {
    expect(hasDir({ ...base, dirs: ["/project/"] }, "/project")).toBe(true);
  });

  it("addDirToAccount returns null when dir already exists", () => {
    expect(addDirToAccount({ ...base, dirs: ["/p"] }, "/p")).toBeNull();
  });

  it("addDirToAccount adds dir and keeps sorted", () => {
    const result = addDirToAccount({ ...base, dirs: ["/b", "/c"] }, "/a");
    expect(result?.dirs).toEqual(["/a", "/b", "/c"]);
  });

  it("addDirToAccount creates dirs array when undefined", () => {
    const result = addDirToAccount(base, "/new");
    expect(result?.dirs).toEqual(["/new"]);
  });

  it("removeDirFromAccount returns null when dirs is undefined", () => {
    expect(removeDirFromAccount(base, "/x")).toBeNull();
  });

  it("removeDirFromAccount returns null when dir not found", () => {
    expect(removeDirFromAccount({ ...base, dirs: ["/a"] }, "/x")).toBeNull();
  });

  it("removeDirFromAccount removes dir and sets undefined when last is removed", () => {
    const result = removeDirFromAccount({ ...base, dirs: ["/only"] }, "/only");
    expect(result?.dirs).toBeUndefined();
  });

  it("removeDirFromAccount keeps remaining dirs", () => {
    const result = removeDirFromAccount({ ...base, dirs: ["/a", "/b"] }, "/a");
    expect(result?.dirs).toEqual(["/b"]);
  });
});
