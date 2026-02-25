/**
 * app/api/dev/debug-candidates/route.ts
 *
 * [이슈 후보 생성 디버그 API]
 *
 * 개발 환경에서만 사용. auto-create-issue 로직을 시뮬레이션해
 * 각 그룹이 어느 단계에서 탈락했는지 상세 내역을 반환한다.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

const ALERT_THRESHOLD = parseInt(process.env.CANDIDATE_ALERT_THRESHOLD ?? '5')
const MIN_UNIQUE_SOURCES = parseInt(process.env.CANDIDATE_MIN_UNIQUE_SOURCES ?? '2')
const MIN_HEAT_TO_REGISTER = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')
const WINDOW_HOURS = parseInt(process.env.CANDIDATE_WINDOW_HOURS ?? '3')

function stripMediaPrefix(title: string): string {
    return title.replace(/^(\[[^\]]{1,30}\]\s*)+/, '').trim()
}

function tokenize(text: string): string[] {
    const words = text
        .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2)
    return Array.from(new Set(words))
}

function commonKeywordCount(a: string[], b: string[]): number {
    const setB = new Set(b.map((w) => w.toLowerCase()))
    return a.filter((w) => setB.has(w.toLowerCase())).length
}

export async function GET() {
    const now = new Date()
    const sinceWindow = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()

    const { data: newsItems } = await supabaseAdmin
        .from('news_data')
        .select('id, title, created_at, category, source')
        .is('issue_id', null)
        .gte('created_at', sinceWindow)
        .order('created_at', { ascending: true })

    const items = (newsItems ?? []).map((n) => ({
        ...n,
        tokens: tokenize(stripMediaPrefix(n.title)),
    }))

    // 그루핑
    const groups: { tokens: string[]; items: typeof items }[] = []
    for (const item of items) {
        let matched = false
        for (const group of groups) {
            if (commonKeywordCount(item.tokens, group.tokens) >= 1) {
                group.items.push(item)
                matched = true
                break
            }
        }
        if (!matched) groups.push({ tokens: item.tokens, items: [item] })
    }

    // 탈락 원인 분석
    const analysis = groups.map((group) => {
        const count = group.items.length
        const uniqueSources = new Set(group.items.filter(i => i.source).map(i => i.source)).size
        const representativeTitle = group.items
            .map(i => stripMediaPrefix(i.title))
            .reduce((s, c) => c.length < s.length ? c : s)

        let reason = 'pass'
        if (count < ALERT_THRESHOLD) reason = `count_${count}<${ALERT_THRESHOLD}`
        else if (uniqueSources < MIN_UNIQUE_SOURCES) reason = `sources_${uniqueSources}<${MIN_UNIQUE_SOURCES}`

        return {
            representativeTitle,
            count,
            uniqueSources,
            reason,
            titles: group.items.map(i => i.title),
        }
    })

    const passed = analysis.filter(g => g.reason === 'pass')
    const failedByCount = analysis.filter(g => g.reason.startsWith('count'))
    const failedBySources = analysis.filter(g => g.reason.startsWith('sources'))

    return NextResponse.json({
        config: { ALERT_THRESHOLD, MIN_UNIQUE_SOURCES, MIN_HEAT_TO_REGISTER, WINDOW_HOURS },
        totalNews: items.length,
        totalGroups: groups.length,
        passed: passed.length,
        failedByCount: failedByCount.length,
        failedBySources: failedBySources.length,
        // 통과한 그룹 상세
        passedGroups: passed,
        // 출처 부족으로 탈락한 그룹 (가장 많은 건 순)
        failedBySourcesTop5: failedBySources
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        // 건수 많은 순으로 탈락한 그룹
        failedByCountTop10: failedByCount
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
    })
}
