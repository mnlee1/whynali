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

interface SearchBarProps {
    value: string
    onChange: (value: string) => void
    onSearch?: () => void
    placeholder?: string
}

export default function SearchBar({ value, onChange, onSearch, placeholder = '이슈 검색...' }: SearchBarProps) {
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
                className="w-full pl-3 pr-10 py-2 text-sm border border-neutral-200 rounded-md bg-white focus:outline-none focus:border-neutral-400"
            />
            <button
                type="button"
                onClick={onSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
                aria-label="검색"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </button>
        </div>
    )
}
