/**
 * scripts/test-youtube-auth.ts
 *
 * YOUTUBE_REFRESH_TOKEN이 아직 유효한지 직접 확인하는 일회성 진단 스크립트.
 * channels.list(mine=true)만 호출 — 읽기 전용, 실제 업로드/삭제 없음.
 */

import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { google } from 'googleapis'

async function main() {
    const clientId = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN

    console.log('=== YouTube OAuth 인증 상태 확인 ===\n')
    console.log('YOUTUBE_CLIENT_ID 설정됨:', !!clientId)
    console.log('YOUTUBE_CLIENT_SECRET 설정됨:', !!clientSecret)
    console.log('YOUTUBE_REFRESH_TOKEN 설정됨:', !!refreshToken)
    console.log('')

    if (!clientId || !clientSecret || !refreshToken) {
        console.error('환경변수 누락 — 확인 불가')
        return
    }

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'https://developers.google.com/oauthplayground'
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })

    try {
        // access token 발급 시도 (refresh_token → access_token 교환)
        const tokenResponse = await oauth2Client.getAccessToken()
        console.log('✅ access token 발급 성공 (refresh token 유효)')
        console.log('   access token 존재:', !!tokenResponse.token)

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
        const res = await youtube.channels.list({ part: ['snippet', 'statistics'], mine: true })
        const channel = res.data.items?.[0]
        if (channel) {
            console.log(`✅ 채널 조회 성공: "${channel.snippet?.title}" (구독자 ${channel.statistics?.subscriberCount})`)
        } else {
            console.log('⚠️  채널 조회는 성공했지만 결과가 비어있음')
        }
    } catch (error: any) {
        console.error('❌ 인증/조회 실패')
        console.error('   에러 메시지:', error?.message)
        if (error?.response?.data) {
            console.error('   응답 데이터:', JSON.stringify(error.response.data))
        }
    }
}

main().catch(e => {
    console.error('스크립트 실행 실패:', e)
    process.exit(1)
})
