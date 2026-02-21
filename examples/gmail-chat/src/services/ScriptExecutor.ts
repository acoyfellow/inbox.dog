import { Context, Effect } from "effect";
import type { GmailScriptArgs } from "../domain/script";
import type {
  ScriptExecutionError,
  ScriptTimeoutError,
  GmailApiError,
} from "../domain/errors";

export interface ScriptExecutorService {
  readonly execute: (
    args: GmailScriptArgs
  ) => Effect.Effect<
    unknown,
    ScriptExecutionError | ScriptTimeoutError | GmailApiError
  >;
}

export const ScriptExecutor = Context.GenericTag<ScriptExecutorService>(
  "@inbox/ScriptExecutor"
);
