# Gmail-Chat Improvements

## TL;DR

> **Quick Summary**: Upgrade AI SDK packages to v6, re-architect session handling to eliminate in-memory Map, and improve error UX with both agent-side interpretation and UI error cards.
>
> **Deliverables**:
> - Upgraded `ai` (v6), `@ai-sdk/react` (v3), `agents` (v0.5+) packages
> - Refactored `GmailChat.tsx` using `useAgentChat` with tool invocation rendering
> - Session handling via service binding props (no in-memory Map)
> - ErrorCard component + improved system prompt
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 0 → Task 2 → Task 4

---

## Context

### Original Request
Improve `examples/gmail-chat` with 3 items before conversation persistence:
1. Harden in-memory sessions (theoretical DO hibernation concern)
2. Switch from manual WebSocket parsing to `useAgentChat` for proper tool rendering
3. Improve error UX with both agent-side interpretation and UI error cards

### Interview Summary
**Key Discussions**:
- Item 1: User chose **full re-architect** — pass tokens via service binding props instead of in-memory Map
- Item 2: User chose **Option A: Full Upgrade** — upgrade ai→v6, @ai-sdk/react→v3, agents→v0.5
- Item 3: User chose **both** agent-side + UI-side error improvements

**Research Findings**:
- `@cloudflare/ai-chat` v0.1.2 requires `ai` ^6.0.0, `@ai-sdk/react` ^3.0.0, `agents` ^0.5.0
- Current versions are 2 major versions behind (ai 4.3.19, @ai-sdk/react 1.2.12, agents 0.0.113)
- `useAgentChat` wraps `useChat` with WebSocket transport to `AIChatAgent`
- AI SDK v6 uses `UIMessage[]` with parts array (not `Message[]` with string content)

### Metis Review
**Identified Gaps** (addressed):
- Package version incompatibility: Addressed by committing to full upgrade
- Session Map analysis: Addressed by re-architecting to pass tokens via props
- Tool state changes: v6 uses `input-streaming | input-available | output-available | output-error` (not `partial-call | call | result`)

---

## Work Objectives

### Core Objective
Upgrade the gmail-chat example to modern AI SDK v6 with proper tool invocation rendering, eliminate the fragile in-memory session Map, and improve error UX.

### Concrete Deliverables
- Updated `package.json` with `ai@^6.0.0`, `@ai-sdk/react@^3.0.0`, `agents@^0.5.0`
- Refactored `InboxAgent.ts` importing from `@cloudflare/ai-chat`
- Refactored `GmailChat.tsx` using `useAgentChat`
- Refactored `GmailBridge.ts` receiving tokens via props (no Map)
- New `ErrorCard.tsx` component
- Updated `system-prompt.ts` with error interpretation guidance

### Definition of Done
- [ ] `npx tsc --noEmit` exits 0 (zero type errors)
- [ ] `npx vitest run` exits 0 (all tests pass)
- [ ] `npx vite build` exits 0 (clean production build)

### Must Have
- AI SDK v6 with `useAgentChat` working
- Tool invocations render visually (not just text)
- Session handling without in-memory Map
- Error cards for structured error display

### Must NOT Have (Guardrails)
- Do NOT add message persistence UI (that's the next work item)
- Do NOT change the sandbox architecture (Worker Loader + GmailBridge)
- Do NOT change the Effect error types in `domain/errors.ts`
- Do NOT change tool definitions in `tools.ts`
- Do NOT add error retry buttons
- Do NOT add loading skeletons

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: TDD (RED-GREEN-REFACTOR)
- **Framework**: Vitest

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Vitest component tests
- **Backend**: Use Vitest unit tests
- **Type safety**: Use `tsc --noEmit`
- **Build**: Use `vite build`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent work):
├── Task 0: Upgrade AI SDK packages [deep]
├── Task 1: Re-architect session handling [unspecified-high]
└── Task 3: Error UX — prompt + ErrorCard [unspecified-low]

Wave 2 (After Wave 1 — depends on Task 0):
└── Task 2: Rewrite GmailChat with useAgentChat + tool rendering [deep]

Wave 3 (After Wave 2 — final verification):
└── Task 4: Final integration verification [quick]

