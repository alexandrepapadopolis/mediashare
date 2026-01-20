// app/utils/supabase.client.ts
import { createClient } from "@supabase/supabase-js";

export function createSupabaseServerClient(_request?: Request): {
  supabase: SupabaseClient;
  headers: Headers;
} {
  // No browser: usa publishable key e deixa o Supabase lidar com o fluxo de OAuth e callbacks.
  // Em SSR: NÃO use este client para ler dados sensíveis; prefira supabase.server.ts.
  export function createSupabaseBrowserClient() {
    const url = (window as any).__ENV?.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const key =
      (window as any).__ENV?.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
}

