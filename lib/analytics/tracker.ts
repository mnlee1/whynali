/**
 * lib/analytics/tracker.ts
 * 
 * [방문자 추적 시스템]
 * 
 * 페이지뷰, 유입 경로, 전환 이벤트를 자동으로 추적합니다.
 * 재미나이 제안 반영: 유입 경로별 세분화, 전환율 측정
 */

import { supabase } from '@/lib/supabase/client'

// 세션 ID 생성 (브라우저 세션 단위)
function getSessionId(): string {
    if (typeof window === 'undefined') return ''
    
    let sessionId = localStorage.getItem('whynali_session_id')
    if (!sessionId) {
        sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('whynali_session_id', sessionId)
    }
    return sessionId
}

// UTM 파라미터 파싱
function getUTMParams(): {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
} {
    if (typeof window === 'undefined') return {}
    
    const params = new URLSearchParams(window.location.search)
    const utm: any = {}
    
    if (params.get('utm_source')) utm.utm_source = params.get('utm_source')
    if (params.get('utm_medium')) utm.utm_medium = params.get('utm_medium')
    if (params.get('utm_campaign')) utm.utm_campaign = params.get('utm_campaign')
    if (params.get('utm_content')) utm.utm_content = params.get('utm_content')
    
    // 유입 경로 자동 감지
    if (!utm.utm_source) {
        const referrer = document.referrer
        if (!referrer) {
            utm.utm_source = 'direct'
        } else if (referrer.includes('threads.net')) {
            utm.utm_source = 'threads'
            utm.utm_medium = 'social'
        } else if (referrer.includes('instagram.com')) {
            utm.utm_source = 'instagram'
            utm.utm_medium = 'social'
        } else if (referrer.includes('twitter.com') || referrer.includes('t.co')) {
            utm.utm_source = 'twitter'
            utm.utm_medium = 'social'
        } else if (referrer.includes('google.com')) {
            utm.utm_source = 'google'
            utm.utm_medium = 'organic'
        } else if (referrer.includes('naver.com')) {
            utm.utm_source = 'naver'
            utm.utm_medium = 'organic'
        } else {
            utm.utm_source = 'referral'
            utm.utm_medium = 'referral'
        }
    }
    
    // UTM 파라미터 저장 (첫 방문 시)
    if (!sessionStorage.getItem('whynali_first_utm')) {
        sessionStorage.setItem('whynali_first_utm', JSON.stringify(utm))
    }
    
    return utm
}

// 디바이스 타입 감지
function getDeviceType(): string {
    if (typeof window === 'undefined') return 'unknown'
    
    const ua = navigator.userAgent
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return 'tablet'
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
        return 'mobile'
    }
    return 'desktop'
}

// 페이지뷰 추적
export async function trackPageView(params: {
    pageType: 'home' | 'issue' | 'discussion' | 'vote' | 'profile' | 'other'
    pagePath?: string
    issueId?: string
    discussionId?: string
}) {
    try {
        const sessionId = getSessionId()
        const utm = getUTMParams()
        const deviceType = getDeviceType()
        
        const { data: { user } } = await supabase.auth.getUser()
        
        // 관리자는 KPI 추적에서 제외
        if (user?.app_metadata?.is_admin === true) {
            console.debug('[Analytics] Admin user - skipping tracking')
            return
        }
        
        await supabase.from('page_views').insert({
            user_id: user?.id || null,
            session_id: sessionId,
            page_type: params.pageType,
            page_path: params.pagePath || window.location.pathname,
            issue_id: params.issueId || null,
            discussion_id: params.discussionId || null,
            referrer: document.referrer || null,
            ...utm,
            user_agent: navigator.userAgent,
            device_type: deviceType,
        })
    } catch (error) {
        // 추적 실패는 조용히 무시 (사용자 경험에 영향 없음)
        console.debug('[Analytics] trackPageView failed:', error)
    }
}

// 전환 이벤트 추적 (재미나이 제안 2번)
export async function trackConversion(params: {
    eventType: 'signup' | 'vote' | 'comment' | 'reaction'
    issueId?: string
    discussionId?: string
}) {
    try {
        const sessionId = getSessionId()
        const { data: { user } } = await supabase.auth.getUser()
        
        // 관리자는 KPI 추적에서 제외
        if (user?.app_metadata?.is_admin === true) {
            console.debug('[Analytics] Admin user - skipping conversion tracking')
            return
        }
        
        // 첫 방문 시 UTM 가져오기
        const firstUTM = JSON.parse(sessionStorage.getItem('whynali_first_utm') || '{}')
        
        await supabase.from('conversion_events').insert({
            user_id: user?.id || null,
            session_id: sessionId,
            event_type: params.eventType,
            issue_id: params.issueId || null,
            discussion_id: params.discussionId || null,
            first_utm_source: firstUTM.utm_source || null,
            first_utm_campaign: firstUTM.utm_campaign || null,
        })
    } catch (error) {
        console.debug('[Analytics] trackConversion failed:', error)
    }
}

// 자동 페이지뷰 추적 (Next.js App Router)
export function usePageTracking() {
    if (typeof window === 'undefined') return
    
    // 페이지 로드 시 자동 추적
    const path = window.location.pathname
    
    if (path === '/') {
        trackPageView({ pageType: 'home' })
    } else if (path.startsWith('/issues/')) {
        const issueId = path.split('/')[2]
        trackPageView({ pageType: 'issue', issueId })
    } else if (path.startsWith('/discussions/')) {
        const discussionId = path.split('/')[2]
        trackPageView({ pageType: 'discussion', discussionId })
    } else if (path.startsWith('/votes')) {
        trackPageView({ pageType: 'vote' })
    } else if (path.startsWith('/profile')) {
        trackPageView({ pageType: 'profile' })
    } else {
        trackPageView({ pageType: 'other' })
    }
}
