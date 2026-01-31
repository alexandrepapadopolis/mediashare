// app/utils/supabase.client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __ENV?: {
      SUPABASE_PUBLIC_URL?: string;
      SUPABASE_ANON_KEY?: string;
    };
  }
}

function required(name: "SUPABASE_PUBLIC_URL" | "SUPABASE_ANON_KEY"): string {
  const v = window.__ENV?.[name];
  if (!v || typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Missing public env var in window.__ENV: ${name}`);
  }
  return v;
}

// No browser: usa ANON KEY e deixa o Supabase lidar com o fluxo de OAuth e callbacks.
// Em SSR: NÃO use este client para ler dados sensíveis; prefira um client server-only.
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = required("SUPABASE_PUBLIC_URL");
  const key = required("SUPABASE_ANON_KEY");

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
