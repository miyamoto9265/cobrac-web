import { describe, expect, it } from "vitest";
import { usableDefaultModel } from "../src/lib/models";

describe("usableDefaultModel", () => {
  it("keeps a saved default the user can run and hides one the default API key does not allow", () => {
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: null })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: 2 })).toBe("gpt-6-sol");
    expect(usableDefaultModel({ defaultModel: "gpt-5.6-luna", orgTier: 1 })).toBe("gpt-5.6-luna");
    expect(usableDefaultModel({ defaultModel: "gpt-6-sol", orgTier: 1 })).toBeNull();
    expect(usableDefaultModel({ defaultModel: null, orgTier: 1 })).toBeNull();
    expect(usableDefaultModel(null)).toBeNull();
  });
});
