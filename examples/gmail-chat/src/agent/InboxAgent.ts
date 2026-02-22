import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import type { StreamTextOnFinishCallback, ToolSet, UIMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { InboxDog } from "inbox.dog";
import { createGmailTools } from "./gmail-tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import { z } from "zod";

// https://github.com/cloudflare/agents/tree/main/examples/codemode
const MODEL = "@cf/zai-org/glm-4.7-flash";

function sanitizePayload(obj: unknown): unknown {
  if (typeof obj === "string") {
    // If it's a massive string, truncate it to save context window
    if (obj.length > 2000) {
      return obj.slice(0, 2000) + "\n... [TRUNCATED DUE TO SIZE: " + obj.length + " chars]";
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizePayload);
  }
  if (obj !== null && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    const newObj: Record<string, unknown> = {};
    for (const key of Object.keys(rec)) {
      if (key === "headers" && Array.isArray(rec[key])) {
        // Drop useless massive headers (ARC, DKIM, etc) to save thousands of tokens
        const keep = ["subject", "from", "to", "cc", "bcc", "date", "message-id", "in-reply-to", "references"];
        const filtered = (rec[key] as { name?: string }[]).filter((h) => h?.name && keep.includes(h.name.toLowerCase()));
        newObj[key] = sanitizePayload(filtered);
      } else if (key === "data" && typeof rec[key] === "string") {
        // Gmail API returns email body data as base64url. Decode it for the LLM.
        try {
          const base64 = (rec[key] as string).replace(/-/g, '+').replace(/_/g, '/');
          const binString = atob(base64);
          const bytes = new Uint8Array(binString.length);
          for (let i = 0; i < binString.length; i++) {
            bytes[i] = binString.charCodeAt(i);
          }
          let decoded = new TextDecoder().decode(bytes);
          if (decoded.length > 2000) {
            decoded = decoded.slice(0, 2000) + "\n... [TRUNCATED DUE TO SIZE: " + decoded.length + " chars]";
          }
          newObj[key] = decoded;
        } catch {
          newObj[key] = sanitizePayload(rec[key]);
        }
      } else {
        newObj[key] = sanitizePayload(rec[key]);
      }
    }
    return newObj;
  }
  return obj;
}

/** Strip trailing ); ) () and leading ( so executor's (CODE)() stays valid. */
function sanitizeCodemodeCode(code: string): string {
  let s = code.trim();
  s = s.replace(/\s*\);?\s*$/, "").trim();
  while (s.endsWith(")()")) s = s.slice(0, -3).trim();
  while (s.endsWith(")")) s = s.slice(0, -1).trim();
  if (s.startsWith("(") && s.endsWith(")")) {
    const inner = s.slice(1, -1).trim();
    if (inner.startsWith("async ") || inner.startsWith("function")) s = inner;
  }
  return s;
}

/** Detect likely truncated code (model output cut off) to avoid executor syntax errors. */
function looksTruncated(code: string): boolean {
  const s = code.trim();
  if (!s.length) return true;
  return !/[\s}]$/.test(s) || (s.includes("async") && !s.includes("}"));
}

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
      let activeToken = session.access_token;

      const testRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${activeToken}` } },
      );
      if (testRes.status === 401) {
        if (!session.refresh_token) {
          throw new Error("Gmail token expired and no refresh token available. Please reconnect.");
        }
        const dog = new InboxDog({ fetch: globalThis.fetch.bind(globalThis) });
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
      } else if (!testRes.ok) {
        throw new Error(`Gmail API returned ${testRes.status} during token validation`);
      }

      const gmailTools = createGmailTools(activeToken);
      const executor = new DynamicWorkerExecutor({ loader: this.env.LOADER });
      const codemodeInner = createCodeTool({ tools: gmailTools, executor });
      // Use strict object schema to avoid confusing the model
      tools.codemode = tool({
        description: (codemodeInner as { description?: string }).description,
        inputSchema: z.object({ code: z.string().describe("The JavaScript async arrow function to execute") }),
        execute: async ({ code }: { code: string }) => {
          console.log("[codemode] Input code received from model:\n", code);
          code = sanitizeCodemodeCode(code);
          console.log("[codemode] Code after sanitize:\n", code);
          
          if (looksTruncated(code)) {
            console.error("[codemode] Code rejected as truncated.");
            throw new Error("Code appears truncated (incomplete). Please output the full async arrow with no cut-off.");
          }
          
          const res = await (codemodeInner as unknown as { execute: (x: { code: string }) => Promise<unknown> }).execute({ code });
          const safeRes = sanitizePayload(res);
          console.log("[codemode] Execution result:\n", JSON.stringify(safeRes, null, 2));
          return safeRes;
        },
      });
    } else {
      system =
        "You are a helpful assistant. The user has not connected their Gmail account yet. Politely tell them to log out and reconnect with Google to use Gmail features. You can still have a general conversation.";
    }

    let modelMessages = await convertToModelMessages(this.messages);
    
    // Prevent 1031 context-window errors by limiting history length
    // We use a small history because tool outputs (and sometimes the JS code the model writes) can be large.
    const MAX_HISTORY = 6;
    if (modelMessages.length > MAX_HISTORY) {
      modelMessages = modelMessages.slice(-MAX_HISTORY);
      // Remove orphaned tool messages at the start of the window
      while (modelMessages.length > 0 && modelMessages[0].role === "tool") {
        modelMessages.shift();
      }
    }

    const persistError = async (e: unknown) => {
      const errorMessage = e instanceof Error ? e.message : String(e);
      await this.persistMessages([
        ...this.messages,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "",
          parts: [{ type: "text", text: `[SYSTEM_ERROR] ${errorMessage}` }]
        } as UIMessage
      ]);
    };

    try {
      const result = streamText({
        model: workersai(MODEL as Parameters<typeof workersai>[0]),
        system,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(3), // Limit retries to prevent bloating chat history on tool errors
        onFinish: onFinish as unknown as StreamTextOnFinishCallback<ToolSet>,
        onError: async ({ error }) => {
          console.error("AI SDK streamText onError callback:", error);
          await persistError(error);
        },
        abortSignal: options?.abortSignal,
      });

      const res = result.toUIMessageStreamResponse();
      if (!res.body) return res;
      // Avoid "Illegal invocation" in Workers: don't pass Response.body to framework;
      // re-wrap so getReader() is never detached from the original body.
      const reader = res.body.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel() {
          return reader.cancel();
        },
      });
      return new Response(stream, { headers: res.headers, status: res.status });
    } catch (error) {
      console.error("AI SDK streamText synchronous error:", error);
      await persistError(error);
      throw error;
    }
  }
}
