/**
 * scripts/test-tts-voices.ts
 * 한국어 Neural2 / WaveNet 전체 목소리 샘플 MP3 생성
 * 실행: npx tsx scripts/test-tts-voices.ts
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SAMPLE_TEXT = '안녕하세요. 지금 가장 뜨거운 이슈가 터졌습니다. 자세한 내용을 확인해 보세요.'

const VOICES = [
    { name: 'ko-KR-Neural2-A', type: 'Neural2', gender: '여성' },
    { name: 'ko-KR-Neural2-B', type: 'Neural2', gender: '여성' },
    { name: 'ko-KR-Neural2-C', type: 'Neural2', gender: '남성' },
    { name: 'ko-KR-Neural2-D', type: 'Neural2', gender: '남성' },
    { name: 'ko-KR-Wavenet-A', type: 'WaveNet', gender: '여성' },
    { name: 'ko-KR-Wavenet-B', type: 'WaveNet', gender: '여성' },
    { name: 'ko-KR-Wavenet-C', type: 'WaveNet', gender: '남성' },
    { name: 'ko-KR-Wavenet-D', type: 'WaveNet', gender: '남성' },
]

async function generateTTS(voiceName: string): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_TTS_API_KEY?.trim()
    if (!apiKey) throw new Error('GOOGLE_TTS_API_KEY 미설정')

    const res = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: { text: SAMPLE_TEXT },
                voice: { languageCode: 'ko-KR', name: voiceName },
                audioConfig: { audioEncoding: 'MP3', speakingRate: 1.3 },
            }),
        }
    )

    if (!res.ok) {
        console.error(`  오류 ${res.status}:`, await res.text())
        return null
    }

    const { audioContent } = await res.json()
    return Buffer.from(audioContent, 'base64')
}

async function main() {
    const outputDir = join(process.cwd(), 'output', 'tts-voices')
    await mkdir(outputDir, { recursive: true })

    console.log(`\n샘플 텍스트: "${SAMPLE_TEXT}"\n`)

    for (const v of VOICES) {
        process.stdout.write(`  ${v.type} ${v.name} (${v.gender}) ... `)
        const buf = await generateTTS(v.name)
        if (buf) {
            const filePath = join(outputDir, `${v.name}.mp3`)
            await writeFile(filePath, buf)
            console.log(`저장 → output/tts-voices/${v.name}.mp3`)
        } else {
            console.log('실패')
        }
    }

    console.log('\n완료. output/tts-voices/ 폴더에서 확인하세요.')
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
