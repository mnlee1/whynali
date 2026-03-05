/**
 * components/search/SearchHeader.tsx
 *
 * [검색 페이지 헤더]
 *
 * 검색 페이지 상단의 검색바와 제목을 포함합니다.
 * initialQuery가 변경되면 자동으로 검색어를 업데이트합니다.
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import SearchBar from '@/components/common/SearchBar'

interface SearchHeaderProps {
    initialQuery?: string
}

export default function SearchHeader({ initialQuery = '' }: SearchHeaderProps) {
    const [query, setQuery] = useState(initialQuery)
    const router = useRouter()

    useEffect(() => {
        setQuery(initialQuery)
    }, [initialQuery])

    const handleSearch = () => {
        if (query.trim().length >= 2) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`)
        }
    }

    return (
        <div className="mb-6">
            <h1 className="text-2xl font-bold mb-4">검색</h1>
            <SearchBar
                value={query}
                onChange={setQuery}
                onSearch={handleSearch}
                placeholder="이슈 검색..."
            />
        </div>
    )
}
