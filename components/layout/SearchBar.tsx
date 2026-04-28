/**
 * components/layout/SearchBar.tsx (Header용 글로벌 검색바)
 *
 * [헤더 검색바 컴포넌트]
 *
 * 헤더에서 사용하는 글로벌 검색바입니다.
 * 포커스 시 인기 검색어 드롭다운을 표시합니다.
 * 상위 이슈에서 2-3개 핵심 단어 조합 키워드를 추출하여 제공합니다.
 * 검색은 OR 조건으로 작동하여 단어 중 하나라도 포함되면 검색됩니다.
 * 클릭 시 해당 키워드로 검색 페이지로 이동합니다.
 * 
 * Props:
 * - mobile: 모바일 토글 영역용 스타일 (흰색 배경에 맞춤)
 * - onSearchComplete: 검색 실행 후 호출되는 콜백
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Search, ChevronDown } from 'lucide-react'
import { extractKeyword } from '@/lib/utils/extract-keyword'

interface SearchBarProps {
    mobile?: boolean
    onSearchComplete?: () => void
}

interface PopularKeyword {
    keyword: string
    issueId: string
    rank: number
}

export default function SearchBar({ mobile = false, onSearchComplete }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [popularKeywords, setPopularKeywords] = useState<PopularKeyword[]>([])
    const router = useRouter()
    const pathname = usePathname()
    const wrapperRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // 페이지 이동 시 검색어 초기화
    useEffect(() => {
        if (pathname !== '/search') {
            setQuery('')
            setShowSuggestions(false)
        }
    }, [pathname])

    // 인기 검색어 로드 (2-3개 단어 조합)
    useEffect(() => {
        async function loadPopularKeywords() {
            try {
                const res = await fetch('/api/issues?sort=heat&limit=15')
                const data = await res.json()
                
                if (data.data && data.data.length > 0) {
                    const keywords: PopularKeyword[] = []
                    const usedKeywords = new Set<string>()
                    
                    for (const issue of data.data) {
                        if (keywords.length >= 5) break
                        
                        const title = issue.title || ''
                        const decodedTitle = title
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'")
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                        
                        const keyword = extractKeyword(decodedTitle)
                        
                        if (keyword && !usedKeywords.has(keyword)) {
                            keywords.push({
                                keyword: keyword,
                                issueId: issue.id,
                                rank: keywords.length + 1
                            })
                            usedKeywords.add(keyword)
                        }
                    }
                    
                    setPopularKeywords(keywords)
                }
            } catch (error) {
                console.error('Failed to load popular keywords:', error)
            }
        }
        
        loadPopularKeywords()
    }, [])

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])


    const handleSearch = () => {
        if (query.trim().length >= 2) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`)
            setShowSuggestions(false)
            onSearchComplete?.()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleSearch()
        }
    }

    const handleKeywordClick = (keyword: string) => {
        setQuery(keyword)
        router.push(`/search?q=${encodeURIComponent(keyword)}`)
        setShowSuggestions(false)
        onSearchComplete?.()
    }

    // 유휴 오버레이 표시 조건 (모바일/데스크톱 공통)
    const showIdleOverlay = !showSuggestions && !query && popularKeywords.length > 0

    const currentPlaceholder = '실시간 인기 이슈 검색'

    return (
        <div ref={wrapperRef} className={`relative ${mobile ? 'w-full' : 'w-full md:w-auto'}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={currentPlaceholder}
                    className={`${mobile ? 'w-full' : 'w-72'} pl-3 pr-10 py-2 text-sm rounded-full bg-white text-content-primary placeholder:text-content-muted focus:outline-none transition-colors border ${
                        showIdleOverlay
                            ? 'border-primary/60 cursor-pointer'
                            : 'border-border focus:border-primary'
                    }`}
                />

                {/* 유휴 상태 오버레이 (모바일/데스크톱 공통) */}
                <div
                    className={`absolute inset-0 flex items-center pl-3 pr-10 transition-opacity duration-150 ${
                        showIdleOverlay ? 'opacity-100 cursor-pointer' : 'opacity-0 pointer-events-none'
                    }`}
                    onClick={() => {
                        setShowSuggestions(true)
                        inputRef.current?.focus()
                    }}
                >
                    <span className="flex items-center gap-1.5 bg-white">
                        <span className="text-sm text-content-secondary whitespace-nowrap">실시간 인기 이슈 키워드</span>
                        <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" strokeWidth={2.5} />
                    </span>
                </div>

                <button
                    type="button"
                    onClick={handleSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-content-secondary transition-colors"
                    aria-label="검색"
                >
                    <Search className="w-4 h-4" strokeWidth={2} />
                </button>
            </div>

            {/* 인기 검색어 드롭다운 */}
            {showSuggestions && popularKeywords.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-card z-50">
                    <div className="p-2">
                        <ul className="space-y-0.5">
                            {popularKeywords.map((item) => (
                                <li key={item.rank}>
                                    <button
                                        onClick={() => handleKeywordClick(item.keyword)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-surface-muted rounded-lg transition-colors"
                                    >
                                        <span className="text-xs font-bold text-primary w-4 shrink-0">{item.rank}</span>
                                        <span className="text-content-secondary line-clamp-1 flex-1">{item.keyword}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    )
}