Critical Path: Task 0 → Task 2 → Task 4
Parallel Speedup: Tasks 0, 1, 3 can run simultaneously
Max Concurrent: 3
```

### Dependency Matrix

- **0**: — — 2
- **1**: — — None
- **3**: — — None
- **2**: 0 — 4
- **4**: 0, 1, 2, 3 — —

### Agent Dispatch Summary

- **Wave 1**: 3 parallel — T0 → `deep`, T1 → `unspecified-high`, T3 → `unspecified-low`
- **Wave 2**: 1 — T2 → `deep`
- **Wave 3**: 1 — T4 → `quick`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task has: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [ ] 0. **Upgrade AI SDK + agents packages**

  **What to do**:
  - Update `package.json`: `ai` → `^6.0.0`, `@ai-sdk/react` → `^3.0.0`, `agents` → `^0.5.0`
  - Run `bun install` to update lockfile
  - Fix `InboxAgent.ts`: Import `AIChatAgent` from `@cloudflare/ai-chat` (not `agents/ai-chat-agent`)
  - Change `result.toDataStreamResponse()` → `result.toUIMessageStreamResponse()`
  - Update `this.messages` usage: v6 uses `UIMessage[]` with parts array, use `convertToModelMessages(this.messages)` for `streamText`
  - Fix all resulting type errors
  - Verify: `tsc --noEmit`, `vitest run`, `vite build` all pass

  **Must NOT do**:
  - Do NOT change tool definitions or Effect error pipeline
  - Do NOT touch `ScriptExecutorLive.ts`, `GmailBridge.ts`, or `domain/` files

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex multi-package upgrade with cascading breaking changes across client and server
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser verification needed for package upgrade
    - `git-master`: No git operations in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `examples/gmail-chat/src/agent/InboxAgent.ts:1-107` — Agent class to update
  - `examples/gmail-chat/package.json:13-24` — Dependencies to upgrade
  - `node_modules/@cloudflare/ai-chat/dist/index.d.ts` — New AIChatAgent interface

  **Acceptance Criteria**:
  - [ ] `package.json` shows `ai: ^6.0.0`, `@ai-sdk/react: ^3.0.0`, `agents: ^0.5.0`
  - [ ] `tsc --noEmit` exits 0
  - [ ] `vitest run` exits 0 (all existing tests pass)
  - [ ] `vite build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Type check passes after upgrade
    Tool: Bash
    Steps:
      1. cd examples/gmail-chat && npx tsc --noEmit
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-0-tsc-pass.log

  Scenario: Tests pass after upgrade
    Tool: Bash
    Steps:
      1. cd examples/gmail-chat && npx vitest run
    Expected Result: Exit code 0, all tests pass
    Evidence: .sisyphus/evidence/task-0-tests-pass.log
  ```

  **Commit**: YES
  - Message: `upgrade(deps): ai sdk v6, agents v0.5 for useAgentChat support`
  - Files: `package.json`, `bun.lock`, `src/agent/InboxAgent.ts`

---

- [ ] 1. **Re-architect session handling — eliminate in-memory Map**

  **What to do**:
  - Remove `sessions` Map and `registerGmail`/`unregisterGmail` functions from `GmailBridge.ts`
  - Update `ScriptExecutorLive.ts`: Pass tokens directly via `GmailBridge` props
  - Update `GmailBridge.ts` `call()` method: Create Gmail instance from props on each call
  - Props interface: `{ sessionId, access_token, refresh_token, client_id, client_secret }`
  - Write unit tests for new session handling

  **Must NOT do**:
  - Do NOT change how tokens are stored in DO storage (`this.ctx.storage.put`)
  - Do NOT change the Worker Loader sandbox architecture

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Significant refactor of session flow
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Backend-only change
    - `frontend-*`: No UI changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 0, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `examples/gmail-chat/src/services/GmailBridge.ts:1-47` — Current Map-based session handling
  - `examples/gmail-chat/src/services/ScriptExecutor.live.ts:36-96` — Where props are passed to GmailBridge

  **Acceptance Criteria**:
  - [ ] `sessions` Map removed from `GmailBridge.ts`
  - [ ] `registerGmail`/`unregisterGmail` functions removed
  - [ ] `GmailBridge.call()` creates Gmail from props
  - [ ] Unit test verifies session-less flow works
  - [ ] `tsc --noEmit` exits 0
  - [ ] `vitest run` exits 0

  **QA Scenarios**:
  ```
  Scenario: No in-memory Map in GmailBridge
    Tool: Bash
    Steps:
      1. grep -r "sessions = new Map" examples/gmail-chat/src/services/GmailBridge.ts
    Expected Result: Exit code 1 (no matches)
    Evidence: .sisyphus/evidence/task-1-no-map.log

  Scenario: Unit test for session handling
    Tool: Bash
    Steps:
      1. cd examples/gmail-chat && npx vitest run src/services/GmailBridge.test.ts
    Expected Result: Exit code 0, tests pass
    Evidence: .sisyphus/evidence/task-1-tests-pass.log
  ```

  **Commit**: YES
  - Message: `refactor(sessions): pass tokens via service binding props instead of in-memory map`
  - Files: `src/services/GmailBridge.ts`, `src/services/ScriptExecutor.live.ts`

---

- [ ] 2. **Rewrite GmailChat with useAgentChat + tool rendering**

  **What to do**:
  - Replace manual WebSocket parsing in `GmailChat.tsx` with `useAgentChat` from `@cloudflare/ai-chat/react`
  - Remove `assistantTextRef`, `onMessage` handler, `msgCounter`, regex parsing
  - Update `MessageList` to iterate `msg.parts` instead of `msg.content`
  - Render `TextUIPart` as text, `ToolInvocationUIPart` via `ToolInvocation` component
  - Update `ToolInvocation.tsx` props for v6 tool states: `input-streaming`, `input-available`, `output-available`, `output-error`
  - Map old states (`partial-call`, `call`, `result`) to new states for backward compatibility
  - Update `ChatInput` integration: adapt `sendMessage` to form submit pattern
  - Write unit tests for ToolInvocation state mapping

  **Must NOT do**:
  - Do NOT redesign ChatInput component
  - Do NOT add message persistence UI

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex refactor touching message rendering, WebSocket transport, tool state machine
  - **Skills**: [`frontend-ui-ux`] — Parts-based message rendering needs good visual composition
  - **Skills Evaluated but Omitted**:
    - `playwright`: Unit tests preferred for this scope
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 0)
  - **Blocks**: Task 4
  - **Blocked By**: Task 0 (package upgrade)

  **References**:
  - `examples/gmail-chat/src/components/GmailChat.tsx:1-160` — Current manual WebSocket handling
  - `examples/gmail-chat/src/components/ToolInvocation.tsx:1-46` — Component to update
  - `examples/gmail-chat/src/components/ResultCards.tsx:1-42` — Already handles results
  - `node_modules/@cloudflare/ai-chat/dist/react.d.ts` — useAgentChat interface

  **Acceptance Criteria**:
  - [ ] `useAgentChat` imported from `@cloudflare/ai-chat/react`
  - [ ] No manual regex parsing (`0:"..."`) in GmailChat.tsx
  - [ ] Message rendering uses `msg.parts`
  - [ ] ToolInvocation renders for tool parts
  - [ ] ToolInvocation handles v6 states
  - [ ] `tsc --noEmit` exits 0
  - [ ] `vitest run` exits 0
  - [ ] `vite build` exits 0

  **QA Scenarios**:
  ```
  Scenario: useAgentChat is used
    Tool: Bash
    Steps:
      1. grep "useAgentChat" examples/gmail-chat/src/components/GmailChat.tsx
    Expected Result: Exit code 0 (found)
    Evidence: .sisyphus/evidence/task-2-use-agent-chat.log

  Scenario: Old parser removed
    Tool: Bash
    Steps:
      1. grep '0:"' examples/gmail-chat/src/components/GmailChat.tsx
    Expected Result: Exit code 1 (no matches)
    Evidence: .sisyphus/evidence/task-2-no-old-parser.log

  Scenario: Parts-based rendering
    Tool: Bash
    Steps:
      1. grep "\.parts" examples/gmail-chat/src/components/GmailChat.tsx
    Expected Result: Exit code 0 (found)
    Evidence: .sisyphus/evidence/task-2-parts-rendering.log
  ```

  **Commit**: YES
  - Message: `feat(chat): replace manual websocket with useAgentChat and wire tool rendering`
  - Files: `src/components/GmailChat.tsx`, `src/components/ToolInvocation.tsx`

---

- [ ] 3. **Improve error UX — system prompt + ErrorCard**

  **What to do**:
  - Update `system-prompt.ts`: Add per-error-type interpretation guidance
    - `GmailApiError`: Explain statusCode meaning (401=reconnect, 403=permissions, 404=not found, 429=rate limit)
    - `ScriptExecutionError`: Explain code error, suggest fix
    - `SessionExpiredError`: Tell user to reconnect
    - `ScriptTimeoutError`: Explain operation took too long, suggest simpler query
  - Create `ErrorCard.tsx` component: Accepts `{ _tag: string, [key]: unknown }`, renders styled error cards with icon, title, detail per error type
  - Wire `ErrorCard` into `ResultCards.tsx` or `ToolInvocation.tsx`: Detect `_tag: "Error"` and render ErrorCard
  - Write unit tests for ErrorCard rendering each error type

  **Must NOT do**:
  - Do NOT change Effect error types in `domain/errors.ts`
  - Do NOT add error retry buttons

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low` — Moderate effort: prompt update + component + wiring + tests
  - **Skills**: [`frontend-ui-ux`] — ErrorCard needs good visual design
  - **Skills Evaluated but Omitted**:
    - `playwright`: Unit tests suffice
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 0, 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `examples/gmail-chat/src/agent/system-prompt.ts:1-25` — Current system prompt
  - `examples/gmail-chat/src/domain/errors.ts:1-38` — Error types for interpretation
  - `examples/gmail-chat/src/components/ResultCards.tsx:1-42` — Where to wire ErrorCard

  **Acceptance Criteria**:
  - [ ] System prompt contains error interpretation for all 4 error types
  - [ ] `ErrorCard.tsx` created with `_tag` discrimination
  - [ ] ErrorCard renders inside ResultCards for error results
  - [ ] Unit tests for ErrorCard with each error type
  - [ ] `tsc --noEmit` exits 0
  - [ ] `vitest run` exits 0

  **QA Scenarios**:
  ```
  Scenario: System prompt has error guidance
    Tool: Bash
    Steps:
      1. grep "GmailApiError" examples/gmail-chat/src/agent/system-prompt.ts
      2. grep "ScriptExecutionError" examples/gmail-chat/src/agent/system-prompt.ts
      3. grep "SessionExpiredError" examples/gmail-chat/src/agent/system-prompt.ts
      4. grep "ScriptTimeoutError" examples/gmail-chat/src/agent/system-prompt.ts
    Expected Result: All exit 0 (found)
    Evidence: .sisyphus/evidence/task-3-error-guidance.log

  Scenario: ErrorCard exists and has _tag logic
    Tool: Bash
    Steps:
      1. grep "_tag" examples/gmail-chat/src/components/ErrorCard.tsx
    Expected Result: Exit code 0 (found)
    Evidence: .sisyphus/evidence/task-3-error-card.log
  ```

  **Commit**: YES
  - Message: `feat(errors): add error interpretation to system prompt and ErrorCard component`
  - Files: `src/agent/system-prompt.ts`, `src/components/ErrorCard.tsx`, `src/components/ResultCards.tsx`

