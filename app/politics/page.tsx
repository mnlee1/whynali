/**
 * app/politics/page.tsx
 *
 * [정치 카테고리 페이지]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '정치 이슈',
    description: '정치계의 최신 이슈와 논란을 한눈에. 국회, 정당, 선거, 정책, 정부의 주요 사건과 뉴스를 실시간으로 확인하세요.',
    keywords: ['정치', '국회', '정당', '선거', '정책', '정부', '정치 이슈', '정치 뉴스'],
    openGraph: {
        title: '정치 이슈 | 왜난리',
        description: '정치계의 최신 이슈와 논란을 한눈에. 국회, 정당, 선거, 정책, 정부의 주요 사건과 뉴스를 실시간으로 확인하세요.',
    },
}

export const revalidate = 900


export default async function PoliticsPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('정치')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '홈', url: baseUrl },
        { name: '정치', url: `${baseUrl}/politics` },
    ])

    const [
        { data, count },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '정치').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '정치').eq('status', '점화'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '정치').eq('status', '논란중'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '정치').eq('status', '종결'),
    ])

    const tabCounts = { '': count ?? 0, '점화': hotCount ?? 0, '논란중': controversialCount ?? 0, '종결': closedCount ?? 0 }

    return (
        <>
            <Script
                id="politics-collection-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(collectionSchema)}
            />
            <Script
                id="politics-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold text-content-primary mb-6">정치 이슈</h1>
                <IssueList
                    category="정치"
                    initialData={{ data: (data ?? []) as Issue[], total: count ?? 0 }}
                    initialTabCounts={tabCounts}
                />
            </div>
        </>
    )
}
