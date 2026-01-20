// app/routes/app.media.%24id.tsx

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";

/**
 * Ajuste o path abaixo para o arquivo real do seu projeto.
 * A premissa é que ele já exista e seja usado nas outras rotas protegidas.
 */
import { getSession, destroySession } from "../utils/session.server";

type MediaDetail = {
  id: string;
  title: string | null;
  media_type: string | null;
  created_at: string | null;
  tags: unknown;
};

/**
 * IMPORTANTE:
 * Use exatamente a mesma tabela/view usada no P07.
 * Se no P07 você usa uma view (ex.: media_with_tags),
 * ajuste aqui para manter consistência.
 */
const MEDIA_RESOURCE = "media";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getAccessToken(session: any): string | null {
  return (
    session.get?.("access_token") ||
    session.get?.("accessToken") ||
    session.get?.("sb-access-token") ||
    null
  );
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function fetchMediaById(args: {
  id: string;
  accessToken: string;
}): Promise<MediaDetail | null> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");

  const url = new URL(`${supabaseUrl}/rest/v1/${MEDIA_RESOURCE}`);
  url.searchParams.set("id", `eq.${args.id}`);
  url.searchParams.set(
    "select",
    "id,title,media_type,created_at,tags"
  );
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/json",
    },
  });

  if (response.status === 401 || response.status === 403) {
    const err = new Error("AUTH_INVALID");
    (err as any).code = "AUTH_INVALID";
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PostgREST error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as MediaDetail[];
  return data[0] ?? null;
}

/* ===========================
 * Loader SSR (rota protegida)
 * =========================== */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = params.id;

  if (!id || !isValidUuid(id)) {
    throw new Response("Invalid id", { status: 400 });
  }

  const cookieHeader = request.headers.get("Cookie");
  const session = await getSession(cookieHeader);
  const accessToken = getAccessToken(session);

  if (!accessToken) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }

  try {
    const media = await fetchMediaById({ id, accessToken });

    if (!media) {
      throw new Response("Not Found", { status: 404 });
    }

    return json({ media });
  } catch (error: any) {
    if (error?.code === "AUTH_INVALID") {
      return redirect("/login", {
        headers: {
          "Set-Cookie": await destroySession(session),
        },
      });
    }
    throw error;
  }
}

/* ===========================
 * UI
 * =========================== */
export default function MediaDetailRoute() {
  const { media } = useLoaderData<typeof loader>();

  const tagsText = Array.isArray(media.tags)
    ? media.tags.filter(Boolean).join(", ")
    : typeof media.tags === "string"
    ? media.tags
    : "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4">
        <Link
          to="/app"
          className="text-sm text-blue-600 hover:underline"
        >
          Voltar
        </Link>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <h1 className="text-xl font-semibold">
          {media.title ?? "(sem título)"}
        </h1>

        <div className="mt-4 grid gap-2 text-sm">
          <div>
            <strong>Tipo:</strong> {media.media_type ?? "—"}
          </div>
          <div>
            <strong>Criado em:</strong> {media.created_at ?? "—"}
          </div>
          <div>
            <strong>Tags:</strong> {tagsText || "—"}
          </div>
          <div>
            <strong>ID:</strong> {media.id}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-medium">Preview</div>
          <div className="flex h-64 items-center justify-center rounded-md border bg-gray-50 text-sm text-gray-600">
            Placeholder de preview (imagem ou vídeo)
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
 * ErrorBoundary
 * =========================== */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold">
            Mídia não encontrada
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            O item solicitado não existe ou você não tem acesso.
          </p>
          <div className="mt-4">
            <Link
              to="/app"
              className="text-sm text-blue-600 hover:underline"
            >
              Voltar para a lista
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Erro</h1>
        <p className="mt-2 text-sm text-gray-700">
          {error.status} {error.statusText}
        </p>
        <Link
          to="/app"
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Erro inesperado</h1>
      <p className="mt-2 text-sm text-gray-700">
        {(error as Error)?.message ??
          "Falha ao carregar o detalhe da mídia."}
      </p>
      <Link
        to="/app"
        className="mt-4 inline-block text-sm text-blue-600 hover:underline"
      >
        Voltar
      </Link>
    </div>
  );
}
