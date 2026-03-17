/**
 * scripts/test-groq-api.ts
 * 
 * Groq API 연결 테스트 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/test-groq-api.ts
 */

import Groq from 'groq-sdk'

async function testGroqConnection() {
    const apiKey = process.env.GROQ_API_KEY

    if (!apiKey) {
        console.error('❌ GROQ_API_KEY 환경변수가 설정되지 않았습니다.')
        console.log('\n.env.local 파일에 다음을 추가하세요:')
        console.log('GROQ_API_KEY=gsk_your_key_here\n')
        process.exit(1)
    }

    console.log('🔍 Groq API 연결 테스트 시작...\n')

    try {
        const groq = new Groq({ apiKey })

        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: '당신은 한국어로 답변하는 도우미입니다.'
                },
                {
                    role: 'user',
                    content: '안녕하세요. 간단히 인사해주세요.'
                }
            ],
            temperature: 0.7,
            max_tokens: 100,
        })

        const response = completion.choices[0]?.message?.content

        console.log('✅ Groq API 연결 성공!\n')
        console.log('📝 응답:', response)
        console.log('\n📊 사용 정보:')
        console.log(`  - 모델: ${completion.model}`)
        console.log(`  - 프롬프트 토큰: ${completion.usage?.prompt_tokens}`)
        console.log(`  - 완성 토큰: ${completion.usage?.completion_tokens}`)
        console.log(`  - 총 토큰: ${completion.usage?.total_tokens}`)
        console.log('\n✨ Groq API 설정이 완료되었습니다!\n')
    } catch (error) {
        console.error('❌ Groq API 호출 실패:\n')
        if (error instanceof Error) {
            console.error(error.message)
        }
        console.log('\n🔧 문제 해결:')
        console.log('  1. API 키가 올바른지 확인')
        console.log('  2. https://console.groq.com 에서 키 활성 상태 확인')
        console.log('  3. 네트워크 연결 확인\n')
        process.exit(1)
    }
}

testGroqConnection()
