import { describe, expect, it } from "vitest";
import { WORKER_ONLY_ENV, childEnv } from "../src/childEnv.js";

describe("childEnv", () => {
  const source = {
    PATH: "/usr/bin",
    HOME: "/home/worker",
    AWS_REGION: "ap-northeast-1",
    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials/x",
    AWS_ACCESS_KEY_ID: "AKIA",
    AWS_SECRET_ACCESS_KEY: "s",
    AWS_SESSION_TOKEN: "t",
    NCBI_API_KEY: "n",
    RCS_MCP_TOKEN: "r",
    EMPTY: undefined,
  };

  it("drops the worker-only variables and keeps the rest", () => {
    expect(childEnv({}, source)).toEqual({ PATH: "/usr/bin", HOME: "/home/worker", AWS_REGION: "ap-northeast-1" });
  });

  it("adds the extra variables, which may set a worker-only one on purpose", () => {
    expect(childEnv({ PYTHONIOENCODING: "utf-8", RCS_MCP_TOKEN: "for-codex" }, source)).toMatchObject({ PYTHONIOENCODING: "utf-8", RCS_MCP_TOKEN: "for-codex" });
  });

  it("covers the credentials the ECS agent gives a task", () => {
    expect(WORKER_ONLY_ENV).toEqual(expect.arrayContaining(["AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_AUTHORIZATION_TOKEN"]));
  });
});
