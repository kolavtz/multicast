insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "Workspace Access"
  on storage.objects for all
  using (
      bucket_id = 'media' 
      and exists (
        select 1 from public.workspace_members
        where workspace_members.user_id = auth.uid()
        -- In a real app, strict path validation matching workspace_id is needed.
        -- e.g. path starts with workspace_id or user_id
      )
  );

-- For scaffold: Allow authenticated users to upload to their own folder (user_id/...)
create policy "Users can upload own media"
  on storage.objects for insert
  with check (
      bucket_id = 'media' 
      and auth.role() = 'authenticated'
      and (storage.foldername(name))[1] = auth.uid()::text
  );
  
create policy "Users can view own media"
  on storage.objects for select
  using (
      bucket_id = 'media'
      and auth.role() = 'authenticated'
      and (storage.foldername(name))[1] = auth.uid()::text
  );