---

- [ ] 4. **Final integration verification**

  **What to do**:
  - Run full QA suite: typecheck, tests, build
  - Verify no regressions
  - Check all components work together

  **Must NOT do**:
  - Do NOT make any code changes

  **Recommended Agent Profile**:
  - **Category**: `quick` — Simple verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after all tasks)
  - **Blocks**: None
  - **Blocked By**: Tasks 0, 1, 2, 3

  **References**:
  - `examples/gmail-chat/package.json` — Scripts for verification

  **Acceptance Criteria**:
  - [ ] `tsc --noEmit` exits 0
  - [ ] `vitest run` exits 0
  - [ ] `vite build` exits 0

  **QA Scenarios**:
  ```
  Scenario: Full verification passes
    Tool: Bash
    Steps:
      1. cd examples/gmail-chat && npx tsc --noEmit && npx vitest run && npx vite build
    Expected Result: Exit code 0, all pass
    Evidence: .sisyphus/evidence/task-4-full-verification.log
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify all "Must Have" present (ai v6, useAgentChat, no Map, ErrorCard). Verify all "Must NOT Have" absent (no persistence UI, no sandbox changes). Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [4/4] | Must NOT Have [5/5] | Tasks [5/5] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `vitest run` + `vite build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Type Safety Check** — `unspecified-high`
  Verify `ai` package is v6+, `@ai-sdk/react` is v3+, `agents` is v0.5+. Verify `useAgentChat` import works. Verify `UIMessage` type is used correctly. Check `InboxAgent` imports from `@cloudflare/ai-chat`.
  Output: `Versions [CORRECT/INCORRECT] | Imports [VALID/INVALID] | Types [MATCH/MISMATCH] | VERDICT`

