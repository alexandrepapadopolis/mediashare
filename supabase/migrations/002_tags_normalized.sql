-- 002_tags_normalized.sql
-- Normaliza tags em tabelas próprias e cria relacionamento N:N com public.media.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  full_path text not null,
  created_at timestamptz not null default now()
);

-- Uma tag hierárquica deve ser única
create unique index if not exists uq_tags_full_path on public.tags (full_path);

-- Cria media_tags somente se public.media existir
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'media'
  ) then
    create table if not exists public.media_tags (
      media_id uuid not null references public.media(id) on delete cascade,
      tag_id uuid not null references public.tags(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (media_id, tag_id)
    );

    create index if not exists idx_media_tags_tag_id on public.media_tags (tag_id);
    create index if not exists idx_media_tags_media_id on public.media_tags (media_id);
  end if;
end $$;


-- (Opcional) Se você quiser permitir consulta fácil de tags por mídia:
-- create view public.v_media_with_tags as
-- select
--   m.*,
--   coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'full_path', t.full_path))
--            filter (where t.id is not null), '[]'::jsonb) as tags_normalized
-- from public.media m
-- left join public.media_tags mt on mt.media_id = m.id
-- left join public.tags t on t.id = mt.tag_id
-- group by m.id;
