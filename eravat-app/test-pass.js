import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const email = 'admin@eravat.app'; // example, let's just create a new user instead
  console.log("Creating test user...");
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
     email: 'test_pass_' + Date.now() + '@eravat.app',
     password: 'oldpassword123'
  });
  if (signUpError) {
      console.error("Sign up error:", signUpError.message);
      return;
  }
  
  console.log("Logged in:", signUpData.user.id);
  
  // Try changing password
  console.log("Changing password...");
  const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password: 'newpassword456'
  });
  
  if (updateError) {
      console.error("Update password failed:", updateError.message);
  } else {
      console.log("Update password succeeded!");
      
      // Verify login with new password
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: signUpData.user.email,
          password: 'newpassword456'
      });
      if (signInError) {
          console.error("Sign in with new password failed:", signInError.message);
      } else {
          console.log("Sign in with new password succeeded! Change password is fully working natively.");
      }
  }
}
test();
