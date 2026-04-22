/**
 * app/politics/page.tsx
 *
 * [?�치 카테고리 ?�이지]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '?�치 ?�슈',
    description: '?�치계의 최신 ?�슈?� ?��????�눈?? �?��, ?�당, ?�거, ?�책, ?��???주요 ?�건�??�스�??�시간으�??�인?�세??',
    keywords: ['?�치', '�?��', '?�당', '?�거', '?�책', '?��?', '?�치 ?�슈', '?�치 ?�스'],
    openGraph: {
        title: '?�치 ?�슈 | ?�난�?,
        description: '?�치계의 최신 ?�슈?� ?��????�눈?? �?��, ?�당, ?�거, ?�책, ?��???주요 ?�건�??�스�??�시간으�??�인?�세??',
    },
}

export const revalidate = 900


export default async function PoliticsPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('?�치')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '??, url: baseUrl },
        { name: '?�치', url: `${baseUrl}/politics` },
    ])

    const [
        { data },
        { count: totalCount },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '?�치').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?�치'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?�치').eq('status', '?�화'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?�치').eq('status', '?��?�?),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?�인').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?�치').eq('status', '종결'),
    ])

    const tabCounts = { '': totalCount ?? 0, '?�화': hotCount ?? 0, '?��?�?: controversialCount ?? 0, '종결': closedCount ?? 0 }

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
                <h1 className="text-2xl font-bold text-content-primary mb-6">?�치 ?�슈</h1>
                <IssueList
                    category="?�치"
                    initialData={{ data: (data ?? []) as Issue[], total: totalCount ?? 0 }}
                    initialTabCounts={tabCounts}
                infiniteScroll
                />
            </div>
        </>
    )
}
