// app/routes/login.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { createSupabaseServerClient } from "../utils/supabase.server";
import { createAuthSession, getAccessToken } from "../utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await getAccessToken(request);
  if (token) return redirect("/app");
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  if (!email || !password) {
    return json({ ok: false, message: "Informe e-mail e senha." }, { status: 400 });
  }

  // sem token aqui
  const { supabase } = createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session?.access_token) {
    return json({ ok: false, message: "Credenciais inválidas." }, { status: 401 });
  }

  const accessToken = data.session.access_token;
  const refreshToken = data.session.refresh_token;
  const userId = data.user?.id;

  return createAuthSession({
    request,
    accessToken,
    refreshToken: refreshToken ?? undefined,
    userId: userId ?? undefined,
    redirectTo: "/app",
  });
}

export default function LoginRoute() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <main className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
            P
          </div>
          <div>
            <div className="text-lg font-semibold">Phosio</div>
            <div className="text-sm text-muted-foreground">Entrar</div>
          </div>
        </div>

        {data?.message ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {data.message}
          </div>
        ) : null}

        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </Form>

        <div className="mt-6 text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
            Criar conta
          </Link>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Precisa verificar e-mail?{" "}
          <Link to="/verify-email" className="underline underline-offset-4">
            Ver instruções
          </Link>
        </div>
      </div>
    </main>
  );
}
