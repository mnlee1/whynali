/**
 * app/world/page.tsx
 *
 * [세계 카테고리 페이지]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'

export const metadata: Metadata = {
    title: '세계 이슈',
    description: '세계의 최신 이슈와 논란을 한눈에. 국제, 해외, 외교, 글로벌 뉴스를 실시간으로 확인하세요.',
    keywords: ['세계', '국제', '해외', '외교', '글로벌', '세계 이슈', '국제 뉴스'],
    openGraph: {
        title: '세계 이슈 | 왜난리',
        description: '세계의 최신 이슈와 논란을 한눈에. 국제, 해외, 외교, 글로벌 뉴스를 실시간으로 확인하세요.',
    },
}

export const revalidate = 900

const MIN_HEAT = parseInt(process.env.CANDIDATE_MIN_HEAT_TO_REGISTER ?? '10')

export default async function WorldPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('세계')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '홈', url: baseUrl },
        { name: '세계', url: `${baseUrl}/world` },
    ])

    const { data, count } = await supabaseAdmin
        .from('issues')
        .select('*', { count: 'exact' })
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .gte('heat_index', MIN_HEAT)
        .eq('category', '세계')
        .order('created_at', { ascending: false })
        .range(0, 19)

    return (
        <>
            <Script
                id="world-collection-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(collectionSchema)}
            />
            <Script
                id="world-breadcrumb-schema"
                type="application/ld+json"
                dangerouslySetInnerHTML={createJsonLd(breadcrumbSchema)}
            />
            <div className="container mx-auto px-4 py-6 md:py-8">
                <h1 className="text-2xl font-bold text-content-primary mb-6">세계 이슈</h1>
                <IssueList
                    category="세계"
                    initialData={{ data: (data ?? []) as Issue[], total: count ?? 0 }}
                />
            </div>
        </>
    )
}
