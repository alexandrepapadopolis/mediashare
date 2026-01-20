// app/utils/media.server.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { toRange } from "./pagination";

/**
 * P07 (PR1): consulta SSR mínima para listagem + filtros via querystring.
 *
 * Regras:
 * - Fonte da verdade: URL
 * - Nenhum token persistido no browser
 * - SSR simples antes de otimizações
 */

const MediaSearchSchema = z.object({
    q: z.string().max(200).optional(),
    /**
     * tags: MVP comma-separated (ex.: "family,trip")
     * Mantemos compatibilidade com o param legado "tag" (singular) se existir.
     */
    tags: z.string().max(400).optional(),
    tag: z.string().max(80).optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(48).optional(),
});

export type MediaQueryInput = {
    q: string | null;
    tags: string[]; // normalized unique
    page: number; // 1-based
    pageSize: number;
};

export type MediaItem = {
    id: string;
    title: string;
    media_type: "photo" | "video" | string;
    thumbnail_url: string | null;
    created_at: string;
    tags: unknown; // jsonb no schema atual (ver migrations)
};

export type MediaQueryResult = {
    items: MediaItem[];
    total: number;
    pageCount: number;
    hasNext: boolean;
    hasPrev: boolean;
    appliedFilters: {
        q: string | null;
        tags: string[];
        page: number;
        pageSize: number;
    };
};


export function isInvalidAuthError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const anyErr = err as any;
    const status = typeof anyErr.status === "number" ? anyErr.status : undefined;
    const message = typeof anyErr.message === "string" ? anyErr.message.toLowerCase() : "";

    if (status === 401 || status === 403) return true;
    if (message.includes("jwt") && (message.includes("expired") || message.includes("invalid"))) {
        return true;
    }
    if (message.includes("invalid") && message.includes("token")) {
        return true;
    }
    return false;
}

export function parseMediaQuery(url: URL): MediaQueryInput {
    const parsed = MediaSearchSchema.safeParse({
        q: url.searchParams.get("q") ?? undefined,
        tags: url.searchParams.get("tags") ?? undefined,
        tag: url.searchParams.get("tag") ?? undefined,
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
    });

    // Em PR1, falhas de validação apenas caem para defaults seguros.
    const qRaw = parsed.success ? parsed.data.q : undefined;
    const q = qRaw && qRaw.trim().length > 0 ? qRaw.trim() : null;

    const tagsRaw = parsed.success ? parsed.data.tags : undefined;
    const tagRaw = parsed.success ? parsed.data.tag : undefined;

    const fromComma = splitTags(tagsRaw);
    const fromSingle = splitTags(tagRaw);
    const tags = uniq([...fromComma, ...fromSingle]).slice(0, 20);

    const page = parsed.success && parsed.data.page ? Math.max(1, parsed.data.page) : 1;
    const pageSize =
        parsed.success && parsed.data.pageSize
            ? Math.min(48, Math.max(12, parsed.data.pageSize))
            : 24;

    return { q, tags, page, pageSize };
}

function splitTags(raw?: string): string[] {
    if (!raw) return [];
    const v = raw.trim();
    if (!v) return [];
    return v
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.slice(0, 50));
}

function uniq(values: string[]): string[] {
    return Array.from(new Set(values));
}

/**
 * Query SSR mínima baseada no schema atual (public.media).
 * - Busca por title via ilike
 * - Tags: coluna jsonb (array). MVP usa "contains" (AND).
 *
 * Evolução esperada (PR2/PR3): suportar tags normalizadas (media_tags/tags) via view ou rpc.
 */
export async function queryMedia(opts: {
    supabase: SupabaseClient;
    input: MediaQueryInput;
}): Promise<MediaQueryResult> {
    const { supabase, input } = opts;
    const { q, tags, page, pageSize } = input;

    const { from, to } = toRange(page, pageSize);

    let query = supabase
        .from("media")
        .select("id,title,media_type,thumbnail_url,created_at,tags", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

    if (q) {
        query = query.ilike("title", `%${q}%`);
    }

    // tags é jsonb no schema; contains aplica AND (todas as tags).
    // MVP aceitável para PR1; pode ser ajustado depois.
    if (tags.length > 0) {
        query = query.contains("tags", JSON.stringify(tags));
    }

    const { data, error, count } = await query;
    if (error) {
        // PostgREST: range fora do total => tratar como vazio (não é falha do sistema)
        if ((error as any).code === "PGRST103") {
            const total = 0;
            const pageCount = 0;
            const hasPrev = page > 1;
            const hasNext = false;

            return {
                items: [],
                total,
                pageCount,
                hasPrev,
                hasNext,
                appliedFilters: { q, tags, page, pageSize },
            };
        }

        throw error;
    }

    const total = count ?? 0;
    const pageCount = total > 0 ? Math.ceil(total / pageSize) : 0;
    const hasPrev = page > 1;
    const hasNext = page * pageSize < total;

    return {
        items: (data ?? []) as MediaItem[],
        total,
        pageCount,
        hasPrev,
        hasNext,
        appliedFilters: { q, tags, page, pageSize },
    };

}
