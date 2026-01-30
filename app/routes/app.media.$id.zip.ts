// app/routes/app.media.$id.zip.ts
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createReadableStreamFromReadable, redirect } from "@remix-run/node";
import { PassThrough } from "node:stream";
import archiver from "archiver";

import { getServerEnv } from "../utils/env.server";
import { destroySession, getSession } from "../utils/session.server";

const MEDIA_RESOURCE = "media";
const SIGNED_URL_TTL_SECONDS = 120;

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function encodeObjectPathPreservingSlashes(path: string): string {
  // preserva "/" e escapa cada segmento (para espaços/acentos)
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Normaliza a signedURL retornada pelo Supabase Storage para uma URL absoluta
 * sob a base informada (ex.: SUPABASE_URL interno).
 */
function normalizeSignedUrlToBase(args: {
  base: string; // ex.: env.SUPABASE_URL (interno)
  signedURL: string;
}): string {
  const baseNoSlash = String(args.base).replace(/\/+$/, "");
  const s = String(args.signedURL);

  // Se vier absoluta, reescreve host/protocol para bater com a base
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      const b = new URL(baseNoSlash);
      u.protocol = b.protocol;
      u.host = b.host;
      return u.toString();
    } catch {
      return s;
    }
  }

  // Se vier relativa, garante que fique sob /storage/v1
  if (s.startsWith("/storage/v1/")) {
    return `${baseNoSlash}${s}`;
  }

  const normalized = s.startsWith("/") ? `/storage/v1${s}` : `/storage/v1/${s}`;
  return `${baseNoSlash}${normalized}`;
}

