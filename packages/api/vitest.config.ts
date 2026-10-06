import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      TABLE_USERS: "users",
      TABLE_PROJECTS: "projects",
      TABLE_JOBS: "jobs",
      TABLE_MESSAGES: "messages",
      TABLE_WS_CONNECTIONS: "ws",
      TABLE_CANONS: "canons",
      TABLE_CATALOG: "catalog",
      TABLE_PLANS: "plans",
    },
  },
});
