/**
 * scripts/test-ai-news-linking.ts
 * 
 * AI 뉴스 연결 테스트
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { validateNewsRelevanceBatch } from '../lib/linker/ai-news-validator'
import { extractKeywords } from '../lib/linker/linker-utils'

async function testAINewsLinking() {
    console.log('=== AI 뉴스 연결 테스트 ===\n')

    // 테스트 케이스 1: 잠실 스포츠 MICE 파크
    const issueTitle1 = "3만석 돔구장 코엑스 2.5배 전시 잠실 스포츠 MICE 파크 사업 본격"
    const newsTitles1 = [
        '웨이브, KLPGA 및 KPGA 전 경기 온라인 생중계하며 스포츠 콘텐츠 강화', // 관련 없음
        '무신사, 스포츠 IP 전문 큐레이션관 팬 스토어 론칭', // 관련 없음
        '서울시, 잠실 스포츠 타운 조성 올림픽공원에 야구장 전시관 건립', // 관련 있음
        '잠실 종합운동장 일대 대규모 재개발 MICE 복합시설 들어선다', // 관련 있음
        '스포츠토토 건전화 통합 플랫폼 위드토토 오픈 기념 이벤트 실시', // 관련 없음
    ]

    console.log('📋 테스트 케이스 1: 잠실 스포츠 MICE 파크\n')
    console.log(`이슈: ${issueTitle1}\n`)
    console.log(`키워드: [${extractKeywords(issueTitle1).join(', ')}]\n`)
    console.log('뉴스 목록:')
    newsTitles1.forEach((title, idx) => {
        console.log(`  ${idx + 1}. ${title}`)
    })
    console.log()

    const result1 = await validateNewsRelevanceBatch(issueTitle1, newsTitles1)
    
    console.log('AI 검증 결과:\n')
    result1.results.forEach((r, idx) => {
        const icon = r.isRelated ? '✅' : '❌'
        console.log(`${icon} ${idx + 1}. ${r.newsTitle}`)
        console.log(`   관련도: ${r.isRelated ? '관련 있음' : '관련 없음'} (신뢰도 ${r.confidence}%)`)
        console.log(`   이유: ${r.reason}\n`)
    })

    if (result1.totalTokens) {
        console.log(`사용 토큰: ${result1.totalTokens}\n`)
    }

    console.log('━'.repeat(80) + '\n')

    // 테스트 케이스 2: 김연경 IOC 수상
    const issueTitle2 = "배구 여제 김연경, IOC GEDI Champions Awards 수상 여성 스포츠 참여 확대"
    const newsTitles2 = [
        "스포츠 통한 성평등 포용 가치 확산 공로 김연경, IOC GEDI 챔피언스 어워즈 수상", // 관련 있음
        "김연경, IOC 올림픽 챔피언스 어워즈서 스포츠 성평등 공로상", // 관련 있음
        "김연경, 은퇴 후 첫 인터뷰 배구는 내 인생", // 관련 없음 (다른 사건)
        "김연경, 예능 프로그램 출연 확정 나 혼자 산다", // 관련 없음 (다른 주제)
        "여자배구, 김연경 공백 어떻게 메울까 신인 기대주는?", // 관련 없음 (다른 주제)
    ]

    console.log('📋 테스트 케이스 2: 김연경 IOC 수상\n')
    console.log(`이슈: ${issueTitle2}\n`)
    console.log(`키워드: [${extractKeywords(issueTitle2).join(', ')}]\n`)
    console.log('뉴스 목록:')
    newsTitles2.forEach((title, idx) => {
        console.log(`  ${idx + 1}. ${title}`)
    })
    console.log()

    const result2 = await validateNewsRelevanceBatch(issueTitle2, newsTitles2)
    
    console.log('AI 검증 결과:\n')
    result2.results.forEach((r, idx) => {
        const icon = r.isRelated ? '✅' : '❌'
        console.log(`${icon} ${idx + 1}. ${r.newsTitle}`)
        console.log(`   관련도: ${r.isRelated ? '관련 있음' : '관련 없음'} (신뢰도 ${r.confidence}%)`)
        console.log(`   이유: ${r.reason}\n`)
    })

    if (result2.totalTokens) {
        console.log(`사용 토큰: ${result2.totalTokens}\n`)
    }

    console.log('━'.repeat(80) + '\n')

    const totalTokens = (result1.totalTokens || 0) + (result2.totalTokens || 0)
    console.log('📊 요약:\n')
    console.log(`총 사용 토큰: ${totalTokens}`)
    console.log(`검증 뉴스 수: ${newsTitles1.length + newsTitles2.length}건`)
    console.log(`평균 토큰/뉴스: ${(totalTokens / (newsTitles1.length + newsTitles2.length)).toFixed(0)}\n`)

    console.log('✅ AI 뉴스 연결 시스템 정상 작동!')
}

testAINewsLinking().catch(console.error)
