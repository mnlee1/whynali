/**
 * app/i/[id]/page.tsx
 *
 * 단축 URL 리다이렉트
 * /i/[UUID 앞 8자리] → /issue/[전체 UUID]
 *
 * 예: /i/550e8400 → /issue/550e8400-e29b-41d4-a716-446655440000
 */

import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/server'

interface Props {
    params: Promise<{ id: string }>
}

export default async function ShortIssueUrl({ params }: Props) {
    const { id } = await params

    // UUID 앞 8자리로 이슈 조회
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id')
        .filter('id::text', 'ilike', `${id}%`)
        .limit(1)
        .single()

    if (!issue) redirect('/')

    redirect(`/issue/${issue.id}`)
}
