import { config } from 'dotenv'
config({ path: '.env.local' })

import { tokenize } from '@/lib/candidate/tokenizer'

// 개선된 키워드 추출 함수
function extractCommunityKeywords(title: string): string[] {
    const STOPWORDS = new Set([
        '이', '가', '을', '를', '의', '에', '도', '는', '은', '과', '와', '로', '으로',
        '이다', '입니다', '합니다', '했다', '한다', '하다', '되다', '이라',
        '진짜', '정말', '완전', '너무', '대박', '엄청', '정말로', '매우',
        '같은', '다른', '이런', '저런', '그런', '어떤', '무슨',
        '하면', '하는', '했다', '할', '한', '이렇게', '저렇게', '그렇게',
        '아', '오', '우와', '헐', '와', '어', '음',
        '이거', '저거', '그거', '요거', '여기', '저기', '거기',
        '오늘', '내일', '어제', '지금', '이제', '나중', '다시', '또',
        '있다', '없다', '되다', '하다', '이유', '때문', '사람', '거', '것',
        '뭐', '왜', '어떻게', '언제', '누구', '얼마',
        'ㅋㅋ', 'ㄷㄷ', 'ㅠㅠ', 'ㅎㅎ', 'ㅇㅇ',
        '단독', '속보', '공식', '사진', '영상', '동영상',
    ])
    
    const tokens = tokenize(title)
        .map(w => w.toLowerCase().trim())
        .filter(w => {
            if (w.length < 2) return false
            if (STOPWORDS.has(w)) return false
            if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(w)) return false
            if (/^\d+$/.test(w)) return false
            return true
        })
    
    return tokens
}

// 테스트 샘플
const testTitles = [
    "wbc 진짜 개꿀잼ㅋㅋ",
    "이거 완전 대박이다",
    "연기 진짜 미쳤다",
    "WBC 한국 이탈리아전 봤어?",
    "같은 생각하는 사람 있나",
    "[속보] 최태원 이혼 소송",
    "오늘 날씨 너무 좋다",
]

console.log('🔍 키워드 추출 테스트\n')

for (const title of testTitles) {
    const keywords = extractCommunityKeywords(title)
    console.log(`입력: "${title}"`)
    console.log(`키워드: [${keywords.join(', ')}]`)
    console.log()
}
