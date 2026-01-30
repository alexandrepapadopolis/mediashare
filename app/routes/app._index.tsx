// app/routes/app._index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "@remix-run/react";
import {
  destroySession,
  getSession,
  requireAccessToken,
} from "../utils/session.server";
import { getServerEnv } from "../utils/env.server";
import { createSupabaseServerClientWithAccessToken } from "../utils/supabase.server";
import {
  isInvalidAuthError,
  parseMediaQuery,
  queryMedia,
} from "../utils/media.server";

function normalizeThumbUrl(input: unknown, publicBaseNoSlash: string): string | null {
  if (!input || typeof input !== "string") return null;

  const raw = input.trim();
  if (!raw) return null;

  // Absoluto: reescreve host/protocol para o publicBase
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      const p = new URL(publicBaseNoSlash);
      u.protocol = p.protocol;
      u.host = p.host;
      return u.toString();
    } catch {
      return raw;
    }
  }

  // Relativo com / no início
  if (raw.startsWith("/")) {
    return `${publicBaseNoSlash}${raw}`;
  }

  // Relativo sem /: torna absoluto no publicBase
  return `${publicBaseNoSlash}/${raw}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const accessToken = await requireAccessToken(request);

  const supabase = createSupabaseServerClientWithAccessToken(accessToken);

  // Confirma o usuário no GoTrue usando o Bearer token
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
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

    // IMPORTANT: thumbs precisam ser acessíveis pelo BROWSER.
    // Portanto, sempre usar a base pública (SUPABASE_PUBLIC_URL).
    const env = getServerEnv();
    const publicBaseNoSlash = String(env.SUPABASE_PUBLIC_URL || env.SUPABASE_URL).replace(
      /\/+$/,
      ""
    );

    const items = Array.isArray((result as any).items) ? (result as any).items : [];
    const patchedItems = items.map((it: any) => {
      const fixedThumb = normalizeThumbUrl(it?.thumbnail_url, publicBaseNoSlash);
      return {
        ...it,
        thumbnail_url: fixedThumb,
      };
    });

    return json({
      userEmail: data.user.email ?? null,
      ...result,
      items: patchedItems,
    });
  } catch (err) {
    // Token pode expirar entre getUser() e query
    if (isInvalidAuthError(err)) {
      const session = await getSession(request.headers.get("Cookie"));
      return redirect("/login", {
        headers: { "Set-Cookie": await destroySession(session) },
      });
    }

    throw err;
  }
}

export default function AppIndexRoute() {
  const { userEmail, appliedFilters, items, total, hasNext, hasPrev, pageCount } =
    useLoaderData<typeof loader>();

  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  // PR3: preserva a URL de origem (path + query) para o botão "Voltar" no detalhe
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;

  function buildPageHref(nextPage: number) {
    const params = new URLSearchParams();

    if (appliedFilters.q) params.set("q", appliedFilters.q);
    if (appliedFilters.tags.length > 0)
      params.set("tags", appliedFilters.tags.join(","));

    params.set("page", String(nextPage));
    params.set("pageSize", String(appliedFilters.pageSize));

    return `/app?${params.toString()}`;
  }

  function buildDetailHref(id: string) {
    const params = new URLSearchParams();
    params.set("from", from);
    return `/app/media/${id}?${params.toString()}`;
  }

  function formatDateTime(value: string) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  function MediaThumb({ src, alt }: { src: string; alt: string }) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
        className="h-full w-full rounded-lg object-cover"
      />
    );
  }

  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm">Carregando…</div>
      ) : null}
      <div className="rounded-2xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Catálogo (placeholder SSR)</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Próximo passo: listar mídias do Supabase, filtros por tags, busca e paginação.
        </p>

        <p className="mt-2 text-xs text-muted-foreground">
          {userEmail ? `Logado como ${userEmail}` : "Logado"}
        </p>

        {/* PR2 — filtros GET-based (URL como fonte da verdade) */}
        <Form method="get" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Busca</label>
              <input
                type="search"
                name="q"
                defaultValue={appliedFilters.q ?? ""}
                placeholder="Buscar por título…"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Tags (CSV)</label>
              <input
                name="tags"
                defaultValue={appliedFilters.tags.join(",")}
                placeholder="ex.: family,trip"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* page reset implícito: não enviar page */}
          <input type="hidden" name="pageSize" value={String(appliedFilters.pageSize)} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"
            >
              Aplicar
            </button>

            <a href="/app" className="rounded-xl border px-4 py-2 text-sm">
              Limpar
            </a>

            {appliedFilters.tags.length > 0 ? (
              <div className="ml-auto flex flex-wrap gap-2">
                {appliedFilters.tags.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-3 py-1 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Form>

        <div className="mt-4 rounded-xl bg-muted p-3">
          <div className="text-xs font-medium">State from loader (URL source of truth)</div>
          <pre className="mt-2 overflow-auto text-xs">
            {JSON.stringify(appliedFilters, null, 2)}
          </pre>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Total: {total}</span>
          <span>HasNext: {hasNext ? "yes" : "no"}</span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Link
            to={buildPageHref(appliedFilters.page - 1)}
            prefetch="intent"
            aria-disabled={!hasPrev}
            className={`rounded-xl border px-4 py-2 text-sm ${
              !hasPrev ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Anterior
          </Link>

          <div className="text-sm text-muted-foreground">
            Página {appliedFilters.page}
            {pageCount > 0 ? ` de ${pageCount}` : ""}
          </div>

          <Link
            to={buildPageHref(appliedFilters.page + 1)}
            prefetch="intent"
            aria-disabled={!hasNext}
            className={`ml-auto rounded-xl border px-4 py-2 text-sm ${
              !hasNext ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Próxima
          </Link>
        </div>
      </div>

      {/* Grid de resultados (indentação estável, sem ruído de diff) */}
      {!isLoading && items.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">
          Nenhum item encontrado para os filtros atuais.
        </div>
      ) : null}

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
              <Link
                key={it.id}
                to={buildDetailHref(it.id)}
                prefetch="intent"
                className="block rounded-2xl border bg-white p-4 hover:bg-muted/40"
                aria-label={`Abrir detalhes: ${it.title ?? "mídia"}`}
              >
                <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                  {it.thumbnail_url ? (
                    <MediaThumb src={it.thumbnail_url} alt={it.title ?? "Thumbnail"} />
                  ) : (
                    <div className="h-full w-full" />
                  )}
                </div>
                <div className="mt-3 text-sm font-medium">{it.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {it.media_type} • {formatDateTime(it.created_at)}
                </div>
              </Link>
            ))}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <h1 className="text-lg font-semibold">Erro</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.status} {error.statusText}
        </p>
      </div>
    );
  }

  const message = error instanceof Error ? error.message : "Erro inesperado";
  return (
    <div className="rounded-2xl border bg-white p-6">
      <h1 className="text-lg font-semibold">Erro</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
