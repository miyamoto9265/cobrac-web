/**
 * DynamoDB Streams consumer: pushes new Messages and Project updates to subscribed WebSocket clients.
 * Events go only to connections of the project's owner.
 */
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import type { DynamoDBStreamEvent } from "aws-lambda";
import type { MessageRecord, ProjectRecord, WsServerEvent } from "@cobrac/shared";
import { env } from "../env.js";
import { deleteWsConnection, getJob, listSubscribers } from "../lib/db.js";
import { subscribersOf } from "../lib/ownership.js";

const mgmt = new ApiGatewayManagementApiClient({ region: env.region, endpoint: env.wsEndpoint });

interface Target {
  projectId: string;
  userId: string;
  events: WsServerEvent[];
}

export async function handler(event: DynamoDBStreamEvent) {
  const targets = new Map<string, Target>();
  const jobOwner = new Map<string, Promise<string | null>>();
  const ownerOfMessage = (m: MessageRecord): Promise<string | null> => {
    if (m.userId) return Promise.resolve(m.userId);
    const k = `${m.projectId}\u0000${m.jobId}`;
    if (!jobOwner.has(k)) jobOwner.set(k, getJob(m.projectId, m.jobId).then((j) => j?.userId ?? null));
    return jobOwner.get(k)!;
  };

  for (const rec of event.Records) {
    const img = rec.dynamodb?.NewImage;
    if (!img) continue;
    const item = unmarshall(img as Record<string, AttributeValue>);
    const table = tableFromArn(rec.eventSourceARN);
    if (table === env.tables.messages && rec.eventName === "INSERT") {
      const m = item as MessageRecord;
      const owner = await ownerOfMessage(m);
      if (owner) push(targets, m.projectId, owner, { type: "message", projectId: m.projectId, message: m });
    } else if (table === env.tables.projects) {
      const p = item as ProjectRecord;
      push(targets, p.projectId, p.userId, { type: "project", projectId: p.projectId, project: p });
    }
  }

  const subsByProject = new Map<string, ReturnType<typeof listSubscribers>>();
  for (const t of targets.values()) {
    if (!subsByProject.has(t.projectId)) subsByProject.set(t.projectId, listSubscribers(t.projectId));
    const subs = subscribersOf(await subsByProject.get(t.projectId)!, t.userId);
    await Promise.all(
      subs.map(async (s) => {
        for (const ev of t.events) {
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

function push(map: Map<string, Target>, projectId: string, userId: string, ev: WsServerEvent) {
  const key = `${userId}\u0000${projectId}`;
  if (!map.has(key)) map.set(key, { projectId, userId, events: [] });
  map.get(key)!.events.push(ev);
}

function tableFromArn(arn?: string): string {
  // arn:aws:dynamodb:region:acct:table/NAME/stream/2024-...
  const m = /table\/([^/]+)\//.exec(arn ?? "");
  return m?.[1] ?? "";
}
