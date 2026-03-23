import { supabaseAdmin } from '@/lib/supabase/server'
import * as cheerio from 'cheerio'

const COMMUNITY_MIN_EXPECTED_POSTS = parseInt(
    process.env.COMMUNITY_MIN_EXPECTED_POSTS ?? '5'
)

interface CollectResult {
    count: number
    skipped: number
    warning?: string
}

interface CommunityPostRow {
    title: string
    url: string
    view_count: number
    comment_count: number
    written_at: string | null
    source_site: string
    updated_at?: string
}

async function fetchHtml(url: string): Promise<string> {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
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

/** "16:44", "25.02.20", "2026.03.16 20:56" 형태의 더쿠 시간 문자열을 ISO 변환 */
function parseTheqooTime(timeText: string): string {
    const now = new Date()
    const trimmed = timeText.trim()

    /* YYYY.MM.DD HH:MM 형식 (상세 페이지) */
    const fullDateTimeMatch = trimmed.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2})$/)
    if (fullDateTimeMatch) {
        const year = parseInt(fullDateTimeMatch[1], 10)
        const month = parseInt(fullDateTimeMatch[2], 10) - 1
        const day = parseInt(fullDateTimeMatch[3], 10)
        const hours = parseInt(fullDateTimeMatch[4], 10)
        const minutes = parseInt(fullDateTimeMatch[5], 10)
        return new Date(year, month, day, hours, minutes, 0, 0).toISOString()
    }

    /* HH:MM 형식 (당일 게시글) */
    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
    if (timeMatch) {
        const d = new Date(now)
        d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0)

        /* 파싱된 시각이 현재보다 미래면 전날 게시글 (자정 넘어서 수집한 경우) */
        if (d > now) {
            d.setDate(d.getDate() - 1)
        }

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

