-- 003_tags_checks.sql (opcional)

alter table public.tags
  add constraint tags_full_path_not_blank_chk
  check (length(trim(full_path)) > 0);

alter table public.tags
  add constraint tags_name_not_blank_chk
  check (length(trim(name)) > 0);
