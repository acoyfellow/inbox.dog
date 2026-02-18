import { Schema } from "effect";

export class GmailApiError extends Schema.TaggedError<GmailApiError>()(
  "GmailApiError",
  {
    statusCode: Schema.Number,
    message: Schema.String,
    endpoint: Schema.String,
  }
) {}

export class ScriptExecutionError extends Schema.TaggedError<ScriptExecutionError>()(
  "ScriptExecutionError",
  {
    message: Schema.String,
    code: Schema.String,
    line: Schema.optional(Schema.Number),
  }
) {}

export class SessionExpiredError extends Schema.TaggedError<SessionExpiredError>()(
  "SessionExpiredError",
  { reason: Schema.String }
) {}

export class ScriptTimeoutError extends Schema.TaggedError<ScriptTimeoutError>()(
  "ScriptTimeoutError",
  { durationMs: Schema.Number }
) {}

export const AppError = Schema.Union(
  GmailApiError,
  ScriptExecutionError,
  SessionExpiredError,
  ScriptTimeoutError
);
export type AppError = Schema.Schema.Type<typeof AppError>;
