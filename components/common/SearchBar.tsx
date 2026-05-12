/**
 * components/common/SearchBar.tsx
 *
 * [검색바 공통 컴포넌트]
 *
 * 카테고리 페이지 이슈 목록에서 사용하는 검색바입니다.
 * category prop을 넘기면 포커스 시 해당 카테고리의 화력 상위 이슈에서
 * 추출한 키워드를 드롭다운으로 표시합니다.
 * 키워드 클릭 시 같은 페이지 내 필터링(onChange 호출)이 실행됩니다.
 *
 * 사용 예시:
 *   <SearchBar value={query} onChange={setQuery} onSearch={handleSearch} category="연예" />
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { extractKeyword } from '@/lib/utils/extract-keyword'

interface SearchBarProps {
    value: string
    onChange: (value: string) => void
    onSearch?: () => void
    placeholder?: string
    category?: string          // 카테고리 키워드 추천용 (연예, 스포츠 등)
    keywordSource?: 'issues' | 'discussions'  // 키워드 출처 (기본: 'issues')
}

interface SuggestedKeyword {
    keyword: string
    rank: number
}

export default function SearchBar({
    value,
    onChange,
    onSearch,
    placeholder = '이슈 검색',
    category,
    keywordSource = 'issues',
}: SearchBarProps) {
    const [showDropdown, setShowDropdown] = useState(false)
    const [keywords, setKeywords] = useState<SuggestedKeyword[]>([])
    const wrapperRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // 카테고리/출처 기반 추천 키워드 로드
    useEffect(() => {
        async function loadKeywords() {
            try {
                let titles: string[] = []

                if (keywordSource === 'discussions') {
                    // 커뮤니티: 인기 토론 주제의 관련 이슈 제목에서 키워드 추출
                    const res = await fetch('/api/discussions?sort=popular&limit=15')
                    const data = await res.json()
                    titles = (data.data ?? [])
                        .map((t: { issues?: { title?: string } | null; body?: string }) =>
                            t.issues?.title ?? t.body ?? ''
                        )
                        .filter(Boolean)
                } else {
                    // 이슈: 카테고리 화력 상위 이슈 제목에서 키워드 추출
                    const url = category
                        ? `/api/issues?sort=heat&limit=15&category=${encodeURIComponent(category)}`
                        : `/api/issues?sort=heat&limit=15`
                    const res = await fetch(url)
                    const data = await res.json()
                    titles = (data.data ?? []).map((issue: { title?: string }) => {
                        return (issue.title ?? '')
                            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                    })
                }

                const result: SuggestedKeyword[] = []
                const used = new Set<string>()
                for (const title of titles) {
                    if (result.length >= 5) break
                    const keyword = extractKeyword(title)
                    if (keyword && !used.has(keyword)) {
                        result.push({ keyword, rank: result.length + 1 })
                        used.add(keyword)
                    }
                }
                setKeywords(result)
            } catch {
                // 추천 키워드 로드 실패 시 무시
            }
        }
        loadKeywords()
    }, [category, keywordSource])

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && onSearch) {
            onSearch()
            setShowDropdown(false)
        }
    }

    const handleKeywordClick = (keyword: string) => {
        onChange(keyword)
        setShowDropdown(false)
        inputRef.current?.blur()
    }

    return (
        <div ref={wrapperRef} className="relative">
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                className="w-full pl-3 pr-10 py-2 text-sm border border-border rounded-lg bg-white text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary transition-colors"
            />
            <button
                type="button"
                onClick={() => { onSearch?.(); setShowDropdown(false) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-neutral-600 transition-colors"
                aria-label="검색"
            >
                <Search className="w-4 h-4" strokeWidth={2} />
            </button>

            {/* 추천 키워드 드롭다운 */}
            {showDropdown && keywords.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-card z-50">
                    <div className="px-3 pt-2.5 pb-1">
                        <p className="text-[11px] text-content-muted mb-1.5">
                            {keywordSource === 'discussions'
                                ? '커뮤니티 인기 키워드'
                                : category ? `${category} 인기 키워드` : '인기 키워드'
                            }
                        </p>
                    </div>
                    <ul className="pb-1.5">
                        {keywords.map((item) => (
                            <li key={item.rank}>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleKeywordClick(item.keyword)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface-muted transition-colors"
                                >
                                    <span className="text-xs font-bold text-primary w-4 shrink-0">{item.rank}</span>
                                    <span className="text-content-secondary">{item.keyword}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
