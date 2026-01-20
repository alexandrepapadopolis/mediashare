// app/routes/verify-email.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return json({ status: url.searchParams.get("status") });
}

export default function VerifyEmailRoute() {
  const { status } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen grid place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Verifique seu e-mail</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          {status === "sent"
            ? "Enviamos um link de confirmação para o seu e-mail. Abra a mensagem e conclua a ativação."
            : "Se você acabou de criar sua conta, procure o e-mail de confirmação para ativar o acesso."}
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Ir para Login
          </Link>
          <Link
            to="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
          >
            Voltar à landing
          </Link>
        </div>
      </div>
    </main>
  );
}
