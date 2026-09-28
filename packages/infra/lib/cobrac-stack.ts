import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer, WebSocketLambdaAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource, SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { ContainerImageBuild } from "@cdklabs/deploy-time-build";
import type { Construct } from "constructs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CobracAgentsStackProps extends StackProps {
  adminEmails: string;
  selfSignUp: boolean;
  maxConcurrentJobs: number;
  maxConcurrentJobsPerUser: number;
  codexModel: string;
  codexReasoningEffort: string;
  /** RCS MCP endpoint for the agent's SABRA lookups; empty disables RCS */
  rcsMcpUrl: string;
  /** Secrets Manager secret (same account) holding the accepted RCS bearer tokens, owned by rosetta-candidate-search */
  rcsMcpSecretName: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../.."); // repository root ("cobrac-web/")
const apiSrc = resolve(repoRoot, "packages/api/src");
const webDist = resolve(repoRoot, "packages/web/dist");
/** Root package.json version is the single source of truth (see AGENTS.md). */
const appVersion: string = (JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as { version: string }).version;

export class CobracAgentsStack extends Stack {
  constructor(scope: Construct, id: string, props: CobracAgentsStackProps) {
    super(scope, id, props);

    // -----------------------------------------------------------------------
    // Storage & keys
    // -----------------------------------------------------------------------
    const key = new kms.Key(this, "ApiKeyKmsKey", {
      description: "CoBRAC Agents - encrypts user OpenAI API keys",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const artifacts = new s3.Bucket(this, "Artifacts", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(3) }],
    });

    const tableDefaults: Partial<dynamodb.TablePropsV2> = {
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
    };

