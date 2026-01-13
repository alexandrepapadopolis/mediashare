-- Base MediaShare domain migration (Supabase CLI)
-- Idempotent + safe for supabase db reset / re-runs

set check_function_bodies = off;

-- Ensure UUID helper exists (gen_random_uuid)
create extension if not exists pgcrypto with schema extensions;

-- =========================
-- PROFILES (private)
-- =========================
create table if not exists public.profiles (
  id uuid not null references auth.users on delete cascade primary key,
  username text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Trigger function to create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username')
  on conflict (id) do update
    set username = excluded.username,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================
-- CATEGORIES
-- =========================
create table if not exists public.categories (
  id uuid not null default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "Categories are viewable by everyone" on public.categories;
create policy "Categories are viewable by everyone"
  on public.categories for select
  using (true);

drop policy if exists "Authenticated users can create categories" on public.categories;
create policy "Authenticated users can create categories"
  on public.categories for insert
  with check (auth.uid() is not null);

-- =========================
-- MEDIA
-- =========================
create table if not exists public.media (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text,
  media_type text not null check (media_type in ('photo', 'video')),
  source_type text not null check (source_type in ('file', 'url')),
  file_path text,
  external_url text,
  thumbnail_url text,
  tags jsonb default '[]'::jsonb,
  category_id uuid references public.categories(id),
  view_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media enable row level security;

drop policy if exists "Media is viewable by everyone" on public.media;
create policy "Media is viewable by everyone"
  on public.media for select
  using (true);

drop policy if exists "Users can create their own media" on public.media;
create policy "Users can create their own media"
  on public.media for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own media" on public.media;
create policy "Users can update their own media"
  on public.media for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own media" on public.media;
create policy "Users can delete their own media"
  on public.media for delete
  using (auth.uid() = user_id);

-- =========================
-- UPDATED_AT trigger helper
-- =========================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_media_updated_at on public.media;
create trigger update_media_updated_at
  before update on public.media
  for each row execute function public.update_updated_at_column();

-- =========================
-- STORAGE: bucket + policies
-- =========================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "Media files are publicly accessible" on storage.objects;
create policy "Media files are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "Authenticated users can upload media" on storage.objects;
create policy "Authenticated users can upload media"
  on storage.objects for insert
  with check (bucket_id = 'media' and auth.uid() is not null);

drop policy if exists "Users can update their own media files" on storage.objects;
create policy "Users can update their own media files"
  on storage.objects for update
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own media files" on storage.objects;
create policy "Users can delete their own media files"
  on storage.objects for delete
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

-- =========================
-- SEED: default categories
-- =========================
insert into public.categories (name, description) values
  ('Natureza', 'Fotos e vídeos da natureza'),
  ('Arquitetura', 'Construções e design arquitetônico'),
  ('Pessoas', 'Retratos e fotos de pessoas'),
  ('Animais', 'Fauna e vida selvagem'),
  ('Arte', 'Arte e criações artísticas'),
  ('Viagens', 'Destinos e experiências de viagem'),
  ('Tecnologia', 'Gadgets e inovações'),
  ('Outros', 'Outras categorias')
on conflict (name) do nothing;
