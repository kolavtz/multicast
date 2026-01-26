# Multicast - Production Runbook

## 1. Project Setup (Local Development)

### Prerequisites
- Node.js 18+ (Verified)
- Supabase CLI (`npm i -g supabase`) - **Required for Backend**
- Deno (`choco install deno`) - **Required for Edge Functions**
- Docker - **Required for Local Supabase**

### Installation
1.  Clone the repo:
    ```bash
    git clone <repo-url>
    cd multicast
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Supabase Initialization
1.  Start local Supabase (or link to cloud project):
    ```bash
    supabase init
    supabase start
    ```
2.  Apply Migrations:
    ```bash
    # (If using local) - Migrations in supabase/migrations are applied automatically on start.
    # To re-apply or push:
    supabase db reset
    ```

### Environment Variables
1.  Copy `.env.example` to `.env.local`:
    ```bash
    cp .env.example .env.local
    ```
2.  Fill in your keys:
    - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase API URL.
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon Key.
    - `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`: Google Console Credentials.
    - `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`: Facebook App Credentials.
    - `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`: TikTok Developer Credentials.
    - `ENCRYPTION_KEY`: Generate with `openssl rand -hex 32`

### Edge Functions
1.  Serve functions locally:
    ```bash
    supabase functions serve --no-verify-jwt
    ```
2.  Update `.env.local` to point any backend calls to localhost if needed, though Next.js calls functions via specific URLs.

### Running Frontend
```bash
npm run dev
```
Visit `http://localhost:3000`.

## 2. Production Deployment

### Database
1.  Link to your Supabase project:
    ```bash
    supabase link --project-ref <your-project-id>
    ```
2.  Push DB schema:
    ```bash
    supabase db push
    ```

### Edge Functions
1.  Set Secrets in Supabase Dashboard (or CLI):
    ```bash
    supabase secrets set YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
    ```
2.  Deploy functions:
    ```bash
    supabase functions deploy oauth-init
    supabase functions deploy oauth-callback
    supabase functions deploy jobs-runner
    ```

### Frontend (Vercel/Netlify)
1.  Connect your repo.
2.  Add Environment Variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3.  Deploy.

## 3. Configuration & OAuth

### Google/YouTube Console
1.  Create Project.
2.  Enable "YouTube Data API v3".
3.  Create OAuth Client ID (Web Application).
4.  Add Redirect URI: `https://<your-project>.supabase.co/functions/v1/oauth-callback` (or your production URL).

### Facebook/Instagram Setup
1.  Create App at https://developers.facebook.com/
2.  Add "Facebook Login" and "Instagram Graph API" products.
3.  Set OAuth Redirect URIs to: `https://<your-project>.supabase.co/functions/v1/oauth-callback`
4.  Get App ID and App Secret from Settings.
5.  For Instagram Business: Link Instagram account to a Facebook Page in your app settings.

### TikTok Setup
1.  Create Developer Account at https://developers.tiktok.com/
2.  Create an App and enable "User Info" and "Video Upload" permissions.
3.  Set OAuth Redirect URI to: `https://<your-project>.supabase.co/functions/v1/oauth-callback`
4.  Get Client Key and Client Secret.

### Job Scheduler (Cron)
1.  In Supabase Dashboard -> Integrations -> Cron (or use SQL pg_cron if enabled).
2.  Schedule the runner:
    ```sql
    select cron.schedule(
      'invoke-job-runner',
      '* * * * *', -- Every minute
      $$
      select
        net.http_post(
            url:='https://<project>.supabase.co/functions/v1/jobs-runner',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_KEY"}'::jsonb,
            body:='{}'::jsonb
        ) as request_id;
      $$
    );
    ```

## 4. Minimal Verification Steps

1.  **Sign Up**: Go to `/login`, create a user.
2.  **Dashboard**: Verify you are redirected to `/dashboard`.
3.  **Connect Accounts**:
    -   Go to `/dashboard/connections`.
    -   Click "Connect YouTube" (or other platform).
    -   Complete OAuth flow.
    -   Verify you return to connections page with "Account connected successfully!" message.
    -   See the connected account listed.
4.  **Create Post**:
    -   Go to `/dashboard/create-post`.
    -   Upload a small MP4 video (less than 500MB).
    -   Enter title and caption.
    -   Select connected account(s).
    -   Set schedule time to 1-2 mins in future.
    -   Click "Schedule Post".
5.  **Verify Job**:
    -   Check `publish_jobs` table in Supabase Studio. Status should be `queued`.
    -   Go to `/dashboard/history` to see the job.
    -   Wait for Cron to trigger (or manually invoke the jobs-runner function via curl).
    -   Reload table. Status should change `processing` -> `success`.
    -   Check the platform (YouTube, Facebook, Instagram, TikTok) for the uploaded video.
