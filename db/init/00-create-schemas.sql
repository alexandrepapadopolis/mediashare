-- 00-create-schemas.sql
-- Cria schemas básicos e extensões necessárias para Supabase-like stack.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- Extensões usadas por scripts/migrations (gen_random_uuid, etc.)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- (Opcional, mas útil) UUID helpers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Garanta que o postgres consiga enxergar extensões no search_path, se necessário.
-- (Não é obrigatório, mas ajuda quando scripts chamam gen_random_uuid() sem schema.)
ALTER DATABASE postgres SET search_path = public, extensions, auth, storage;
