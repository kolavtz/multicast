# Testing Guide - Multicast Video Poster

This guide covers testing the omnichannel video posting application across TikTok, Facebook, Instagram, and YouTube.

## Prerequisites
- All platforms configured with OAuth apps and credentials in `.env.local`
- At least one test video (MP4, under 500MB)
- Test accounts on each platform with publishing permissions

## Unit Tests

### Running Tests
```bash
npm run dev  # Start dev server first
# In another terminal:
node tests/encryption_node.js
npx ts-node tests/minimal_test.ts
npx ts-node tests/advanced_test.ts
```

## Integration Testing

### 1. Authentication Flow
**Test:** User signup and login
1. Go to http://localhost:3000/login
2. Sign up with email/password
3. Verify profile created in `profiles` table
4. Verify workspace created in `workspaces` table
5. Log in with same credentials
6. Should redirect to `/dashboard`

### 2. YouTube OAuth Integration
**Test:** Connect YouTube account
1. Navigate to `/dashboard/connections`
2. Click "🎥 YouTube"
3. Sign in with Google/YouTube account
4. Grant permissions (YouTube upload, read)
5. Should redirect back with "Account connected successfully!" message
6. Verify account appears in "Active Accounts" with platform "youtube"
7. Check `connected_accounts` table - tokens should be encrypted

**Test:** Token Refresh
- Manually set `token_expires_at` to past date in DB
- Post video and wait for jobs-runner to execute
- Should auto-refresh token before uploading
- Check `updated_at` timestamp changed

### 3. Facebook OAuth Integration
**Test:** Connect Facebook
1. Click "📘 Facebook" on connections page
2. Sign in with Facebook account that owns a page
3. Verify connected account with platform "facebook"
4. Verify `external_id` is the page ID

### 4. Instagram Business OAuth Integration
**Test:** Connect Instagram Business
1. Click "📷 Instagram" on connections page
2. Sign in with Facebook account (must have Instagram Business account)
3. Should fetch linked Instagram Business account
4. Verify connected account with platform "instagram"

### 5. TikTok OAuth Integration
**Test:** Connect TikTok
1. Click "🎵 TikTok" on connections page
2. Sign in with TikTok account
3. Grant permissions (user info, video upload)
4. Verify connected account with platform "tiktok"
5. Check `external_id` is user's open_id

### 6. Video Upload Flow - YouTube
**Test:** Post to YouTube
1. Go to `/dashboard/create-post`
2. Upload test video (MP4)
3. Enter title: "Test Video - [timestamp]"
4. Enter caption: "Testing omnichannel posting"
5. Select YouTube account only
6. Set schedule to 2 minutes in future
7. Click "Schedule Post"
8. Check `/dashboard/history` - job should appear as "queued"
9. Trigger jobs-runner (wait or manually call via curl):
   ```bash
   curl -X POST http://localhost:54321/functions/v1/jobs-runner \
     -H "Authorization: Bearer $(supabase secrets get SUPABASE_SERVICE_ROLE_KEY)" \
     -H "Content-Type: application/json"
   ```
10. Job should progress: queued → processing → success
11. Verify video appears on YouTube channel
12. Check `logs` field in job contains upload steps

### 7. Video Upload Flow - Facebook
**Test:** Post to Facebook Page
1. Schedule post with Facebook account only (similar to YouTube test)
2. Wait for jobs-runner
3. Job should succeed with `platform_post_id` set
4. Verify video appears on Facebook page

### 8. Video Upload Flow - Instagram Reels
**Test:** Post to Instagram as Reel
1. Schedule post with Instagram account only
2. Note: Instagram processing is async - job polls status
3. Wait for jobs-runner (may take longer - 5 min max)
4. Once success, verify Reel appears on Instagram profile
5. Check logs for `instagram_container` and `instagram_success` steps

### 9. Video Upload Flow - TikTok
**Test:** Post to TikTok
1. Schedule post with TikTok account only
2. Wait for jobs-runner
3. Job should progress through upload phases
4. Once success, verify video on TikTok profile
5. Check logs for upload progress steps

### 10. Multi-Platform Simultaneous Posting
**Test:** Post to all 4 platforms at once
1. Connect all 4 platforms (YouTube, Facebook, Instagram, TikTok)
2. Go to create post page
3. Select all 4 accounts
4. Schedule with title: "Multi-Platform Test"
5. Should create 4 separate jobs
6. Trigger jobs-runner
7. All 4 jobs should process concurrently
8. All should succeed
9. Verify video on all 4 platforms

