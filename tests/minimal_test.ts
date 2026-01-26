
// Minimal e2e test script (Run with Deno: deno test --allow-net --allow-env tests/minimal_test.ts)
// Assumes Env vars are set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // Use service key to bypass Auth for test setup

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("Skipping tests - missing env vars");
    Deno.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

Deno.test("E2E: Create Post and Check Job", async () => {
    // 1. Create a Workspce (Mock)
    const { data: user } = await supabase.auth.admin.createUser({ email: `test-${Date.now()}@example.com`, password: 'password123', email_confirm: true });
    assertExists(user.user);
    const userId = user.user.id;

    const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*').eq('owner_id', userId).single();
    // (Trigger might have created it, or we create manual if logic differs)
    let workspaceId = ws?.id;
    if (!workspaceId) {
        const { data: newWs } = await supabase.from('workspaces').insert({ name: 'Test WS', owner_id: userId }).select().single();
        workspaceId = newWs.id;
    }
    assertExists(workspaceId);

    // 2. Insert Connected Account (Mock Tokens)
    const { data: acc, error: accErr } = await supabase.from('connected_accounts').insert({
        workspace_id: workspaceId,
        platform: 'youtube',
        external_id: 'mock_yt_user',
        access_token_encrypted: 'mock_enc_token',
        display_name: 'Test Channel'
    }).select().single();
    if (accErr) console.error(accErr);
    assertExists(acc);

    // 3. Create Post
    const { data: post, error: postErr } = await supabase.from('posts').insert({
        workspace_id: workspaceId,
        author_id: userId,
        title: 'Test Video',
        caption: 'Automated Test'
        // media_asset_id: null (Optional for this test if we skip actual storage upload)
    }).select().single();
    assertExists(post);

    // 4. Create Job
    const { data: job, error: jobErr } = await supabase.from('publish_jobs').insert({
        workspace_id: workspaceId,
        post_id: post.id,
        connected_account_id: acc.id,
        scheduled_at: new Date(Date.now() - 1000).toISOString(), // Past (Due now)
        status: 'queued'
    }).select().single();
    assertExists(job);

    // 5. Invoke Runner (Mock fetch or just verify DB state if we had a runner running)
    // Here we can just call the runner endpoint if we had the service url, but for this test we'll assume manual invoke
    // await fetch(RUNNER_URL, ...);

    // For now, fast forward: Assert job exists in queued state
    const { data: fetchedJob } = await supabase.from('publish_jobs').select('*').eq('id', job.id).single();
    assertEquals(fetchedJob.status, 'queued');

    console.log("Test Setup Complete. Job ID:", job.id);
});
