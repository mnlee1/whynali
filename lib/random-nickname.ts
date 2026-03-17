/**
 * lib/random-nickname.ts
 *
 * [랜덤 닉네임 생성 유틸리티]
 *
 * 형식: 형용사 + 동물 + 4자리숫자 (예: 수줍은너구리9983)
 * DB 중복 확인 후 유니크 닉네임 반환
 */

import { SupabaseClient } from '@supabase/supabase-js'

const ADJECTIVES = [
    '수줍은', '용감한', '귀여운', '엉뚱한', '신나는',
    '조용한', '활발한', '느긋한', '씩씩한', '영리한',
    '포근한', '발랄한', '당당한', '유쾌한', '상냥한',
    '엄격한', '허술한', '진지한', '엉성한', '반짝이는',
    '차분한', '솔직한', '겸손한', '명랑한', '순수한'
]

const ANIMALS = [
    '너구리', '고양이', '강아지', '토끼', '햄스터',
    '수달', '판다', '여우', '늑대', '곰',
    '사슴', '다람쥐', '치타', '펭귄', '고릴라',
    '캥거루', '코알라', '미어캣', '오리', '부엉이',
    '비버', '앵무새', '고슴도치', '알파카', '라마'
]

export function generateRandomNickname(): string {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
    const number = Math.floor(1000 + Math.random() * 9000)
    return `${adjective}${animal}${number}`
}

export async function generateUniqueNickname(supabase: SupabaseClient): Promise<string> {
    const maxAttempts = 5

    for (let i = 0; i < maxAttempts; i++) {
        const nickname = generateRandomNickname()

        const { count, error } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('display_name', nickname)

        if (error) {
            console.error('닉네임 중복 확인 오류:', error)
            continue
        }

        if (count === 0) {
            return nickname
        }
    }

    return generateRandomNickname() + Math.floor(Math.random() * 100)
}