    const users = new dynamodb.TableV2(this, "Users", {
      ...tableDefaults,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      // Project ID namespace (`<userKey>-<seq>`): uniqueness check on issue, ID → owner lookup
      globalSecondaryIndexes: [
        {
          indexName: "userKey-index",
          partitionKey: { name: "userKey", type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.KEYS_ONLY,
        },
      ],
    });
    const projects = new dynamodb.TableV2(this, "Projects", {
      ...tableDefaults,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
    });
    const jobs = new dynamodb.TableV2(this, "Jobs", {
      ...tableDefaults,
      partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: "status-index",
          partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
        },
      ],
    });
    const messages = new dynamodb.TableV2(this, "Messages", {
      ...tableDefaults,
      partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
    });
    const wsConnections = new dynamodb.TableV2(this, "WsConnections", {
      ...tableDefaults,
      removalPolicy: RemovalPolicy.DESTROY,
      partitionKey: { name: "connectionId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      globalSecondaryIndexes: [
        {
          indexName: "project-index",
          partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    const jobDlq = new sqs.Queue(this, "JobDlq", { retentionPeriod: Duration.days(14) });
    const jobQueue = new sqs.Queue(this, "JobQueue", {
      visibilityTimeout: Duration.seconds(120),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: jobDlq, maxReceiveCount: 5 },
    });

    // -----------------------------------------------------------------------
    // Cognito
    // -----------------------------------------------------------------------
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: props.selfSignUp,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 10, requireLowercase: true, requireDigits: true, requireUppercase: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient("WebClient", {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(2),
      accessTokenValidity: Duration.hours(2),
      refreshTokenValidity: Duration.days(30),
    });
    new cognito.CfnUserPoolGroup(this, "AdminGroup", { userPoolId: userPool.userPoolId, groupName: "admin" });

    // -----------------------------------------------------------------------
    // Network + ECS worker (public subnets only → no NAT gateway cost)
    // -----------------------------------------------------------------------
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });
    const workerSg = new ec2.SecurityGroup(this, "WorkerSg", { vpc, allowAllOutbound: true, description: "CoBRAC worker (no inbound)" });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc, enableFargateCapacityProviders: true, containerInsightsV2: ecs.ContainerInsights.DISABLED });

    const workerLogs = new logs.LogGroup(this, "WorkerLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY });

    const taskDef = new ecs.FargateTaskDefinition(this, "WorkerTask", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
      ephemeralStorageGiB: 21,
    });
    // The worker image is built by CodeBuild at deploy time, so no local Docker is required.
    const workerImage = new ContainerImageBuild(this, "WorkerImage", {
      directory: repoRoot,
      file: "packages/worker/Dockerfile",
      platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
      // keep in sync with .dockerignore (asset upload only; the Docker build itself honours .dockerignore)
      exclude: ["**/node_modules", "**/dist", "**/cdk.out", ".git", ".env", ".env.*", "archive", "packages/web/src", "packages/web/index.html", "packages/infra/lib", "packages/infra/bin", "packages/api/src"],
    });
    const container = taskDef.addContainer("worker", {
      image: workerImage.toEcsDockerImageCode(),
      logging: ecs.LogDrivers.awsLogs({ logGroup: workerLogs, streamPrefix: "worker" }),
      environment: {
        TABLE_USERS: users.tableName,
        TABLE_PROJECTS: projects.tableName,
        TABLE_JOBS: jobs.tableName,
        TABLE_MESSAGES: messages.tableName,
        ARTIFACTS_BUCKET: artifacts.bucketName,
        CODEX_MODEL: props.codexModel,
        CODEX_REASONING_EFFORT: props.codexReasoningEffort,
        RCS_MCP_URL: props.rcsMcpUrl,
        RCS_MCP_SECRET_ID: props.rcsMcpUrl ? props.rcsMcpSecretName : "",
        // Overridden per run by the dispatcher:
        JOB_USER_ID: "",
        JOB_PROJECT_ID: "",
        JOB_ID: "",
        JOB_MODE: "initial",
      },
    });
    for (const t of [users, projects, jobs, messages]) t.grantReadWriteData(taskDef.taskRole);
    artifacts.grantReadWrite(taskDef.taskRole);
    key.grantDecrypt(taskDef.taskRole);
    // read at run time (not injected by ECS) so a missing secret only disables RCS instead of failing task start
    if (props.rcsMcpUrl) secretsmanager.Secret.fromSecretNameV2(this, "RcsMcpToken", props.rcsMcpSecretName).grantRead(taskDef.taskRole);

    // -----------------------------------------------------------------------
    // Lambdas
    // -----------------------------------------------------------------------
    const commonEnv: Record<string, string> = {
      APP_VERSION: appVersion,
      TABLE_USERS: users.tableName,
      TABLE_PROJECTS: projects.tableName,
      TABLE_JOBS: jobs.tableName,
      TABLE_MESSAGES: messages.tableName,
      TABLE_WS_CONNECTIONS: wsConnections.tableName,
      ARTIFACTS_BUCKET: artifacts.bucketName,
      JOB_QUEUE_URL: jobQueue.queueUrl,
      KMS_KEY_ID: key.keyId,
      ADMIN_EMAILS: props.adminEmails,
      MAX_CONCURRENT_JOBS: String(props.maxConcurrentJobs),
      MAX_CONCURRENT_JOBS_PER_USER: String(props.maxConcurrentJobsPerUser),
      CODEX_MODEL: props.codexModel,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      ECS_CLUSTER_ARN: cluster.clusterArn,
      ECS_TASK_DEFINITION_ARN: taskDef.taskDefinitionArn,
      ECS_CONTAINER_NAME: container.containerName,
      ECS_SUBNETS: vpc.publicSubnets.map((s) => s.subnetId).join(","),
      ECS_SECURITY_GROUP: workerSg.securityGroupId,
      ECS_USE_SPOT: "true",
    };

    const fn = (name: string, entry: string, handler: string, extra: Partial<cdk.aws_lambda_nodejs.NodejsFunctionProps> = {}) =>
      new NodejsFunction(this, name, {
        entry: resolve(apiSrc, entry),
        handler,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(30),
        logGroup: new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
        environment: commonEnv,
        bundling: {
          format: OutputFormat.ESM,
          target: "node22",
          minify: true,
          sourceMap: false,
          externalModules: ["@aws-sdk/*"],
          banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        },
        ...extra,
      });

    const apiFn = fn("ApiFn", "handlers/http.ts", "handler");
    const dispatcherFn = fn("DispatcherFn", "handlers/dispatcher.ts", "handler", { timeout: Duration.seconds(60) });
    const wsAuthFn = fn("WsAuthorizerFn", "handlers/ws.ts", "authorizer");
    const wsConnectFn = fn("WsConnectFn", "handlers/ws.ts", "connect");
    const wsDisconnectFn = fn("WsDisconnectFn", "handlers/ws.ts", "disconnect");
    const wsDefaultFn = fn("WsDefaultFn", "handlers/ws.ts", "defaultRoute");
    const broadcasterFn = fn("BroadcasterFn", "handlers/broadcaster.ts", "handler", { timeout: Duration.seconds(60) });
    const janitorFn = fn("JanitorFn", "handlers/janitor.ts", "handler", { timeout: Duration.minutes(2) });

    // permissions ------------------------------------------------------------
    for (const t of [users, projects, jobs, messages, wsConnections]) {
      for (const f of [apiFn, dispatcherFn, wsConnectFn, wsDisconnectFn, wsDefaultFn, broadcasterFn, janitorFn]) t.grantReadWriteData(f);
    }
    artifacts.grantRead(apiFn);
    // user-arranged graph layouts are written by the API (graph/*.layout.json only)
    artifacts.grantPut(apiFn, "users/*/graph/*.layout.json");
    artifacts.grantDelete(apiFn, "users/*/graph/*.layout.json");
    key.grantEncrypt(apiFn);
    jobQueue.grantSendMessages(apiFn);
    jobQueue.grantSendMessages(dispatcherFn);
    jobQueue.grantSendMessages(janitorFn);
    apiFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["ecs:StopTask"], resources: ["*"], conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } } }));
    dispatcherFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["ecs:RunTask"], resources: [taskDef.taskDefinitionArn] }));
    dispatcherFn.addToRolePolicy(new iam.PolicyStatement({ actions: ["ecs:TagResource"], resources: ["*"] }));
    dispatcherFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["iam:PassRole"], resources: [taskDef.taskRole.roleArn, taskDef.obtainExecutionRole().roleArn] }),
    );

    dispatcherFn.addEventSource(new SqsEventSource(jobQueue, { batchSize: 1, reportBatchItemFailures: true }));
    for (const t of [messages, projects]) {
      broadcasterFn.addEventSource(
        new DynamoEventSource(t, { startingPosition: lambda.StartingPosition.LATEST, batchSize: 25, retryAttempts: 2, bisectBatchOnError: true }),
      );
    }
    new events.Rule(this, "JanitorSchedule", { schedule: events.Schedule.rate(Duration.minutes(15)), targets: [new targets.LambdaFunction(janitorFn)] });

    // -----------------------------------------------------------------------
    // HTTP API
    // -----------------------------------------------------------------------
    const jwtAuthorizer = new HttpJwtAuthorizer("JwtAuth", `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, {
      jwtAudience: [userPoolClient.userPoolClientId],
      identitySource: ["$request.header.Authorization"],
    });
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "cobrac-agents-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PUT, apigwv2.CorsHttpMethod.DELETE, apigwv2.CorsHttpMethod.OPTIONS],
        maxAge: Duration.hours(1),
      },
    });
    const apiIntegration = new HttpLambdaIntegration("ApiIntegration", apiFn);
    httpApi.addRoutes({ path: "/health", methods: [apigwv2.HttpMethod.GET], integration: apiIntegration });
    // NOTE: OPTIONS is intentionally excluded so API Gateway answers CORS preflight itself (an ANY route
    // would send preflight through the JWT authorizer and return 401 → "Failed to fetch" in the browser).
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE, apigwv2.HttpMethod.PATCH],
      integration: apiIntegration,
      authorizer: jwtAuthorizer,
    });

    // -----------------------------------------------------------------------
    // WebSocket API
    // -----------------------------------------------------------------------
    const wsApi = new apigwv2.WebSocketApi(this, "WsApi", {
      apiName: "cobrac-agents-ws",
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("WsConnect", wsConnectFn),
        authorizer: new WebSocketLambdaAuthorizer("WsAuth", wsAuthFn, { identitySource: ["route.request.querystring.token"] }),
      },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration("WsDisconnect", wsDisconnectFn) },
      defaultRouteOptions: { integration: new WebSocketLambdaIntegration("WsDefault", wsDefaultFn) },
    });
    const wsStage = new apigwv2.WebSocketStage(this, "WsStage", { webSocketApi: wsApi, stageName: "prod", autoDeploy: true });
    wsApi.grantManageConnections(wsDefaultFn);
    wsApi.grantManageConnections(broadcasterFn);
    broadcasterFn.addEnvironment("WS_MANAGEMENT_ENDPOINT", `https://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`);

    // -----------------------------------------------------------------------
    // Frontend (S3 + CloudFront) with runtime config.json
    // -----------------------------------------------------------------------
    const webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const distribution = new cloudfront.Distribution(this, "WebDistribution", {
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        "/config.json": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        },
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.seconds(10) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.seconds(10) },
      ],
    });

    const runtimeConfig = {
      apiUrl: httpApi.apiEndpoint,
      wsUrl: wsStage.url,
      userPoolId: userPool.userPoolId,
      userPoolClientId: userPoolClient.userPoolClientId,
      region: this.region,
      appName: "CoBRAC Agents",
    };
    const sources: s3deploy.ISource[] = [s3deploy.Source.jsonData("config.json", runtimeConfig)];
    if (existsSync(webDist)) sources.unshift(s3deploy.Source.asset(webDist));
    else cdk.Annotations.of(this).addWarning(`packages/web/dist not found - deploying config.json only. Run "npm run build -w @cobrac/web" first.`);
    new s3deploy.BucketDeployment(this, "WebDeploy", {
      sources,
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
      memoryLimit: 512,
    });

    // -----------------------------------------------------------------------
    // Outputs
    // -----------------------------------------------------------------------
    new cdk.CfnOutput(this, "WebUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "WsUrl", { value: wsStage.url });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "ArtifactsBucket", { value: artifacts.bucketName });
    new cdk.CfnOutput(this, "WorkerLogGroup", { value: workerLogs.logGroupName });
  }
}
