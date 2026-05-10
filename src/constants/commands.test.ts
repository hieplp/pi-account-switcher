import { describe, expect, it } from "vitest";
import { COMMANDS } from "./commands";

describe("COMMANDS", () => {
  it("does not register legacy command aliases", () => {
    const entries = [
      ...Object.values(COMMANDS.accounts),
      ...Object.values(COMMANDS.providers),
      ...Object.values(COMMANDS.models),
      ...Object.values(COMMANDS.system),
    ];

    for (const command of entries) {
      expect(command).not.toHaveProperty("aliases");
    }
  });
});
