'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase/client'
import { LayoutDashboard, Share2, PlusSquare, LogOut, Settings, Clock } from 'lucide-react'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [open, setOpen] = useState(true)

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.refresh()
        router.push('/login')
    }

    return (
        <div className="flex h-screen bg-gray-900 text-white">
            {/* Sidebar */}
            <aside className={`${open ? 'w-64' : 'w-20'} duration-300 bg-gray-800 border-r border-gray-700 flex flex-col p-4`}>
                <div className="flex items-center gap-2 mb-8 cursor-pointer" onClick={() => setOpen(!open)}>
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">M</div>
                    {open && <span className="font-bold text-xl">Multicast</span>}
                </div>

                <nav className="flex-1 space-y-2">
                    <NavLink href="/dashboard" icon={<LayoutDashboard size={20} />} label="Overview" open={open} />
                    <NavLink href="/dashboard/connections" icon={<Share2 size={20} />} label="Connections" open={open} />
                    <NavLink href="/dashboard/create-post" icon={<PlusSquare size={20} />} label="Create Post" open={open} />
                    <NavLink href="/dashboard/history" icon={<Clock size={20} />} label="History" open={open} />
                </nav>

                <div className="pt-4 border-t border-gray-700">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 p-3 w-full hover:bg-gray-700 rounded text-red-400 hover:text-red-300 transition"
                    >
                        <LogOut size={20} />
                        {open && <span>Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-8">
                {children}
            </main>
        </div>
    )
}

function NavLink({ href, icon, label, open }: { href: string; icon: React.ReactNode; label: string; open: boolean }) {
    return (
        <Link href={href} className="flex items-center gap-3 p-3 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition">
            {icon}
            {open && <span>{label}</span>}
        </Link>
    )
}
