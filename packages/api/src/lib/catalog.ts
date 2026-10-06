import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CatalogItem, CatalogKind, CloneCounter, IdReservation } from "@cobrac/shared";
import { generateCanonId, generatePlanId, generateProjectId, ID_RESERVATION_KIND, nowIso, RANDOM_ID_ATTEMPTS } from "@cobrac/shared";
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

/**
 * Draws a random ID and reserves it with a conditional Put (`attribute_not_exists(id)`); a taken ID is drawn again.
 * The reservation is what makes the ID globally unique: the Projects table is keyed by user, so its own conditional
 * Put cannot see other users' projects.
 */
const GENERATORS: Record<IdReservation["type"], () => string> = { project: generateProjectId, canon: generateCanonId, plan: generatePlanId };

export async function reserveNewId(type: IdReservation["type"], ownerUserId: string, generate: () => string = GENERATORS[type]): Promise<string> {
  for (let i = 0; i < RANDOM_ID_ATTEMPTS; i++) {
    const id = generate();
    const row: IdReservation = { kind: ID_RESERVATION_KIND, id, type, ownerUserId, createdAt: nowIso() };
    try {
      await ddb.send(new PutCommand({ TableName: env.tables.catalog, Item: row, ConditionExpression: "attribute_not_exists(id)" }));
      return id;
    } catch (e) {
      if ((e as { name?: string }).name !== "ConditionalCheckFailedException") throw e;
    }
  }
  throw new Error(`could not reserve a unique ${type} ID`);
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
