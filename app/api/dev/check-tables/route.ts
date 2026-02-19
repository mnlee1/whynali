import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * 97_1단계_기초픽스.md §3.1 기준 테이블 존재 여부 확인.
 * GET /api/dev/check-tables (로컬 또는 환경 변수 설정 후 호출)
 */
const EXPECTED_TABLES = [
    'issues',
    'timeline_points',
    'news_data',
    'community_data',
    'users',
    'reactions',
    'comments',
    'votes',
    'vote_choices',
    'user_votes',
    'discussion_topics',
    'safety_rules',
    'admin_logs',
]

export const dynamic = 'force-dynamic'

export async function GET() {
    const results: { table: string; exists: boolean; error?: string }[] = []

    for (const table of EXPECTED_TABLES) {
        try {
            const { error } = await supabaseAdmin.from(table).select('*').limit(0)
            results.push({
                table,
                exists: !error,
                error: error?.message,
            })
        } catch (e) {
            results.push({
                table,
                exists: false,
                error: e instanceof Error ? e.message : String(e),
            })
        }
    }

    const existing = results.filter((r) => r.exists).map((r) => r.table)
    const missing = results.filter((r) => !r.exists).map((r) => r.table)

    return NextResponse.json({
        ok: missing.length === 0,
        existing,
        missing,
        details: results,
    })
}
