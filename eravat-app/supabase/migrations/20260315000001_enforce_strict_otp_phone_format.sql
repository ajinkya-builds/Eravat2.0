-- Migration: enforce_strict_otp_phone_format
-- Description: Automatically normalizes phone numbers to '91XXXXXXXXXX' format 
--              and creates the necessary auth.identities row so OTP login works
--              instantly for newly created users.

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
        
        -- If it's a 10 digit Indian number, prepend 91 (Twilio Supabase stripped format)
        IF length(normalized_phone) = 10 THEN
            normalized_phone := '91' || normalized_phone;
        -- If it's already 12 digits starting with 91, keep it
        ELSIF length(normalized_phone) = 12 AND normalized_phone LIKE '91%' THEN
            -- already in correct format
        -- If it's 11 digits starting with 0, drop the 0 and add 91
        ELSIF length(normalized_phone) = 11 AND normalized_phone LIKE '0%' THEN
            normalized_phone := '91' || substring(normalized_phone from 2);
        END IF;

        -- 1. OVERRIDE the phone number on the actual auth.users record 
        -- so it perfectly matches the `91XXXXXXXXXX` expected by Twilio/GoTrue.
        NEW.phone := normalized_phone;

        -- 2. AUTO-CONFIRM the phone number so Supabase allows OTP to be sent
        NEW.phone_confirmed_at := COALESCE(NEW.phone_confirmed_at, now());
    END IF;
    
    RETURN NEW;
END;
$$;

-- Trigger 1: BEFORE INSERT/UPDATE to sanitize the phone string and set confirmed_at
DROP TRIGGER IF EXISTS on_auth_user_phone_sanitize ON auth.users;
CREATE TRIGGER on_auth_user_phone_sanitize
    BEFORE INSERT OR UPDATE OF phone
    ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_phone();


-- Trigger 2 function: AFTER INSERT/UPDATE to ensure auth.identities exists
CREATE OR REPLACE FUNCTION public.ensure_phone_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        -- Insert into identities if it doesn't already exist for this exact phone
        -- Supabase requires this row for verifyOtp/signInWithOtp to work for existing users
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at,
            provider_id
        )
        SELECT 
            gen_random_uuid(),
            NEW.id,
            jsonb_build_object(
                'phone', NEW.phone,
                'phone_verified', true,
                'sub', NEW.id::text,
                'email_verified', false
            ),
            'phone',
            now(),
            now(),
            now(),
            NEW.phone
        WHERE NOT EXISTS (
            SELECT 1 FROM auth.identities 
            WHERE user_id = NEW.id AND provider = 'phone'
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger 2: AFTER INSERT/UPDATE
DROP TRIGGER IF EXISTS on_auth_user_create_identity ON auth.users;
CREATE TRIGGER on_auth_user_create_identity
    AFTER INSERT OR UPDATE OF phone
    ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_phone_identity();

-- Trigger 2: AFTER INSERT/UPDATE
DROP TRIGGER IF EXISTS on_auth_user_create_identity ON auth.users;
CREATE TRIGGER on_auth_user_create_identity
    AFTER INSERT OR UPDATE OF phone
    ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_phone_identity();
