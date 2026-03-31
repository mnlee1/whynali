/**
 * app/politics/page.tsx
 *
 * [정치 카테고리 페이지]
 */

import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'

export const revalidate = 900

const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')

export default async function PoliticsPage() {
    const { data, count } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT)
        .eq('category', '정치')
        .order('created_at', { ascending: false })
        .range(0, 19)

    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl font-bold text-content-primary mb-6">정치 이슈</h1>
            <IssueList
                category="정치"
                initialData={{ data: (data ?? []) as Issue[], total: count ?? 0 }}
            />
        </div>
    )
}
