// app/utils/auth.server.ts
import { redirect, json } from "@remix-run/node";
import { createSupabaseServerClient } from "./supabase.server";
import { clearSupabaseTokens, getSupabaseTokens, setSupabaseTokens } from "./session.server";
import { getEnv } from "./env.server";

// Login email/senha (server action)
export async function signInWithPassword(request: Request, email: string, password: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return json(
      { ok: false, message: error?.message ?? "Login failed" },
      { status: 400 }
    );
  }

  const { setCookie } = await setSupabaseTokens(request, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  return redirect("/app", { headers: { "Set-Cookie": setCookie } });
}

// Signup email/senha + redirect de confirmação
export async function signUpWithEmail(request: Request, email: string, password: string, username?: string) {
  const env = getEnv();
  const supabase = createSupabaseServerClient();

  const emailRedirectTo = `${env.APP_ORIGIN ?? new URL(request.url).origin}/verify-email`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: username ? { username } : undefined,
    },
  });

  if (error) {
    return json({ ok: false, message: error.message }, { status: 400 });
  }

  // Em muitos setups, signUp não retorna session até confirmação (depende da config).
  // Portanto, redirecione para /verify-email instruindo o usuário.
  return redirect("/verify-email");
}

// Logout (server action)
export async function signOut(request: Request) {
  // Não depende de chamar supabase.auth.signOut porque estamos guardando tokens no cookie.
  const { setCookie } = await clearSupabaseTokens(request);
  return redirect("/", { headers: { "Set-Cookie": setCookie } });
}

// Valida sessão do usuário via Supabase usando access token
export async function getUserFromRequest(request: Request) {
  const { accessToken } = await getSupabaseTokens(request);
  if (!accessToken) return null;

  const supabase = createSupabaseServerClient({ accessToken });

  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
