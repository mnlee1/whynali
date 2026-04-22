/**
 * app/tech/page.tsx
 *
 * [기술 카테고리 페이지]
 *
 * IT, 과학, AI, 스타트업 등 기술 관련 이슈를 포함합니다.
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '기술 이슈',
    description: '기술계의 최신 이슈와 논란을 한눈에. IT, 과학, AI, 스타트업, 반도체, 전기차 등 첨단 기술 뉴스를 실시간으로 확인하세요.',
    keywords: ['기술', 'IT', '과학', '스타트업', '테크', '혁신', 'AI', '인공지능', '반도체', '전기차', '기술 이슈', '기술 뉴스'],
    openGraph: {
        title: '기술 이슈 | 왜난리',
        description: '기술계의 최신 이슈와 논란을 한눈에. IT, 과학, AI, 스타트업, 반도체, 전기차 등 첨단 기술 뉴스를 실시간으로 확인하세요.',
    },
}

export const revalidate = 900


export default async function TechPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('기술')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '홈', url: baseUrl },
        { name: '기술', url: `${baseUrl}/tech` },
    ])

    const [
        { data },
        { count: totalCount },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '기술').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술').eq('status', '점화'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술').eq('status', '논란중'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술').eq('status', '종결'),
    ])

    const tabCounts = { '': totalCount ?? 0, '점화': hotCount ?? 0, '논란중': controversialCount ?? 0, '종결': closedCount ?? 0 }

    return (
        <>
            <Script
                id="tech-collection-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(collectionSchema)}
            />
            <Script
                id="tech-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold text-content-primary mb-6">기술 이슈</h1>
                <IssueList
                    category="기술"
                    initialData={{ data: (data ?? []) as Issue[], total: totalCount ?? 0 }}
                    initialTabCounts={tabCounts}
                infiniteScroll
                />
            </div>
        </>
    )
}
