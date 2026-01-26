'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'

export default function DashboardPage() {
    const [stats, setStats] = useState({ totalPosts: 0, scheduled: 0, connectedAccounts: 0 })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadStats() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Get workspace
            const { data: workspace } = await supabase
                .from('workspaces')
                .select('id')
                .eq('owner_id', user.id)
                .single()

            if (!workspace) {
                setLoading(false)
                return
            }

            // Get counts
            const [postsRes, scheduledRes, accountsRes] = await Promise.all([
                supabase.from('posts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
                supabase.from('publish_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('status', 'queued'),
                supabase.from('connected_accounts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id)
            ])

            setStats({
                totalPosts: postsRes.count || 0,
                scheduled: scheduledRes.count || 0,
                connectedAccounts: accountsRes.count || 0
            })
            setLoading(false)
        }

        loadStats()
    }, [])

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Overview</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-gray-400 text-sm font-medium uppercase">Total Posts</h3>
                    <p className="text-3xl font-bold mt-2">{loading ? '...' : stats.totalPosts}</p>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-gray-400 text-sm font-medium uppercase">Scheduled</h3>
                    <p className="text-3xl font-bold mt-2 text-yellow-500">{loading ? '...' : stats.scheduled}</p>
                </div>
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-gray-400 text-sm font-medium uppercase">Connected Accounts</h3>
                    <p className="text-3xl font-bold mt-2 text-blue-500">{loading ? '...' : stats.connectedAccounts}</p>
                </div>
            </div>
        </div>
    )
}
