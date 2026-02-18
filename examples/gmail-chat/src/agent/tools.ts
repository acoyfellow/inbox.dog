import { z } from "zod";

export const runGmailScriptParams = z.object({
  code: z.string().describe("JavaScript to execute against Gmail API"),
  intent: z.string().describe("What this script does, in plain English"),
});

export type RunGmailScriptParams = z.infer<typeof runGmailScriptParams>;