/** 더쿠(theqoo.net) 전체 게시판 메타데이터 수집 */
export async function collectTheqoo(): Promise<CollectResult> {
    const baseUrl = 'https://theqoo.net'
    const listUrl = `${baseUrl}/total`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const mainPosts: CommunityPostRow[] = []
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

            mainPosts.push({
                title,
                url,
                view_count,
                comment_count,
                written_at,
                source_site: '더쿠',
                updated_at: now
            })
        })

        // 스크래핑 장애 감지
        const mainWarning = mainPosts.length < COMMUNITY_MIN_EXPECTED_POSTS
            ? `더쿠 수집 이상: ${mainPosts.length}건 수집 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). HTML 구조 변경 가능성 있음.`
            : undefined

        if (mainWarning) {
            console.error('[스크래핑 경고]', mainWarning, { url: listUrl })
        }

        if (mainPosts.length === 0) {
            return { count: 0, skipped: 0, warning: mainWarning }
        }

        /* ① 메인 페이지 게시글 즉시 upsert (타임아웃 전에 반드시 저장) */
        const { error: mainError, data: mainUpserted } = await supabaseAdmin
            .from('community_data')
            .upsert(mainPosts, { onConflict: 'url' })
            .select('id')
        if (mainError) throw mainError

        const mainCount = mainUpserted?.length ?? 0

        /* ② 추가 크롤링: 이슈 연결 게시글 & 인기 게시글 업데이트 (best-effort) */
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

            const { data: linkedPosts } = await supabaseAdmin
                .from('community_data')
                .select('url')
                .eq('source_site', '더쿠')
                .not('issue_id', 'is', null)
                .gte('created_at', sevenDaysAgo)

            const { data: popularPosts } = await supabaseAdmin
                .from('community_data')
                .select('url')
                .eq('source_site', '더쿠')
                .or('view_count.gte.30000,comment_count.gte.50')
                .gte('created_at', sevenDaysAgo)

            console.log(`[더쿠 수집] 이슈 연결: ${linkedPosts?.length || 0}건, 인기글: ${popularPosts?.length || 0}건`)

            const trackingUrls = new Set([
                ...(linkedPosts?.map(p => p.url) || []),
                ...(popularPosts?.map(p => p.url) || [])
            ])
            const currentUrls = new Set(mainPosts.map(p => p.url))
            const missingLinkedUrls = Array.from(trackingUrls).filter(url => url && !currentUrls.has(url))

            if (missingLinkedUrls.length > 0) {
                const additionalPosts: CommunityPostRow[] = []

                for (const url of missingLinkedUrls.slice(0, 15)) {
                    try {
                        const postHtml = await fetchHtml(url)
                        const $post = cheerio.load(postHtml)

                        const title = $post('.theqoo_document_header .title').text().trim() ||
                                      $post('meta[property="og:title"]').attr('content')?.trim() || ''

                        const countText = $post('.count_container').first().text().replace(/\s+/g, ' ').trim()
                        const allNumbers = countText.match(/\d+(?:,\d{3})*/g) || []

                        const view_count = allNumbers[0] ? parseInt(allNumbers[0].replace(/,/g, ''), 10) : 0
                        const comment_count = allNumbers[1] ? parseInt(allNumbers[1].replace(/,/g, ''), 10) : 0

                        const dateText = $post('.btm_area .side.fr span').text().trim()
                        const written_at = dateText ? parseTheqooTime(dateText.replace(/\./g, '.').trim()) : now

                        if (title && view_count > 0) {
                            additionalPosts.push({
                                title,
                                url,
                                view_count,
                                comment_count,
                                written_at,
                                source_site: '더쿠',
                                updated_at: now
                            })
                        }
                    } catch (err) {
                        console.log(`더쿠 개별 게시글 크롤링 실패: ${url}`, err)
                    }
                }

                if (additionalPosts.length > 0) {
                    const { error: addError } = await supabaseAdmin
                        .from('community_data')
                        .upsert(additionalPosts, { onConflict: 'url' })
                        .select('id')
                    if (addError) console.error('[더쿠] 추가 크롤링 upsert 실패:', addError)
                }
            }
        } catch (additionalErr) {
            // 추가 크롤링 실패해도 메인 수집 결과는 이미 저장됨
            console.error('[더쿠] 추가 크롤링 중 에러 (무시):', additionalErr)
        }

        return {
            count: mainCount,
            skipped: mainPosts.length - mainCount,
            warning: mainWarning,
        }
    } catch (error) {
        console.error('더쿠 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** 네이트판(pann.nate.com) 랭킹 메타데이터 수집 */
export async function collectNatePann(): Promise<CollectResult> {
    const baseUrl = 'https://pann.nate.com'
    const listUrl = `${baseUrl}/talk/ranking`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const mainPosts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        /* 기존 데이터 조회 (written_at 유지용) */
        const urls = new Set<string>()
        $('ul.post_wrap li').each((_, el) => {
            const href = $(el).find('dt h2 a').first().attr('href')
            if (href) {
                const url = href.startsWith('http') ? href : `${baseUrl}${href}`
                urls.add(url)
            }
        })

        const { data: existingPosts } = await supabaseAdmin
            .from('community_data')
            .select('url, written_at')
            .in('url', Array.from(urls))

        const existingMap = new Map(existingPosts?.map(p => [p.url, p.written_at]) || [])

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

            /* 네이트판 랭킹 페이지에는 작성 시각 정보 없음 → 항상 null */
            const written_at = null

            mainPosts.push({
                title,
                url,
                view_count,
                comment_count,
                written_at,
                source_site: '네이트판',
                updated_at: now
            })
        })

        // 스크래핑 장애 감지
        const mainWarning = mainPosts.length < COMMUNITY_MIN_EXPECTED_POSTS
            ? `네이트판 수집 이상: ${mainPosts.length}건 수집 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). HTML 구조 변경 가능성 있음.`
            : undefined

        if (mainWarning) {
            console.error('[스크래핑 경고]', mainWarning, { url: listUrl })
        }

        if (mainPosts.length === 0) {
            return { count: 0, skipped: 0, warning: mainWarning }
        }

        /* ① 메인 페이지 게시글 즉시 upsert (타임아웃 전에 반드시 저장) */
        const { error: mainError, data: mainUpserted } = await supabaseAdmin
            .from('community_data')
            .upsert(mainPosts, { onConflict: 'url' })
            .select('id')
        if (mainError) throw mainError

        const mainCount = mainUpserted?.length ?? 0

        /* ② 추가 크롤링: 이슈 연결 게시글 & 인기 게시글 업데이트 (best-effort) */
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

            const { data: linkedPosts } = await supabaseAdmin
                .from('community_data')
                .select('url, written_at')
                .eq('source_site', '네이트판')
                .not('issue_id', 'is', null)
                .gte('created_at', sevenDaysAgo)

            const { data: popularPosts } = await supabaseAdmin
                .from('community_data')
                .select('url, written_at')
                .eq('source_site', '네이트판')
                .or('view_count.gte.30000,comment_count.gte.50')
                .gte('created_at', sevenDaysAgo)

            console.log(`[네이트판 수집] 이슈 연결: ${linkedPosts?.length || 0}건, 인기글: ${popularPosts?.length || 0}건`)

            const allTrackingPosts = [
                ...(linkedPosts || []),
                ...(popularPosts || [])
            ]
            const trackingUrls = new Set(allTrackingPosts.map(p => p.url))
            const currentUrls = new Set(mainPosts.map(p => p.url))

            const writtenAtMap = new Map<string, string>()
            existingMap.forEach((value, key) => writtenAtMap.set(key, value))
            allTrackingPosts.forEach(p => writtenAtMap.set(p.url, p.written_at))

            const missingLinkedUrls = Array.from(trackingUrls).filter(url => url && !currentUrls.has(url))

            if (missingLinkedUrls.length > 0) {
                const additionalPosts: CommunityPostRow[] = []

                for (const url of missingLinkedUrls.slice(0, 15)) {
                    try {
                        const postHtml = await fetchHtml(url)
                        const $post = cheerio.load(postHtml)

                        const title = $post('meta[property="og:title"]').attr('content')?.trim() || ''
                        const viewMatch = $post('.info .count').text().match(/(\d+)/)
                        const view_count = viewMatch ? parseInt(viewMatch[1], 10) : 0
                        const comment_count = $post('.cbox_module .u_cbox_count').length || 0
                        const written_at = null

                        if (title) {
                            additionalPosts.push({
                                title,
                                url,
                                view_count,
                                comment_count,
                                written_at,
                                source_site: '네이트판',
                                updated_at: now
                            })
                        }
                    } catch (err) {
                        console.log(`네이트판 개별 게시글 크롤링 실패: ${url}`)
                    }
                }

                if (additionalPosts.length > 0) {
                    const { error: addError } = await supabaseAdmin
                        .from('community_data')
                        .upsert(additionalPosts, { onConflict: 'url' })
                        .select('id')
                    if (addError) console.error('[네이트판] 추가 크롤링 upsert 실패:', addError)
                }
            }
        } catch (additionalErr) {
            // 추가 크롤링 실패해도 메인 수집 결과는 이미 저장됨
            console.error('[네이트판] 추가 크롤링 중 에러 (무시):', additionalErr)
        }

        return {
            count: mainCount,
            skipped: mainPosts.length - mainCount,
            warning: mainWarning,
        }
    } catch (error) {
        console.error('네이트판 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** 클리앙(clien.net) 전체 게시판 통합 피드 메타데이터 수집 */
export async function collectClien(): Promise<CollectResult> {
    const baseUrl = 'https://www.clien.net'
    const listUrl = `${baseUrl}/service/group/board_all`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        $('div.list_item.symph_row').each((_, el) => {
            const $el = $(el)
            const linkEl = $el.find('a.list_subject').first()
            const title = $el.find('.subject_fixed').first().attr('title')?.trim()
                       || linkEl.text().trim()
            const href = linkEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href}`
            const viewText = $el.find('.list_hit .hit').text().replace(/[^0-9]/g, '')
            const view_count = parseInt(viewText, 10) || 0
            const comment_count = parseInt($el.attr('data-comment-count') ?? '0', 10) || 0
            const timeText = $el.find('.timestamp').text().trim()
            const written_at = timeText ? new Date(timeText).toISOString() : now

            posts.push({ title, url, view_count, comment_count, written_at, source_site: '클리앙', updated_at: now })
        })

        const warning = posts.length < COMMUNITY_MIN_EXPECTED_POSTS
            ? `클리앙 수집 이상: ${posts.length}건 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). HTML 구조 변경 가능성.`
            : undefined
        if (warning) console.error('[스크래핑 경고]', warning)
        if (posts.length === 0) return { count: 0, skipped: 0, warning }

        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url' })
            .select('id')
        if (error) throw error

        return { count: upserted?.length ?? 0, skipped: posts.length - (upserted?.length ?? 0), warning }
    } catch (error) {
        console.error('클리앙 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** "16:13", "03/18", "2026.03.18" 형태의 보배드림 시간 문자열을 ISO 변환 */
function parseBobaeTime(dateText: string): string {
    const now = new Date()
    const trimmed = dateText.trim()

    // HH:MM 형식 (당일)
    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
    if (timeMatch) {
        const d = new Date(now)
        d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0)
        if (d > now) d.setDate(d.getDate() - 1)
        return d.toISOString()
    }

    // MM/DD 형식 (올해)
    const mdMatch = trimmed.match(/^(\d{1,2})\/(\d{2})$/)
    if (mdMatch) {
        return new Date(now.getFullYear(), parseInt(mdMatch[1], 10) - 1, parseInt(mdMatch[2], 10)).toISOString()
    }

    // YYYY.MM.DD 형식
    const fullMatch = trimmed.match(/^(\d{4})\.(\d{2})\.(\d{2})$/)
    if (fullMatch) {
        return new Date(parseInt(fullMatch[1]), parseInt(fullMatch[2], 10) - 1, parseInt(fullMatch[3], 10)).toISOString()
    }

    return now.toISOString()
}

/** 보배드림(bobaedream.co.kr) 자유게시판 메타데이터 수집 */
export async function collectBobaedream(): Promise<CollectResult> {
    const baseUrl = 'https://www.bobaedream.co.kr'
    const listUrl = `${baseUrl}/list?code=freeb`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        $('table#boardlist tbody tr').each((_, el) => {
            const $el = $(el)
            const linkEl = $el.find('a.bsubject').first()
            const title = linkEl.attr('title')?.trim() || linkEl.text().trim()
            const href = linkEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href}`
            const viewText = $el.find('td.count').first().text().replace(/[^0-9]/g, '')
            const view_count = parseInt(viewText, 10) || 0
            const commentText = $el.find('strong.totreply').first().text().replace(/[^0-9]/g, '')
            const comment_count = parseInt(commentText, 10) || 0
            const dateText = $el.find('td.date').first().text().trim()
            const written_at = parseBobaeTime(dateText)

            posts.push({ title, url, view_count, comment_count, written_at, source_site: '보배드림', updated_at: now })
        })

        const warning = posts.length < COMMUNITY_MIN_EXPECTED_POSTS
            ? `보배드림 수집 이상: ${posts.length}건 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). HTML 구조 변경 가능성.`
            : undefined
        if (warning) console.error('[스크래핑 경고]', warning)
        if (posts.length === 0) return { count: 0, skipped: 0, warning }

        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url' })
            .select('id')
        if (error) throw error

        return { count: upserted?.length ?? 0, skipped: posts.length - (upserted?.length ?? 0), warning }
    } catch (error) {
        console.error('보배드림 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** 루리웹(ruliweb.com) 이슈&토론 게시판 메타데이터 수집 */
export async function collectRuliweb(): Promise<CollectResult> {
    const baseUrl = 'https://bbs.ruliweb.com'
    const listUrl = `${baseUrl}/community/board/300143`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        $('tr.table_body').each((_, el) => {
            const $el = $(el)
            if ($el.hasClass('notice')) return

            const titleEl = $el.find('td.subject a.deco').first()
            const title = titleEl.text().trim()
            const href = titleEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}${href}`
            const viewText = $el.find('td.hit').text().replace(/[^0-9]/g, '')
            const view_count = parseInt(viewText, 10) || 0
            const replyText = $el.find('td.replynum').text().replace(/[^0-9]/g, '')
            const comment_count = parseInt(replyText, 10) || 0
            const timeText = $el.find('td.time').text().trim()
            const written_at = timeText ? new Date(timeText).toISOString() : now

            posts.push({ title, url, view_count, comment_count, written_at, source_site: '루리웹', updated_at: now })
        })

        const warning = posts.length < COMMUNITY_MIN_EXPECTED_POSTS
            ? `루리웹 수집 이상: ${posts.length}건 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). HTML 구조 변경 가능성.`
            : undefined
        if (warning) console.error('[스크래핑 경고]', warning)
        if (posts.length === 0) return { count: 0, skipped: 0, warning }

        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url' })
            .select('id')
        if (error) throw error

        return { count: upserted?.length ?? 0, skipped: posts.length - (upserted?.length ?? 0), warning }
    } catch (error) {
        console.error('루리웹 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** "26.03.23 16:25:27" 형태의 뽐뿌 시간 문자열을 ISO 변환 */
function parsePpomppuTime(timeText: string): string {
    const now = new Date()
    const trimmed = timeText.trim()

    // YY.MM.DD HH:MM:SS 형식
    const fullMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
    if (fullMatch) {
        const year = 2000 + parseInt(fullMatch[1], 10)
        const month = parseInt(fullMatch[2], 10) - 1
        const day = parseInt(fullMatch[3], 10)
        const hours = parseInt(fullMatch[4], 10)
        const minutes = parseInt(fullMatch[5], 10)
        const seconds = parseInt(fullMatch[6], 10)
        return new Date(year, month, day, hours, minutes, seconds).toISOString()
    }

    return now.toISOString()
}

/** 뽐뿌(ppomppu.co.kr) 자유게시판 메타데이터 수집 */
export async function collectPpomppu(): Promise<CollectResult> {
    const baseUrl = 'https://www.ppomppu.co.kr'
    const listUrl = `${baseUrl}/zboard/zboard.php?id=freeboard`

    try {
        const html = await fetchHtml(listUrl)
        const $ = cheerio.load(html)
        const posts: CommunityPostRow[] = []
        const now = new Date().toISOString()

        $('tr.baseList').each((_, el) => {
            const $el = $(el)
            const linkEl = $el.find('a.baseList-title').first()
            const title = linkEl.find('span').first().text().trim() || linkEl.text().trim()
            const href = linkEl.attr('href')
            if (!title || !href) return

            const url = href.startsWith('http') ? href : `${baseUrl}/zboard/${href}`
            const viewText = $el.find('td.baseList-views').text().replace(/[^0-9]/g, '')
            const view_count = parseInt(viewText, 10) || 0
            const commentText = $el.find('span.baseList-c').text().replace(/[^0-9]/g, '')
            const comment_count = parseInt(commentText, 10) || 0
            const timeAttr = $el.find('time.baseList-time').attr('title') ?? ''
            const written_at = timeAttr ? parsePpomppuTime(timeAttr) : now

            posts.push({ title, url, view_count, comment_count, written_at, source_site: '뽐뿌', updated_at: now })
        })

        const warning = posts.length < COMMUNITY_MIN_EXPECTED_POSTS
            ? `뽐뿌 수집 이상: ${posts.length}건 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). HTML 구조 변경 가능성.`
            : undefined
        if (warning) console.error('[스크래핑 경고]', warning)
        if (posts.length === 0) return { count: 0, skipped: 0, warning }

        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url' })
            .select('id')
        if (error) throw error

        return { count: upserted?.length ?? 0, skipped: posts.length - (upserted?.length ?? 0), warning }
    } catch (error) {
        console.error('뽐뿌 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** 전체 커뮤니티 통합 수집 (1분 Cron용) */
export async function collectAllCommunity(): Promise<{
    theqoo: CollectResult
    natePann: CollectResult
    clien: CollectResult
    bobaedream: CollectResult
    ruliweb: CollectResult
    ppomppu: CollectResult
}> {
    const [theqoo, natePann, clien, bobaedream, ruliweb, ppomppu] = await Promise.all([
        collectTheqoo(),
        collectNatePann(),
        collectClien(),
        collectBobaedream(),
        collectRuliweb(),
        collectPpomppu(),
    ])
    return { theqoo, natePann, clien, bobaedream, ruliweb, ppomppu }
}
