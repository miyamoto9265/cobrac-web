/**
 * DynamoDB Streams consumer: pushes new Messages and Project updates to subscribed WebSocket clients.
 */
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import type { DynamoDBStreamEvent } from "aws-lambda";
import type { MessageRecord, ProjectRecord, WsServerEvent } from "@cobrac/shared";
import { env } from "../env.js";
import { deleteWsConnection, listSubscribers } from "../lib/db.js";

const mgmt = new ApiGatewayManagementApiClient({ region: env.region, endpoint: env.wsEndpoint });

export async function handler(event: DynamoDBStreamEvent) {
  const byProject = new Map<string, WsServerEvent[]>();

  for (const rec of event.Records) {
    const img = rec.dynamodb?.NewImage;
    if (!img) continue;
    const item = unmarshall(img as Record<string, AttributeValue>);
    const table = tableFromArn(rec.eventSourceARN);
    if (table === env.tables.messages && rec.eventName === "INSERT") {
      const m = item as MessageRecord;
      push(byProject, m.projectId, { type: "message", projectId: m.projectId, message: m });
    } else if (table === env.tables.projects) {
      const p = item as ProjectRecord;
      push(byProject, p.projectId, { type: "project", projectId: p.projectId, project: p });
    }
  }

  for (const [projectId, events] of byProject) {
    const subs = await listSubscribers(projectId);
    await Promise.all(
      subs.map(async (s) => {
        for (const ev of events) {
          try {
            await mgmt.send(new PostToConnectionCommand({ ConnectionId: s.connectionId, Data: Buffer.from(JSON.stringify(ev)) }));
          } catch (e) {
            const code = (e as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode;
            if (code === 410 || (e as { name?: string }).name === "GoneException") {
              await deleteWsConnection(s.connectionId, s.projectId).catch(() => undefined);
              return;
            }
            console.warn("post failed", e);
          }
        }
      }),
    );
  }
}

function push(map: Map<string, WsServerEvent[]>, key: string, ev: WsServerEvent) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(ev);
}

function tableFromArn(arn?: string): string {
  // arn:aws:dynamodb:region:acct:table/NAME/stream/2024-...
  const m = /table\/([^/]+)\//.exec(arn ?? "");
  return m?.[1] ?? "";
}
