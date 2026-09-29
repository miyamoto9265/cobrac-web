import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CatalogItem, CatalogKind, CloneCounter } from "@cobrac/shared";
import { env } from "../env.js";
import { ddb } from "./db.js";

export async function getCatalogItem(kind: Exclude<CatalogKind, "clones">, id: string): Promise<CatalogItem | null> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.catalog, Key: { kind, id } }));
  return (r.Item as CatalogItem) ?? null;
}

export async function putCatalogItem(item: CatalogItem) {
  await ddb.send(new PutCommand({ TableName: env.tables.catalog, Item: item }));
}

/** Removes the listing row only (the project or Canon itself is untouched). */
export async function deleteCatalogItem(kind: Exclude<CatalogKind, "clones">, id: string) {
  await ddb.send(new DeleteCommand({ TableName: env.tables.catalog, Key: { kind, id } }));
}

export async function listCatalog(kind: Exclude<CatalogKind, "clones">): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: env.tables.catalog,
        KeyConditionExpression: "#k = :k",
        ExpressionAttributeNames: { "#k": "kind" },
        ExpressionAttributeValues: { ":k": kind },
        ExclusiveStartKey: start,
      }),
    );
    out.push(...((r.Items as CatalogItem[]) ?? []));
    start = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (start);
  return out;
}

export async function getCloneCount(projectId: string): Promise<number> {
  const r = await ddb.send(new GetCommand({ TableName: env.tables.catalog, Key: { kind: "clones", id: projectId } }));
  return Number((r.Item as CloneCounter | undefined)?.count ?? 0);
}

/** Counted outside the original project's item, so cloning never writes to the original. */
export async function incrementCloneCount(projectId: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: env.tables.catalog,
      Key: { kind: "clones", id: projectId },
      UpdateExpression: "ADD #c :one",
      ExpressionAttributeNames: { "#c": "count" },
      ExpressionAttributeValues: { ":one": 1 },
    }),
  );
}
