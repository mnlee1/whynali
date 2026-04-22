/**
 * app/society/page.tsx
 *
 * [?¬íšŒ ì¹´í…Œê³ ë¦¬ ?˜ì´ì§€]
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import IssueList from '@/components/issues/IssueList'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Issue } from '@/types/issue'
import { generateCollectionPageSchema, generateBreadcrumbSchema, createJsonLd } from '@/lib/seo/schema'
import { CANDIDATE_MIN_HEAT_TO_REGISTER as MIN_HEAT } from '@/lib/config/candidate-thresholds'

export const metadata: Metadata = {
    title: '?¬íšŒ ?´ìŠˆ',
    description: '?¬íšŒê³„ì˜ ìµœì‹  ?´ìŠˆ?€ ?¼ë????œëˆˆ?? ?¬ê±´, ?¬ê³ , ë²”ì£„, ?¬íŒ, ?¬íšŒ ?„ìƒ ??ì£¼ìš” ?´ìŠ¤ë¥??¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ì„¸??',
    keywords: ['?¬íšŒ', '?¬ê±´', '?¬ê³ ', 'ë²”ì£„', '?¬íŒ', '?¬íšŒ ?´ìŠˆ', '?¬íšŒ ?´ìŠ¤'],
    openGraph: {
        title: '?¬íšŒ ?´ìŠˆ | ?œë‚œë¦?,
        description: '?¬íšŒê³„ì˜ ìµœì‹  ?´ìŠˆ?€ ?¼ë????œëˆˆ?? ?¬ê±´, ?¬ê³ , ë²”ì£„, ?¬íŒ, ?¬íšŒ ?„ìƒ ??ì£¼ìš” ?´ìŠ¤ë¥??¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ì„¸??',
    },
}

export const revalidate = 900


export default async function SocietyPage() {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'
    const collectionSchema = generateCollectionPageSchema('?¬íšŒ')
    const breadcrumbSchema = generateBreadcrumbSchema([
        { name: '??, url: baseUrl },
        { name: '?¬íšŒ', url: `${baseUrl}/society` },
    ])

    const [
        { data },
        { count: totalCount },
        { count: hotCount },
        { count: controversialCount },
        { count: closedCount },
    ] = await Promise.all([
        supabaseAdmin.from('issues').select('*', { count: 'exact' }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).gte('heat_index', MIN_HEAT).eq('category', '?¬íšŒ').order('created_at', { ascending: false }).range(0, 19),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¬íšŒ'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¬íšŒ').eq('status', '?í™”'),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¬íšŒ').eq('status', '?¼ë?ì¤?),
        supabaseAdmin.from('issues').select('*', { count: 'exact', head: true }).eq('approval_status', '?¹ì¸').eq('visibility_status', 'visible').is('merged_into_id', null).eq('category', '?¬íšŒ').eq('status', 'ì¢…ê²°'),
    ])

    const tabCounts = { '': totalCount ?? 0, '?í™”': hotCount ?? 0, '?¼ë?ì¤?: controversialCount ?? 0, 'ì¢…ê²°': closedCount ?? 0 }

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
                <h1 className="text-2xl font-bold text-content-primary mb-6">?¬íšŒ ?´ìŠˆ</h1>
                <IssueList
                    category="?¬íšŒ"
                    initialData={{ data: (data ?? []) as Issue[], total: totalCount ?? 0 }}
                    initialTabCounts={tabCounts}
                infiniteScroll
                />
            </div>
        </>
    )
}
