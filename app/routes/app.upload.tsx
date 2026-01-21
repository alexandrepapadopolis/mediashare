import { useMemo, useState } from "react";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLocation, useNavigate, useNavigation } from "@remix-run/react";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { getEnv } from "../utils/env.server";
import { getAccessToken, getUserId } from "../utils/session.server";

type ActionData =
    | { ok: true; id: string }
    | { ok: false; formError?: string; fieldErrors?: Record<string, string>; postgrestError?: string };

function isValidMediaType(value: string): value is "photo" | "video" | "audio" {
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

async function uploadToSupabaseStorage(args: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    accessToken: string;
    bucket: string;
    objectPath: string; // URL-encoded segments joined by "/"
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

    const env = getEnv();
    const supabaseUrl = env.VITE_SUPABASE_URL;
    const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
        return json<ActionData>(
            { ok: false, formError: "Configuração ausente: VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY." },
            { status: 500 }
        );
    }

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
        return json<ActionData>({ ok: false, postgrestError: "Resposta inesperada do PostgREST (id ausente)." }, { status: 502 });
    }

    // ---- P13-2: upload binário + update draft + redirect ----
    const fileEntries = formData.getAll("files");
    const files = fileEntries.filter((v): v is File => v instanceof File);

    if (!files.length) {
        return json<ActionData>({ ok: false, formError: "Selecione ao menos um arquivo para enviar." }, { status: 400 });
    }

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

    // Carregar metadata atual para merge seguro (sem sobrescrever defaults)
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

    const primary = uploadedFiles[0];
    const mergedMetadata =
        typeof currentMetadata === "object" && currentMetadata !== null
            ? { ...(currentMetadata as Record<string, unknown>), files: uploadedFiles }
            : { files: uploadedFiles };

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

type MediaType = "photo" | "video" | "audio";

type FormState = {
    title: string;
    description: string;
    tagsCsv: string;
    mediaType: MediaType;
};

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

export default function AppUploadRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const search = location.search || "";
    const actionData = useActionData<ActionData>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";
    const [form, setForm] = useState<FormState>({
        title: "",
        description: "",
        tagsCsv: "",
        mediaType: "photo",
    });

    const tagsPreview = useMemo(() => normalizeTags(form.tagsCsv), [form.tagsCsv]);

    const titleOk = isValidTitle(form.title);
    const canContinue = titleOk;

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Enviar mídia</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Nesta etapa você informa apenas os metadados. O envio do arquivo e a persistência serão adicionados em PRs
                    seguintes.
                </p>
            </header>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {actionData?.ok === false && (actionData.formError || actionData.postgrestError) ? (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                        {actionData.formError ? <p>{actionData.formError}</p> : null}
                        {actionData.postgrestError ? <p className="mt-1 break-words">{actionData.postgrestError}</p> : null}
                    </div>
                ) : null}

                {actionData?.ok === true ? (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                        <p>Mídia criada com sucesso (draft lógico).</p>
                        <p className="mt-1">
                            ID: <span className="font-mono">{actionData.id}</span>
                        </p>
                    </div>
                ) : null}

                <Form method="post" className="space-y-6">

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                            {actionData?.ok === false && actionData.fieldErrors?.title ? <p className="mt-2 text-xs text-rose-700">{actionData.fieldErrors.title}</p> : null}
                            <p id="title-help" className="mt-2 text-xs text-slate-600">
                                Mínimo de 3 caracteres.
                            </p>
                        </div>

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
                            </select>
                            {actionData?.ok === false && actionData.fieldErrors?.mediaType ? <p className="mt-2 text-xs text-rose-700">{actionData.fieldErrors.mediaType}</p> : null}
                        </div>

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

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-medium text-slate-900">Arquivo</p>
                        <p className="mt-1 text-sm text-slate-600">
                            Upload binário ainda não habilitado neste PR. Este formulário prepara o fluxo de metadados.
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
                            {isSubmitting ? "Salvando..." : "Continuar"}
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
