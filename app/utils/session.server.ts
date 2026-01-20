// app/utils/session.server.ts
import { createCookieSessionStorage, redirect } from "@remix-run/node";

const SESSION_COOKIE_NAME = "__phosio_session";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const sessionSecret = mustEnv("SESSION_SECRET");

// Em dev (http://localhost), secure deve ser false, senão o browser ignora o cookie.
const isProd = process.env.NODE_ENV === "production";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: isProd,
  },
});

export async function getSession(cookieHeader: string | null) {
  return sessionStorage.getSession(cookieHeader);
}

export async function commitSession(
  session: Awaited<ReturnType<typeof getSession>>,
  opts?: { remember?: boolean }
) {
  return sessionStorage.commitSession(session, {
    maxAge: opts?.remember ? 60 * 60 * 24 * 30 : undefined, // 30 dias se "remember"
  });
}

export async function destroySession(session: Awaited<ReturnType<typeof getSession>>) {
  return sessionStorage.destroySession(session);
}

export async function getAccessToken(request: Request): Promise<string | null> {
  const session = await getSession(request.headers.get("Cookie"));
  return session.get("accessToken") ?? null;
}

export async function requireAccessToken(request: Request): Promise<string> {
  const token = await getAccessToken(request);
  if (!token) throw redirect("/login");
  return token;
}

export async function getUserId(request: Request): Promise<string | null> {
  const session = await getSession(request.headers.get("Cookie"));
  return session.get("userId") ?? null;
}

/**
 * Cria sessão (cookie do Remix) a partir dos tokens do Supabase.
 * Supabase é apenas IdP; o estado de login da aplicação é o cookie do Remix.
 */
export async function createAuthSession(args: {
  request: Request;
  accessToken: string;
  refreshToken?: string | null;
  userId: string;
  remember?: boolean;
  redirectTo?: string;
}) {
  const { request, accessToken, refreshToken, userId, remember, redirectTo = "/app" } = args;

  const session = await getSession(request.headers.get("Cookie"));
  session.set("accessToken", accessToken);
  session.set("refreshToken", refreshToken ?? null);
  session.set("userId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session, { remember }),
    },
  });
}
