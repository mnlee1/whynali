'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar() {
    const [query, setQuery] = useState('')
    const router = useRouter()

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query)}`)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="w-full md:w-auto">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="지금 이슈 검색"
                className="w-full md:w-40 px-3 py-1.5 text-sm border border-neutral-200 rounded-md bg-neutral-50 focus:outline-none focus:border-neutral-400 focus:bg-white"
            />
        </form>
    )
}
