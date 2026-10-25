import { describe, expect, it } from "vitest";
import { isOutOfMemory } from "../src/lib/ecsTask.js";

describe("isOutOfMemory", () => {
  it("tells a worker killed for memory from other stops", () => {
    expect(isOutOfMemory({ stoppedReason: "Essential container in task exited", containerReason: "OutOfMemoryError: Container killed due to memory usage", exitCode: 137 })).toBe(true);
    expect(isOutOfMemory({ stoppedReason: "Your Spot Task was interrupted.", containerReason: null, exitCode: 143 })).toBe(false);
    expect(isOutOfMemory(null)).toBe(false);
  });
});
