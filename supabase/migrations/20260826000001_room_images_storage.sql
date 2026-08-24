-- Storage bucket לתמונות חדרים. ציבורי לקריאה (תמונות שיווקיות, לא רגישות),
-- כתיבה רק לאדמין. ר' baclinica-status: "תמונות 10 החדרים ריקות".

insert into storage.buckets (id, name, public)
values ('room-images', 'room-images', true)
on conflict (id) do nothing;

create policy "room_images_public_read"
  on storage.objects for select
  using (bucket_id = 'room-images');

create policy "room_images_admin_write"
  on storage.objects for insert
  with check (bucket_id = 'room-images' and is_admin());

create policy "room_images_admin_update"
  on storage.objects for update
  using (bucket_id = 'room-images' and is_admin());

create policy "room_images_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'room-images' and is_admin());
