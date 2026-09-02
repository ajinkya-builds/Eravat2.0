-- Public bucket for staging APK + update manifest (read-only for clients).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-updates',
  'app-updates',
  true,
  52428800,
  ARRAY['application/vnd.android.package-archive', 'application/json', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read app-updates" ON storage.objects;
CREATE POLICY "Public read app-updates"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'app-updates');

DROP POLICY IF EXISTS "Service role write app-updates" ON storage.objects;
CREATE POLICY "Service role write app-updates"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'app-updates')
  WITH CHECK (bucket_id = 'app-updates');
