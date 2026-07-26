-- Enforce unique phone numbers in profiles table.
-- Uses a functional index on digits-only phone to prevent duplicates
-- regardless of formatting (e.g. "+91 98765 43210" vs "9876543210").
-- NULL and empty phone values are excluded so multiple users can exist without a phone.

CREATE UNIQUE INDEX idx_profiles_phone_unique
ON public.profiles (regexp_replace(phone, '\D', '', 'g'))
WHERE phone IS NOT NULL AND phone != '';
