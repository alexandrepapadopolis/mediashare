// app/routes/app.upload.tsx

import { useMemo, useState } from "react";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLocation, useNavigate, useNavigation } from "@remix-run/react";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { getServerEnv } from "../utils/env.server";
import { getAccessToken, getUserId } from "../utils/session.server";
import { generateThumbnailWebp, isImageMime } from "../utils/thumbnail.server";

// --- Tipagens ---

type ActionData =
    | { ok: true; id: string }
    | { ok: false; formError?: string; fieldErrors?: Record<string, string>; postgrestError?: string };

type MediaType = "photo" | "video" | "audio";

type FormState = {
    title: string;
    description: string;
    tagsCsv: string;
    mediaType: MediaType;
};

// --- Helpers e Validações ---

function isValidMediaType(value: string): value is MediaType {
    return value === "photo" || value === "video" || value === "audio";
}

function isAllowedMime(mime: string): boolean {
    return mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
}

const MAX_BYTES_PER_FILE = 1024 * 1024 * 1024; // 1GB

function safeFilename(name: string): string {
    const base = name.split("/").pop()?.split("\\").pop() ?? "file";
    const cleaned = base.replace(/\s+/g, "_").trim();
    return cleaned.length ? cleaned : "file";
}

function encodePathSegments(segments: string[]): string {
    return segments.map((s) => encodeURIComponent(s)).join("/");
}

function normalizeTags(tagsCsv: string): string[] {
    const raw = tagsCsv
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

    const normalized = raw
        .map((t) => t.toLowerCase())
        .map((t) => t.replace(/\s+/g, "-"))
        .map((t) => t.replace(/[^a-z0-9\-_.]/g, ""))
        .filter(Boolean);

    return Array.from(new Set(normalized));
}

function isValidTitle(value: string): boolean {
    return value.trim().length >= 3;
}

// --- Funções de Upload (Server-Side) ---

async function uploadToSupabaseStorage(args: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    accessToken: string;
    bucket: string;
    objectPath: string;
    file: File;
}): Promise<{
    checksum_sha256: string;
    size_bytes: number;
    mime_type: string;
    original_filename: string;
}> {
    const { supabaseUrl, supabaseAnonKey, accessToken, bucket, objectPath, file } = args;

    const mime = file.type || "application/octet-stream";
    const size = file.size ?? 0;
    const original = file.name || "file";

    const hash = createHash("sha256");
    const hasher = new Transform({
        transform(chunk, _enc, cb) {
            hash.update(chunk as Buffer);
            cb(null, chunk);
        },
    });

    const nodeReadable = Readable.fromWeb(file.stream() as unknown as ReadableStream);
    const bodyStream = nodeReadable.pipe(hasher);

    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": mime,
        },
        // @ts-expect-error Node fetch requer duplex para request streaming
        duplex: "half",
        body: bodyStream as unknown as BodyInit,
    });

    if (!resp.ok) {
        let details = "";
        try {
            const j = await resp.json();
            details = typeof j === "string" ? j : JSON.stringify(j);
        } catch {
            details = await resp.text().catch(() => "");
        }
        throw new Error(`Storage ${resp.status}: ${details}`);
    }

    return {
        checksum_sha256: hash.digest("hex"),
        size_bytes: size,
        mime_type: mime,
        original_filename: original,
    };
}

async function uploadBufferToSupabaseStorage(args: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    accessToken: string;
    bucket: string;
    objectPath: string;
    contentType: string;
    buffer: Buffer;
}): Promise<void> {
    const { supabaseUrl, supabaseAnonKey, accessToken, bucket, objectPath, contentType, buffer } = args;

    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
            "x-upsert": "true",
        },
        body: buffer,
    });

    if (!resp.ok) {
        let details = "";
        try {
            const j = await resp.json();
            details = typeof j === "string" ? j : JSON.stringify(j);
        } catch {
            details = await resp.text().catch(() => "");
        }
        throw new Error(`Storage thumbnail ${resp.status}: ${details}`);
    }
}

// --- Action (Server-Side Logic) ---

