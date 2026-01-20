// app/utils/supabase.server.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function createBaseClient(extraHeaders?: Record<string, string>): SupabaseClient {
  const supabaseUrl = mustEnv("SUPABASE_URL");
  const supabaseAnonKey = mustEnv("SUPABASE_ANON_KEY");

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: extraHeaders
      ? { headers: extraHeaders }
      : undefined,
  });
}

/**
 * Supabase server client (anon). Use para operações onde não precisa do user token.
 */
export function createSupabaseServerClient(_request?: Request): {
  supabase: SupabaseClient;
  headers: Headers;
} {
  const headers = new Headers();
  const supabase = createBaseClient();
  return { supabase, headers };
}

/**
 * Supabase server client autenticado via Bearer token.
 * Use quando precisa chamar auth.getUser() ou fazer queries com RLS como o usuário.
 */
export function createSupabaseServerClientWithAccessToken(accessToken: string): SupabaseClient {
  return createBaseClient({
    Authorization: `Bearer ${accessToken}`,
  });
}
