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
    written_at: string
    source_site: string
    updated_at?: string
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

/** 더쿠(theqoo.net) 스퀘어 게시판 메타데이터 수집 */
export async function collectTheqoo(): Promise<CollectResult> {
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

            posts.push({ 
                title, 
                url, 
                view_count, 
                comment_count, 
                written_at, 
                source_site: '더쿠',
                updated_at: now
            })
        })

        /* 메인 페이지에 없지만 추가 크롤링이 필요한 게시글 조회 */
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        
        // 1) 이슈에 연결된 게시글
        const { data: linkedPosts } = await supabaseAdmin
            .from('community_data')
            .select('url')
            .eq('source_site', '더쿠')
            .not('issue_id', 'is', null)
            .gte('created_at', sevenDaysAgo)
        
        // 2) 인기 게시글 (조회수 3만 이상 OR 댓글 50개 이상)
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
        const currentUrls = new Set(posts.map(p => p.url))

        /* 메인 페이지에 없지만 추적이 필요한 게시글은 직접 크롤링하여 업데이트 */
        const missingLinkedUrls = Array.from(trackingUrls).filter(url => url && !currentUrls.has(url))
        
        for (const url of missingLinkedUrls.slice(0, 15)) { // 최대 15개까지 추가 크롤링 (7일 + 효율화)
            try {
                const postHtml = await fetchHtml(url)
                const $post = cheerio.load(postHtml)
                
                const title = $post('.theqoo_document_header .title').text().trim() || 
                              $post('meta[property="og:title"]').attr('content')?.trim() || ''
                
                /* 더쿠 상세 페이지: .count_container 전체 텍스트에서 모든 숫자 추출 */
                const countText = $post('.count_container').first().text().replace(/\s+/g, ' ').trim()
                const allNumbers = countText.match(/\d+(?:,\d{3})*/g) || []
                
                const view_count = allNumbers[0] ? parseInt(allNumbers[0].replace(/,/g, ''), 10) : 0
                const comment_count = allNumbers[1] ? parseInt(allNumbers[1].replace(/,/g, ''), 10) : 0
                
                const dateText = $post('.btm_area .side.fr span').text().trim()
                const written_at = dateText ? parseTheqooTime(dateText.replace(/\./g, '.').trim()) : now

                if (title && view_count > 0) {
                    posts.push({
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

        // 스크래핑 장애 감지: 수집 건수가 최소 기대값보다 적으면 경고
        if (posts.length < COMMUNITY_MIN_EXPECTED_POSTS) {
            const warning =
                `더쿠 수집 이상: ${posts.length}건 수집 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). ` +
                `HTML 구조 변경 가능성 있음.`
            console.error('[스크래핑 경고]', warning, { url: listUrl })

            // 수집된 건이 있으면 그대로 INSERT (버리지 않음)
            // 0건이면 upsert 스킵
            if (posts.length === 0) {
                return { count: 0, skipped: 0, warning }
            }
        }

        if (posts.length === 0) return { count: 0, skipped: 0 }

        /* url UNIQUE 제약 + onConflict로 중복 URL 감지 시 view_count, comment_count 업데이트
           (migration: add_unique_constraints_for_collectors.sql) */
        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url' })
            .select('id')
        if (error) throw error
        
        return {
            count: upserted?.length ?? 0,
            skipped: posts.length - (upserted?.length ?? 0),
            warning: posts.length < COMMUNITY_MIN_EXPECTED_POSTS
                ? `수집 건수 ${posts.length}건 — 구조 변경 의심`
                : undefined,
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
        const posts: CommunityPostRow[] = []
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

            /* 기존 데이터가 있으면 written_at 유지, 없으면 현재 시각 사용 */
            const written_at = existingMap.get(url) || now

            posts.push({ 
                title, 
                url, 
                view_count, 
                comment_count, 
                written_at,
                source_site: '네이트판',
                updated_at: now
            })
        })

        /* 메인 페이지에 없지만 추가 크롤링이 필요한 게시글 조회 */
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        
        // 1) 이슈에 연결된 게시글
        const { data: linkedPosts } = await supabaseAdmin
            .from('community_data')
            .select('url, written_at')
            .eq('source_site', '네이트판')
            .not('issue_id', 'is', null)
            .gte('created_at', sevenDaysAgo)
        
        // 2) 인기 게시글 (조회수 3만 이상 OR 댓글 50개 이상)
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
        const currentUrls = new Set(posts.map(p => p.url))
        
        // existingMap (메인 페이지)과 trackingPosts의 written_at 합치기
        const writtenAtMap = new Map<string, string>()
        existingMap.forEach((value, key) => writtenAtMap.set(key, value))
        allTrackingPosts.forEach(p => writtenAtMap.set(p.url, p.written_at))

        /* 메인 페이지에 없지만 추적이 필요한 게시글은 직접 크롤링하여 업데이트 */
        const missingLinkedUrls = Array.from(trackingUrls).filter(url => url && !currentUrls.has(url))
        
        for (const url of missingLinkedUrls.slice(0, 15)) { // 최대 15개까지 추가 크롤링 (7일 + 효율화)
            try {
                const postHtml = await fetchHtml(url)
                const $post = cheerio.load(postHtml)
                
                const title = $post('meta[property="og:title"]').attr('content')?.trim() || ''
                const viewMatch = $post('.info .count').text().match(/(\d+)/)
                const view_count = viewMatch ? parseInt(viewMatch[1], 10) : 0
                const comment_count = $post('.cbox_module .u_cbox_count').length || 0
                const written_at = writtenAtMap.get(url) || now

                if (title) {
                    posts.push({
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

        // 스크래핑 장애 감지: 수집 건수가 최소 기대값보다 적으면 경고
        if (posts.length < COMMUNITY_MIN_EXPECTED_POSTS) {
            const warning =
                `네이트판 수집 이상: ${posts.length}건 수집 (최소 ${COMMUNITY_MIN_EXPECTED_POSTS}건 기대). ` +
                `HTML 구조 변경 가능성 있음.`
            console.error('[스크래핑 경고]', warning, { url: listUrl })

            // 수집된 건이 있으면 그대로 INSERT (버리지 않음)
            // 0건이면 upsert 스킵
            if (posts.length === 0) {
                return { count: 0, skipped: 0, warning }
            }
        }

        if (posts.length === 0) return { count: 0, skipped: 0 }

        /* url UNIQUE 제약 + onConflict로 중복 URL 감지 시 view_count, comment_count 업데이트
           (migration: add_unique_constraints_for_collectors.sql) */
        const { error, data: upserted } = await supabaseAdmin
            .from('community_data')
            .upsert(posts, { onConflict: 'url' })
            .select('id')
        if (error) throw error
        
        return {
            count: upserted?.length ?? 0,
            skipped: posts.length - (upserted?.length ?? 0),
            warning: posts.length < COMMUNITY_MIN_EXPECTED_POSTS
                ? `수집 건수 ${posts.length}건 — 구조 변경 의심`
                : undefined,
        }
    } catch (error) {
        console.error('네이트판 수집 에러:', error)
        return { count: 0, skipped: 0, warning: `수집 실패: ${error}` }
    }
}

/** 더쿠 + 네이트판 통합 수집 (3분 Cron용) */
export async function collectAllCommunity(): Promise<{ theqoo: CollectResult; natePann: CollectResult }> {
    const [theqoo, natePann] = await Promise.all([collectTheqoo(), collectNatePann()])
    return { theqoo, natePann }
}
