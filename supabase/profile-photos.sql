-- Add profile photo URL to athlete profiles
alter table public.athlete_profiles
  add column if not exists profile_photo_url text;

-- ───────────────────────────────────────────────────────────
-- MANUAL STEP: Create Supabase Storage bucket in the dashboard
-- ───────────────────────────────────────────────────────────
-- 1. Go to Storage in your Supabase project dashboard
-- 2. Create a new bucket named:  profile-photos
-- 3. Set it to PUBLIC
-- 4. Run the RLS policies below

-- Allow authenticated users to upload their own photo
create policy "Athletes can upload own photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/replace their own photo
create policy "Athletes can update own photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read of all profile photos
create policy "Public can read profile photos"
  on storage.objects for select
  to public
  using (bucket_id = 'profile-photos');
