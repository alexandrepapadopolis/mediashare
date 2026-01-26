
  create policy "media: storage admin can manage objects"
  on "storage"."objects"
  as permissive
  for all
  to supabase_storage_admin
using ((bucket_id = 'media'::text))
with check ((bucket_id = 'media'::text));



  create policy "media: users can delete their files"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'media'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));



  create policy "media: users can read their files"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'media'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));



  create policy "media: users can update their files"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'media'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)))
with check (((bucket_id = 'media'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));



  create policy "media: users can upload to their folder"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'media'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));



  create policy "storage thumbnails insert (owner)"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'media'::text) AND (name ~~ 'thumbnails/%'::text) AND ((auth.uid())::text = split_part(name, '/'::text, 2))));


  create policy "storage thumbnails update (owner)"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'media'::text) AND (name ~~ 'thumbnails/%'::text) AND ((auth.uid())::text = split_part(name, '/'::text, 2))))
with check (((bucket_id = 'media'::text) AND (name ~~ 'thumbnails/%'::text) AND ((auth.uid())::text = split_part(name, '/'::text, 2))));

  create policy "storage thumbnails delete (owner)"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'media'::text) AND (name ~~ 'thumbnails/%'::text) AND ((auth.uid())::text = split_part(name, '/'::text, 2))));

  create policy "storage thumbnails select (public)"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'media'::text) AND (name ~~ 'thumbnails/%'::text)));



