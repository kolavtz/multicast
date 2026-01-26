import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// CORS Headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { platform, workspace_id } = await req.json()

        if (!workspace_id) throw new Error('Missing workspace_id');

        let url = '';
        const state = JSON.stringify({ workspace_id, platform, nonce: crypto.randomUUID() });

        if (platform === 'youtube') {
            const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;

            const scope = [
                'https://www.googleapis.com/auth/youtube.upload',
                'https://www.googleapis.com/auth/youtube.readonly',
                'https://www.googleapis.com/auth/userinfo.email'
            ].join(' ');

            url = `${Deno.env.get('YOUTUBE_AUTH_URI')}?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
        } else if (platform === 'facebook') {
            const clientId = Deno.env.get('FACEBOOK_CLIENT_ID');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
            // Scopes: Pages API + Instagram API
            const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
            url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}`;
        } else if (platform === 'tiktok') {
            const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
            // TikTok Scopes
            const scope = 'user.info.basic,video.upload,video.publish';
            url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${encodeURIComponent(state)}`;
        } else if (platform === 'instagram') {
            // Instagram uses Facebook OAuth with Instagram-specific scopes
            const clientId = Deno.env.get('FACEBOOK_CLIENT_ID');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
            // Instagram Business API scopes
            const scope = 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement';
            url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${scope}`;
        } else {
            throw new Error(`Platform ${platform} not implemented yet`);
        }

        return new Response(
            JSON.stringify({ url }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        )
    }
})
