/**
 * lib/linker/issue-news-linker.ts
 * 
 * [이슈-뉴스 자동 연결]
 * 
 * 수집된 뉴스를 키워드 기반으로 이슈와 자동 연결합니다.
 * 
 * 주요 로직:
 * 1. 승인된 모든 이슈 조회
 * 2. 각 이슈의 제목에서 키워드 추출
 * 3. 미연결 뉴스 중 키워드가 포함된 뉴스 검색
 * 4. source_links 테이블에 연결 저장
 */

import { supabaseAdmin } from '@/lib/supabase/server'

interface LinkResult {
    issueId: string
    issueTitle: string
    linkedCount: number
}

/**
 * 텍스트에서 2글자 이상 키워드 추출 (간단한 공백 기반)
 */
function extractKeywords(text: string): string[] {
    const words = text
        .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    
    return Array.from(new Set(words))
}

/**
 * 특정 이슈에 뉴스 자동 연결
 */
async function linkNewsToIssue(
    issueId: string,
    issueTitle: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    
    if (keywords.length === 0) {
        return 0
    }

    // 이미 연결된 뉴스 ID 조회
    const { data: existingLinks } = await supabaseAdmin
        .from('source_links')
        .select('source_id')
        .eq('issue_id', issueId)
        .eq('source_type', 'news')

    const existingNewsIds = new Set(
        existingLinks?.map((link) => link.source_id) || []
    )

    // 키워드가 포함된 뉴스 검색
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title')
        .order('created_at', { ascending: false })
        .limit(500)

    if (!news || news.length === 0) {
        return 0
    }

    // 매칭되는 뉴스 필터링
    const matchedNews = news.filter((item) => {
        if (existingNewsIds.has(item.id)) return false

        const titleLower = item.title.toLowerCase()
        const matchCount = keywords.filter((kw) =>
            titleLower.includes(kw.toLowerCase())
        ).length

        return matchCount >= Math.max(1, Math.floor(keywords.length * 0.3))
    })

    if (matchedNews.length === 0) {
        return 0
    }

    // source_links에 삽입
    const linksToInsert = matchedNews.slice(0, 20).map((item) => ({
        issue_id: issueId,
        source_type: 'news' as const,
        source_id: item.id,
    }))

    const { error } = await supabaseAdmin
        .from('source_links')
        .insert(linksToInsert)

    if (error) {
        console.error(`이슈 ${issueId} 뉴스 연결 에러:`, error)
        return 0
    }

    return linksToInsert.length
}

/**
 * 모든 승인된 이슈에 뉴스 자동 연결
 */
export async function linkAllNewsToIssues(): Promise<LinkResult[]> {
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title')
        .eq('approval_status', '승인')
        .order('updated_at', { ascending: false })
        .limit(50)

    if (!issues || issues.length === 0) {
        return []
    }

    const results: LinkResult[] = []

    for (const issue of issues) {
        const linkedCount = await linkNewsToIssue(issue.id, issue.title)
        
        if (linkedCount > 0) {
            results.push({
                issueId: issue.id,
                issueTitle: issue.title,
                linkedCount,
            })
        }
    }

    return results
}
