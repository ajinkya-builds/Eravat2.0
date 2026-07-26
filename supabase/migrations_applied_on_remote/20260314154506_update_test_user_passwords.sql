-- Update passwords for all test users (emails ending with @eravat-test.com)
-- This sets the password to 'Test123!@#' for all test accounts
-- WARNING: Only run this on development/test environments, NEVER on production!

DO $$
DECLARE
  test_user RECORD;
BEGIN
  FOR test_user IN
    SELECT id, email
    FROM auth.users
    WHERE email LIKE '%@eravat-test.com'
  LOOP
    -- Update the password using Supabase's internal password hashing
    -- Using extensions.crypt with extensions.gen_salt for proper schema
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt('Test123!@#', extensions.gen_salt('bf')),
      updated_at = now()
    WHERE id = test_user.id;

    RAISE NOTICE 'Updated password for test user: %', test_user.email;
  END LOOP;

  RAISE NOTICE 'Password update complete for all @eravat-test.com users';
END $$;
