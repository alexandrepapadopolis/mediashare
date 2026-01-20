// app/routes/signup.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { createSupabaseServerClient } from "../utils/supabase.server";
import { getUserId } from "../utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect("/app");
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const username = String(form.get("username") || "").trim();

  if (!email || !password) {
    return json({ ok: false, message: "Informe e-mail e senha." }, { status: 400 });
  }
  if (password.length < 6) {
    return json({ ok: false, message: "Senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const origin = new URL(request.url).origin;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/verify-email`,
      data: username ? { username } : undefined,
    },
  });

  if (error) {
    return json({ ok: false, message: "Não foi possível criar a conta." }, { status: 400 });
  }

  return redirect("/verify-email?status=sent");
}

export default function SignupRoute() {
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
            <div className="text-sm text-muted-foreground">Criar conta</div>
          </div>
        </div>

        {data?.message ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {data.message}
          </div>
        ) : null}

        <Form method="post" className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="username">Nome de usuário (opcional)</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="nickname"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="seunome"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">Email</label>
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
            <label className="text-sm font-medium" htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
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
            {busy ? "Criando..." : "Criar conta"}
          </button>
        </Form>

        <div className="mt-6 text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </div>
      </div>
    </main>
  );
}
