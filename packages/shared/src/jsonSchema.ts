/**
 * Validator for the JSON Schema subset used by the harness files (draft 2020-12 keywords only):
 * type, enum, pattern, minLength, minItems, maxItems, items, properties, required, additionalProperties (boolean).
 * Dependency-free so the web bundle can import `@cobrac/shared` without a schema library.
 */
export type JsonType = "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: JsonType | readonly JsonType[];
  enum?: readonly unknown[];
  pattern?: string;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

function typeOf(v: unknown): JsonType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v as JsonType;
}

const typeMatches = (want: JsonType, got: JsonType) => want === got || (want === "number" && got === "integer");

/** Problems as `<JSON pointer> <message>`; empty when `value` conforms. Stops descending into a mistyped value. */
export function validateJsonSchema(schema: JsonSchema, value: unknown, path = ""): string[] {
  const at = path || "/";
  const got = typeOf(value);
  if (schema.type) {
    const types = (Array.isArray(schema.type) ? schema.type : [schema.type]) as JsonType[];
    if (!types.some((t) => typeMatches(t, got))) return [`${at} must be ${types.join(" or ")} (got ${got})`];
  }
  const errors: string[] = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at} must not be empty`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${at} (${JSON.stringify(value)}) must match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at} needs at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at} must have at most ${schema.maxItems} item(s) (got ${value.length})`);
    if (schema.items) value.forEach((v, i) => errors.push(...validateJsonSchema(schema.items!, v, `${path}/${i}`)));
  }
  if (got === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) errors.push(`${path}/${k} is required`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (sub) errors.push(...validateJsonSchema(sub, v, `${path}/${k}`));
      else if (schema.additionalProperties === false) errors.push(`${path}/${k} is not allowed`);
    }
  }
  return errors;
}
