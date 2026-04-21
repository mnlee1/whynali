/**
 * app/economy/page.tsx
 *
 * [경제 카테고리 페이지]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '경제 이슈',
    description: '경제계의 최신 이슈와 논란을 한눈에. 주식, 부동산, 금융, 기업, 시장의 주요 뉴스를 실시간으로 확인하세요.',
    keywords: ['경제', '주식', '부동산', '금융', '기업', '시장', '경제 이슈', '경제 뉴스'],
    openGraph: {
        title: '경제 이슈 | 왜난리',
        description: '경제계의 최신 이슈와 논란을 한눈에. 주식, 부동산, 금융, 기업, 시장의 주요 뉴스를 실시간으로 확인하세요.',
    },
}

export const revalidate = 900


export default async function EconomyPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('경제')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '홈', url: baseUrl },
        { name: '경제', url: `${baseUrl}/economy` },
    ])

    const [
        { data, count },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '경제').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '경제').eq('status', '점화'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '경제').eq('status', '논란중'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '승인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '경제').eq('status', '종결'),
    ])

    const tabCounts = { '': count ?? 0, '점화': hotCount ?? 0, '논란중': controversialCount ?? 0, '종결': closedCount ?? 0 }

    return (
        <>
            <Script
                id="economy-collection-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(collectionSchema)}
            />
            <Script
                id="economy-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold text-content-primary mb-6">경제 이슈</h1>
                <IssueList
                    category="경제"
                    initialData={{ data: (data ?? []) as Issue[], total: count ?? 0 }}
                    initialTabCounts={tabCounts}
                />
            </div>
        </>
    )
}
