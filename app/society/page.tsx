/**
 * app/society/page.tsx
 *
 * [사회 카테고리 페이지]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '사회 이슈',
    description: '사회계의 최신 이슈와 논란을 한눈에. 사건, 사고, 범죄, 재판, 사회 현상 등 주요 뉴스를 실시간으로 확인하세요.',
    keywords: ['사회', '사건', '사고', '범죄', '재판', '사회 이슈', '사회 뉴스'],
    openGraph: {
        title: '사회 이슈 | 왜난리',
        description: '사회계의 최신 이슈와 논란을 한눈에. 사건, 사고, 범죄, 재판, 사회 현상 등 주요 뉴스를 실시간으로 확인하세요.',
    },
}

export const revalidate = 900


export default async function SocietyPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('사회')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '홈', url: baseUrl },
        { name: '사회', url: `${baseUrl}/society` },
    ])

    const { data, count } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT)
        .eq('category', '사회')
        .order('created_at', { ascending: false })
        .range(0, 19)

    return (
        <>
            <Script
                id="society-collection-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(collectionSchema)}
            />
            <Script
                id="society-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold text-content-primary mb-6">사회 이슈</h1>
                <IssueList
                    category="사회"
                    initialData={{ data: (data ?? []) as Issue[], total: count ?? 0 }}
                />
            </div>
        </>
    )
}
