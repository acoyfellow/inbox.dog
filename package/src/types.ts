// ── OAuth types (extracted from index.ts) ─────────────────────────────────

export type Scope = "email" | "email:read" | "email:send" | "email:full";

export interface CreateKeyResponse {
  client_id: string;
  client_secret: string;
  name: string;
  credits: number;
}

export interface KeyInfo {
  client_id: string;
  name: string;
  credits: number;
  created_at: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  email: string;
}

export interface RefreshResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface CheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface DeviceCodeResponse {
  auth_url: string;
  redirect_uri: string;
  expires_in: number;
}

export interface InboxDogErrorDetail {
  code: string;
  message: string;
  action?: string;
  docs?: string;
}

// ── Gmail types ───────────────────────────────────────────────────────────

export interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  /** inbox.dog client credentials for auto-refresh */
  client_id?: string;
  client_secret?: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  labelIds: string[];
}

export interface EmailListResult {
  messages: EmailSummary[];
  total: number;
  nextPageToken?: string;
}

export interface SendOptions {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  threadId?: string;
}

export interface SendResult {
  id: string;
  threadId: string;
}

export interface Label {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface AttachmentData extends Attachment {
  data: Uint8Array;
}

export interface DraftOptions {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  threadId?: string;
}

export interface Draft {
  id: string;
  message: EmailSummary;
}

export interface BatchModifyOptions {
  ids: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

// ── Internal Gmail API types ──────────────────────────────────────────────

/** @internal */
export interface GmailHeader {
  name: string;
  value: string;
}

/** @internal */
export interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
  filename?: string;
}

/** @internal */
export interface GmailRawMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
  internalDate?: string;
}

/** @internal */
export interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  resultSizeEstimate?: number;
  nextPageToken?: string;
}

/** @internal */
export interface GmailDraftResponse {
  id: string;
  message: GmailRawMessage;
}

/** @internal */
export interface GmailDraftListResponse {
  drafts?: GmailDraftResponse[];
}

/** @internal */
export interface GmailLabelResponse {
  labels?: Array<{
    id: string;
    name: string;
    type: string;
    messagesTotal?: number;
    messagesUnread?: number;
  }>;
}
