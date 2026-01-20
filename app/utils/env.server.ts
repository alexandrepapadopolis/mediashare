// app/utils/env.server.ts
type Env = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
  SESSION_SECRET: string;
};

function required(name: keyof Env): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || v.trim().length === 0) {
    throw new Error(`Invalid environment variables: ${name}: Required`);
  }
  return v;
}

export function getEnv(): Env {
  return {
    VITE_SUPABASE_URL: required("VITE_SUPABASE_URL"),
    VITE_SUPABASE_PUBLISHABLE_KEY: required("VITE_SUPABASE_PUBLISHABLE_KEY"),
    SESSION_SECRET: required("SESSION_SECRET"),
  };
}
