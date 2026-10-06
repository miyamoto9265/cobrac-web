import { HTTPException } from "hono/http-exception";

export const bad = (msg: string) => new HTTPException(400, { message: msg });
export const notFound = () => new HTTPException(404, { message: "not found" });
