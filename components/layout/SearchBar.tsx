/**
 * components/layout/SearchBar.tsx (Header용 글로벌 검색바)
 *
 * [헤더 검색바 컴포넌트]
 *
 * 헤더에서 사용하는 글로벌 검색바입니다.
 * 포커스 시 인기 검색어 추천 드롭다운을 표시합니다.
 * 상위 5개 이슈에서 키워드를 추출하여 제공합니다.
 * 
 * Props:
 * - mobile: 모바일 토글 영역용 스타일 (흰색 배경에 맞춤)
 * - onSearchComplete: 검색 실행 후 호출되는 콜백
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface SearchBarProps {
    mobile?: boolean
    onSearchComplete?: () => void
}

interface PopularKeyword {
    keyword: string
    rank: number
}

// 불용어 목록
const STOPWORDS = new Set([
    '논란', '사건', '사고', '통보', '불참', '발표', '확인', '관련', '이후',
    '결국', '충격', '공개', '최초', '단독', '속보', '긴급', '오늘', '어제',
    '지금', '올해', '최근', '현재', '직접', '처음', '마지막', '드디어',
    '알고', '보니', '위해', '대해', '통해', '따라', '의해', '부터', '까지',
    '이번', '해당', '모든', '일부', '전체', '이미', '아직', '더욱', '매우',
    '어디', '어디로', '어디서', '어디에', '여기', '저기', '거기',
    '모집', '참여', '신청', '접수', '지원', '선발', '채용',
])

// 1글자이지만 중요한 의미를 가진 예외 키워드
const ALLOWED_ONE_CHAR_KEYWORDS = new Set([
    '환', '뷔', '진', '첸', '츄', '뱀', '윤', '문', '안', '정', '이', '박', '김', '최',
    '권', '조', '강', '류', '홍', '송', '백', '유', '오', '신', '양', '황', '허', '고',
    '설', '선', '길', '표', '명', '범', '혁', '훈', '빈', '결', '률', '현', '린'
])

// 언론 접두어 제거
function stripMediaPrefix(title: string): string {
    return title.replace(/^(\[[^\]]{1,30}\]\s*)+/, '').trim()
}

// 제목에서 핵심 키워드 추출
function extractKeywords(text: string): string[] {
    return Array.from(new Set(
        stripMediaPrefix(text)
            .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
            .split(/\s+/)
            .filter((w) => (w.length >= 2 || ALLOWED_ONE_CHAR_KEYWORDS.has(w)) && !STOPWORDS.has(w))
    ))
}

export default function SearchBar({ mobile = false, onSearchComplete }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [popularKeywords, setPopularKeywords] = useState<PopularKeyword[]>([])
    const router = useRouter()
    const wrapperRef = useRef<HTMLDivElement>(null)

    // 인기 검색어 로드
    useEffect(() => {
        async function loadPopularKeywords() {
            try {
                const res = await fetch('/api/issues?sort=heat&limit=5')
                const data = await res.json()
                
                if (data.data && data.data.length > 0) {
                    const keywords: PopularKeyword[] = []
                    const usedKeywords = new Set<string>()
                    
                    data.data.forEach((issue: any) => {
                        if (keywords.length >= 5) return
                        
                        const title = issue.title || ''
                        // HTML 엔티티 디코드
                        const decodedTitle = title
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'")
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                        
                        // 제목에서 키워드 추출
                        const extractedKeywords = extractKeywords(decodedTitle)
                        
                        // 추출된 키워드 중 처음 1개만 사용 (가장 중요한 키워드)
                        for (const kw of extractedKeywords) {
                            if (keywords.length >= 5) break
                            if (!usedKeywords.has(kw) && kw.length >= 2) {
                                keywords.push({ keyword: kw, rank: keywords.length + 1 })
                                usedKeywords.add(kw)
                                break // 각 이슈당 1개만
                            }
                        }
                    })
                    
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

    return (
        <div ref={wrapperRef} className="relative w-full md:w-auto">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="지금 이슈 검색"
                    className="w-full md:w-48 pl-3 pr-10 py-1.5 text-sm border border-neutral-200 rounded-md bg-neutral-50 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 focus:bg-white"
                />
                <button
                    type="button"
                    onClick={handleSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                    aria-label="검색"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </button>
            </div>

            {/* 인기 검색어 드롭다운 */}
            {showSuggestions && popularKeywords.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-md shadow-lg z-50">
                    <div className="p-2">
                        <p className="text-xs text-neutral-500 px-2 py-1 font-medium">인기 검색어</p>
                        <ul className="space-y-0.5">
                            {popularKeywords.map((item) => (
                                <li key={item.rank}>
                                    <button
                                        onClick={() => handleKeywordClick(item.keyword)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-neutral-50 rounded transition-colors"
                                    >
                                        <span className="text-xs font-bold text-violet-600 w-4">{item.rank}</span>
                                        <span className="text-neutral-700 line-clamp-1">{item.keyword}</span>
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
