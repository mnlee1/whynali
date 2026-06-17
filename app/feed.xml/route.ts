import { supabaseAdmin } from '@/lib/supabase-server'
import { SITE_URL } from '@/lib/seo/site'

export const revalidate = 3600

export async function GET() {
    const baseUrl = SITE_URL

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, topic_description, category, status, created_at, updated_at')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .order('updated_at', { ascending: false })
        .limit(50)

    const items = (issues ?? []).map((issue) => {
        const url = `${baseUrl}/issue/${issue.id}`
        const description = issue.topic_description || `${issue.category} 카테고리의 ${issue.status} 이슈`
        const pubDate = new Date(issue.updated_at).toUTCString()

        return `
    <item>
      <title><![CDATA[${issue.title}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[${description}]]></description>
      <category><![CDATA[${issue.category}]]></category>
      <pubDate>${pubDate}</pubDate>
    </item>`
    }).join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>왜난리 - 요즘 난리, 한눈에</title>
    <link>${baseUrl}</link>
    <description>지금 한국에서 가장 뜨거운 이슈를 한눈에 확인하세요. 연예·정치·사회·스포츠 실시간 논란을 왜난리에서 빠르게 파악하세요.</description>
    <language>ko</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
        },
    })
}
