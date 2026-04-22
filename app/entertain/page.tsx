/**
 * app/entertain/page.tsx
 *
 * [연예 카테고리 페이지]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '연예 이슈',
    description: '연예계의 최신 이슈와 논란을 한눈에. 아이돌, 배우, 가수, 방송인의 사건과 뉴스를 실시간으로 확인하세요.',
    keywords: ['연예', '연예계', '아이돌', '배우', '가수', '방송인', '셀럽', '연예 이슈', '연예 뉴스'],
    openGraph: {
        title: '연예 이슈 | 왜난리',
        description: '연예계의 최신 이슈와 논란을 한눈에. 아이돌, 배우, 가수, 방송인의 사건과 뉴스를 실시간으로 확인하세요.',
    },
}

export const revalidate = 900


export default async function EntertainPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('연예')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '홈', url: baseUrl },
        { name: '연예', url: `${baseUrl}/entertain` },
    ])

    const [
        { data, count },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '연예').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '연예').eq('status', '점화'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '연예').eq('status', '논란중'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '연예').eq('status', '종결'),
    ])

    const tabCounts = {
        '': count ?? 0,
        '점화': hotCount ?? 0,
        '논란중': controversialCount ?? 0,
        '종결': closedCount ?? 0,
    }

    return (
        <>
            <Script
                id="entertain-collection-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(collectionSchema)}
            />
            <Script
                id="entertain-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold text-content-primary mb-6">연예 이슈</h1>
            <IssueList
                category="연예"
                initialData={{ data: (data ?? []) as Issue[], total: count ?? 0 }}
                initialTabCounts={tabCounts}
                infiniteScroll
            />
        </div>
        </>
    )
}
