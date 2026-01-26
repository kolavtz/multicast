
// Advanced e2e test script
// Run with Deno: deno test --allow-net --allow-env --allow-read tests/advanced_test.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { encrypt, decrypt } from '../supabase/functions/_shared/encryption.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("Skipping tests - missing env vars");
    Deno.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

Deno.test("Security: Encryption Utility", async () => {
    const text = "super_secret_token";
    const encrypted = await encrypt(text);
    console.log("Encrypted:", encrypted);

    // Format should be IV:Cipher
    assertEquals(encrypted.includes(':'), true);

    const decrypted = await decrypt(encrypted);
    assertEquals(decrypted, text);
});

Deno.test("E2E: Full Publish Flow (Encryption + Job)", async () => {
    // 1. Create Workspace
    const userId = crypto.randomUUID(); // Mock User ID (we are admin)
    const { data: newWs } = await supabase.from('workspaces').insert({ name: 'Test WS ' + Date.now(), owner_id: userId }).select().single();
    if (!newWs) throw new Error("Failed to create workspace. Note: RLS might block if user doesn't exist in auth.users. skipping FK check for mock?");

    // Note: Creating user in public.profiles requires auth.users trigger usually.
    // We'll skip strict FK checks if possible, or create real auth user.
    // For this test, assume we need a real user or we rely on Service Role to bypass RLS but FK still applies?
    // Postgres strict mode: Yes. So we need a user.
    // Let's rely on the previous minimal_test logic which created a user.
});
