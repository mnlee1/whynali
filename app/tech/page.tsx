/**
 * app/tech/page.tsx
 *
 * [기술 카테고리 ?�이지]
 *
 * IT, 과학, AI, ?��??�업 ??기술 관???�슈�??�함?�니??
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '기술 ?�슈',
    description: '기술계의 최신 ?�슈?� ?��????�눈?? IT, 과학, AI, ?��??�업, 반도�? ?�기�???첨단 기술 ?�스�??�시간으�??�인?�세??',
    keywords: ['기술', 'IT', '과학', '?��??�업', '?�크', '?�신', 'AI', '?�공지??, '반도�?, '?�기�?, '기술 ?�슈', '기술 ?�스'],
    openGraph: {
        title: '기술 ?�슈 | ?�난�?,
        description: '기술계의 최신 ?�슈?� ?��????�눈?? IT, 과학, AI, ?��??�업, 반도�? ?�기�???첨단 기술 ?�스�??�시간으�??�인?�세??',
    },
}

export const revalidate = 900


export default async function TechPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('기술')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '??, url: baseUrl },
        { name: '기술', url: `${baseUrl}/tech` },
    ])

    const [
        { data },
        { count: totalCount },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '기술').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술').eq('status', '?�화'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술').eq('status', '?��?�?),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '기술').eq('status', '종결'),
    ])

    const tabCounts = { '': totalCount ?? 0, '?�화': hotCount ?? 0, '?��?�?: controversialCount ?? 0, '종결': closedCount ?? 0 }

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
                <h1 className="text-2xl font-bold text-content-primary mb-6">기술 ?�슈</h1>
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
