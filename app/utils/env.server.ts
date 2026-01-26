// app/utils/env.server.ts
type ServerEnv = {
  SUPABASE_URL: string;
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
  return v;
}

export function getServerEnv(): ServerEnv {
  return {
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_ANON_KEY: required("SUPABASE_ANON_KEY"),
    SESSION_SECRET: required("SESSION_SECRET"),
  };
}

export function getPublicEnv(): PublicEnv {
  // IMPORTANTE: só variáveis seguras para expor ao browser
  return {
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_ANON_KEY: required("SUPABASE_ANON_KEY"),
  };
}