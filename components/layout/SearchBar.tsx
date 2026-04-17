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
import { Search } from 'lucide-react'

interface SearchBarProps {
    mobile?: boolean
    onSearchComplete?: () => void
}

interface PopularKeyword {
    keyword: string
    issueId: string
    rank: number
}

// 불용어 목록 (의미 없는 단어)
const STOPWORDS = new Set([
    '통보', '불참', '발표', '확인', '관련', '이후',
    '결국', '충격', '공개', '최초', '단독', '속보', '긴급',
    '알고', '보니', '위해', '대해', '통해', '따라', '의해', '부터', '까지',
    '이번', '해당', '모든', '일부', '전체', '이미', '아직', '더욱', '매우',
    '어디', '어디로', '어디서', '어디에', '여기', '저기', '거기',
    '논란', '사고', '오늘', '어제', '지금', '올해', '최근', '현재',
    '직접', '처음', '마지막', '드디어',
    '유명', '유명인', '인기', '스타', '셀럽',
    '방지법', '출격준비', '이상무', '혐의', '소지',
    '연예기획사', '차단', '비연예인', '예비', '신부', '배려', '진행', '사항',
    '발의', '차단', '관리', '의무화', '언팩',
])

// 핵심 키워드 (반드시 포함되어야 할 단어)
const CORE_KEYWORDS = new Set([
    '탈세', '마약', '체포', '구속', '기소', '선고',
    '결혼', '이혼', '열애', '사망', '출산', '임신',
    '갤럭시', 'S26', '아이폰', '맥북',
])

// 날짜/시간 패턴 (1월, 2일, 3시, 4월일, 년도 등)
function isDateTimeWord(word: string): boolean {
    return /^\d+[일월년시분초]$/.test(word) || /^\d{2,4}$/.test(word)
}

// 언론 접두어 제거
function stripMediaPrefix(title: string): string {
    return title.replace(/^(\[[^\]]{1,30}\]\s*)+/, '').trim()
}

// 따옴표 안에서 무시할 단어들 (법률용어, 일반용어)
const QUOTED_STOPWORDS = new Set(['방지법', '혐의', '소지', '투약', '사건', '사고'])

// 제목에서 2-3개 핵심 단어 조합 키워드 추출
function extractKeyword(text: string): string | null {
    const cleanText = stripMediaPrefix(text)
    
    // 1. 제목 앞쪽의 따옴표로 묶인 내용 우선 추출 (이벤트명, 프로그램명 등)
    const quotedMatch = cleanText.match(/^['"「『]([^'"」』]{3,20})['"」』]/)
    if (quotedMatch) {
        const quoted = quotedMatch[1].trim()
        // 따옴표 안에 무시할 단어가 있으면 스킵
        const hasStopword = Array.from(QUOTED_STOPWORDS).some(sw => quoted.includes(sw))
        if (!hasStopword && quoted.length >= 3 && quoted.length <= 20) {
            return quoted
        }
    }
    
    // 2. 일반 단어 추출
    const words = cleanText
        .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣0-9]/g, ' ')
        .split(/\s+/)
        .map((w) => w.replace(/(의|로|에|는|은|이|가|을|를|와|과|도|만|으로|으|에서|부터|까지|한테|에게|께|께서)$/, ''))
        .filter((w) => {
            if (w.length < 2) return false
            if (STOPWORDS.has(w)) return false
            if (/^\d+$/.test(w)) return false
            if (isDateTimeWord(w)) return false
            return true
        })
    
    if (words.length === 0) return null
    
    // 3. 핵심 키워드가 있는지 확인
    const coreWords = words.filter(w => CORE_KEYWORDS.has(w))
    
    // 4. 핵심 키워드가 있으면 끝에 배치 (어순 명확화)
    if (coreWords.length > 0) {
        // 핵심 키워드가 2개 이상이면 비-핵심 단어 + 핵심 키워드들
        if (coreWords.length >= 2) {
            const nonCoreWords = words.filter(w => !CORE_KEYWORDS.has(w))
            // 비-핵심 단어 최대 2개 + 핵심 키워드 모두
            const result = [...nonCoreWords.slice(0, 2), ...coreWords.slice(0, 2)]
            const phrase = result.join(' ')
            if (phrase.length <= 15) return phrase
            
            // 15자 초과면 비-핵심 1개 + 핵심 2개
            return [nonCoreWords[0], ...coreWords.slice(0, 2)].join(' ')
        }
        
        // 핵심 키워드가 1개면 첫 단어(주로 고유명사) + 핵심 키워드
        const result = [words[0]]
        coreWords.forEach(core => {
            if (!result.includes(core) && result.length < 3) {
                result.push(core)
            }
        })
        const phrase = result.join(' ')
        if (phrase.length <= 15) return phrase
    }
    
    // 5. 핵심 키워드 없으면 2-3개 단어 조합 (15자 이내)
    if (words.length >= 3) {
        const phrase3 = words.slice(0, 3).join(' ')
        if (phrase3.length <= 15) return phrase3
    }
    
    if (words.length >= 2) {
        const phrase2 = words.slice(0, 2).join(' ')
        if (phrase2.length <= 15) return phrase2
    }
    
    return words[0]
}

export default function SearchBar({ mobile = false, onSearchComplete }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [popularKeywords, setPopularKeywords] = useState<PopularKeyword[]>([])
    const router = useRouter()
    const pathname = usePathname()
    const wrapperRef = useRef<HTMLDivElement>(null)

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

    const handleKeywordClick = (keyword: string, issueId: string) => {
        setQuery(keyword)
        router.push(`/search?q=${encodeURIComponent(keyword)}`)
        setShowSuggestions(false)
        onSearchComplete?.()
    }

    return (
        <div ref={wrapperRef} className={`relative ${mobile ? 'w-full' : 'w-full md:w-auto'}`}>
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="지금 이슈 검색"
                    className={`${mobile ? 'w-full' : 'w-full md:w-64'} pl-3 pr-10 py-1.5 text-sm border border-border rounded-lg bg-white text-content-primary placeholder:text-content-muted focus:outline-none focus:border-primary transition-colors`}
                />
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
                        <p className="text-xs text-content-muted px-2 py-1 font-medium">인기 검색어</p>
                        <ul className="space-y-0.5">
                            {popularKeywords.map((item) => (
                                <li key={item.rank}>
                                    <button
                                        onClick={() => handleKeywordClick(item.keyword, item.issueId)}
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
