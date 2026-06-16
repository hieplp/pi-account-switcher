import { describe, expect, it } from "vitest";
import { commonUtil, findLongestMatchingDir, providerUtil } from "@/utils";

const customProviders = [{ id: "acme", aliases: ["acme-ai"], envKeys: ["ACME_API_KEY"] }];

describe("commonUtil", () => {
  it("slugifies labels for account ids", () => {
    expect(commonUtil.slugify("Claude — Work Account")).toBe("claude-work-account");
  });

  it("normalizes provider ids with whitespace", () => {
    expect(providerUtil.normalizeProvider("Acme AI")).toBe("acme-ai");
  });

  it("deduplicates and trims string arrays", () => {
    expect(commonUtil.unique([" A ", "A", "", "B"])).toEqual(["A", "B"]);
  });
});

describe("providerUtil", () => {
  it("normalizes built-in aliases", () => {
    expect(providerUtil.normalizeProvider("Claude")).toBe("anthropic");
    expect(providerUtil.normalizeProvider("gemini")).toBe("google");
  });

  it("normalizes custom provider aliases", () => {
    expect(providerUtil.normalizeProviderWithCustom("acme-ai", customProviders)).toBe("acme");
  });

  describe("findLongestMatchingDir", () => {
    it("returns longest prefix match", () => {
      const accounts = [
        { id: "short", label: "Short", dirs: ["/home/user"] },
        { id: "long", label: "Long", dirs: ["/home/user/Development"] },
      ];
      expect(findLongestMatchingDir(accounts as any, "/home/user/Development/Work/project")).toBe("long");
    });

    it("returns first-in-array on tie (same dir length)", () => {
      const accounts = [
        { id: "first", label: "First", dirs: ["/home/user/Work"] },
        { id: "second", label: "Second", dirs: ["/home/user/Work"] },
      ];
      expect(findLongestMatchingDir(accounts as any, "/home/user/Work/subdir")).toBe("first");
    });

    it("returns undefined when no match", () => {
      const accounts = [{ id: "work", label: "Work", dirs: ["/home/user/Work"] }];
      expect(findLongestMatchingDir(accounts as any, "/home/other/path")).toBeUndefined();
    });

    it("resolves tilde to home directory", () => {
      const home = require("os").homedir();
      const accounts = [{ id: "home-user", label: "Home", dirs: ["~/Desktop"] }];
      const result = findLongestMatchingDir(accounts as any, `${home}/Desktop/Projects`);
      expect(result).toBe("home-user");
    });

    it("strips trailing slashes before matching", () => {
      const accounts = [{ id: "trailing", label: "Trailing", dirs: ["/home/user/Work/"] }];
      expect(findLongestMatchingDir(accounts as any, "/home/user/Work/project")).toBe("trailing");
    });


    it("matches when cwd equals the configured dir exactly (not just subdirectory)", () => {
      const accounts = [{ id: "exact", label: "Exact", dirs: ["/home/user/Work"] }];
      expect(findLongestMatchingDir(accounts as any, "/home/user/Work")).toBe("exact");
    });

    it("matches tilde-resolved dir exactly", () => {
      const home = require("os").homedir();
      const accounts = [{ id: "home-match", label: "Home", dirs: ["~"] }];
      expect(findLongestMatchingDir(accounts as any, home)).toBe("home-match");
    });
    it("only matches proper path prefix (not substring)", () => {
      const accounts = [{ id: "prefix", label: "Prefix", dirs: ["/home/user"] }];
      expect(findLongestMatchingDir(accounts as any, "/home/username")).toBeUndefined();
    });

    it("handles empty dirs array", () => {
      const accounts = [{ id: "no-dirs", label: "No Dirs", dirs: [] }];
      expect(findLongestMatchingDir(accounts as any, "/home/user/Work")).toBeUndefined();
    });

    it("handles undefined dirs", () => {
      const accounts = [{ id: "undefined-dirs", label: "Undefined", dirs: undefined }];
      expect(findLongestMatchingDir(accounts as any, "/home/user/Work")).toBeUndefined();
    });

    it("returns account id string, not the account object", () => {
      const accounts = [{ id: "returns-id", label: "Returns", dirs: ["/home/user"] }];
      expect(typeof findLongestMatchingDir(accounts as any, "/home/user/file")).toBe("string");
      expect(findLongestMatchingDir(accounts as any, "/home/user/file")).toBe("returns-id");
    });
  });
});
