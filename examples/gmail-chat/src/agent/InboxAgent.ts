import { AIChatAgent } from "agents/ai-chat-agent";
import type { AgentContext } from "agents";
import { streamText } from "ai";
import type { CoreMessage, StreamTextOnFinishCallback, ToolSet } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Effect, Schema } from "effect";
import { Gmail } from "inbox.dog";
import { ScriptExecutor } from "../services/ScriptExecutor";
import { ScriptExecutorLive } from "../services/ScriptExecutor.live";
import { GmailScriptArgs } from "../domain/script";
import { SYSTEM_PROMPT } from "./system-prompt";
import { runGmailScriptParams } from "./tools";

interface GmailSession {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  email: string;
}

interface Env {
  ANTHROPIC_API_KEY: string;
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
}

export class InboxAgent extends AIChatAgent<Env> {
  declare ctx: AgentContext;
  declare env: Env;

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "PUT" && url.pathname.endsWith("/session")) {
      const session = (await request.json()) as GmailSession;
      await this.ctx.storage.put("gmail_session", session);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (request.method === "DELETE" && url.pathname.endsWith("/session")) {
      await this.ctx.storage.delete("gmail_session");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return super.onRequest(request);
  }

  override async onChatMessage(
    ...args: Parameters<AIChatAgent<Env>["onChatMessage"]>
  ): ReturnType<AIChatAgent<Env>["onChatMessage"]> {
    const [onFinish, options] = args;
    const session = await this.ctx.storage.get<GmailSession>("gmail_session");
    if (!session?.access_token) {
      return new Response(
        JSON.stringify({ error: "Please connect your Gmail account first." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const gmail = new Gmail(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        client_id: session.client_id,
        client_secret: session.client_secret,
      },
      { baseUrl: "https://inbox.dog", autoRefresh: true }
    );

    const executorLayer = ScriptExecutorLive(gmail);
    const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: SYSTEM_PROMPT,
      messages: this.messages as unknown as CoreMessage[],
      tools: {
        run_gmail_script: {
          description: "Execute JavaScript against sandboxed Gmail API. The script has access to a `gmail` object. Return a useful summary.",
          parameters: runGmailScriptParams,
          execute: async ({ code, intent }) => {
            const args = Schema.decodeSync(GmailScriptArgs)({ code, intent });
            const program = Effect.gen(function* () {
              const executor = yield* ScriptExecutor;
              return yield* executor.execute(args);
            });
            const value = await Effect.runPromise(
              program.pipe(
                Effect.provide(executorLayer),
                Effect.catchAll((err) =>
                  Effect.succeed({
                    _tag: "Error",
                    error: (err as { _tag?: string })._tag ?? "Unknown",
                    message: err instanceof Error ? err.message : String(err),
                  })
                )
              )
            );
            return typeof value === "object" && value !== null && "_tag" in value
              ? JSON.stringify(value, null, 2)
              : JSON.stringify(value, null, 2);
          },
        },
      },
      maxSteps: 5,
      onFinish: onFinish as unknown as StreamTextOnFinishCallback<ToolSet>,
      abortSignal: options?.abortSignal,
    });

    return result.toDataStreamResponse();
  }
}
