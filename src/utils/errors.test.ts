import { describe, expect, it } from "vitest";
import { errorUtil } from "./errors";
import z from "zod";

describe("errorUtil.format", () => {
  it("formats ZodError as path: message", () => {
    const schema = z.object({ name: z.string().min(1) });
    const result = schema.safeParse({ name: "" });
    const formatted = errorUtil.format(result.error!);
    expect(formatted).toContain("name:");
    expect(formatted).toContain("string");
  });

  it("formats multiple ZodError issues separated by semicolon", () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const result = schema.safeParse({ a: 1, b: "x" });
    const formatted = errorUtil.format(result.error!);
    expect(formatted).toContain("; ");
  });

  it("formats regular Error as error.message", () => {
    expect(errorUtil.format(new Error("something broke"))).toBe("something broke");
  });

  it("formats string as the string itself", () => {
    expect(errorUtil.format("plain error")).toBe("plain error");
  });

  it("formats number as string", () => {
    expect(errorUtil.format(42)).toBe("42");
  });

  it("formats null as String(null)", () => {
    expect(errorUtil.format(null)).toBe("null");
  });

  it("formats undefined as String(undefined)", () => {
    expect(errorUtil.format(undefined)).toBe("undefined");
  });
});

describe("errorUtil.formatPath", () => {
  it("joins path segments with dots", () => {
    expect(errorUtil.formatPath(["a", "b", "c"])).toBe("a.b.c");
  });

  it("returns 'root' for empty path", () => {
    expect(errorUtil.formatPath([])).toBe("root");
  });
});
