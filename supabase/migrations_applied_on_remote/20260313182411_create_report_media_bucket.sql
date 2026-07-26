-- Migration: Create internal storage bucket for report media and configure its RLS policies

-- 1. Create the report_media bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('report_media', 'report_media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Ensure RLS is enabled for storage.objects
-- Removed because Supabase manages this automatically and it causes permission errors.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Allow authenticated users to upload files to the report_media bucket
CREATE POLICY "Authenticated users can upload to report_media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'report_media');

-- 3. Allow authenticated users to view files in the report_media bucket
CREATE POLICY "Authenticated users can read from report_media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'report_media');

-- 4. Allow authenticated users to update files in the report_media bucket (e.g., upsert)
CREATE POLICY "Authenticated users can update report_media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'report_media')
WITH CHECK (bucket_id = 'report_media');

-- 5. Allow authenticated users to delete files in the report_media bucket
CREATE POLICY "Authenticated users can delete from report_media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report_media');
