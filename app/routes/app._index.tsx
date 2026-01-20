// app/routes/app._index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAccessToken } from "../utils/session.server";
import { createSupabaseServerClient } from "../utils/supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const accessToken = await requireAccessToken(request);

  const { supabase } = createSupabaseServerClient({ accessToken });

  // Exemplo simples: confirma o usuário
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    // token inválido/expirado: derruba sessão no próximo passo (você pode limpar cookie aqui também)
    return redirect("/login");
  }

  return json({
    userEmail: data.user.email ?? null,
  });
}

export default function AppIndexRoute() {
  const { userEmail } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Catálogo (placeholder SSR)</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Próximo passo: listar mídias do Supabase, filtros por tags, busca e paginação.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {userEmail ? `Logado como ${userEmail}` : "Logado"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4">
            <div className="aspect-video rounded-lg bg-muted" />
            <div className="mt-3 h-4 w-2/3 rounded bg-muted" />
            <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
