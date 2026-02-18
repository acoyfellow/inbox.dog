import { Schema } from "effect";

export const ScriptCode = Schema.String.pipe(Schema.brand("ScriptCode"));
export type ScriptCode = Schema.Schema.Type<typeof ScriptCode>;

export const ScriptIntent = Schema.String.pipe(Schema.brand("ScriptIntent"));
export type ScriptIntent = Schema.Schema.Type<typeof ScriptIntent>;

export class GmailScriptArgs extends Schema.Class<GmailScriptArgs>("GmailScriptArgs")({
  code: ScriptCode,
  intent: ScriptIntent,
}) {}

export const EmailSummarySchema = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  from: Schema.String,
  subject: Schema.String,
  snippet: Schema.String,
  date: Schema.String,
  labelIds: Schema.Array(Schema.String),
});
export type EmailSummary = Schema.Schema.Type<typeof EmailSummarySchema>;

export class EmailListResult extends Schema.TaggedClass<EmailListResult>()(
  "EmailListResult",
  { emails: Schema.Array(EmailSummarySchema) }
) {}

export class ActionResult extends Schema.TaggedClass<ActionResult>()(
  "ActionResult",
  {
    action: Schema.Literal("archived", "labeled", "sent", "trashed", "drafted"),
    targetIds: Schema.Array(Schema.String),
    detail: Schema.optional(Schema.String),
  }
) {}

export class RawResult extends Schema.TaggedClass<RawResult>()(
  "RawResult",
  { data: Schema.Unknown }
) {}

export const ScriptResult = Schema.Union(EmailListResult, ActionResult, RawResult);
export type ScriptResult = Schema.Schema.Type<typeof ScriptResult>;
