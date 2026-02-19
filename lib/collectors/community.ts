import { supabaseAdmin } from '@/lib/supabase/server'
import * as cheerio from 'cheerio'

interface CommunityPostRow {
    title: string
    url: string
    view_count: number
    comment_count: number
    written_at: string
    source_site: string
}

async function fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    })
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`)
    }
    return response.text()
}

function parseRelativeTimeToIso(relative: string): string {
    const now = new Date()
    const m = relative.match(/(\d+)\s*분/)
    if (m) {
        now.setMinutes(now.getMinutes() - parseInt(m[1], 10))
        return now.toISOString()
    }
    const h = relative.match(/(\d+)\s*시간/)
    if (h) {
        now.setHours(now.getHours() - parseInt(h[1], 10))
        return now.toISOString()
    }
    const d = relative.match(/(\d+)\s*일/)
    if (d) {
        now.setDate(now.getDate() - parseInt(d[1], 10))
        return now.toISOString()
    }
    return now.toISOString()
}

/**
 * 더쿠(theqoo.net) 메타데이터 수집.
 * 실제 HTML 구조에 맞게 셀렉터 조정 필요.
 */
export async function collectTheqoo(): Promise<number> {
    const baseUrl = 'https://theqoo.net'
    const listUrl = `${baseUrl}/square`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []

        $('.bd_lst .bd_li').each((_, el) => {
            const $el = $(el)
            const titleEl = $el.find('.tit a')
            const title = titleEl.text().trim()
            const href = titleEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
            const viewText = $el.find('.count .num').first().text().trim()
            const commentText = $el.find('.reply_num, .cmt_num').text().trim()
            const view_count = parseInt(viewText.replace(/[^0-9]/g, ''), 10) || 0
            const comment_count = parseInt(commentText.replace(/[^0-9]/g, ''), 10) || 0
            const timeText = $el.find('.date, .time').text().trim() || ''
            const written_at = timeText ? parseRelativeTimeToIso(timeText) : new Date().toISOString()

            posts.push({
                title,
                url,
                view_count,
                comment_count,
                written_at,
                source_site: '더쿠',
            })
        })

        if (posts.length === 0) {
            return 0
        }

        const { error } = await supabaseAdmin.from('community_data').insert(posts)
        if (error) {
            console.error('더쿠 저장 에러:', error)
            throw error
        }
        return posts.length
    } catch (error) {
        console.error('더쿠 수집 에러:', error)
        return 0
    }
}

/**
 * 네이트판 메타데이터 수집.
 * 실제 HTML 구조에 맞게 셀렉터 조정 필요.
 */
export async function collectNatePann(): Promise<number> {
    const baseUrl = 'https://pann.nate.com'
    const listUrl = `${baseUrl}/talk/ranking`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []

        $('.postListItem, .list-content li, [data-type="post"]').each((_, el) => {
            const $el = $(el)
            const titleEl = $el.find('a[href*="/talk/"]').first()
            const title = titleEl.text().trim()
            const href = titleEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`
            const viewEl = $el.find('.count, .hit, .view')
            const commentEl = $el.find('.reply, .comment, .cmt')
            const view_count = parseInt(viewEl.text().replace(/[^0-9]/g, ''), 10) || 0
            const comment_count = parseInt(commentEl.text().replace(/[^0-9]/g, ''), 10) || 0
            const timeEl = $el.find('.date, .time')
            const written_at = timeEl.length
                ? parseRelativeTimeToIso(timeEl.text().trim())
                : new Date().toISOString()

            posts.push({
                title,
                url,
                view_count,
                comment_count,
                written_at,
                source_site: '네이트판',
            })
        })

        if (posts.length === 0) {
            return 0
        }

        const { error } = await supabaseAdmin.from('community_data').insert(posts)
        if (error) {
            console.error('네이트판 저장 에러:', error)
            throw error
        }
        return posts.length
    } catch (error) {
        console.error('네이트판 수집 에러:', error)
        return 0
    }
}

/**
 * 더쿠 + 네이트판 통합 수집 (3분 Cron용).
 */
export async function collectAllCommunity(): Promise<{ theqoo: number; natePann: number }> {
    const [theqoo, natePann] = await Promise.all([
        collectTheqoo(),
        collectNatePann(),
    ])
    return { theqoo, natePann }
}