- [ ] F4. **Session Architecture Check** — `deep`
  Verify `sessions` Map is removed from GmailBridge.ts. Verify tokens are passed via props. Verify Gmail instance is created per-call. Verify no `registerGmail`/`unregisterGmail` calls remain.
  Output: `Map [REMOVED/PRESENT] | Props [IMPLEMENTED/MISSING] | Cleanup [COMPLETE/INCOMPLETE] | VERDICT`

---

## Commit Strategy

- **Commit 1**: `upgrade(deps): ai sdk v6, agents v0.5 for useAgentChat support` — Task 0
- **Commit 2**: `refactor(sessions): pass tokens via service binding props instead of in-memory map` — Task 1
- **Commit 3**: `feat(errors): add error interpretation to system prompt and ErrorCard component` — Task 3
- **Commit 4**: `feat(chat): replace manual websocket with useAgentChat and wire tool rendering` — Task 2

---

## Success Criteria

### Verification Commands
```bash
cd examples/gmail-chat
npx tsc --noEmit  # Expected: Exit 0, no errors
npx vitest run    # Expected: All tests pass
npx vite build    # Expected: Clean build
```

### Final Checklist
- [ ] AI SDK v6 installed (`ai@^6.0.0` in package.json)
- [ ] `useAgentChat` used in GmailChat.tsx
- [ ] Tool invocations render visually
- [ ] No `sessions` Map in GmailBridge.ts
- [ ] ErrorCard component exists
- [ ] System prompt has error interpretation
- [ ] All tests pass
- [ ] Type check passes
- [ ] Production build succeeds

