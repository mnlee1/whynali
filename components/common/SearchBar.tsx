/**
 * components/common/SearchBar.tsx
 *
 * [검색바 공통 컴포넌트]
 *
 * 이슈 검색을 위한 input 컴포넌트입니다.
 * 오른쪽에 돋보기 아이콘 버튼이 포함되어 있습니다.
 *
 * 사용 예시:
 *   <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} />
 */

'use client'

import { Search } from 'lucide-react'

interface SearchBarProps {
    value: string
    onChange: (value: string) => void
    onSearch?: () => void
    placeholder?: string
}

export default function SearchBar({ value, onChange, onSearch, placeholder = '이슈 검색' }: SearchBarProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && onSearch) {
            onSearch()
        }
    }

    return (
        <div className="relative">
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-3 pr-10 py-2 text-sm border border-border rounded-lg bg-white text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary transition-colors"
            />
            <button
                type="button"
                onClick={onSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
                aria-label="검색"
            >
                <Search className="w-4 h-4" strokeWidth={2} />
            </button>
        </div>
    )
}
