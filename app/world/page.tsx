/**
 * app/world/page.tsx
 *
 * [?¸ê³„ ì¹´í…Œê³ ë¦¬ ?˜ì´ì§€]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '?¸ê³„ ?´ìŠˆ',
    description: '?¸ê³„??ìµœì‹  ?´ìŠˆ?€ ?¼ë????œëˆˆ?? êµ? œ, ?´ì™¸, ?¸êµ, ê¸€ë¡œë²Œ ?´ìŠ¤ë¥??¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ì„¸??',
    keywords: ['?¸ê³„', 'êµ? œ', '?´ì™¸', '?¸êµ', 'ê¸€ë¡œë²Œ', '?¸ê³„ ?´ìŠˆ', 'êµ? œ ?´ìŠ¤'],
    openGraph: {
        title: '?¸ê³„ ?´ìŠˆ | ?œë‚œë¦?,
        description: '?¸ê³„??ìµœì‹  ?´ìŠˆ?€ ?¼ë????œëˆˆ?? êµ? œ, ?´ì™¸, ?¸êµ, ê¸€ë¡œë²Œ ?´ìŠ¤ë¥??¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ì„¸??',
    },
}

export const revalidate = 900


export default async function WorldPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('?¸ê³„')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '??, url: baseUrl },
        { name: '?¸ê³„', url: `${baseUrl}/world` },
    ])

    const [
        { data },
        { count: totalCount },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '?¸ê³„').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¸ê³„'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¸ê³„').eq('status', '?í™”'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¸ê³„').eq('status', '?¼ë?ì¤?),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¸ê³„').eq('status', 'ì¢…ê²°'),
    ])

    const tabCounts = { '': totalCount ?? 0, '?í™”': hotCount ?? 0, '?¼ë?ì¤?: controversialCount ?? 0, 'ì¢…ê²°': closedCount ?? 0 }

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
                <h1 className="text-2xl font-bold text-content-primary mb-6">?¸ê³„ ?´ìŠˆ</h1>
                <IssueList
                    category="?¸ê³„"
                    initialData={{ data: (data ?? []) as Issue[], total: totalCount ?? 0 }}
                    initialTabCounts={tabCounts}
                infiniteScroll
                />
            </div>
        </>
    )
}
