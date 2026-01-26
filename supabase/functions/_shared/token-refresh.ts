import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encrypt, decrypt } from './encryption.ts'

export async function refreshTokenIfNeeded(
    supabaseClient: SupabaseClient,
    accountId: string
): Promise<string> {
    // Fetch account
    const { data: account, error: fetchError } = await supabaseClient
        .from('connected_accounts')
        .select('*')
        .eq('id', accountId)
        .single()

    if (fetchError || !account) {
        throw new Error('Account not found')
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null
    const now = new Date()
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

    if (!expiresAt || expiresAt > fiveMinutesFromNow) {
        // Token is still valid
        return await decrypt(account.access_token_encrypted)
    }

    // Need to refresh
    console.log(`Refreshing token for account ${accountId} (${account.platform})`)

    if (!account.refresh_token_encrypted) {
        throw new Error('No refresh token available')
    }

    const refreshToken = await decrypt(account.refresh_token_encrypted)
    let newTokens: any = {}

    if (account.platform === 'youtube') {
        const tokenResp = await fetch(Deno.env.get('YOUTUBE_TOKEN_URI')!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: refreshToken,
                client_id: Deno.env.get('YOUTUBE_CLIENT_ID')!,
                client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET')!,
                grant_type: 'refresh_token',
            })
        })

        newTokens = await tokenResp.json()
        if (newTokens.error) {
            throw new Error(`Token refresh failed: ${newTokens.error_description || newTokens.error}`)
        }

    } else if (account.platform === 'facebook' || account.platform === 'instagram') {
        // Facebook/Instagram long-lived token exchange
        const clientId = Deno.env.get('FACEBOOK_CLIENT_ID')
        const clientSecret = Deno.env.get('FACEBOOK_CLIENT_SECRET')
        
        const tokenResp = await fetch(
            `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${await decrypt(account.access_token_encrypted)}`
        )
        
        newTokens = await tokenResp.json()
        if (newTokens.error) {
            throw new Error(`Token refresh failed: ${newTokens.error.message}`)
        }

    } else if (account.platform === 'tiktok') {
        const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY')
        const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET')

        const params = new URLSearchParams()
        params.append('client_key', clientKey!)
        params.append('client_secret', clientSecret!)
        params.append('grant_type', 'refresh_token')
        params.append('refresh_token', refreshToken)

        const tokenResp = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        })

        newTokens = await tokenResp.json()
        if (newTokens.error) {
            throw new Error(`Token refresh failed: ${newTokens.error_description}`)
        }
    }

    // Update account with new tokens
    const accessTokenEnc = await encrypt(newTokens.access_token)
    const refreshTokenEnc = newTokens.refresh_token ? await encrypt(newTokens.refresh_token) : account.refresh_token_encrypted

    const { error: updateError } = await supabaseClient
        .from('connected_accounts')
        .update({
            access_token_encrypted: accessTokenEnc,
            refresh_token_encrypted: refreshTokenEnc,
            token_expires_at: newTokens.expires_in 
                ? new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString()
                : null,
            updated_at: new Date().toISOString()
        })
        .eq('id', accountId)

    if (updateError) {
        throw new Error(`Failed to update tokens: ${updateError.message}`)
    }

    return newTokens.access_token
}