export async function action({ request }: ActionFunctionArgs) {
    const accessToken = await getAccessToken(request);
    if (!accessToken) {
        return json<ActionData>({ ok: false, formError: "Token ausente. Faça login novamente." }, { status: 401 });
    }

    const userId = await getUserId(request);
    if (!userId) {
        return json<ActionData>({ ok: false, formError: "Sessão inválida. Faça login novamente." }, { status: 401 });
    }

    const formData = await request.formData();
    const title = String(formData.get("title") ?? "");
    const description = String(formData.get("description") ?? "");
    const mediaTypeRaw = String(formData.get("mediaType") ?? "");
    const tagsCsv = String(formData.get("tagsCsv") ?? "");

    const fieldErrors: Record<string, string> = {};
    if (!isValidTitle(title)) fieldErrors.title = "Título deve ter no mínimo 3 caracteres.";
    if (!isValidMediaType(mediaTypeRaw)) fieldErrors.mediaType = "Tipo inválido.";

    if (Object.keys(fieldErrors).length) {
        return json<ActionData>({ ok: false, fieldErrors }, { status: 400 });
    }

    const tags = normalizeTags(tagsCsv);
    const env = getServerEnv();
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return json<ActionData>(
            { ok: false, formError: "Configuração ausente: SUPABASE_URL/SUPABASE_ANON_KEY." },
            { status: 500 }
        );
    }

    // 1. Cria o registro lógico no banco (Draft)
    const payload = {
        user_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        media_type: mediaTypeRaw,
        source_type: "file",
        tags,
    };

    const resp = await fetch(`${supabaseUrl}/rest/v1/media`, {
        method: "POST",
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        let details = "";
        try {
            const j = await resp.json();
            details = typeof j === "string" ? j : JSON.stringify(j);
        } catch {
            details = await resp.text().catch(() => "");
        }
        return json<ActionData>(
            { ok: false, postgrestError: `PostgREST ${resp.status}: ${details}` },
            { status: resp.status }
        );
    }

    const created = (await resp.json()) as Array<{ id: string }>;
    const id = created?.[0]?.id;
    if (!id) {
        return json<ActionData>(
            { ok: false, postgrestError: "Resposta inesperada do PostgREST (id ausente)." },
            { status: 502 }
        );
    }

    // 2. Processa o Upload dos arquivos
    const fileEntries = formData.getAll("files");
    const files = fileEntries.filter((v): v is File => v instanceof File);

    if (!files.length) {
        // Nota: Se a validação client-side falhar, isso captura no server
        return json<ActionData>({ ok: false, formError: "Selecione ao menos um arquivo para enviar." }, { status: 400 });
    }

    // Validação de segurança dos arquivos antes de enviar
    for (const f of files) {
        const mime = f.type || "";
        if (!isAllowedMime(mime)) {
            return json<ActionData>(
                { ok: false, formError: `Tipo de arquivo não permitido: ${mime || "(vazio)"}` },
                { status: 400 }
            );
        }
        const size = f.size ?? 0;
        if (size <= 0) {
            return json<ActionData>(
                { ok: false, formError: `Arquivo inválido (tamanho zero): ${f.name || "(sem nome)"}` },
                { status: 400 }
            );
        }
        if (size > MAX_BYTES_PER_FILE) {
            return json<ActionData>(
                { ok: false, formError: `Arquivo excede 1GB: ${f.name || "(sem nome)"}` },
                { status: 400 }
            );
        }
    }

    const bucket = "media";
    const directoryRel = `${userId}/${id}`;
    const nowIso = new Date().toISOString();

    // Tenta carregar metadados existentes para merge (caso expanda para multi-step no futuro)
    let currentMetadata: unknown = {};
    try {
        const metaResp = await fetch(`${supabaseUrl}/rest/v1/media?id=eq.${id}&select=metadata`, {
            method: "GET",
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        if (metaResp.ok) {
            const rows = (await metaResp.json()) as Array<{ metadata: unknown }>;
            currentMetadata = rows?.[0]?.metadata ?? {};
        }
    } catch {
        currentMetadata = {};
    }

    const uploadedFiles: Array<{
        bucket: string;
        path: string;
        original_filename: string;
        mime_type: string;
        size_bytes: number;
        checksum_sha256: string;
        uploaded_at: string;
    }> = [];

    try {
        for (const f of files) {
            const filename = safeFilename(f.name || "file");
            const objectPath = encodePathSegments([userId, id, filename]);

            const uploaded = await uploadToSupabaseStorage({
                supabaseUrl,
                supabaseAnonKey,
                accessToken,
                bucket,
                objectPath,
                file: f,
            });

            uploadedFiles.push({
                bucket,
                path: `${userId}/${id}/${filename}`,
                original_filename: uploaded.original_filename,
                mime_type: uploaded.mime_type,
                size_bytes: uploaded.size_bytes,
                checksum_sha256: uploaded.checksum_sha256,
                uploaded_at: nowIso,
            });
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return json<ActionData>(
            { ok: false, postgrestError: `Falha no upload para Storage: ${msg}` },
            { status: 502 }
        );
    }

    // 3. Gera thumbnail (somente para imagens) e sobe para o Storage (best-effort)
    // Importante: mantemos best-effort para não bloquear upload de vídeo/áudio.
    let thumbnail: {
        objectPath: string;
        publicUrl: string;
        width: number;
        height: number;
        mime_type: "image/webp";
        variant: "w320-webp";
        generated_at: string;
    } | null = null;

    try {
        const primaryImageFile = files.find((f) => isImageMime(f.type)) ?? null;
        if (primaryImageFile) {
            const generated = await generateThumbnailWebp(primaryImageFile, 320);
            if (generated) {
                const thumbObjectPath = encodePathSegments(["thumbnails", userId, id, "w320.webp"]);

                await uploadBufferToSupabaseStorage({
                    supabaseUrl,
                    supabaseAnonKey,
                    accessToken,
                    bucket,
                    objectPath: thumbObjectPath,
                    contentType: "image/webp",
                    buffer: generated.buffer,
                });

                // Bucket é público (no seu config.toml), então URL pública é estável e não expira.
                const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${thumbObjectPath}`;

                thumbnail = {
                    objectPath: thumbObjectPath,
                    publicUrl,
                    width: generated.width,
                    height: generated.height,
                    mime_type: "image/webp",
                    variant: "w320-webp",
                    generated_at: nowIso,
                };
            }
        }
    } catch {
        // Silencioso por design: thumbnail não deve falhar o upload principal.
        thumbnail = null;
    }

    // 4. Atualiza o registro com os dados dos arquivos (PATCH)
    const primary = uploadedFiles[0];

    const baseMetadata =
        typeof currentMetadata === "object" && currentMetadata !== null
            ? { ...(currentMetadata as Record<string, unknown>) }
            : {};

    const mergedMetadata: Record<string, unknown> = {
        ...baseMetadata,
        files: uploadedFiles,
    };

    if (thumbnail) {
        mergedMetadata.thumbnail = {
            bucket,
            objectPath: thumbnail.objectPath,
            publicUrl: thumbnail.publicUrl,
            width: thumbnail.width,
            height: thumbnail.height,
            mime_type: thumbnail.mime_type,
            variant: thumbnail.variant,
            generated_at: thumbnail.generated_at,
        };
    }

    const patchPayload = {
        storage_bucket: bucket,
        storage_object_path: primary.path,
        directory_relpath: directoryRel,
        file_path: primary.path,
        original_filename: primary.original_filename,
        mime_type: primary.mime_type,
        size_bytes: primary.size_bytes,
        checksum_sha256: primary.checksum_sha256,
        fs_created_at: nowIso,
        fs_modified_at: nowIso,
        uploaded_at: nowIso,
        thumbnail_url: thumbnail ? thumbnail.publicUrl : null,
        metadata: mergedMetadata,
    };

    const patchResp = await fetch(`${supabaseUrl}/rest/v1/media?id=eq.${id}`, {
        method: "PATCH",
        headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
        },
        body: JSON.stringify(patchPayload),
    });

    if (!patchResp.ok) {
        let details = "";
        try {
            const j = await patchResp.json();
            details = typeof j === "string" ? j : JSON.stringify(j);
        } catch {
            details = await patchResp.text().catch(() => "");
        }
        return json<ActionData>(
            { ok: false, postgrestError: `PostgREST (PATCH) ${patchResp.status}: ${details}` },
            { status: patchResp.status }
        );
    }

    return redirect(`/app/media/${id}`);
}

export const meta: MetaFunction = () => {
    return [
        { title: "Upload | Phosio" },
        { name: "description", content: "Enviar nova mídia para o seu acervo no Phosio." },
    ];
};

// --- Componente React ---

export default function AppUploadRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const search = location.search || "";
    const actionData = useActionData<ActionData>();
    const navigation = useNavigation();

    const isSubmitting = navigation.state === "submitting";

    // Estado do formulário
    const [form, setForm] = useState<FormState>({
        title: "",
        description: "",
        tagsCsv: "",
        mediaType: "photo",
    });

    // 1. Estado para saber se existem arquivos selecionados
    const [hasFiles, setHasFiles] = useState(false);

    const tagsPreview = useMemo(() => normalizeTags(form.tagsCsv), [form.tagsCsv]);

    const titleOk = isValidTitle(form.title);

    // 2. O botão só habilita se tiver Título válido E Arquivos selecionados
    const canContinue = titleOk && hasFiles;

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Enviar mídia</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Nesta etapa você informa os metadados e seleciona os arquivos. O envio será processado pelo servidor.
                </p>
            </header>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {/* Feedback de Erro */}
                {actionData?.ok === false && (actionData.formError || actionData.postgrestError) ? (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        {actionData.formError ? <p>{actionData.formError}</p> : null}
                        {actionData.postgrestError ? <p className="mt-1 break-words">{actionData.postgrestError}</p> : null}
                    </div>
                ) : null}

                {/* Feedback de Sucesso */}
                {actionData?.ok === true ? (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <p>Mídia enviada com sucesso! Redirecionando...</p>
                    </div>
                ) : null}

                <Form method="post" encType="multipart/form-data" className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Campo Título */}
                        <div className="sm:col-span-2">
                            <label htmlFor="title" className="block text-sm font-medium text-slate-900">
                                Título <span className="text-rose-600">*</span>
                            </label>
                            <input
                                id="title"
                                name="title"
                                type="text"
                                value={form.title}
                                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                                placeholder="Ex.: Viagem 2026 - Praia"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                                aria-invalid={!titleOk}
                                aria-describedby="title-help"
                            />
                            {actionData?.ok === false && actionData.fieldErrors?.title ? (
                                <p className="mt-2 text-xs text-rose-700">{actionData.fieldErrors.title}</p>
                            ) : null}
                            <p id="title-help" className="mt-2 text-xs text-slate-600">
                                Mínimo de 3 caracteres.
                            </p>
                        </div>

                        {/* Campo Tipo */}
                        <div>
                            <label htmlFor="mediaType" className="block text-sm font-medium text-slate-900">
                                Tipo
                            </label>
                            <select
                                id="mediaType"
                                name="mediaType"
                                value={form.mediaType}
                                onChange={(e) => setForm((p) => ({ ...p, mediaType: e.target.value as MediaType }))}
                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                            >
                                <option value="photo">Foto</option>
                                <option value="video">Vídeo</option>
                                <option value="audio">Áudio</option>
                            </select>
                            {actionData?.ok === false && actionData.fieldErrors?.mediaType ? (
                                <p className="mt-2 text-xs text-rose-700">{actionData.fieldErrors.mediaType}</p>
                            ) : null}
                        </div>

                        {/* Campo Tags */}
                        <div>
                            <label htmlFor="tags" className="block text-sm font-medium text-slate-900">
                                Tags (separadas por vírgula)
                            </label>
                            <input
                                id="tags"
                                name="tagsCsv"
                                type="text"
                                value={form.tagsCsv}
                                onChange={(e) => setForm((p) => ({ ...p, tagsCsv: e.target.value }))}
                                placeholder="Ex.: família, viagem, praia"
                                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                            />
                            <p className="mt-2 text-xs text-slate-600">
                                Prévia normalizada: {tagsPreview.length ? tagsPreview.join(", ") : "(vazio)"}
                            </p>
                        </div>
                    </div>

                    {/* Campo Descrição */}
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-slate-900">
                            Descrição
                        </label>
                        <textarea
                            id="description"
                            name="description"
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            placeholder="Notas opcionais sobre esta mídia..."
                            rows={5}
                            className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                        />
                    </div>

                    {/* Campo Arquivos */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                        <p className="text-sm font-medium text-slate-900">Arquivos</p>
                        <p className="text-sm text-slate-600">
                            Selecione um ou mais arquivos (imagem, vídeo ou áudio). Máximo: 1GB por arquivo.
                        </p>
                        <input
                            id="files"
                            name="files"
                            type="file"
                            multiple
                            accept="image/*,video/*,audio/*"
                            // Atualiza o estado para liberar o botão
                            onChange={(e) => setHasFiles(!!e.target.files?.length)}
                            className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                        />
                        <p className="text-xs text-slate-500">
                            Os arquivos serão enviados pelo servidor (SSR) e vinculados ao draft desta mídia.
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            onClick={() => navigate(`/app${search}`)}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!canContinue || isSubmitting}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmitting ? "Enviando..." : "Enviar"}
                        </button>
                    </div>
                </Form>
            </div>

            <footer className="mt-6 text-xs text-slate-500">
                P09-2 (Issue #28): action SSR + PostgREST criando draft lógico (sem upload binário).
            </footer>
        </div>
    );
}
