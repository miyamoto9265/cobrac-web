const get = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
};

export const env = {
  region: process.env.AWS_REGION ?? "ap-northeast-1",
  appVersion: process.env.APP_VERSION ?? "0.0.0",
  tables: {
    users: get("TABLE_USERS", ""),
    projects: get("TABLE_PROJECTS", ""),
    jobs: get("TABLE_JOBS", ""),
    messages: get("TABLE_MESSAGES", ""),
    wsConnections: get("TABLE_WS_CONNECTIONS", ""),
  },
  artifactsBucket: get("ARTIFACTS_BUCKET", ""),
  jobQueueUrl: get("JOB_QUEUE_URL", ""),
  kmsKeyId: get("KMS_KEY_ID", ""),
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS ?? "2"),
  maxConcurrentJobsPerUser: Number(process.env.MAX_CONCURRENT_JOBS_PER_USER ?? "1"),
  ecs: {
    clusterArn: process.env.ECS_CLUSTER_ARN ?? "",
    taskDefinitionArn: process.env.ECS_TASK_DEFINITION_ARN ?? "",
    containerName: process.env.ECS_CONTAINER_NAME ?? "worker",
    subnets: (process.env.ECS_SUBNETS ?? "").split(",").filter(Boolean),
    securityGroup: process.env.ECS_SECURITY_GROUP ?? "",
    useSpot: (process.env.ECS_USE_SPOT ?? "true") === "true",
  },
  wsEndpoint: process.env.WS_MANAGEMENT_ENDPOINT ?? "",
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID ?? "",
    clientId: process.env.COGNITO_CLIENT_ID ?? "",
  },
  codexModel: process.env.CODEX_MODEL ?? "",
};
