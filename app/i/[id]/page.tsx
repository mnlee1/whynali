/**
 * app/i/[id]/page.tsx
 *
 * 이슈 숏URL 리다이렉트
 * /i/[short_code] → /issue/[UUID]
 *
 * 예: /i/aBc123 → /issue/550e8400-e29b-41d4-a716-446655440000
 *
 * short_code가 없으면 UUID로도 작동 (하위 호환성)
 */

import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-server'
import { Metadata } from 'next'

interface Props {
    params: Promise<{ id: string }>
}

export const metadata: Metadata = {
    robots: {
        index: false,
        follow: false,
    },
}

export default async function ShortIssueUrl({ params }: Props) {
    const { id } = await params

    // 1. short_code로 조회 시도
    let issue = await supabaseAdmin
        .from('issues')
        .select('id, short_code')
        .eq('short_code', id)
        .maybeSingle()

    // 2. short_code로 못 찾으면 UUID로 시도 (하위 호환성)
    if (!issue.data) {
        issue = await supabaseAdmin
            .from('issues')
            .select('id, short_code')
            .eq('id', id)
            .maybeSingle()
    }

    // 3. 이슈를 찾지 못하면 홈으로
    if (!issue.data) {
        redirect('/')
    }

    // 4. 이슈 상세 페이지로 리다이렉트
    redirect(`/issue/${issue.data.id}`)
}
