// app/routes/app._index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { destroySession, getSession, requireAccessToken } from "../utils/session.server";
import { createSupabaseServerClientWithAccessToken } from "../utils/supabase.server";
import { isInvalidAuthError, parseMediaQuery, queryMedia } from "../utils/media.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const accessToken = await requireAccessToken(request);

  const supabase = createSupabaseServerClientWithAccessToken(accessToken);

  // Confirma o usuário no GoTrue usando o Bearer token
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    // Token inválido/expirado => destrói o cookie Remix para quebrar loop
    const session = await getSession(request.headers.get("Cookie"));
    return redirect("/login", {
      headers: { "Set-Cookie": await destroySession(session) },
    });
  }

  // PR1: loader SSR mínimo (querystring -> query -> JSON)
  const url = new URL(request.url);
  const input = parseMediaQuery(url);

  try {
    const result = await queryMedia({ supabase, input });
    return json({
      userEmail: data.user.email ?? null,
      ...result,
    });
  } catch (err) {
    // Se o token expirar entre o getUser() e a query, não queremos loop.
    if (isInvalidAuthError(err)) {
      const session = await getSession(request.headers.get("Cookie"));
      return redirect("/login", {
        headers: { "Set-Cookie": await destroySession(session) },
      });
    }

    // PR3: estados de erro na UI. Por ora, propagamos.
    throw err;
  }
}

export default function AppIndexRoute() {
  const { userEmail, appliedFilters, items, total, hasNext } = useLoaderData<typeof loader>();

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

        <div className="mt-4 rounded-xl bg-muted p-3">
          <div className="text-xs font-medium">Applied filters (URL as source of truth)</div>
          <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(appliedFilters, null, 2)}</pre>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Total: {total}</span>
          <span>HasNext: {hasNext ? "yes" : "no"}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {items.length === 0
          ? Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-2xl border bg-white p-4">
                <div className="aspect-video rounded-lg bg-muted" />
                <div className="mt-3 h-4 w-2/3 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
              </div>
            ))
          : items.map((it) => (
              <div key={it.id} className="rounded-2xl border bg-white p-4">
                <div className="aspect-video rounded-lg bg-muted" />
                <div className="mt-3 text-sm font-medium">{it.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {it.media_type} • {new Date(it.created_at).toLocaleString()}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
