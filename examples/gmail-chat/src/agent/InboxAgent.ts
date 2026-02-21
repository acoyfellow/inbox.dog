import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { InboxDog } from "inbox.dog";
import { createGmailTools } from "./gmail-tools";
import { SYSTEM_PROMPT } from "./system-prompt";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

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
      const session = (await request.json()) as GmailSession;
      await this.ctx.storage.put("gmail_session", session);
      return new Response("ok");
    }
    if (url.pathname === "/session" && request.method === "GET") {
      const session =
        await this.ctx.storage.get<GmailSession>("gmail_session");
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
    const session =
      await this.ctx.storage.get<GmailSession>("gmail_session");
    const workersai = createWorkersAI({ binding: this.env.AI });

    const tools: ToolSet = {};
    let system = SYSTEM_PROMPT;

    if (session?.access_token) {
      // Auto-refresh token if expired
      let activeToken = session.access_token;
      try {
        const testRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          { headers: { Authorization: `Bearer ${activeToken}` } },
        );
        if (testRes.status === 401 && session.refresh_token) {
          const dog = new InboxDog();
          const refreshed = await dog.refreshToken(
            session.refresh_token,
            session.client_id,
            session.client_secret,
          );
          activeToken = refreshed.access_token;
          await this.ctx.storage.put("gmail_session", {
            ...session,
            access_token: activeToken,
          });
        }
      } catch {
        // Continue with existing token; errors will surface in tool calls
      }

      // Create typed Gmail tools and wrap them with codemode
      const gmailTools = createGmailTools(activeToken);
      const executor = new DynamicWorkerExecutor({
        loader: this.env.LOADER,
      });
      const codemode = createCodeTool({
        tools: gmailTools,
        executor,
      });
      tools.codemode = codemode;
    } else {
      system =
        "You are a helpful assistant. The user has not connected their Gmail account yet. Politely tell them to log out and reconnect with Google to use Gmail features. You can still have a general conversation.";
    }

    const modelMessages = await convertToModelMessages(this.messages);
    const result = streamText({
      model: workersai(MODEL as Parameters<typeof workersai>[0]),
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10),
      onFinish: onFinish as unknown as StreamTextOnFinishCallback<ToolSet>,
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }
}
