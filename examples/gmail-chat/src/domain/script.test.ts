import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import {
  GmailScriptArgs,
  ScriptResult,
  EmailListResult,
  RawResult,
} from "./script";

describe("GmailScriptArgs", () => {
  it("decodes valid code and intent", () => {
    const out = Schema.decodeSync(GmailScriptArgs)({
      code: "return await gmail.list({ max: 5 });",
      intent: "List recent emails",
    });
    expect(out.code).toBe("return await gmail.list({ max: 5 });");
    expect(out.intent).toBe("List recent emails");
  });

  it("throws on missing intent", () => {
    const decode = Schema.decodeSync(GmailScriptArgs) as (u: unknown) => GmailScriptArgs;
    expect(() => decode({ code: "x" })).toThrow();
  });
});

describe("ScriptResult", () => {
  it("decodes EmailListResult", () => {
    const json = {
      _tag: "EmailListResult",
      emails: [
        {
          id: "1",
          threadId: "t1",
          from: "a@b.com",
          subject: "Hi",
          snippet: "Hello",
          date: "2025-01-01",
          labelIds: ["INBOX"],
        },
      ],
    };
    const decode = Schema.decodeSync(ScriptResult) as (u: unknown) => Schema.Schema.Type<typeof ScriptResult>;
    const out = decode(json);
    expect(out).toBeInstanceOf(EmailListResult);
    expect((out as EmailListResult).emails).toHaveLength(1);
    expect((out as EmailListResult).emails[0].subject).toBe("Hi");
  });

  it("decodes RawResult for unknown shape", () => {
    const json = { _tag: "RawResult", data: { foo: 1 } };
    const decode = Schema.decodeSync(ScriptResult) as (u: unknown) => Schema.Schema.Type<typeof ScriptResult>;
    const out = decode(json);
    expect(out).toBeInstanceOf(RawResult);
    expect((out as RawResult).data).toEqual({ foo: 1 });
  });
});
