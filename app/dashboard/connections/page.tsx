'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useSearchParams } from 'next/navigation'

export default function ConnectionsPage() {
    const [accounts, setAccounts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const searchParams = useSearchParams()
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // In a real app, you'd fetch the current workspace_id. 
    // For the scaffold, we'll assume a "default" workspace or fetch the first one.
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)

    useEffect(() => {
        // Check for OAuth callback status
        const status = searchParams.get('status')
        const errorMsg = searchParams.get('message')
        
        if (status === 'success') {
            setMessage({ type: 'success', text: 'Account connected successfully!' })
            setTimeout(() => setMessage(null), 5000)
        } else if (status === 'error') {
            setMessage({ type: 'error', text: errorMsg || 'Failed to connect account' })
            setTimeout(() => setMessage(null), 5000)
        }

        async function init() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Fetch or Create default workspace
            let { data: workspace } = await supabase
                .from('workspaces')
                .select('id')
                .eq('owner_id', user.id)
                .single()

            if (!workspace) {
                // Create one for onboarding
                const { data: newWs } = await supabase.from('workspaces').insert({ name: 'My Workspace', owner_id: user.id }).select().single()
                workspace = newWs
                // Add self as member (trigger handles profile, but we need member record if logic requires it)
                await supabase.from('workspace_members').insert({ workspace_id: newWs.id, user_id: user.id, role: 'owner' })
            }

            if (!workspace) {
                setLoading(false)
                return
            }

            setWorkspaceId(workspace.id)

            // Fetch connected accounts
            const { data: accs } = await supabase
                .from('connected_accounts')
                .select('*')
                .eq('workspace_id', workspace.id)

            setAccounts(accs || [])
            setLoading(false)
        }

        init()
    }, [])

    const handleConnect = async (platform: string) => {
        if (!workspaceId) return

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/oauth-init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, workspace_id: workspaceId })
            })
            const { url, error } = await res.json()
            if (error) throw new Error(error)

            // Redirect to OAuth
            window.location.href = url
        } catch (err: any) {
            alert(err.message)
        }
    }

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Connections</h1>

            {/* Status Message */}
            {message && (
                <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-900/50 border border-green-700 text-green-200' : 'bg-red-900/50 border border-red-700 text-red-200'}`}>
                    {message.text}
                </div>
            )}

            {/* Existing Accounts */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 text-gray-300">Active Accounts</h2>
                {loading ? (
                    <div className="text-gray-500">Loading...</div>
                ) : accounts.length === 0 ? (
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center text-gray-400">
                        No accounts connected yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {accounts.map(acc => {
                            const platformColors: Record<string, string> = {
                                youtube: 'bg-red-600',
                                facebook: 'bg-blue-600',
                                instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
                                tiktok: 'bg-black'
                            };
                            const platformEmojis: Record<string, string> = {
                                youtube: '🎥',
                                facebook: '📘',
                                instagram: '📷',
                                tiktok: '🎵'
                            };
                            return (
                                <div key={acc.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xl ${platformColors[acc.platform] || 'bg-gray-600'}`}>
                                        {platformEmojis[acc.platform] || acc.platform[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold">{acc.display_name || acc.username}</p>
                                        <p className="text-xs text-gray-500 capitalize">{acc.platform}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Connect New */}
            <h2 className="text-xl font-semibold mb-4 text-gray-300">Add Connection</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <button
                    onClick={() => handleConnect('youtube')}
                    className="flex items-center justify-center gap-2 p-4 bg-red-600 hover:bg-red-700 rounded-lg transition font-medium"
                >
                    🎥 YouTube
                </button>
                <button
                    onClick={() => handleConnect('facebook')}
                    className="flex items-center justify-center gap-2 p-4 bg-blue-600 hover:bg-blue-700 rounded-lg transition font-medium"
                >
                    📘 Facebook
                </button>
                <button
                    onClick={() => handleConnect('instagram')}
                    className="flex items-center justify-center gap-2 p-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg transition font-medium"
                >
                    📷 Instagram
                </button>
                <button
                    onClick={() => handleConnect('tiktok')}
                    className="flex items-center justify-center gap-2 p-4 bg-black border border-gray-700 hover:bg-gray-800 rounded-lg transition font-medium"
                >
                    🎵 TikTok
                </button>
            </div>
        </div>
    )
}
