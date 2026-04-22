/**
 * app/politics/page.tsx
 *
 * [?•ì¹˜ ì¹´í…Œê³ ë¦¬ ?˜ì´ì§€]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '?•ì¹˜ ?´ìŠˆ',
    description: '?•ì¹˜ê³„ì˜ ìµœì‹  ?´ìŠˆ?€ ?¼ë????œëˆˆ?? êµ?šŒ, ?•ë‹¹, ? ê±°, ?•ì±…, ?•ë???ì£¼ìš” ?¬ê±´ê³??´ìŠ¤ë¥??¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ì„¸??',
    keywords: ['?•ì¹˜', 'êµ?šŒ', '?•ë‹¹', '? ê±°', '?•ì±…', '?•ë?', '?•ì¹˜ ?´ìŠˆ', '?•ì¹˜ ?´ìŠ¤'],
    openGraph: {
        title: '?•ì¹˜ ?´ìŠˆ | ?œë‚œë¦?,
        description: '?•ì¹˜ê³„ì˜ ìµœì‹  ?´ìŠˆ?€ ?¼ë????œëˆˆ?? êµ?šŒ, ?•ë‹¹, ? ê±°, ?•ì±…, ?•ë???ì£¼ìš” ?¬ê±´ê³??´ìŠ¤ë¥??¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ì„¸??',
    },
}

export const revalidate = 900


export default async function PoliticsPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('?•ì¹˜')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '??, url: baseUrl },
        { name: '?•ì¹˜', url: `${baseUrl}/politics` },
    ])

    const [
        { data },
        { count: totalCount },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '?•ì¹˜').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?•ì¹˜'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?•ì¹˜').eq('status', '?í™”'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?•ì¹˜').eq('status', '?¼ë?ì¤?),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?•ì¹˜').eq('status', 'ì¢…ê²°'),
    ])

    const tabCounts = { '': totalCount ?? 0, '?í™”': hotCount ?? 0, '?¼ë?ì¤?: controversialCount ?? 0, 'ì¢…ê²°': closedCount ?? 0 }

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
                <h1 className="text-2xl font-bold text-content-primary mb-6">?•ì¹˜ ?´ìŠˆ</h1>
                <IssueList
                    category="?•ì¹˜"
                    initialData={{ data: (data ?? []) as Issue[], total: totalCount ?? 0 }}
                    initialTabCounts={tabCounts}
                infiniteScroll
                />
            </div>
        </>
    )
}
