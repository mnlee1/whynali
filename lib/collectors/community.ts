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

/** "16:44" 또는 "25.02.20" 형태의 더쿠 시간 문자열을 ISO 변환 */
function parseTheqooTime(timeText: string): string {
    const now = new Date()
    const trimmed = timeText.trim()

    /* HH:MM 형식 (당일 게시글) */
    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
    if (timeMatch) {
        const d = new Date(now)
        d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0)
        return d.toISOString()
    }

    /* YY.MM.DD 형식 (이전 게시글) */
    const dateMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})$/)
    if (dateMatch) {
        const year = 2000 + parseInt(dateMatch[1], 10)
        const month = parseInt(dateMatch[2], 10) - 1
        const day = parseInt(dateMatch[3], 10)
        return new Date(year, month, day).toISOString()
    }

    return now.toISOString()
}

/** 더쿠(theqoo.net) 스퀘어 게시판 메타데이터 수집 */
export async function collectTheqoo(): Promise<number> {
    const baseUrl = 'https://theqoo.net'
    const listUrl = `${baseUrl}/square`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        /* 일반 게시글: .bd_lst tbody tr 중 notice/notice_expand 클래스 없는 것 */
        $('.bd_lst tbody tr').each((_, el) => {
            const $el = $(el)
            if (
                $el.hasClass('notice') ||
                $el.hasClass('notice_expand') ||
                $el.hasClass('nofn')
            ) return

            const titleEl = $el.find('td.title a').first()
            const title = titleEl.text().trim()
            const href = titleEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href}`
            const replyText = $el.find('td.title .replyNum').text().replace(/[^0-9]/g, '')
            const comment_count = parseInt(replyText, 10) || 0
            const viewText = $el.find('td.m_no').last().text().replace(/[^0-9]/g, '')
            const view_count = parseInt(viewText, 10) || 0
            const timeText = $el.find('td.time').text().trim()
            const written_at = timeText ? parseTheqooTime(timeText) : now

            posts.push({ title, url, view_count, comment_count, written_at, source_site: '더쿠' })
        })

        if (posts.length === 0) return 0

        /* url UNIQUE 제약 + onConflict ignoreDuplicates로 원자적 중복 방지
           (migration: add_unique_constraints_for_collectors.sql) */
        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url', ignoreDuplicates: true })
            .select('id')
        if (error) throw error
        return upserted?.length ?? 0
    } catch (error) {
        console.error('더쿠 수집 에러:', error)
        return 0
    }
}

/** 네이트판(pann.nate.com) 랭킹 메타데이터 수집 */
export async function collectNatePann(): Promise<number> {
    const baseUrl = 'https://pann.nate.com'
    const listUrl = `${baseUrl}/talk/ranking`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        /* ul.post_wrap > li 구조 */
        $('ul.post_wrap li').each((_, el) => {
            const $el = $(el)
            const titleEl = $el.find('dt h2 a').first()
            const title = titleEl.attr('title')?.trim() || titleEl.text().trim()
            const href = titleEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href}`
            const repleText = $el.find('.reple-num').text().replace(/[^0-9]/g, '')
            const comment_count = parseInt(repleText, 10) || 0
            const countText = $el.find('.count').text().replace('조회', '').replace(/[^0-9]/g, '')
            const view_count = parseInt(countText, 10) || 0

            posts.push({ title, url, view_count, comment_count, written_at: now, source_site: '네이트판' })
        })

        if (posts.length === 0) return 0

        /* url UNIQUE 제약 + onConflict ignoreDuplicates로 원자적 중복 방지
           (migration: add_unique_constraints_for_collectors.sql) */
        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url', ignoreDuplicates: true })
            .select('id')
        if (error) throw error
        return upserted?.length ?? 0
    } catch (error) {
        console.error('네이트판 수집 에러:', error)
        return 0
    }
}

/** 더쿠 + 네이트판 통합 수집 (3분 Cron용) */
export async function collectAllCommunity(): Promise<{ theqoo: number; natePann: number }> {
    const [theqoo, natePann] = await Promise.all([collectTheqoo(), collectNatePann()])
    return { theqoo, natePann }
}
