import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { Effect, Schema } from "effect";
import { InboxDog } from "inbox.dog";
import { ScriptExecutor } from "../services/ScriptExecutor";
import { ScriptExecutorLive } from "../services/ScriptExecutor.live";
import { GmailScriptArgs } from "../domain/script";
import { SYSTEM_PROMPT } from "./system-prompt";
import { runGmailScriptParams } from "./tools";

const MODEL = "@cf/zai-org/glm-4.7-flash";

interface GmailSession {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  email: string;
}

interface AgentEnv {
  AI: Ai;
  INBOX_DOG_CLIENT_ID: string;
  INBOX_DOG_CLIENT_SECRET: string;
  LOADER: WorkerLoader;
}

export class InboxAgent extends AIChatAgent<AgentEnv> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/session" && request.method === "PUT") {
      const session = await request.json() as GmailSession;
      await this.ctx.storage.put("gmail_session", session);
      return new Response("ok");
    }
    if (url.pathname === "/session" && request.method === "GET") {
      const session = await this.ctx.storage.get<GmailSession>("gmail_session");
      if (!session) {
        return new Response("not found", { status: 404 });
      }
      return Response.json(session);
    }
    return super.onRequest(request);
  }

  override async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal: AbortSignal | undefined },
  ): Promise<Response | undefined> {
    const session = await this.ctx.storage.get<GmailSession>("gmail_session");
    const workersai = createWorkersAI({ binding: this.env.AI });

    const tools: ToolSet = {};
    let system = SYSTEM_PROMPT;

    if (session?.access_token) {
      // Auto-refresh token if expired (test with a lightweight Gmail call)
      let activeToken = session.access_token;
      try {
        const testRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${activeToken}` } },
        );
        if (testRes.status === 401 && session.refresh_token) {
          // Token expired — refresh it
          const dog = new InboxDog();
          const refreshed = await dog.refreshToken(
            session.refresh_token,
            session.client_id,
            session.client_secret,
          );
          activeToken = refreshed.access_token;
          // Persist the new token
          await this.ctx.storage.put("gmail_session", {
            ...session,
            access_token: activeToken,
          });
        }
      } catch {
        // If refresh fails, continue with the existing token
        // The sandbox will surface a clear error to the user
      }

      const sessionId = session.email.replace(/[^a-zA-Z0-9._-]/g, "_");
      const executorLayer = ScriptExecutorLive(
        {
          sessionId,
          access_token: activeToken,
          refresh_token: session.refresh_token,
          client_id: session.client_id,
          client_secret: session.client_secret,
        },
        { LOADER: this.env.LOADER as unknown as { get: (id: string, init: () => unknown) => { getEntrypoint: () => { fetch: (req: RequestInfo | URL) => Promise<Response> } } } },
      );
      tools.run_gmail_script = tool({
        description: "Execute JavaScript against sandboxed Gmail API. The script has access to a `gmail` object. Return a useful summary.",
        inputSchema: runGmailScriptParams,
        execute: async ({ code, intent }: { code: string; intent: string }) => {
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
          return value;
        },
      });
    } else {
      system = "You are a helpful assistant. The user has not connected their Gmail account yet. Politely tell them to log out and reconnect with Google to use Gmail features. You can still have a general conversation.";
    }

    const modelMessages = await convertToModelMessages(this.messages);
    const result = streamText({
      model: workersai(MODEL as Parameters<typeof workersai>[0]),
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      onFinish: onFinish as unknown as StreamTextOnFinishCallback<ToolSet>,
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}
