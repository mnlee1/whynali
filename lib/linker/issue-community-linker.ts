/**
 * lib/linker/issue-community-linker.ts
 * 
 * [이슈-커뮤니티 자동 연결]
 * 
 * 수집된 커뮤니티 데이터를 키워드 기반으로 이슈와 자동 연결합니다.
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

async function linkCommunityToIssue(
    issueId: string,
    issueTitle: string
): Promise<number> {
    const keywords = extractKeywords(issueTitle)
    
    if (keywords.length === 0) {
        return 0
    }

    const { data: existingLinks } = await supabaseAdmin
        .from('source_links')
        .select('source_id')
        .eq('issue_id', issueId)
        .eq('source_type', 'community')

    const existingCommunityIds = new Set(
        existingLinks?.map((link) => link.source_id) || []
    )

    const { data: community } = await supabaseAdmin
        .from('community_data')
        .select('id, title')
        .order('scraped_at', { ascending: false })
        .limit(500)

    if (!community || community.length === 0) {
        return 0
    }

    const matchedCommunity = community.filter((item) => {
        if (existingCommunityIds.has(item.id)) return false

        const titleLower = item.title.toLowerCase()
        const matchCount = keywords.filter((kw) =>
            titleLower.includes(kw.toLowerCase())
        ).length

        return matchCount >= Math.max(1, Math.floor(keywords.length * 0.3))
    })

    if (matchedCommunity.length === 0) {
        return 0
    }

    const linksToInsert = matchedCommunity.slice(0, 20).map((item) => ({
        issue_id: issueId,
        source_type: 'community' as const,
        source_id: item.id,
    }))

    const { error } = await supabaseAdmin
        .from('source_links')
        .insert(linksToInsert)

    if (error) {
        console.error(`이슈 ${issueId} 커뮤니티 연결 에러:`, error)
        return 0
    }

    return linksToInsert.length
}

export async function linkAllCommunityToIssues(): Promise<LinkResult[]> {
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
        const linkedCount = await linkCommunityToIssue(issue.id, issue.title)
        
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
