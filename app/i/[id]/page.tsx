/**
 * app/i/[id]/page.tsx
 *
 * 이슈 단축 URL 리다이렉트
 * /i/[UUID] → /issue/[UUID]
 *
 * 예: /i/550e8400-e29b-41d4-a716-446655440000 → /issue/550e8400-e29b-41d4-a716-446655440000
 */

import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/server'

interface Props {
    params: Promise<{ id: string }>
}

export default async function ShortIssueUrl({ params }: Props) {
    const { id } = await params

    // UUID 직접 조회 (eq 사용 — id::text ilike 방식은 PostgREST에서 신뢰할 수 없음)
    const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('id')
        .eq('id', id)
        .maybeSingle()

    if (!issue) redirect('/')

    redirect(`/issue/${issue.id}`)
}
