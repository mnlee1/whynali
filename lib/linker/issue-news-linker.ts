/**
 * lib/linker/issue-news-linker.ts
 * 
 * [이슈-뉴스 자동 연결]
 * 
 * 수집된 뉴스를 키워드 기반으로 이슈와 자동 연결합니다.
 * news_data.issue_id FK를 직접 UPDATE합니다.
 */

import { supabaseAdmin } from '@/lib/supabase/server'

interface LinkResult {
    issueId: string
    issueTitle: string
    linkedCount: number
}

function extractKeywords(text: string): string[] {
    const words = text
        .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    
    return Array.from(new Set(words))
}

async function linkNewsToIssue(
    issueId: string,
    issueTitle: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    
    if (keywords.length === 0) {
        return 0
    }

    /* 아직 이슈에 연결되지 않은 최근 뉴스 500건 조회 */
    const { data: news } = await supabaseAdmin
        .from('news_data')
        .select('id, title')
        .is('issue_id', null)
        .order('created_at', { ascending: false })
        .limit(500)

    if (!news || news.length === 0) {
        return 0
    }

    const matchedIds = news
        .filter((item) => {
            const titleLower = item.title.toLowerCase()
            const matchCount = keywords.filter((kw) =>
                titleLower.includes(kw.toLowerCase())
            ).length
            return matchCount >= Math.max(1, Math.floor(keywords.length * 0.3))
        })
        .slice(0, 20)
        .map((item) => item.id)

    if (matchedIds.length === 0) {
        return 0
    }

    const { error } = await supabaseAdmin
        .from('news_data')
        .update({ issue_id: issueId })
        .in('id', matchedIds)

    if (error) {
        console.error(`이슈 ${issueId} 뉴스 연결 에러:`, error)
        return 0
    }

    return matchedIds.length
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
