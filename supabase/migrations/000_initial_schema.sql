-- 000_initial_schema.sql
-- Schema base do Phosio (mínimo necessário para o loader e para o app)

-- Extensão para gen_random_uuid() (normalmente já existe no Supabase, mas garantimos)
create extension if not exists pgcrypto;

-- Tabela de categorias (referenciada por media.category_id)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabela principal de mídias
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),

  -- dono do registro (mantém compatibilidade com Supabase Auth)
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  description text,

  -- Tipos do seu app
  media_type text not null check (media_type in ('photo', 'video')),
  source_type text not null check (source_type in ('file', 'url')),

  -- Campos legados/úteis (você pode manter mesmo usando Storage)
  file_path text,
  external_url text,
  thumbnail_url text,

  -- Tags legadas (jsonb); vamos manter por compatibilidade e evoluir com media_tags
  tags jsonb not null default '[]'::jsonb,

  category_id uuid references public.categories(id) on delete set null,

  view_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger simples para updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_media_updated_at on public.media;
create trigger trg_media_updated_at
before update on public.media
for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- Índices úteis
create index if not exists idx_media_user_id on public.media(user_id);
create index if not exists idx_media_created_at on public.media(created_at desc);
create index if not exists idx_media_category_id on public.media(category_id);

-- RLS
alter table public.media enable row level security;
alter table public.categories enable row level security;

-- Policies (mantém app navegável; loader com service_role ignora RLS)
-- Media: leitura aberta (ajuste se quiser privado depois)
drop policy if exists "media_select_all" on public.media;
create policy "media_select_all"
on public.media for select
to public
using (true);

drop policy if exists "media_insert_own" on public.media;
create policy "media_insert_own"
on public.media for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "media_update_own" on public.media;
create policy "media_update_own"
on public.media for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "media_delete_own" on public.media;
create policy "media_delete_own"
on public.media for delete
to authenticated
using (auth.uid() = user_id);

-- Categories: leitura aberta, escrita somente autenticado (ajuste conforme sua regra)
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all"
on public.categories for select
to public
using (true);

drop policy if exists "categories_write_authenticated" on public.categories;
create policy "categories_write_authenticated"
on public.categories for all
to authenticated
using (true)
with check (true);
