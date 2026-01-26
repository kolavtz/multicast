
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encrypt } from '../_shared/encryption.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        const stateStr = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) throw new Error(`OAuth Error: ${error}`);
        if (!code || !stateStr) throw new Error('Missing code or state');

        const state = JSON.parse(stateStr);
        const { platform, workspace_id } = state;

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        let tokens: any = {};
        let externalId = '';
        let name = '';
        let picture = '';

        if (platform === 'youtube') {
            const tokenResp = await fetch(Deno.env.get('YOUTUBE_TOKEN_URI')!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: Deno.env.get('YOUTUBE_CLIENT_ID')!,
                    client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET')!,
                    redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`,
                    grant_type: 'authorization_code',
                })
            });
            const tokenData = await tokenResp.json();
            if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);
            tokens = tokenData;

            const userResp = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo`, {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
            });
            const userData = await userResp.json();
            externalId = userData.id;
            name = userData.email;
            picture = userData.picture;

        } else if (platform === 'facebook') {
            const clientId = Deno.env.get('FACEBOOK_CLIENT_ID');
            const clientSecret = Deno.env.get('FACEBOOK_CLIENT_SECRET');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;

            const tokenResp = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${clientId}&redirect_uri=${redirectUri}&client_secret=${clientSecret}&code=${code}`);
            const tokenData = await tokenResp.json();
            if (tokenData.error) throw new Error(tokenData.error.message);
            tokens = tokenData;

            const meResp = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${tokens.access_token}`);
            const meData = await meResp.json();
            externalId = meData.id;
            name = meData.name;
            picture = meData.picture?.data?.url;

        } else if (platform === 'tiktok') {
            const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
            const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;

            const params = new URLSearchParams();
            params.append('client_key', clientKey!);
            params.append('client_secret', clientSecret!);
            params.append('code', code);
            params.append('grant_type', 'authorization_code');
            params.append('redirect_uri', redirectUri);

            const tokenResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });
            const tokenData = await tokenResp.json();
            if (tokenData.error) throw new Error(tokenData.error_description);
            tokens = tokenData;

            externalId = tokens.open_id;
            name = 'TikTok User';
        } else if (platform === 'instagram') {
            // Instagram uses Facebook OAuth
            const clientId = Deno.env.get('FACEBOOK_CLIENT_ID');
            const clientSecret = Deno.env.get('FACEBOOK_CLIENT_SECRET');
            const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;

            const tokenResp = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${clientId}&redirect_uri=${redirectUri}&client_secret=${clientSecret}&code=${code}`);
            const tokenData = await tokenResp.json();
            if (tokenData.error) throw new Error(tokenData.error.message);
            tokens = tokenData;

            // Get Instagram Business Account
            const accountsResp = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${tokens.access_token}`);
            const accountsData = await accountsResp.json();
            
            if (accountsData.data && accountsData.data.length > 0) {
                // Get first page's Instagram Business Account
                const pageId = accountsData.data[0].id;
                const igResp = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${tokens.access_token}`);
                const igData = await igResp.json();
                
                if (igData.instagram_business_account) {
                    externalId = igData.instagram_business_account.id;
                    name = accountsData.data[0].name;
                } else {
                    throw new Error('No Instagram Business Account linked to Facebook Page');
                }
            } else {
                throw new Error('No Facebook Pages found');
            }
        }

        // Encrypt Tokens
        const accessTokenEnc = await encrypt(tokens.access_token);
        const refreshTokenEnc = tokens.refresh_token ? await encrypt(tokens.refresh_token) : null;

        // Store
        const { error: dbError } = await supabaseClient
            .from('connected_accounts')
            .upsert({
                workspace_id,
                platform,
                external_id: externalId,
                display_name: name,
                picture_url: picture,
                access_token_encrypted: accessTokenEnc,
                refresh_token_encrypted: refreshTokenEnc,
                token_expires_at: tokens.expires_in ? new Date(Date.now() + (tokens.expires_in * 1000)).toISOString() : null,
                scopes: tokens.scope ? (typeof tokens.scope === 'string' ? tokens.scope.split(/[\s,]+/) : tokens.scope) : [],
                updated_at: new Date().toISOString()
            }, { onConflict: 'workspace_id, platform, external_id' });

        if (dbError) throw dbError;

        return Response.redirect(`${Deno.env.get('FRONTEND_URL') ?? 'http://localhost:3000'}/dashboard/connections?status=success`, 302);

    } catch (error) {
        return Response.redirect(`${Deno.env.get('FRONTEND_URL') ?? 'http://localhost:3000'}/dashboard/connections?status=error&message=${encodeURIComponent(error.message)}`, 302);
    }
})
