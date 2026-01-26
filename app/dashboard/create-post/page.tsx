'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { Upload, Calendar, Send } from 'lucide-react'

export default function CreatePostPage() {
    const [file, setFile] = useState<File | null>(null)
    const [caption, setCaption] = useState('')
    const [title, setTitle] = useState('') // For YT
    const [scheduleTime, setScheduleTime] = useState('')
    const [uploading, setUploading] = useState(false)
    const [accounts, setAccounts] = useState<any[]>([])
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
    const router = useRouter()

    useEffect(() => {
        // Fetch accounts
        supabase.from('connected_accounts').select('*').then(({ data }) => {
            if (data) setAccounts(data)
        })
    }, [])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    const toggleAccount = (id: string) => {
        if (selectedAccounts.includes(id)) {
            setSelectedAccounts(selectedAccounts.filter(a => a !== id))
        } else {
            setSelectedAccounts([...selectedAccounts, id])
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        // Validation
        if (!file) {
            alert('Please select a video file.')
            return
        }
        if (selectedAccounts.length === 0) {
            alert('Please select at least one destination account.')
            return
        }
        if (!scheduleTime) {
            alert('Please set a schedule time.')
            return
        }

        // Check if scheduled time is in the future
        const scheduledDate = new Date(scheduleTime)
        const now = new Date()
        if (scheduledDate <= now) {
            alert('Schedule time must be in the future.')
            return
        }

        // Validate file type
        if (!file.type.startsWith('video/')) {
            alert('Please select a valid video file.')
            return
        }

        // Validate file size (max 500MB)
        const maxSize = 500 * 1024 * 1024 // 500MB
        if (file.size > maxSize) {
            alert('Video file must be less than 500MB.')
            return
        }

        setUploading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Not logged in')

            // 1. Upload File
            const fileExt = file.name.split('.').pop()
            const fileName = `${user.id}/${Date.now()}.${fileExt}`
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('media')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) throw uploadError

            // Fetch Workspace ID (simplified)
            const { data: ws, error: wsError } = await supabase.from('workspaces').select('id').eq('owner_id', user.id).single()
            if (wsError || !ws) throw new Error('Workspace not found. Please refresh and try again.')

            // 2. Create Media Asset
            const { data: asset, error: assetError } = await supabase.from('media_assets').insert({
                workspace_id: ws.id,
                storage_path: uploadData.path,
                filename: file.name,
                mime_type: file.type,
                size_bytes: file.size
            }).select().single()

            if (assetError) throw assetError

            // 3. Create Post
            const { data: post, error: postError } = await supabase.from('posts').insert({
                workspace_id: ws.id,
                author_id: user.id,
                title: title || 'Untitled Video',
                caption,
                media_asset_id: asset.id
            }).select().single()

            if (postError) throw postError

            // 4. Create Jobs
            const jobs = selectedAccounts.map(accId => ({
                workspace_id: ws.id,
                post_id: post.id,
                connected_account_id: accId,
                scheduled_at: new Date(scheduleTime).toISOString(),
                status: 'queued'
            }))

            const { error: jobError } = await supabase.from('publish_jobs').insert(jobs)
            if (jobError) throw jobError

            alert(`Post scheduled successfully for ${selectedAccounts.length} platform(s)!`)
            router.push('/dashboard/history')

        } catch (err: any) {
            console.error('Error creating post:', err)
            alert(`Error: ${err.message}`)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Create Post</h1>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Media Upload */}
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center bg-gray-800">
                    <input
                        type="file"
                        accept="video/*"
                        onChange={handleFileChange}
                        className="hidden"
                        id="video-upload"
                    />
                    <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <Upload size={40} className="text-blue-500" />
                        <span className="text-gray-300 font-medium">
                            {file ? file.name : 'Click to upload video'}
                        </span>
                    </label>
                </div>

                {/* Post Details */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Title (YouTube)</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:border-blue-500 outline-none"
                            placeholder="My Awesome Video"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-400">Caption</label>
                        <textarea
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded p-2 focus:border-blue-500 outline-none h-32"
                            placeholder="What's this video about?"
                        />
                    </div>
                </div>

                {/* Schedule */}
                <div>
                    <label className="block text-sm font-medium mb-1 text-gray-400">Schedule Time</label>
                    <div className="flex items-center gap-2 bg-gray-800 p-2 rounded border border-gray-700 w-full">
                        <Calendar size={18} className="text-gray-400" />
                        <input
                            type="datetime-local"
                            value={scheduleTime}
                            onChange={e => setScheduleTime(e.target.value)}
                            className="bg-transparent outline-none w-full text-white scheme-dark"
                        />
                    </div>
                </div>

                {/* Accounts Selection */}
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-400">Destinations</label>
                    <div className="grid grid-cols-2 gap-3">
                        {accounts.map(acc => (
                            <div
                                key={acc.id}
                                onClick={() => toggleAccount(acc.id)}
                                className={`p-3 rounded border cursor-pointer flex items-center gap-3 transition ${selectedAccounts.includes(acc.id)
                                        ? 'bg-blue-900 border-blue-500'
                                        : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                                    }`}
                            >
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${acc.platform === 'youtube' ? 'bg-red-600' : 'bg-blue-600'}`}>
                                    {acc.platform[0].toUpperCase()}
                                </div>
                                <span className="truncate">{acc.display_name}</span>
                            </div>
                        ))}
                        {accounts.length === 0 && <p className="text-sm text-gray-500">No connected accounts.</p>}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={uploading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {uploading ? 'Uploading...' : <><Send size={20} /> Schedule Post</>}
                </button>
            </form>
        </div>
    )
}
