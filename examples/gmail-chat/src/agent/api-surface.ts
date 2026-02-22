/**
 * Compact API surface for the agent. Not stuffed into context as prose—
 * this is the "door" the agent can open when it needs to use Gmail.
 * Keep it minimal: types/shape only, no instructions.
 */
export const GMAIL_API_SURFACE = `
Gmail API (base: /gmail/v1/users/me). In codemode you have:

  gmail_get({ path: string }): GET. path is relative, e.g. "/profile", "/messages?q=is:unread&maxResults=5"
  gmail_post({ path: string, body: object }): POST. e.g. path "/messages/send"

List: GET /messages?q=...&maxResults=N  →  { messages: [{ id, threadId }], resultSizeEstimate, nextPageToken }
  (resultSizeEstimate = total match count; for count-only use maxResults=1 and return resultSizeEstimate)
One:  GET /messages/{id}               →  message with payload.headers, snippet, and payload.parts
  (Email body "data" fields are automatically decoded to plain text/HTML for you)
Meta: GET /profile                     →  { emailAddress, messagesTotal, threadsTotal }
`;
