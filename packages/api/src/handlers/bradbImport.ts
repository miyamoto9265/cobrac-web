// BRA-DB registration Lambda (BraDb stack; runs in the BRA-DB VPC next to the instance). Invoked by the API with a
// version's package (`register`) or for a project's registrations (`status`). Connects as cobrac_import, whose
// password is in Secrets Manager.
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import pg from "pg";
import type { BradbRegisterResponse, BradbRequest, BradbStatusResponse } from "@cobrac/shared";
import { registerVersion, registrationStatus } from "../lib/bradb/register.js";

const sm = new SecretsManagerClient({});
let password: string | null = null;

async function connect(): Promise<pg.Client> {
  if (!password) {
    const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.BRADB_SECRET_ARN }));
    password = (JSON.parse(r.SecretString ?? "{}") as { password?: string }).password ?? null;
    if (!password) throw new Error("the BRA-DB import secret has no password");
  }
  const client = new pg.Client({
    host: process.env.BRADB_HOST,
    port: 5432,
    database: process.env.BRADB_DB ?? "bra_db_v4_6",
    user: "cobrac_import",
    password,
    // the instance's own (self-signed) certificate: encrypted inside the VPC, not verified
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    statement_timeout: 20_000,
  });
  try {
    await client.connect();
  } catch (e) {
    password = null;
    throw e;
  }
  return client;
}

export async function handler(event: BradbRequest): Promise<BradbRegisterResponse | BradbStatusResponse> {
  const client = await connect();
  try {
    if (event.action === "register") {
      const r = await registerVersion(client, event);
      console.log(JSON.stringify({ action: "register", versionId: event.manifest.versionId, status: r.registration.status, code: r.code ?? null, registrationId: r.registration.registrationId }));
      return r;
    }
    if (event.action === "status") return await registrationStatus(client, event.projectId);
    throw new Error("unknown action");
  } finally {
    await client.end().catch(() => undefined);
  }
}
