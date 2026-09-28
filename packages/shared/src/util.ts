export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}
