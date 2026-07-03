This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
Multicast v1 is an omnichannel video publishing app that lets creators upload a single video once and automatically distribute it to YouTube, TikTok, Instagram, and Facebook.  This README describes what Multicast v1 does, how to set it up, and how to use it for multi-platform posting.

## Overview

Multicast v1 centralizes your short-form and long-form video distribution into one dashboard, replacing separate uploads for each platform with a single workflow.  After connecting your social accounts via OAuth, you can upload a video, add metadata, choose target platforms, and let the jobs runner handle background publishing and retries. 

## Features

- Single video upload, multi-platform posting to YouTube, Facebook Pages, Instagram Reels, and TikTok. 
- OAuth-based account connections with encrypted tokens stored in Supabase tables like `connected_accounts`. 
- Scheduling engine that queues posts for future times and processes them via a jobs-runner edge function.
- Resumable and large-file upload support (up to 500MB) with platform-specific flows, especially for YouTube and Instagram.- Dashboard for stats (total posts, scheduled posts, connected accounts) and detailed job history with statuses and error logs. 
## Tech stack

Multicast v1 is built as a Next.js/Supabase application with TypeScript middleware and edge functions.  Supabase provides authentication, database tables (`profiles`, `workspaces`, `posts`, `publish_jobs`, `media_assets`, `connected_accounts`), storage, and function hosting for `oauth-callback` and `jobs-runner`.  Frontend routes like `/login`, `/dashboard`, `/dashboard/connections`, `/dashboard/create-post`, and `/dashboard/history` power the user experience.

## Getting started

1. Configure OAuth apps for YouTube, TikTok, Facebook, and Instagram; add credentials to `.env.local`.
2. Run the dev server and connect test accounts with publishing permissions through `/dashboard/connections`. 
3. Upload an MP4 (under 500MB) from `/dashboard/create-post`, select platforms, set a schedule, and submit.
4. Trigger the jobs-runner via Supabase (`functions/v1/jobs-runner`) or let it run on schedule to process queued jobs. 
## Reliability & limits

The jobs-runner implements retry logic with exponential backoff and clear error messages for API failures and token issues.  Known limitations include Instagram processing delays, TikTok sandbox constraints, platform rate limits, and the need for proper page/Business account setup on Facebook and Instagram. 
You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
