// app/utils/session.server.ts
import { createCookieSessionStorage } from "@remix-run/node";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__phosio_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

export type AuthSessionData = {
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
};

export async function getAuthSession(request: Request) {
  return getSession(request.headers.get("Cookie"));
}

export async function getAccessToken(request: Request): Promise<string | null> {
  const session = await getAuthSession(request);
  const token = session.get("accessToken");
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function getUserId(request: Request): Promise<string | null> {
  const session = await getAuthSession(request);
  const userId = session.get("userId");
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

export async function requireAccessToken(request: Request): Promise<string> {
  const token = await getAccessToken(request);
  if (!token) throw new Response("Unauthorized", { status: 401 });
  return token;
}

export async function createAuthSession(args: {
  request: Request;
  accessToken: string;
  refreshToken?: string;
  userId?: string;
  redirectTo: string;
}) {
  const session = await getAuthSession(args.request);

  session.set("accessToken", args.accessToken);
  if (args.refreshToken) session.set("refreshToken", args.refreshToken);
  if (args.userId) session.set("userId", args.userId);

  return new Response(null, {
    status: 302,
    headers: {
      Location: args.redirectTo,
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function logout(request: Request) {
  const session = await getAuthSession(request);
  return destroySession(session);
}
