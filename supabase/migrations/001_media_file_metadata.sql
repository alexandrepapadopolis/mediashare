-- 001_media_file_metadata.sql
-- Extende public.media para suportar ingestão automática via Storage + metadados de filesystem.

alter table if exists public.media
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists fs_created_at timestamptz,
  add column if not exists fs_modified_at timestamptz,
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists checksum_sha256 text,
  add column if not exists storage_bucket text,
  add column if not exists storage_object_path text,
  add column if not exists directory_relpath text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Índices recomendados (performance em listagens, dedupe e busca por objeto)
-- Índices recomendados (criar somente se a tabela existir)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'media'
  ) then
    create index if not exists idx_media_uploaded_at on public.media (uploaded_at desc);
    create index if not exists idx_media_checksum_sha256 on public.media (checksum_sha256);
    create index if not exists idx_media_storage_object on public.media (storage_bucket, storage_object_path);
  end if;
end $$;

-- Opcional: garantir que, quando source_type = 'file', exista referência ao objeto no Storage
-- (Deixe comentado se você ainda está em transição / legado com file_path.)
-- alter table public.media
--   add constraint media_storage_ref_chk
--   check (
--     source_type <> 'file'
--     or (storage_bucket is not null and storage_object_path is not null)
--   );
