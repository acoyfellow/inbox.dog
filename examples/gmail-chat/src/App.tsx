import { useCallback, useSyncExternalStore } from "react";
import Landing from "./pages/Landing";
import ChatPage from "./pages/ChatPage";

type Auth = { status: "ok"; userId: string } | { status: "unauthenticated" };

function getPath() {
  return window.location.pathname;
}

function subscribePath(auth: Auth, cb: () => void) {
  const onPop = () => {
    if (auth.status === "ok" && window.location.pathname === "/") {
      window.history.replaceState(null, "", "/chat");
    }
    cb();
  };
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}

export default function App({
  initialAuth,
  initialPath,
  authUrl: initialAuthUrl,
  authUrlError: initialAuthUrlError,
  error: initialError,
}: {
  initialAuth: Auth;
  initialPath: string;
  authUrl: string | null;
  authUrlError: string | null;
  error: string | null;
}) {
  const subscribe = useCallback((cb: () => void) => subscribePath(initialAuth, cb), [initialAuth]);
  const path = useSyncExternalStore(subscribe, getPath, () => initialPath);

  if (path === "/chat" && initialAuth.status === "ok") {
    return <ChatPage userId={initialAuth.userId} />;
  }
  return (
    <Landing
      authUrl={initialAuthUrl}
      authUrlError={initialAuthUrlError}
      error={initialError}
    />
  );
}
