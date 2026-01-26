'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { CheckCircle, XCircle, Clock, Loader } from 'lucide-react'

export default function HistoryPage() {
    const [jobs, setJobs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadJobs() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Fetch jobs with post and account details
            const { data, error } = await supabase
                .from('publish_jobs')
                .select(`
          *,
          posts ( title, caption ),
          connected_accounts ( platform, display_name )
        `)
                .order('scheduled_at', { ascending: false })

            if (data) setJobs(data)
            setLoading(false)
        }
        loadJobs()
    }, [])

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return <CheckCircle className="text-green-500" size={20} />
            case 'failed': return <XCircle className="text-red-500" size={20} />
            case 'processing': return <Loader className="text-blue-500 animate-spin" size={20} />
            default: return <Clock className="text-gray-500" size={20} />
        }
    }

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Job History</h1>
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="p-4">Status</th>
                            <th className="p-4">Post</th>
                            <th className="p-4">Platform</th>
                            <th className="p-4">Scheduled</th>
                            <th className="p-4">Message</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {jobs.map(job => (
                            <tr key={job.id} className="hover:bg-gray-750">
                                <td className="p-4 flex items-center gap-2 capitalize">
                                    {getStatusIcon(job.status)} {job.status}
                                </td>
                                <td className="p-4">
                                    <p className="font-semibold truncate w-48">{job.posts?.title || 'Untitled'}</p>
                                    <p className="text-xs text-gray-500 truncate w-48">{job.posts?.caption}</p>
                                </td>
                                <td className="p-4 flex items-center gap-2">
                                    <span className="capitalize bg-gray-700 px-2 py-1 rounded text-xs">{job.connected_accounts?.platform}</span>
                                    <span className="text-sm text-gray-400">{job.connected_accounts?.display_name}</span>
                                </td>
                                <td className="p-4 text-sm text-gray-400">
                                    {new Date(job.scheduled_at).toLocaleString()}
                                </td>
                                <td className="p-4 text-sm text-red-400 max-w-xs truncate">
                                    {job.last_error}
                                </td>
                            </tr>
                        ))}
                        {!loading && jobs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-gray-500">
                                    No jobs found.
                                </td>
                            </tr>
                        )}
                        {loading && (
                            <tr><td colSpan={5} className="p-8 text-center">Loading...</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
