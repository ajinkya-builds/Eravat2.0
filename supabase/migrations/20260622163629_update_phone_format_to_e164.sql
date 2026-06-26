-- Migration: update_phone_format_to_e164
-- Description: Restores handle_new_user_phone trigger function to strip leading '+' 
--              and normalise phone numbers to '91XXXXXXXXXX' as expected by GoTrue.
--              Also runs data migrations to strip '+' prefix from existing auth.users and auth.identities.

-- 1. Restore the trigger function to strip leading '+' and normalize to '91XXXXXXXXXX'
CREATE OR REPLACE FUNCTION public.handle_new_user_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    normalized_phone text;
BEGIN
    -- Only process if phone is provided
    IF NEW.phone IS NOT NULL THEN
        -- Strip all non-numeric characters to get just the digits
        normalized_phone := regexp_replace(NEW.phone, '\D', '', 'g');
        
        -- If it's a 10 digit Indian number, prepend 91 (Supabase stripped format)
        IF length(normalized_phone) = 10 THEN
            normalized_phone := '91' || normalized_phone;
        -- If it's already 12 digits starting with 91, keep it
        ELSIF length(normalized_phone) = 12 AND normalized_phone LIKE '91%' THEN
            -- already in correct format
        -- If it's 11 digits starting with 0, drop the 0 and add 91
        ELSIF length(normalized_phone) = 11 AND normalized_phone LIKE '0%' THEN
            normalized_phone := '91' || substring(normalized_phone from 2);
        END IF;

        -- OVERRIDE the phone number on the actual auth.users record 
        -- so it perfectly matches the `91XXXXXXXXXX` expected by GoTrue.
        NEW.phone := normalized_phone;

        -- AUTO-CONFIRM the phone number
        NEW.phone_confirmed_at := COALESCE(NEW.phone_confirmed_at, now());
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. Drop and recreate trigger to ensure it is clean
DROP TRIGGER IF EXISTS on_auth_user_phone_sanitize ON auth.users;
CREATE TRIGGER on_auth_user_phone_sanitize
    BEFORE INSERT OR UPDATE OF phone
    ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_phone();

-- 3. Data migration: Sync phone from public.profiles to auth.users if missing in auth.users
-- This ensures seeded E2E users (or manually created users) have their auth.users phone populated
UPDATE auth.users u
SET phone = p.phone
FROM public.profiles p
WHERE p.id = u.id
  AND (u.phone IS NULL OR u.phone = '')
  AND p.phone IS NOT NULL;

-- 4. Data migration: Remove '+' prefix from existing auth.users to match GoTrue format
UPDATE auth.users
SET phone = substring(phone from 2)
WHERE phone IS NOT NULL AND phone LIKE '+%';

-- 5. Data migration: Remove '+' prefix from existing auth.identities to match GoTrue format
UPDATE auth.identities
SET provider_id = substring(provider_id from 2)
WHERE provider = 'phone' AND provider_id LIKE '+%';

-- 6. Data migration: Remove '+' prefix from existing auth.identities.identity_data phone field
UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{phone}', to_jsonb(substring(identity_data->>'phone' from 2)))
WHERE provider = 'phone' AND identity_data->>'phone' LIKE '+%';
