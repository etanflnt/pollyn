// Typed HTTP errors thrown by server logic and turned into JSON by lib/server/http.ts. Owner: Linus.
import type { ApiError } from "../types.ts";

export type ErrorCode = ApiError["code"];

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg: string) => new HttpError(400, "bad_request", msg);
export const unauthenticated = (msg = "Please sign in.") => new HttpError(401, "unauthenticated", msg);
export const forbidden = (msg = "You are not allowed to do that.") => new HttpError(403, "forbidden", msg);
export const wrongTenant = (msg = "This poll is only open to members of the organisation that created it.") =>
  new HttpError(403, "wrong_tenant", msg);
export const notFound = (msg = "Not found.") => new HttpError(404, "not_found", msg);
export const closed = (msg = "This poll is closed.") => new HttpError(409, "closed", msg);
