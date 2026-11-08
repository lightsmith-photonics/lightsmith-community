/** An error with an HTTP status and a stable machine-readable code, raised by agent API operations. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, extra?: Record<string, unknown>) => new ApiError(400, "bad_request", message, extra);
export const notFound = (what = "No such resource, or it is not visible to you.") => new ApiError(404, "not_found", what);
export const forbidden = (message: string, code = "forbidden") => new ApiError(403, code, message);
export const conflict = (message: string, code = "conflict") => new ApiError(409, code, message);
