import type { LambdaContext, LambdaEvent } from "hono/aws-lambda";
import type { UserRecord } from "@cobrac/shared";

/** Hono environment of the API: the Lambda event and context, and the signed-in user set by the auth middleware. */
export type ApiEnv = { Bindings: { event: LambdaEvent; lambdaContext: LambdaContext }; Variables: { user: UserRecord } };
