/**
 * scripts/test-desc-position.ts
 *
 * 서브 설명(자막) 위치 조정(descStartY) 확인용 단일 씬 샘플 영상 생성.
 * 실행: npx tsx scripts/test-desc-position.ts
 *
 * 출력: output/test-desc-position.mp4
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import {
    createBackgroundScene,
    createBackgroundFrames,
    createSceneTextOverlay,
    createTypingFrames,
    type BgMotionType,
} from '../lib/shortform/generate-scenes'

const exec = promisify(execCallback)

const SAMPLE_IMAGE = 'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?w=1280'

// 실제 스크린샷에서 하단바와 겹쳤던 문구 재현
const TITLE = '2026 부동산 세제개편'
const DESC = '8월 3일 발표된 핵심은 실거주자 세금은 줄이고 비거주 다주택자는 늘어나는 방향 확정됐습니다'

const SCENE_NUMBER = 2
const SCENE_DURATION = 4
const FPS = 12
const MOTION: BgMotionType = 'pan-left+zoom-in'

function getFfmpegPath(): string {
    const path = require('path') as typeof import('path')
    const fs   = require('fs')   as typeof import('fs')
    const directPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if (fs.existsSync(directPath)) return directPath
    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic && typeof ffmpegStatic === 'string') return ffmpegStatic
    } catch {}
    throw new Error('ffmpeg-static을 찾을 수 없습니다')
}

async function buildBgVideo(
    frames: { buffer: Buffer; duration: number }[],
    outputPath: string,
    ffmpegPath: string,
    fps: number,
): Promise<void> {
    const tmpDir = outputPath + '_ftmp'
    await mkdir(tmpDir, { recursive: true })
    try {
        await Promise.all(
            frames.map((f, i) =>
                writeFile(join(tmpDir, `f-${String(i).padStart(5, '0')}.png`), f.buffer)
            )
        )
        const concatLines = frames.map((f, i) =>
            `file '${join(tmpDir, `f-${String(i).padStart(5, '0')}.png`).replace(/\\/g, '/')}'\nduration ${f.duration.toFixed(4)}`
        ).join('\n')
        const listPath = join(tmpDir, 'list.txt')
        await writeFile(listPath, concatLines)
        await exec(
            `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" ` +
            `-vf "fps=${fps}" -c:v libx264 -pix_fmt yuv420p -crf 23 "${outputPath}"`
        )
    } finally {
        await rm(tmpDir, { recursive: true, force: true })
    }
}

async function buildTextVideo(
    frames: { buffer: Buffer; duration: number }[],
    outputPath: string,
    ffmpegPath: string,
    fps: number,
    duration: number,
): Promise<void> {
    const tmpDir = outputPath + '_ftmp'
    await mkdir(tmpDir, { recursive: true })
    try {
        await Promise.all(
            frames.map((f, i) =>
                writeFile(join(tmpDir, `f-${String(i).padStart(5, '0')}.png`), f.buffer)
            )
        )
        const lines: string[] = []
        for (let i = 0; i < frames.length; i++) {
            lines.push(`file '${join(tmpDir, `f-${String(i).padStart(5, '0')}.png`).replace(/\\/g, '/')}'`)
            lines.push(`duration ${frames[i].duration.toFixed(4)}`)
        }
        lines.push(`file '${join(tmpDir, `f-${String(frames.length - 1).padStart(5, '0')}.png`).replace(/\\/g, '/')}'`)
        const listPath = join(tmpDir, 'list.txt')
        await writeFile(listPath, lines.join('\n'))
        await exec(
            `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" ` +
            `-vf "fps=${fps}" -pix_fmt rgba -c:v png -t ${duration.toFixed(4)} "${outputPath}"`
        )
    } finally {
        await rm(tmpDir, { recursive: true, force: true })
    }
}

async function main() {
    const outputDir  = join(process.cwd(), 'output')
    const ffmpegPath = getFfmpegPath()
    await mkdir(outputDir, { recursive: true })

    const tmpDir = join(outputDir, 'test-desc-position_tmp')
    await mkdir(tmpDir, { recursive: true })

    console.log('\n서브 설명 위치 조정 샘플 영상 생성 시작\n')
    console.log(`  타이틀: ${TITLE}`)
    console.log(`  설명(${DESC.length}자): ${DESC}\n`)

    const bgPath      = join(tmpDir, 'bg.mp4')
    const overlayPath = join(tmpDir, 'overlay.png')
    const textPath    = join(tmpDir, 'text.mkv')
    const outPath     = join(outputDir, 'test-desc-position.mp4')

    process.stdout.write('  배경 다운로드/모션 프레임 생성... ')
    let t0 = Date.now()
    const bgBuf = await createBackgroundScene(SAMPLE_IMAGE)
    const bgFrames = await createBackgroundFrames(bgBuf, MOTION, SCENE_DURATION, FPS, 0, 1)
    await buildBgVideo(bgFrames, bgPath, ffmpegPath, FPS)
    console.log(`완료 (${Date.now() - t0}ms)`)

    process.stdout.write('  정적 오버레이(로고+타이틀) 생성... ')
    t0 = Date.now()
    const overlayBuf = await createSceneTextOverlay(SCENE_NUMBER, TITLE, DESC)
    await writeFile(overlayPath, overlayBuf)
    console.log(`완료 (${Date.now() - t0}ms)`)

    process.stdout.write('  설명 텍스트 생성(0초부터 전체 표시)... ')
    t0 = Date.now()
    const typingFrames = await createTypingFrames(TITLE, DESC, SCENE_NUMBER, SCENE_DURATION)
    // 타이핑 애니메이션의 마지막(전체 텍스트 표시) 프레임만 사용해 0초부터 고정 표시
    const fullFrame = typingFrames[typingFrames.length - 1]
    const textFrames = [{ buffer: fullFrame.buffer, duration: SCENE_DURATION }]
    await buildTextVideo(textFrames, textPath, ffmpegPath, FPS, SCENE_DURATION)
    console.log(`완료 (${Date.now() - t0}ms)`)

    process.stdout.write('  합성 인코딩... ')
    t0 = Date.now()
    const filter =
        `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
        `[0:v][struct]overlay=0:0[bgs];` +
        `[2:v]format=rgba[textanim];` +
        `[bgs][textanim]overlay=0:0[vout]`
    await exec(
        `"${ffmpegPath}" -i "${bgPath}" -loop 1 -i "${overlayPath}" -i "${textPath}" ` +
        `-filter_complex "${filter}" -map "[vout]" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 23 -t ${SCENE_DURATION.toFixed(4)} -y "${outPath}"`
    )
    console.log(`완료 (${Date.now() - t0}ms)`)

    await rm(tmpDir, { recursive: true, force: true })

    console.log(`\n완료 → ${outPath}`)
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