### 11. Error Handling & Retry Logic
**Test:** Simulate API failure and retry
1. Schedule a post
2. Manually update job status to trigger error:
   ```sql
   UPDATE publish_jobs 
   SET status = 'processing', attempt_count = 1
   WHERE id = 'job-id'
   ```
3. Trigger jobs-runner with mock API failure
4. Job should be retried with exponential backoff (2min, 8min, 32min)
5. `attempt_count` should increment
6. `last_error` should contain error message with timestamp
7. After 3 attempts, job should be marked `failed`

### 12. Dashboard Overview
**Test:** Dashboard stats update
1. Create 3 posts
2. Schedule 2 of them
3. Connect 2 accounts
4. Go to `/dashboard`
5. Verify stats show:
   - Total Posts: 3
   - Scheduled: 2
   - Connected Accounts: 2

### 13. Job History
**Test:** Job history displays correctly
1. Create and schedule posts to different platforms
2. Trigger jobs-runner for some to succeed
3. Go to `/dashboard/history`
4. Should see:
   - Queued jobs with clock icon
   - Processing jobs with spinner
   - Successful jobs with checkmark
   - Failed jobs with X icon
   - Correct platform and account info
   - Timestamps
   - Error messages (if any)

### 14. File Validation
**Test:** Validate upload requirements
1. Try uploading non-video file → should error
2. Try uploading >500MB file → should error
3. Try scheduling in past → should error
4. Try scheduling without account → should error
5. Try with empty caption → should allow

### 15. Token Expiration & Refresh
**Test:** Automatic token refresh
1. Connect YouTube account
2. Manually set `token_expires_at` to 3 minutes from now
3. Create and schedule a post
4. Trigger jobs-runner before token expires
5. Should complete without token refresh
6. Set `token_expires_at` to 1 minute from now
7. Schedule another post
8. Trigger jobs-runner after 5 minutes (token expired)
9. Should auto-refresh token during upload
10. Upload should still succeed

## Performance Testing

### Concurrent Upload Testing
```bash
# Create 10 posts scheduled at the same time
for i in {1..10}; do
  # Schedule post script
done

# Run jobs-runner with batch_size=5
# Should process 5 concurrently, then 5 more
```

### Large File Testing
- Test with 500MB video
- Verify resumable upload works for YouTube
- Check timeout handling

## Cleanup

### Reset Database for Testing
```sql
-- Delete all jobs
DELETE FROM publish_jobs;

-- Delete all posts
DELETE FROM posts;

-- Delete all media assets
DELETE FROM media_assets;

-- Delete all connected accounts
DELETE FROM connected_accounts;

-- Clear storage
-- (Use Supabase Studio UI for storage cleanup)
```

### Reset OAuth Connections
- Revoke app permissions from each platform's settings
- Delete from `connected_accounts` table
- Re-authenticate from `/dashboard/connections`

## Known Issues & Limitations

1. **Instagram Processing Delay**: Instagram videos take longer to process (max 5 minutes in current implementation)
2. **TikTok Sandbox**: If using TikTok sandbox/test account, posting may require additional setup
3. **Facebook Page Token**: Currently uses user token - for production, should implement page-specific tokens
4. **Rate Limiting**: Each platform has rate limits - test with reasonable delays between uploads
5. **Storage Path**: Media storage uses `{user_id}/{timestamp}.{ext}` - ensure unique filenames

## Debugging

### Enable Verbose Logging
1. Check Edge Function logs:
   ```bash
   supabase functions logs oauth-callback --follow
   supabase functions logs jobs-runner --follow
   ```

2. Browser console for frontend errors
3. Check Supabase Studio "Logs" tab for all database operations

### Common Errors

**"Token refresh failed: invalid_grant"**
- OAuth app credentials invalid
- Token was revoked on platform
- Solution: Re-authenticate account

**"No Instagram Business Account linked"**
- User's Facebook account doesn't have Instagram Business account
- Solution: Link Instagram account in Facebook settings first

**"Video upload timeout"**
- Network issue or very large file
- Platform API slow
- Solution: Increase timeout or split video

**"Storage path not found"**
- Video was deleted between job scheduling and execution
- Solution: Implement cleanup for old media assets

## Success Criteria

All tests passed when:
- ✅ All 4 platforms authenticate successfully
- ✅ Videos upload to all platforms without errors
- ✅ Multi-platform posting works simultaneously
- ✅ Token refresh happens automatically when needed
- ✅ Retry logic works with exponential backoff
- ✅ Dashboard shows correct stats
- ✅ Job history displays all jobs with correct statuses
- ✅ Error messages are clear and actionable