async function createSignedUrl(args: {
  accessToken: string;
  bucket: string;
  objectPath: string;
  expiresInSeconds: number;
}): Promise<string> {
  const env = getServerEnv();
  const supabaseUrl = env.SUPABASE_URL;

  // IMPORTANT: path precisa ser codificado por segmento (preserva /)
  const encodedPath = encodeObjectPathPreservingSlashes(args.objectPath);

  const endpoint = `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(
    args.bucket
  )}/${encodedPath}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
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

  return signedURL;
}

type MediaRow = {
  id: string;
  title: string | null;
  metadata: unknown;
  storage_bucket: string | null;
  storage_object_path: string | null;
  mime_type: string | null;
  original_filename: string | null;
  size_bytes: number | null;
};

async function fetchMediaForZip(args: {
  id: string;
  accessToken: string;
}): Promise<MediaRow | null> {
  const env = getServerEnv();
  const supabaseUrl = env.SUPABASE_URL;

  const url = new URL(`${supabaseUrl}/rest/v1/${MEDIA_RESOURCE}`);
  url.searchParams.set("id", `eq.${args.id}`);
  url.searchParams.set(
    "select",
    [
      "id",
      "title",
      "metadata",
      "storage_bucket",
      "storage_object_path",
      "mime_type",
      "original_filename",
      "size_bytes",
    ].join(",")
  );
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
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

  const data = (await response.json()) as MediaRow[];
  return data?.[0] ?? null;
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

function sanitizeZipBaseName(input: string): string {
  const raw = input.normalize("NFKC").trim();

  let s = raw.replace(/[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[<>:"/\\|?*]/g, "");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-+/g, "-");
  s = s.replace(/^[\s.\-]+|[\s.\-]+$/g, "");

  const upper = s.toUpperCase();
  const reserved = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);

  if (reserved.has(upper)) s = `${s}-file`;
  if (s.length > 120) s = s.slice(0, 120);
  if (!s) return "media";
  return s;
}

function sanitizeZipEntryName(input: string): string {
  // Evita:
  // - caminho absoluto
  // - traversal (..)
  // - backslashes
  const raw = input.normalize("NFKC").trim();
  let s = raw.replace(/\\/g, "/");
  s = s.replace(/^\/+/, "");
  s = s.replace(/\.\.(\/|$)/g, "");
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  if (!s) s = "file";
  return s;
}

function buildZipHeaders(args: { filenameBase: string }): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Cache-Control", "no-store");

  const base = args.filenameBase;

  const asciiSafe = base
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim();

  const finalBase = asciiSafe.length ? asciiSafe : "media";
  const filename = `${finalBase}.zip`;

  const filenameStar = `${base}.zip`;
  const encodedStar = encodeURIComponent(filenameStar);

  headers.set(
    "Content-Disposition",
    `attachment; filename="${filename}"; filename*=UTF-8''${encodedStar}`
  );

  return headers;
}

async function fetchAsNodeReadable(url: string, signal: AbortSignal) {
  const resp = await fetch(url, { signal });

  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Download error ${resp.status}: ${body}`);
  }

  // Node 18+/20: resp.body é Web ReadableStream -> convert para Node Readable
  // @ts-expect-error - Readable.fromWeb existe em Node 18+
  const { Readable } = await import("node:stream");
  // @ts-expect-error - fromWeb typing varia
  return Readable.fromWeb(resp.body);
}

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
    const env = getServerEnv();

    const media = await fetchMediaForZip({ id, accessToken });
    if (!media) throw new Response("Not Found", { status: 404 });

    const base = sanitizeZipBaseName(media.title ?? id);

    const fromMetadata = extractMetadataFiles(media.metadata);

    const files: Array<{
      bucket: string;
      path: string;
      original_filename: string;
    }> =
      fromMetadata.length > 0
        ? fromMetadata.map((f, idx) => ({
          bucket: f.bucket ?? media.storage_bucket ?? "media",
          path: f.path!,
          original_filename:
            f.original_filename?.trim() ||
            `file-${String(idx + 1).padStart(3, "0")}`,
        }))
        : media.storage_bucket && media.storage_object_path
          ? [
            {
              bucket: media.storage_bucket,
              path: media.storage_object_path,
              original_filename:
                media.original_filename?.trim() || media.storage_object_path,
            },
          ]
          : [];

    if (files.length === 0) {
      throw new Response("No files", { status: 404 });
    }

    const pass = new PassThrough();

    // Cria o archive e pipeia imediatamente (streaming)
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("warning", (err) => {
      // warnings comuns do archiver (ex.: stat falhou) — não derruba o processo
      // se virar problema real, ele emitirá "error"
      // eslint-disable-next-line no-console
      console.warn("[zip] archiver warning:", err);
    });

    archive.on("error", (err) => {
      pass.destroy(err);
    });

    archive.pipe(pass);

    // Abort: se o cliente cancelar download, aborta o zip e encerra o stream
    const onAbort = () => {
      try {
        archive.abort();
      } catch { }
      try {
        pass.destroy(); // sem Error("Client aborted") para não poluir log
      } catch { }
    };
    request.signal.addEventListener("abort", onAbort, { once: true });

    // Producer async (não bloquear o retorno do Response)
    (async () => {
      try {
        for (const f of files) {
          if (request.signal.aborted) break;

          const signedURL = await createSignedUrl({
            accessToken,
            bucket: f.bucket,
            objectPath: f.path,
            expiresInSeconds: SIGNED_URL_TTL_SECONDS,
          });

          // Para baixar no server (container), use SEMPRE a base interna (SUPABASE_URL)
          const fetchUrl = normalizeSignedUrlToBase({
            base: env.SUPABASE_URL,
            signedURL,
          });

          const nodeStream = await fetchAsNodeReadable(fetchUrl, request.signal);

          const entryName = sanitizeZipEntryName(f.original_filename);
          archive.append(nodeStream, { name: entryName });
        }

        // finalize só faz sentido se o cliente ainda estiver conectado
        if (!request.signal.aborted) {
          await archive.finalize();
        }
      } catch (err) {
        // Se o cliente abortou, não precisa explodir erro
        if (!request.signal.aborted) {
          pass.destroy(err as Error);
        }
      } finally {
        request.signal.removeEventListener("abort", onAbort);
      }
    })();

    const body = createReadableStreamFromReadable(pass);

    return new Response(body, {
      status: 200,
      headers: buildZipHeaders({ filenameBase: base }),
    });
  } catch (error: any) {
    // Abort do cliente (cancelamento de download / navegação)
    if (
      error?.name === "AbortError" ||
      error?.message?.includes("aborted")
    ) {
      return new Response(null, { status: 204 });
    }

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
