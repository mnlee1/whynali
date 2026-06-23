/**
 * scripts/test-bg-motion.ts
 *
 * 배경 모션 효과 테스트 스크립트.
 * 실행: npx tsx scripts/test-bg-motion.ts
 *
 * 각 모션 타입별로 4초짜리 MP4를 output/ 폴더에 저장합니다.
 * 전체 숏폼 생성 없이 배경 모션만 빠르게 확인할 수 있습니다.
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import {
    createBackgroundScene,
    createBackgroundFrames,
    BG_MOTION_CYCLE,
    type BgMotionType,
} from '../lib/shortform/generate-scenes'

const exec = promisify(execCallback)

// 테스트용 Pexels 이미지 (다양한 유형)
const SAMPLE_IMAGES: Record<string, string> = {
    city:  'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?w=1280',
    court: 'https://images.pexels.com/photos/5668481/pexels-photo-5668481.jpeg?w=1280',
    news:  'https://images.pexels.com/photos/6929210/pexels-photo-6929210.jpeg?w=1280',
}

function getFfmpegPath(): string {
    const path = require('path') as typeof import('path')
    const fs = require('fs') as typeof import('fs')
    const directPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    if (fs.existsSync(directPath)) return directPath
    try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic && typeof ffmpegStatic === 'string') return ffmpegStatic
    } catch {}
    throw new Error('ffmpeg-static을 찾을 수 없습니다')
}

async function buildMotionVideo(
    frames: { buffer: Buffer; duration: number }[],
    outputPath: string,
    ffmpegPath: string,
    sceneDuration: number,
    fps: number
): Promise<void> {
    const tmpDir = join(process.cwd(), 'output', '_tmp')
    await mkdir(tmpDir, { recursive: true })

    const framePaths: string[] = []
    for (let i = 0; i < frames.length; i++) {
        const p = join(tmpDir, `frame_${i}.png`)
        await writeFile(p, frames[i].buffer)
        framePaths.push(p)
    }

    const concatLines = ['ffconcat version 1.0']
    for (let i = 0; i < frames.length; i++) {
        concatLines.push(`file '${framePaths[i].replace(/\\/g, '/')}'`)
        concatLines.push(`duration ${frames[i].duration.toFixed(4)}`)
    }
    concatLines.push(`file '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'`)

    const concatPath = join(tmpDir, 'concat.txt')
    await writeFile(concatPath, concatLines.join('\n'))

    await exec(
        `"${ffmpegPath}" -f concat -safe 0 -i "${concatPath}" ` +
        `-vf fps=${fps} -pix_fmt yuv420p -c:v libx264 -crf 18 -preset fast ` +
        `-t ${sceneDuration.toFixed(4)} -y "${outputPath}"`
    )
}

async function main() {
    const ffmpegPath = getFfmpegPath()
    const outputDir = join(process.cwd(), 'output')
    await mkdir(outputDir, { recursive: true })

    const imageKey = process.argv[2] ?? 'city'
    const imageUrl = SAMPLE_IMAGES[imageKey] ?? SAMPLE_IMAGES.city
    const DURATION = 4
    const FPS = 12

    console.log(`\n이미지 타입: ${imageKey}`)
    console.log(`URL: ${imageUrl}`)
    console.log('배경 이미지 처리 중 (864×1536)...\n')

    const bgBuffer = await createBackgroundScene(imageUrl)
    console.log(`배경 버퍼: ${(bgBuffer.length / 1024).toFixed(0)}KB\n`)

    const motionTypes: BgMotionType[] = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left', 'pan-up', 'pan-down']

    for (const motionType of motionTypes) {
        process.stdout.write(`[${motionType}] 프레임 생성 중... `)
        const t0 = Date.now()

        const frames = await createBackgroundFrames(bgBuffer, motionType, DURATION, FPS)
        const elapsed1 = Date.now() - t0
        process.stdout.write(`${frames.length}프레임 (${elapsed1}ms) → 인코딩... `)

        const outputPath = join(outputDir, `test-${imageKey}-${motionType}.mp4`)
        await buildMotionVideo(frames, outputPath, ffmpegPath, DURATION, FPS)

        const elapsed2 = Date.now() - t0
        console.log(`완료 (총 ${elapsed2}ms) → ${outputPath}`)
    }

    console.log(`\n모든 모션 타입 완료.`)
    console.log(`결과 파일: ${outputDir}`)
    console.log(`\n사용법: npx tsx scripts/test-bg-motion.ts [city|court|news]`)
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
