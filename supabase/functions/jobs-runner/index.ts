
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decrypt } from '../_shared/encryption.ts'
import { refreshTokenIfNeeded } from '../_shared/token-refresh.ts'

serve(async (req) => {
    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch queued jobs (Manual batching + locking simulation)
    // For robustness, we should use a stored procedure to atomic UPDATE...RETURNING
    // But for this MVP, we fetch pending, then mark processing.
    const { data: jobs, error } = await supabaseClient
        .rpc('checkout_due_jobs', { batch_size: 5 });

    if (!jobs || jobs.length === 0) {
        return new Response(JSON.stringify({ message: 'No jobs' }), { headers: { 'Content-Type': 'application/json' } })
    }

    const results = [];

    for (const job of jobs) {
        try {
            console.log(`Processing Job: ${job.id} for ${job.connected_account_id}`);

            // 2. GetData
            const { data: post } = await supabaseClient.from('posts').select('*, media_assets(*)').eq('id', job.post_id).single();
            const { data: account } = await supabaseClient.from('connected_accounts').select('*').eq('id', job.connected_account_id).single();

            // 3. Refresh token if needed
            const accessToken = await refreshTokenIfNeeded(supabaseClient, account.id);

            // 4. Publish Logic
            let platformPostId = '';
            const logs = [];

            // Get Signed URL for media
            const { data: signedUrl } = await supabaseClient.storage.from('media').createSignedUrl(post.media_assets.storage_path, 3600);
            const videoUrl = signedUrl?.signedUrl;

            if (account.platform === 'youtube') {
                // YouTube upload using resumable upload
                logs.push({ step: 'youtube_init', time: new Date().toISOString() });
                
                // Step 1: Initialize resumable upload
                const metadata = {
                    snippet: {
                        title: post.title || 'Untitled Video',
                        description: post.caption || '',
                        categoryId: '22' // People & Blogs
                    },
                    status: {
                        privacyStatus: 'public',
                        selfDeclaredMadeForKids: false
                    }
                };

                const initResp = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'X-Upload-Content-Type': post.media_assets.mime_type || 'video/*'
                    },
                    body: JSON.stringify(metadata)
                });

                if (!initResp.ok) {
                    const errorText = await initResp.text();
                    throw new Error(`YouTube init failed: ${errorText}`);
                }

                const uploadUrl = initResp.headers.get('Location');
                if (!uploadUrl) throw new Error('No upload URL received from YouTube');

                logs.push({ step: 'youtube_upload_url', url: uploadUrl });

                // Step 2: Download video from storage
                const videoResp = await fetch(videoUrl);
                if (!videoResp.ok) throw new Error('Failed to fetch video from storage');
                const videoBlob = await videoResp.blob();

                // Step 3: Upload video content
                const uploadResp = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': post.media_assets.mime_type || 'video/*'
                    },
                    body: videoBlob
                });

                if (!uploadResp.ok) {
                    const errorText = await uploadResp.text();
                    throw new Error(`YouTube upload failed: ${errorText}`);
                }

                const result = await uploadResp.json();
                platformPostId = result.id;
                logs.push({ step: 'youtube_success', videoId: platformPostId });

            } else if (account.platform === 'facebook') {
                // Facebook Page Video Upload
                logs.push({ step: 'facebook_init', time: new Date().toISOString() });

                // Step 1: Initialize upload session
                const initResp = await fetch(`https://graph.facebook.com/v18.0/${account.external_id}/videos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        upload_phase: 'start',
                        access_token: accessToken,
                        file_size: post.media_assets.size_bytes
                    })
                });

                const initData = await initResp.json();
                if (initData.error) throw new Error(initData.error.message);
                
                const uploadSessionId = initData.upload_session_id;
                logs.push({ step: 'facebook_session', sessionId: uploadSessionId });

                // Step 2: Download video
                const videoResp = await fetch(videoUrl);
                if (!videoResp.ok) throw new Error('Failed to fetch video from storage');
                const videoBlob = await videoResp.blob();

                // Step 3: Upload video content
                const formData = new FormData();
                formData.append('upload_phase', 'transfer');
                formData.append('upload_session_id', uploadSessionId);
                formData.append('access_token', accessToken);
                formData.append('video_file_chunk', videoBlob);

                const uploadResp = await fetch(`https://graph.facebook.com/v18.0/${account.external_id}/videos`, {
                    method: 'POST',
                    body: formData
                });

                const uploadData = await uploadResp.json();
                if (uploadData.error) throw new Error(uploadData.error.message);

                // Step 4: Finalize
                const finalizeResp = await fetch(`https://graph.facebook.com/v18.0/${account.external_id}/videos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        upload_phase: 'finish',
                        upload_session_id: uploadSessionId,
                        access_token: accessToken,
                        description: post.caption || '',
                        title: post.title || 'Untitled Video'
                    })
                });

                const finalData = await finalizeResp.json();
                if (finalData.error) throw new Error(finalData.error.message);
                
                platformPostId = finalData.id;
                logs.push({ step: 'facebook_success', videoId: platformPostId });

            } else if (account.platform === 'instagram') {
                // Instagram Video Upload (Reels)
                logs.push({ step: 'instagram_init', time: new Date().toISOString() });

                // Step 1: Create media container
                const containerResp = await fetch(`https://graph.facebook.com/v18.0/${account.external_id}/media`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        media_type: 'REELS',
                        video_url: videoUrl,
                        caption: post.caption || '',
                        access_token: accessToken
                    })
                });

                const containerData = await containerResp.json();
                if (containerData.error) throw new Error(containerData.error.message);
                
                const containerId = containerData.id;
                logs.push({ step: 'instagram_container', containerId });

                // Step 2: Wait for processing (poll status)
                let processingComplete = false;
                let attempts = 0;
                const maxAttempts = 30; // 30 attempts x 10s = 5 minutes max

                while (!processingComplete && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
                    
                    const statusResp = await fetch(`https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${accessToken}`);
                    const statusData = await statusResp.json();
                    
                    if (statusData.status_code === 'FINISHED') {
                        processingComplete = true;
                    } else if (statusData.status_code === 'ERROR') {
                        throw new Error('Instagram video processing failed');
                    }
                    
                    attempts++;
                }

                if (!processingComplete) {
                    throw new Error('Instagram video processing timeout');
                }

                // Step 3: Publish
                const publishResp = await fetch(`https://graph.facebook.com/v18.0/${account.external_id}/media_publish`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        creation_id: containerId,
                        access_token: accessToken
                    })
                });

                const publishData = await publishResp.json();
                if (publishData.error) throw new Error(publishData.error.message);
                
                platformPostId = publishData.id;
                logs.push({ step: 'instagram_success', postId: platformPostId });

            } else if (account.platform === 'tiktok') {
                // TikTok Video Upload
                logs.push({ step: 'tiktok_init', time: new Date().toISOString() });

                // Step 1: Initialize upload
                const initResp = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        post_info: {
                            title: post.title || post.caption || 'Untitled Video',
                            privacy_level: 'PUBLIC_TO_EVERYONE',
                            disable_duet: false,
                            disable_comment: false,
                            disable_stitch: false,
                            video_cover_timestamp_ms: 1000
                        },
                        source_info: {
                            source: 'FILE_UPLOAD',
                            video_size: post.media_assets.size_bytes,
                            chunk_size: post.media_assets.size_bytes,
                            total_chunk_count: 1
                        }
                    })
                });

                const initData = await initResp.json();
                if (initData.error) throw new Error(initData.error.message);
                
                const publishId = initData.data.publish_id;
                const uploadUrl = initData.data.upload_url;
                logs.push({ step: 'tiktok_upload_url', publishId, uploadUrl });

                // Step 2: Download video
                const videoResp = await fetch(videoUrl);
                if (!videoResp.ok) throw new Error('Failed to fetch video from storage');
                const videoBlob = await videoResp.blob();

                // Step 3: Upload video
                const uploadResp = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'video/mp4',
                        'Content-Length': post.media_assets.size_bytes.toString()
                    },
                    body: videoBlob
                });

                if (!uploadResp.ok) {
                    const errorText = await uploadResp.text();
                    throw new Error(`TikTok upload failed: ${errorText}`);
                }

                logs.push({ step: 'tiktok_uploaded', publishId });

                // Step 4: Check status (poll)
                let published = false;
                let attempts = 0;
                const maxAttempts = 30;

                while (!published && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
                    
                    const statusResp = await fetch(`https://open.tiktokapis.com/v2/post/publish/status/fetch/?publish_id=${publishId}`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    const statusData = await statusResp.json();
                    
                    if (statusData.data.status === 'PUBLISH_COMPLETE') {
                        published = true;
                        platformPostId = statusData.data.video_id || publishId;
                    } else if (statusData.data.status === 'FAILED') {
                        throw new Error('TikTok video publishing failed');
                    }
                    
                    attempts++;
                }

                if (!published) {
                    throw new Error('TikTok publishing timeout');
                }

                logs.push({ step: 'tiktok_success', videoId: platformPostId });
            }

            // 5. Success
            await supabaseClient.from('publish_jobs').update({
                status: 'success',
                finished_at: new Date().toISOString(),
                platform_post_id: platformPostId,
                logs: JSON.stringify(logs)
            }).eq('id', job.id);

            results.push({ id: job.id, status: 'success' });

        } catch (err) {
            // 6. Failed - Retry Logic with exponential backoff
            const attempt = (job.attempt_count || 0) + 1;
            const maxAttempts = 3;
            const willRetry = attempt < maxAttempts;
            
            // Exponential backoff: 2min, 8min, 32min
            const backoffMinutes = Math.pow(4, attempt);
            const nextSchedule = willRetry 
                ? new Date(Date.now() + (backoffMinutes * 60000)).toISOString() 
                : job.scheduled_at;

            console.error(`Job ${job.id} failed (attempt ${attempt}/${maxAttempts}):`, err.message);

            await supabaseClient.from('publish_jobs').update({
                status: willRetry ? 'queued' : 'failed',
                scheduled_at: nextSchedule,
                attempt_count: attempt,
                last_error: `[${new Date().toISOString()}] ${err.message}`,
                finished_at: willRetry ? null : new Date().toISOString()
            }).eq('id', job.id);

            results.push({ id: job.id, status: 'failed', error: err.message, willRetry });
        }
    }

    return new Response(
        JSON.stringify({ results }),
        { headers: { 'Content-Type': 'application/json' } },
    )
})
