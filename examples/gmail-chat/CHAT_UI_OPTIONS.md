# Chat UI options for gmail-chat

Current state: vanilla JS, `generateText` (no streaming), AI SDK v4.

Backend change needed for streaming: switch to `streamText` and return `toDataStreamResponse()` instead of JSON.

---

## React (ecosystem fit)

### assistant-ui
- **Stars**: ~8.5k | YC-backed
- **What**: Composable primitives (Radix-style), shadcn theming. Streaming, auto-scroll, retries, attachments, markdown, code highlight, a11y, keyboard shortcuts.
- **AI SDK**: v4 (useDataStreamRuntime) and v5 (useChatRuntime)
- **Astro**: Add `@astrojs/react`, use as island. `npx assistant-ui init` for existing project.
- **Pros**: Battle-tested, hundreds in prod. Handles edge cases (interrupt, regeneration, branches).
- **Cons**: React dependency, Tailwind/shadcn stack.

### @llamaindex/chat-ui
- **Stars**: ~563
- **What**: Composable ChatSection, ChatMessages, ChatInput. useChat from @ai-sdk/react. shadcn-based.
- **Install**: `npx shadcn@latest add https://ui.llamaindex.ai/r/chat.json`
- **Pros**: Lighter than assistant-ui, clean composition. Markdown, code, latex.
- **Cons**: Smaller community, fewer docs.

### prompt-kit
- **What**: Drop-in chat components (message list, input, markdown, streaming UI) on React + shadcn + Tailwind.
- **Pros**: Pick individual pieces, less framework lock-in.
- **Cons**: Less cohesive than assistant-ui.

---

## Svelte (your stack preference)

### @ai-sdk/svelte
- **What**: Official Svelte binding. `Chat` class for streaming + state. Hooks layer only—no UI.
- **Pros**: No React, aligns with Svelte 5. Streaming protocol built-in.
- **Cons**: You build all UI. No equivalent to assistant-ui’s primitives.

### svelte-ai-chat
- **What**: Copy-paste Svelte 5 component, runes + AI SDK. Minimal.
- **Pros**: Svelte-native, small.
- **Cons**: Minimal polish, style everything yourself.

### HuggingFace chat-ui
- **What**: SvelteKit app that powers HuggingChat. MCP, tools, smart routing.
- **Pros**: Most production-proven Svelte chat codebase.
- **Cons**: Full app, not a library. Heavy to port into Astro.

---

## Cutting edge / protocol layer

### AG-UI + CopilotKit
- **What**: Event protocol for agent↔UI. CopilotKit = React client. Generative UI, human-in-the-loop, shared state.
- **Pros**: Future-looking. Agents can render React components, not just text.
- **Cons**: Overkill for simple chat. Heavier integration. For inbox.dog later if agents need to surface interactive widgets (triage cards, actions).

### A2UI (Google)
- **What**: Agent returns JSONL UI descriptors; client maps to native widgets. Security-first, declarative.
- **Status**: Early. CopilotKit is a launch partner.
- **Relevance**: Longer-term if we want agents to generate structured UI.

---

## Recommendation

| Path | Effort | Polish | Fits stack |
|------|--------|--------|------------|
| **assistant-ui** | Medium (React island, streamText) | High | Best UX |
| **@llamaindex/chat-ui** | Low–medium | Good | Lighter React option |
| **@ai-sdk/svelte + svelte-ai-chat** | Low | Basic | Svelte-native, DIY |

**Pragmatic pick**: **assistant-ui**. Biggest ecosystem, least time spent on streaming/scroll/a11y edge cases. Add React only to the chat page as an island.

**Svelte pick**: **@ai-sdk/svelte** + copy `svelte-ai-chat` or a minimal custom component. Aligns with Svelte 5; expect more manual UX work.

---

## Next steps (assistant-ui path)

1. `bun add @astrojs/react react react-dom`
2. Astro config: add `react()` integration
3. Chat API: `streamText` → `toDataStreamResponse()`
4. `npx assistant-ui init` in project (or add packages manually)
5. Replace chat.astro body with React island using assistant-ui primitives
