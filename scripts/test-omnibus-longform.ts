/**
 * scripts/test-omnibus-longform.ts
 *
 * lib/longform/create-omnibus-video.ts 라이브러리 함수를 호출해 옴니버스형 롱폼 테스트 영상을 생성.
 * 실제 로직(훅 생성, 검색씬 트림, 정규화/이어붙이기)은 lib/longform/에 있고, 이 스크립트는 DB 조회 + 호출만 담당.
 *
 * 실행: npx tsx --env-file=.env.local scripts/test-omnibus-longform.ts [출력파일명]
 * 출력: output/omnibus-test.mp4 (인자로 파일명 지정 시 해당 이름)
 */

import dotenv from 'dotenv'
import { resolve, join } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { writeFile, mkdir } from 'fs/promises'
import { supabaseAdmin } from '../lib/supabase/server'
import { generateOmnibusLongform, type OmnibusJob } from '../lib/longform/create-omnibus-video'

async function main() {
    console.log('[1/3] 최근 완료된 숏폼 조회...')
    const { data: jobs, error } = await supabaseAdmin
        .from('shortform_jobs')
        .select('id, issue_title, video_path')
        .not('video_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3)

    if (error) throw error
    if (!jobs || jobs.length < 2) {
        throw new Error(`완료된 숏폼이 2개 미만입니다 (${jobs?.length ?? 0}개 발견) — video_path가 채워진 job이 더 필요합니다`)
    }
    jobs.forEach((j, i) => console.log(`  이슈${i + 1}: ${j.issue_title}`))

    const omnibusJobs: OmnibusJob[] = jobs.map(j => ({
        id: j.id as string,
        issueTitle: j.issue_title as string,
        videoPath: j.video_path as string,
    }))

    console.log('[2/3] 옴니버스 롱폼 생성 (훅 + 검색씬 트림 + 이어붙이기)...')
    // 훅 문구는 지금은 수동 입력 — 실작업(Groq 자동 생성)은 admin 연동 시 별도 진행
    const { videoBuffer, chapters } = await generateOmnibusLongform(
        omnibusJobs,
        {
            sentenceA: '황정민 스토킹 논란\n애플 깜짝 1위\n젠슨 황 5000억',
            highlightsA: ['황정민', '애플', '5000억'],
        },
        { outputMode: 'landscape' }
    )
    console.log(`  → 생성 완료 (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`)
    console.log('  → 챕터:', chapters.map(c => `${c.startSeconds}s ${c.label}`).join(' / '))

    console.log('[3/3] 파일 저장...')
    const outputDir = join(process.cwd(), 'output')
    await mkdir(outputDir, { recursive: true })
    const outFileName = process.argv[2] || 'omnibus-test.mp4'
    const finalPath = join(outputDir, outFileName)
    await writeFile(finalPath, videoBuffer)

    console.log(`\n완료: ${finalPath}`)
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
