/**
 * WebSocket API handlers: authorizer ($connect, token in query string), connect, disconnect, default (subscribe).
 */
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import type {
  APIGatewayProxyResultV2,
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
  APIGatewayProxyWebsocketEventV2,
} from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { WsClientEvent, WsServerEvent } from "@cobrac/shared";
import { isProjectDeleted } from "@cobrac/shared";
import { env } from "../env.js";
import {
  deleteWsConnection,
  getProject,
  getWsConnection,
  listWsConnectionRows,
  putWsConnection,
} from "../lib/db.js";

const verifier = CognitoJwtVerifier.create({
  userPoolId: env.cognito.userPoolId,
  clientId: env.cognito.clientId,
  tokenUse: "id",
});

export async function authorizer(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  const token = event.queryStringParameters?.token;
  if (!token) throw new Error("Unauthorized");
  try {
    const payload = await verifier.verify(token);
    return {
      principalId: payload.sub,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: event.methodArn }],
      },
      context: { userId: payload.sub, email: String(payload.email ?? "") },
    };
  } catch (e) {
    console.warn("ws auth failed", e);
    throw new Error("Unauthorized");
  }
}

const TTL_SECONDS = 2 * 60 * 60 + 600; // API GW max connection is 2h

export async function connect(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const ctx = (event.requestContext as unknown as { authorizer?: { userId?: string } }).authorizer;
  const userId = ctx?.userId;
  if (!userId) return { statusCode: 401 };
  await putWsConnection({
    connectionId: event.requestContext.connectionId,
    projectId: "_",
    userId,
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  });
  return { statusCode: 200 };
}

export async function disconnect(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const rows = await listWsConnectionRows(event.requestContext.connectionId);
  await Promise.all(rows.map((r) => deleteWsConnection(r.connectionId, r.projectId)));
  return { statusCode: 200 };
}

export async function defaultRoute(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const base = await getWsConnection(connectionId, "_");
  if (!base) return { statusCode: 401 };
  let msg: WsClientEvent;
  try {
    msg = JSON.parse(event.body ?? "{}") as WsClientEvent;
  } catch {
    return { statusCode: 400 };
  }
  const mgmt = new ApiGatewayManagementApiClient({
    region: env.region,
    endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
  });
  const send = (payload: WsServerEvent) =>
    mgmt.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: Buffer.from(JSON.stringify(payload)) }));

  switch (msg.action) {
    case "ping":
      return { statusCode: 200 };
    case "subscribe": {
      const p = await getProject(base.userId, msg.projectId);
      if (!p || isProjectDeleted(p)) {
        await send({ type: "error", message: "project not found" });
        return { statusCode: 200 };
      }
      await putWsConnection({ connectionId, projectId: msg.projectId, userId: base.userId, ttl: base.ttl });
      await send({ type: "subscribed", projectId: msg.projectId });
      await send({ type: "project", projectId: msg.projectId, project: p });
      return { statusCode: 200 };
    }
    case "unsubscribe":
      await deleteWsConnection(connectionId, msg.projectId);
      return { statusCode: 200 };
    default:
      return { statusCode: 400 };
  }
}
