/**
 * Minimal in-memory stand-in for DynamoDBDocumentClient, covering the expressions used in src/lib/db.ts.
 */
type Item = Record<string, unknown>;
interface Input {
  TableName: string;
  Key?: Item;
  Item?: Item;
  IndexName?: string;
  KeyConditionExpression?: string;
  UpdateExpression?: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
  ReturnValues?: string;
  Limit?: number;
}

export const KEYS: Record<string, string[]> = {
  users: ["userId"],
  projects: ["userId", "projectId"],
  jobs: ["projectId", "jobId"],
  messages: ["projectId", "sk"],
  ws: ["connectionId", "projectId"],
  canons: ["canonId", "sk"],
};

export class ConditionalCheckFailedException extends Error {
  name = "ConditionalCheckFailedException";
}

export class FakeDdb {
  tables = new Map<string, Map<string, Item>>();

  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  items(name: string): Item[] {
    return [...this.table(name).values()];
  }
  put(name: string, item: Item) {
    this.table(name).set(this.key(name, item), structuredClone(item));
  }
  private key(name: string, item: Item) {
    return KEYS[name].map((k) => String(item[k])).join("\u0000");
  }
  private attr(expr: string, i: Input) {
    return expr.startsWith("#") ? i.ExpressionAttributeNames![expr] : expr;
  }
  private val(expr: string, i: Input) {
    return i.ExpressionAttributeValues![expr];
  }
  private check(cond: string | undefined, item: Item | undefined, i: Input) {
    if (!cond) return;
    const ok = cond.split(" AND ").every((c) => {
      const t = c.trim();
      let m = /^attribute_exists\((.+)\)$/.exec(t);
      if (m) return item !== undefined && item[this.attr(m[1], i)] !== undefined;
      m = /^attribute_not_exists\((.+)\)$/.exec(t);
      if (m) return item === undefined || item[this.attr(m[1], i)] === undefined;
      m = /^(\S+) = (:\w+)$/.exec(t);
      if (m) return item !== undefined && item[this.attr(m[1], i)] === this.val(m[2], i);
      m = /^(\S+) <> (:\w+)$/.exec(t);
      if (m) return item !== undefined && item[this.attr(m[1], i)] !== this.val(m[2], i);
      throw new Error(`unsupported condition ${t}`);
    });
    if (!ok) throw new ConditionalCheckFailedException("conditional check failed");
  }

  async send(cmd: { kind: string; input: Input }): Promise<Record<string, unknown>> {
    const i = cmd.input;
    const t = this.table(i.TableName);
    switch (cmd.kind) {
      case "Get":
        return { Item: structuredClone(t.get(this.key(i.TableName, i.Key!))) };
      case "Put": {
        this.check(i.ConditionExpression, t.get(this.key(i.TableName, i.Item!)), i);
        this.put(i.TableName, Object.fromEntries(Object.entries(i.Item!).filter(([, v]) => v !== undefined)));
        return {};
      }
      case "Delete":
        this.check(i.ConditionExpression, t.get(this.key(i.TableName, i.Key!)), i);
        t.delete(this.key(i.TableName, i.Key!));
        return {};
      case "Update": {
        const k = this.key(i.TableName, i.Key!);
        const cur = t.get(k);
        this.check(i.ConditionExpression, cur, i);
        const next: Item = structuredClone(cur ?? { ...i.Key });
        const changed: Item = {};
        const clauses = [...i.UpdateExpression!.matchAll(/(SET|REMOVE|ADD) (.+?)(?= (?:SET|REMOVE|ADD) |$)/g)];
        if (!clauses.length) throw new Error(`unsupported update ${i.UpdateExpression}`);
        for (const [, kind, body] of clauses) {
          for (const part of body.split(", ")) {
            if (kind === "SET") {
              const [a, v] = part.split(" = ");
              next[this.attr(a, i)] = changed[this.attr(a, i)] = this.val(v, i);
            } else if (kind === "REMOVE") {
              delete next[this.attr(part.trim(), i)];
            } else {
              const [a, v] = part.split(" ");
              const name = this.attr(a, i);
              next[name] = changed[name] = Number(next[name] ?? 0) + Number(this.val(v, i));
            }
          }
        }
        t.set(k, next);
        return i.ReturnValues === "UPDATED_NEW" ? { Attributes: changed } : {};
      }
      case "Query": {
        const conds = i.KeyConditionExpression!.split(" AND ").map((c) => c.trim());
        const preds = conds.map((c) => {
          let m = /^(\S+) = (:\w+)$/.exec(c);
          if (m) {
            const a = this.attr(m[1], i);
            const v = this.val(m[2], i);
            return (x: Item) => x[a] === v;
          }
          m = /^begins_with\((\S+), (:\w+)\)$/.exec(c);
          if (m) {
            const a = this.attr(m[1], i);
            const v = String(this.val(m[2], i));
            return (x: Item) => typeof x[a] === "string" && (x[a] as string).startsWith(v);
          }
          throw new Error(`unsupported key condition ${i.KeyConditionExpression}`);
        });
        let rows = [...t.values()].filter((x) => preds.every((p) => p(x))).map((x) => structuredClone(x));
        const sk = i.IndexName ? undefined : KEYS[i.TableName][1];
        if (sk) rows.sort((x, y) => (String(x[sk]) < String(y[sk]) ? -1 : 1));
        if (i.Limit) rows = rows.slice(0, i.Limit);
        return { Items: rows };
      }
      case "Scan":
        return { Items: [...t.values()].map((x) => structuredClone(x)) };
      default:
        throw new Error(`unsupported command ${cmd.kind}`);
    }
  }
}

export const fake = new FakeDdb();

const command = (kind: string) =>
  class {
    kind = kind;
    constructor(public input: Input) {}
  };

export const libDynamodbMock = {
  DynamoDBDocumentClient: { from: () => fake },
  GetCommand: command("Get"),
  PutCommand: command("Put"),
  DeleteCommand: command("Delete"),
  UpdateCommand: command("Update"),
  QueryCommand: command("Query"),
  ScanCommand: command("Scan"),
};
