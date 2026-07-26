-- 1. Fix missing metadata in auth.users
UPDATE auth.users
SET 
  aud = 'authenticated',
  role = 'authenticated',
  instance_id = '00000000-0000-0000-0000-000000000000',
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  last_sign_in_at = COALESCE(last_sign_in_at, now()),
  raw_app_meta_data = '{"provider": "email", "providers": ["email"]}',
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}')
WHERE aud IS NULL OR role IS NULL OR instance_id IS NULL OR raw_app_meta_data IS NULL;

-- 2. Ensure public.profiles exist for these users
INSERT INTO public.profiles (id, first_name, last_name, role, is_active)
SELECT id, 'Seeded', 'User', 'volunteer', true
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- 3. IMPORTANT: Ensure auth.identities exist
-- GoTrue fails with 500 if the identity record is missing during login
INSERT INTO auth.identities (user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT 
    id, 
    jsonb_build_object('sub', id, 'email', email), 
    'email', 
    id::text, 
    now(), 
    now(), 
    now()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM auth.identities)
ON CONFLICT (provider, provider_id) DO NOTHING;
