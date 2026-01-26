// app/routes/app.media.$id.tsx

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useRouteError,
  useSearchParams,
} from "@remix-run/react";

import { getServerEnv } from "../utils/env.server";
import { getSession, destroySession } from "../utils/session.server";

type MediaDetail = {
  id: string;
  title: string | null;
  description: string | null;
  media_type: string | null;
  created_at: string | null;
  tags: unknown;

  // P13-2 armazena múltiplos arquivos em metadata.files[]
  metadata: unknown;

  // Campos relevantes para Storage (P13-2 já preenche)
  storage_bucket: string | null;
  storage_object_path: string | null;

  mime_type: string | null;
  original_filename: string | null;
  size_bytes: number | null;
};

const MEDIA_RESOURCE = "media";

const SIGNED_URL_TTL_SECONDS = 120;

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function encodeObjectPathPreservingSlashes(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchMediaById(args: {
  id: string;
  accessToken: string;
}): Promise<MediaDetail | null> {
  const env = getServerEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;

  const url = new URL(`${supabaseUrl}/rest/v1/${MEDIA_RESOURCE}`);
  url.searchParams.set("id", `eq.${args.id}`);
  url.searchParams.set(
    "select",
    [
      "id",
      "title",
      "description",
      "media_type",
      "created_at",
      "tags",
      "storage_bucket",
      "storage_object_path",
      "mime_type",
      "original_filename",
      "size_bytes",
      "metadata",
    ].join(",")
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

async function createSignedUrl(args: {
  accessToken: string;
  bucket: string;
  objectPath: string;
  expiresInSeconds: number;
}): Promise<string> {
  const env = getServerEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;

  const encodedPath = encodeObjectPathPreservingSlashes(args.objectPath);

  // Endpoint REST do Storage para signed URL:
  // POST /storage/v1/object/sign/:bucket/:path  body: { expiresIn: <seconds> }
  const endpoint = `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(
    args.bucket
  )}/${encodedPath}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ expiresIn: args.expiresInSeconds }),
  });

  if (response.status === 401 || response.status === 403) {
    const err = new Error("AUTH_INVALID");
    (err as any).code = "AUTH_INVALID";
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Storage sign error ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as { signedURL?: string };
  const signedURL = payload?.signedURL;

  if (!signedURL || typeof signedURL !== "string") {
    throw new Error("Storage sign error: signedURL ausente na resposta.");
  }

  // Supabase normalmente retorna um path relativo. Normaliza para absoluto.
  if (signedURL.startsWith("http://") || signedURL.startsWith("https://")) {
    return signedURL;
  }

  // Normaliza para sempre ficar sob /storage/v1
  if (signedURL.startsWith("/storage/v1/")) {
    return `${supabaseUrl}${signedURL}`;
  }

  const normalized =
    signedURL.startsWith("/")
      ? `/storage/v1${signedURL}`
      : `/storage/v1/${signedURL}`;

  return `${supabaseUrl}${normalized}`;
}

type MetadataFile = {
  bucket?: string;
  path?: string;
  original_filename?: string;
  mime_type?: string;
  size_bytes?: number;
};

function extractMetadataFiles(metadata: unknown): MetadataFile[] {
  if (!metadata || typeof metadata !== "object") return [];
  const m = metadata as Record<string, unknown>;
  const files = m.files;
  if (!Array.isArray(files)) return [];

  return files
    .filter((x) => x && typeof x === "object")
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      bucket: typeof x.bucket === "string" ? x.bucket : undefined,
      path: typeof x.path === "string" ? x.path : undefined,
      original_filename:
        typeof x.original_filename === "string" ? x.original_filename : undefined,
      mime_type: typeof x.mime_type === "string" ? x.mime_type : undefined,
      size_bytes: typeof x.size_bytes === "number" ? x.size_bytes : undefined,
    }))
    .filter((f) => !!f.path);
}

function filenameFromPath(path: string): string {
  const seg = path.split("/").pop();
  return seg && seg.trim().length ? seg : "(arquivo)";
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

  const accessToken = session.get("accessToken") ?? null;
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

    const fromMetadata = extractMetadataFiles(media.metadata);

    const files: Array<{
      bucket: string;
      path: string;
      mime_type: string | null;
      original_filename: string | null;
      size_bytes: number | null;
    }> =
      fromMetadata.length > 0
        ? fromMetadata.map((f) => ({
          bucket: f.bucket ?? media.storage_bucket ?? "media",
          path: f.path!,
          mime_type: f.mime_type ?? null,
          original_filename: f.original_filename ?? null,
          size_bytes: typeof f.size_bytes === "number" ? f.size_bytes : null,
        }))
        : media.storage_bucket && media.storage_object_path
          ? [
            {
              bucket: media.storage_bucket,
              path: media.storage_object_path,
              mime_type: media.mime_type ?? null,
              original_filename: media.original_filename ?? null,
              size_bytes: media.size_bytes ?? null,
            },
          ]
          : [];

    const signedFiles = await Promise.all(
      files.map(async (f) => {
        const signedUrl = await createSignedUrl({
          accessToken,
          bucket: f.bucket,
          objectPath: f.path,
          expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        });

        return {
          bucket: f.bucket,
          path: f.path,
          signedUrl,
          mime_type: f.mime_type,
          original_filename: f.original_filename ?? filenameFromPath(f.path),
          size_bytes: f.size_bytes,
        };
      })
    );

    // Compat: mantém signedUrl (primário) para UI legada/elementos que ainda esperam um único arquivo.
    const signedUrl =
      Array.isArray(signedFiles) && signedFiles.length > 0 ? signedFiles[0].signedUrl : null;

    return json({
      media,
      signedFiles,
      signedUrl,
      signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
    });
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
function safeFromParam(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("/app")) return raw; // evita open redirect
  return null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function MediaDetailRoute() {
  const { media, signedFiles, signedUrlTtlSeconds } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  const from = safeFromParam(searchParams.get("from"));
  const backHref = from ?? "/app";

  const tagsText = Array.isArray(media.tags)
    ? media.tags.filter(Boolean).join(", ")
    : typeof media.tags === "string"
      ? media.tags
      : "";
 
  const descriptionText =
    typeof media.description === "string" && media.description.trim().length > 0
      ? media.description.trim()
      : "";

  const primary = Array.isArray(signedFiles) && signedFiles.length ? signedFiles[0] : null;
  const primaryMime = primary?.mime_type ?? "";
  const primaryCanPreviewImage = !!primary?.signedUrl && primaryMime.startsWith("image/");
  const primaryCanPreviewVideo = !!primary?.signedUrl && primaryMime.startsWith("video/");
  const primaryCanPreviewAudio = !!primary?.signedUrl && primaryMime.startsWith("audio/");


  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4">
        <Link to={backHref} className="text-sm text-blue-600 hover:underline">
          Voltar
        </Link>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <h1 className="text-xl font-semibold">{media.title ?? "(sem título)"}</h1>

        <div className="mt-4 grid gap-2 text-sm">
          <div>
            <strong>Tipo:</strong> {media.media_type ?? "—"}
          </div>
          <div>
            <strong>Criado em:</strong> {media.created_at ?? "—"}
          </div>
          <div>
            <strong>Descrição:</strong> {descriptionText || "—"}
          </div>
          <div>
            <strong>Tags:</strong> {tagsText || "—"}
          </div>
          <div>
            <strong>ID:</strong> {media.id}
          </div>

          <div className="mt-2 border-t pt-3">
            <div className="grid gap-1">
              <div>
                <strong>Arquivos:</strong> {Array.isArray(signedFiles) ? signedFiles.length : 0}
              </div>
              <div>
                <strong>Storage (primário):</strong>{" "}
                {media.storage_bucket && media.storage_object_path
                  ? `${media.storage_bucket}/${media.storage_object_path}`
                  : "—"}
              </div>
              <div>
                <strong>MIME (primário):</strong> {media.mime_type ?? "—"}
              </div>
              <div>
                <strong>Arquivo (primário):</strong>{" "}
                {media.original_filename ?? media.storage_object_path ?? "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-medium">Arquivos</div>

          {!Array.isArray(signedFiles) || signedFiles.length === 0 ? (
            <div className="rounded-md border bg-gray-50 p-4 text-sm text-gray-600">
              Nenhum arquivo encontrado para esta mídia.
            </div>
          ) : (
            <div className="grid gap-3">
              {signedFiles.map((f) => {
                const mime = f.mime_type ?? "";
                const canImg = mime.startsWith("image/");
                const canVid = mime.startsWith("video/");
                const canAud = mime.startsWith("audio/");

                return (
                  <div key={`${f.bucket}:${f.path}`} className="rounded-md border bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {f.original_filename ?? filenameFromPath(f.path)}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {f.bucket}/{f.path}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          MIME: {mime || "—"} • Tamanho: {formatBytes(f.size_bytes ?? null)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={f.signedUrl}
                          className="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                          download
                        >
                          Download
                        </a>
                      </div>
                    </div>

                    <div className="mt-3 rounded-md border bg-gray-50 p-3">
                      {canImg ? (
                        <img
                          src={f.signedUrl}
                          alt={f.original_filename ?? "Preview"}
                          className="mx-auto max-h-[18rem] w-auto rounded"
                        />
                      ) : null}

                      {canVid ? (
                        <video
                          src={f.signedUrl}
                          controls
                          className="mx-auto max-h-[18rem] w-full rounded"
                        />
                      ) : null}

                      {canAud ? (
                        <audio src={f.signedUrl} controls className="w-full" />
                      ) : null}

                      {!canImg && !canVid && !canAud ? (
                        <div className="flex h-24 items-center justify-center text-sm text-gray-600">
                          Preview não suportado para este tipo. Use download.
                        </div>
                      ) : null}

                      <div className="mt-3 text-xs text-gray-600">
                        Link temporário (TTL ~ {signedUrlTtlSeconds}s)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
  const [searchParams] = useSearchParams();

  const from = safeFromParam(searchParams.get("from"));
  const backHref = from ?? "/app";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-xl font-semibold">Mídia não encontrada</h1>
          <p className="mt-2 text-sm text-gray-700">
            O item solicitado não existe ou você não tem acesso.
          </p>
          <div className="mt-4">
            <Link to={backHref} className="text-sm text-blue-600 hover:underline">
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
          to={backHref}
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
        {(error as Error)?.message ?? "Falha ao carregar o detalhe da mídia."}
      </p>
      <Link
        to={backHref}
        className="mt-4 inline-block text-sm text-blue-600 hover:underline"
      >
        Voltar
      </Link>
    </div>
  );
}
