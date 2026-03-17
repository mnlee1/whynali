/**
 * scripts/send_dooray_health_report.ts
 * 
 * [Dooray 헬스 리포트 전송]
 * 
 * 트랙A 헬스 체크 결과를 Dooray 메신저로 전송합니다.
 * GitHub Actions에서 자동 실행되거나 수동으로도 실행 가능합니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const doorayWebhook = process.env.DOORAY_WEBHOOK_URL!

const supabase = createClient(supabaseUrl, supabaseKey)

async function sendHealthReport() {
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // 1. 최근 24시간 트랙A 이슈
    const { data: recentIssues } = await supabase
        .from('issues')
        .select('*')
        .eq('source_track', 'track_a')
        .gte('created_at', last24Hours.toISOString())

    const issueCount = recentIssues?.length ?? 0

    // 2. 커뮤니티 수집 상태
    const { data: recentCommunity } = await supabase
        .from('community_data')
        .select('created_at')
        .gte('created_at', last24Hours.toISOString())

    const communityCount = recentCommunity?.length ?? 0
    const lastCollected = recentCommunity?.[0]?.created_at
    const minutesAgo = lastCollected 
        ? Math.floor((now.getTime() - new Date(lastCollected).getTime()) / 60000)
        : 999

    // 3. AI API 상태
    const { data: aiStatus } = await supabase
        .from('ai_key_status')
        .select('*')
        .eq('provider', 'groq')

    const availableKeys = aiStatus?.filter(k => !k.is_blocked).length ?? 0
    const totalKeys = aiStatus?.length ?? 0

    // 4. 판정
    const issues: string[] = []
    let status = '✅ 정상'

    if (issueCount === 0) {
        issues.push('트랙A 이슈 생성 없음 (24시간)')
        status = '⚠️ 경고'
    }

    if (communityCount === 0) {
        issues.push('커뮤니티 데이터 수집 중단')
        status = '❌ 오류'
    } else if (minutesAgo > 60) {
        issues.push(`커뮤니티 수집 지연 (${minutesAgo}분 전)`)
        status = '⚠️ 경고'
    }

    if (availableKeys === 0) {
        issues.push('Groq API 키 전체 차단')
        status = '❌ 오류'
    }

    // 5. Dooray 메시지 생성
    let message = `${status} **트랙A 일일 헬스 체크**\n\n`
    message += `**📊 통계 (최근 24시간)**\n`
    message += `- 생성된 이슈: ${issueCount}개\n`
    message += `- 수집 커뮤니티: ${communityCount}건\n`
    message += `- AI API 키: ${availableKeys}/${totalKeys}개 사용 가능\n`

    if (issues.length > 0) {
        message += `\n**⚠️ 발견된 문제**\n`
        issues.forEach(issue => {
            message += `- ${issue}\n`
        })
    }

    if (issueCount > 0) {
        message += `\n**최근 생성 이슈**\n`
        recentIssues?.slice(0, 3).forEach(issue => {
            message += `- ${issue.title.substring(0, 50)}...\n`
        })
    }

    // 6. Dooray 전송
    if (!doorayWebhook) {
        console.log('DOORAY_WEBHOOK_URL 환경변수가 없습니다.')
        console.log('메시지 내용:')
        console.log(message)
        return
    }

    try {
        const response = await fetch(doorayWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                botName: '트랙A 모니터',
                botIconImage: 'https://static.dooray.com/static_images/dooray-bot.png',
                text: message,
            }),
        })

        if (response.ok) {
            console.log('✅ Dooray 알림 전송 완료')
        } else {
            console.error('❌ Dooray 전송 실패:', response.status)
        }
    } catch (error) {
        console.error('❌ Dooray 전송 오류:', error)
    }
}

sendHealthReport().catch(console.error)
