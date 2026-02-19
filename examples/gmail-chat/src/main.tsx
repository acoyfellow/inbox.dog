import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./App";

type Auth = { status: "ok"; userId: string } | { status: "unauthenticated" };

async function bootstrap() {
  const [authRes, authUrlRes] = await Promise.all([
    fetch("/api/me", { cache: "no-store" }),
    fetch("/api/auth-url"),
  ]);

  const meData = authRes.ok ? (await authRes.json()) as { userId?: string } : null;
  const auth: Auth =
    meData?.userId ? { status: "ok", userId: meData.userId } : { status: "unauthenticated" };

  let authUrl: string | null = null;
  let authUrlError: string | null = null;
  try {
    const authUrlData = (await authUrlRes.json()) as { authUrl?: string; error?: string };
    authUrl = authUrlData.authUrl ?? null;
    authUrlError = authUrlData.error ?? null;
  } catch {
    authUrlError = "Failed to load";
  }

  let path = window.location.pathname;
  if (auth.status === "ok" && path === "/") {
    window.history.replaceState(null, "", "/chat");
    path = "/chat";
  } else if (auth.status === "unauthenticated" && path === "/chat") {
    window.history.replaceState(null, "", "/");
    path = "/";
  }

  const error = new URLSearchParams(window.location.search).get("error");

  return { auth, path, authUrl, authUrlError, error };
}

const rootEl = document.getElementById("root")!;
rootEl.innerHTML = "<div class='flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100'>Loading...</div>";

bootstrap().then(({ auth, path, authUrl, authUrlError, error }) => {
  createRoot(rootEl).render(
    <App initialAuth={auth} initialPath={path} authUrl={authUrl} authUrlError={authUrlError} error={error} />
  );
});
