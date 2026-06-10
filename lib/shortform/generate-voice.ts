/**
 * lib/shortform/generate-voice.ts
 *
 * Google Cloud TTS — 숏폼 나레이션 음성 생성
 *
 * 씬별로 TTS를 각각 생성해 텍스트가 나타나는 타이밍과 목소리를 싱크합니다.
 * GOOGLE_TTS_API_KEY 미설정 시 null 반환 (무음 처리).
 *
 * 무료 한도: Neural2 월 100만 자, WaveNet 월 400만 자 (매월 리셋)
 */

import type { ShortformTextOutput } from './generate-text'

export interface SceneAudios {
    buffers: [Buffer | null, Buffer | null, Buffer | null]
}

/**
 * 씬별 TTS 음성 3개를 병렬 생성.
 * 씬1: 이슈 제목, 씬2: 핵심 설명, 씬3: 결론 설명
 */
export async function generateSceneAudios(text: ShortformTextOutput): Promise<SceneAudios> {
    const scene1Script = text.scene1Title.replace(/^"|"$/g, '').trim()
    const scene2Script = text.scene2Desc.trim()
    const scene3Script = text.scene3Desc.trim()

    const [buf1, buf2, buf3] = await Promise.all([
        scene1Script ? generateGoogleTTS(scene1Script) : Promise.resolve(null),
        scene2Script ? generateGoogleTTS(scene2Script) : Promise.resolve(null),
        scene3Script ? generateGoogleTTS(scene3Script) : Promise.resolve(null),
    ])

    return { buffers: [buf1, buf2, buf3] }
}

/**
 * N개 씬 텍스트를 병렬로 TTS 생성. 빈 텍스트나 검색씬은 null 반환.
 */
export async function generateNSceneAudios(texts: string[]): Promise<(Buffer | null)[]> {
    return Promise.all(
        texts.map(text => text.trim() ? generateGoogleTTS(text.trim()) : Promise.resolve(null))
    )
}

const KOREAN_DIGITS: Record<string, string> = {
    '0': '공', '1': '일', '2': '이', '3': '삼', '4': '사',
    '5': '오', '6': '육', '7': '칠', '8': '팔', '9': '구',
}

/**
 * TTS 전처리: 날짜 형식 숫자를 한국어 자릿수 발음으로 변환
 * 예) 5.18 → 오일팔, 4.19 → 사일구, 6.25 → 육이오, 5·18 → 오일팔
 * 소수점 1자리(1.5배, 2.3% 등)는 변환하지 않음 (점 뒤 2자리일 때만 적용)
 */
function preprocessForTTS(text: string): string {
    const toKorean = (n: string) => n.split('').map(d => KOREAN_DIGITS[d] ?? d).join('')
    return text.replace(/(?<!\d)(\d{1,2})[.·](\d{2})(?!\d)/g, (_, a, b) => toKorean(a) + toKorean(b))
}

export async function generateGoogleTTS(script: string): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY?.trim()

    if (!apiKey) {
        console.warn('[Google TTS] API 키 미설정 — 무음으로 진행')
        return null
    }

    const voice = process.env.GOOGLE_TTS_VOICE?.trim() ?? 'ko-KR-Wavenet-D'
    const processedScript = preprocessForTTS(script)

    try {
        const res = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: processedScript },
                    voice: { languageCode: 'ko-KR', name: voice },
                    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.3 },
                }),
            }
        )

        if (!res.ok) {
            console.error('[Google TTS] API 오류:', res.status, await res.text())
            return null
        }

        const { audioContent } = await res.json()
        return Buffer.from(audioContent, 'base64')
    } catch (e) {
        console.error('[Google TTS] 요청 실패:', e)
        return null
    }
}

