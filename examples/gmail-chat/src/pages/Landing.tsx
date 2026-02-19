const ERROR_MAP: Record<string, string> = {
  "OAuthState not found": "Your sign-in link expired. Please try again.",
  "INVALID_CREDENTIALS": "Invalid credentials. Check your inbox.dog client ID and secret.",
  "missing credentials": "Server credentials not configured.",
  "exchange failed": "Sign-in failed. Please try again.",
};

function friendlyError(raw: string): string {
  const decoded = decodeURIComponent(raw);
  for (const [key, msg] of Object.entries(ERROR_MAP)) {
    if (decoded.includes(key)) return msg;
  }
  return decoded;
}

export default function Landing({
  authUrl,
  authUrlError,
  error,
}: {
  authUrl: string | null;
  authUrlError: string | null;
  error: string | null;
}) {
  const rawError = error ?? authUrlError;
  const displayError = rawError ? friendlyError(rawError) : null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ fontFamily: "system-ui" }}
    >
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Gmail Chat
      </h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Chat with your inbox. ai + agents + inbox.dog
      </p>
      {displayError && (
        <p className="mt-4 text-red-600 dark:text-red-400" role="alert">
          {displayError}
        </p>
      )}
      {authUrl ? (
        <a
          href={authUrl}
          className="mt-4 inline-block rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Connect with Google
        </a>
      ) : (
        !rawError && (
          <p className="mt-4 text-neutral-500">Loading...</p>
        )
      )}
      {!authUrl && displayError?.includes("credentials") && (
        <p className="mt-2 text-sm text-neutral-500">
          Add INBOX_DOG_CLIENT_ID and INBOX_DOG_CLIENT_SECRET in your Worker environment.
        </p>
      )}
    </div>
  );
}
