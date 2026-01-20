// app/utils/supabase.server.ts
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.server";

export function createSupabaseServerClient(options?: { accessToken?: string }) {
  const env = getEnv();

  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: options?.accessToken
      ? { headers: { Authorization: `Bearer ${options.accessToken}` } }
      : undefined,
  });

  return { supabase };
}
