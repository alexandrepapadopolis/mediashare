// app/utils/env.server.ts

type ServerEnv = {
  SUPABASE_URL: string;
  /**
   * URL pública para o browser acessar o Supabase
   * (ex.: http://jupiter.local:54321).
   * Opcional no .env — fallback automático para SUPABASE_URL.
   */
  SUPABASE_PUBLIC_URL: string;
  SUPABASE_ANON_KEY: string;
  SESSION_SECRET: string;
};

type PublicEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Invalid environment variables: ${name}: Required`);
  }
  return v.trim();
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  if (!v || typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getServerEnv(): ServerEnv {
  const supabaseUrl = required("SUPABASE_URL");

  // URL pública usada para links que o browser vai consumir
  const supabasePublicUrl = optional("SUPABASE_PUBLIC_URL") ?? supabaseUrl;

  return {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLIC_URL: supabasePublicUrl,
    SUPABASE_ANON_KEY: required("SUPABASE_ANON_KEY"),
    SESSION_SECRET: required("SESSION_SECRET"),
  };
}

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = required("SUPABASE_URL");
  const supabasePublicUrl = optional("SUPABASE_PUBLIC_URL") ?? supabaseUrl;

  return {
    // Para o browser, SEMPRE a URL pública
    SUPABASE_URL: supabasePublicUrl,
    SUPABASE_ANON_KEY: required("SUPABASE_ANON_KEY"),
  };
}
