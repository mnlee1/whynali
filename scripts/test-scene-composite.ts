/**
 * scripts/test-scene-composite.ts
 *
 * 씬별 모션 + 텍스트 오버레이 합본 테스트 영상 생성.
 * 실행: npx tsx scripts/test-scene-composite.ts
 *
 * 출력:
 *   output/test-composite-3scene.mp4  (씬3개 + 검색바씬)
 *   output/test-composite-5scene.mp4  (씬5개 + 검색바씬)
 */

import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { exec as execCallback } from 'child_process'
import { promisify } from 'util'
import {
    createBackgroundScene,
    createBackgroundFrames,
    createSceneTextOverlay,
    createTypingFrames,
    createSearchSceneOverlay,
    createSearchTypingFrames,
    type BgMotionType,
} from '../lib/shortform/generate-scenes'

const exec = promisify(execCallback)

// 씬별 배경 이미지
const SAMPLE_IMAGES = [
    'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?w=1280',
    'https://images.pexels.com/photos/5668481/pexels-photo-5668481.jpeg?w=1280',
    'https://images.pexels.com/photos/6929210/pexels-photo-6929210.jpeg?w=1280',
    'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?w=1280',
    'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?w=1280',
]

// 씬별 샘플 텍스트
const SCENE_DATA = [
    { title: '"최신 이슈 터졌다"',       desc: '지금 가장 뜨거운 소식이 나왔다' },
    { title: '왜 터진 걸까?',             desc: '내부 갈등이 수면 위로 올랐다' },
    { title: '여론은?',                   desc: '의견이 극명하게 갈리고 있다' },
    { title: '속사정은?',                 desc: '알고 보니 오래된 문제였다' },
    { title: '앞으로는?',                 desc: '다음 행보에 관심이 집중됐다' },
]

const SCENE_DURATION = 3
const SEARCH_SCENE_DURATION = 5.5  // 검색바 문구가 길어져 타이핑 애니메이션 시간이 늘어남 (실제 프로덕션은 TTS 길이 기준 자동 산정)
const FPS = 12

// ── 씬별 모션 정의 ──────────────────────────────────────────────
const MOTIONS_3: BgMotionType[] = [
    'pan-left+zoom-in',
    'pan-right',
    'pan-up',
    'pan-left+zoom-in',  // 검색바씬
]

const MOTIONS_5: BgMotionType[] = [
    'pan-left+zoom-in',
    'pan-right',
    'pan-up',
    'pan-right+zoom-in',
    'pan-left+zoom-in',
    'pan-left+zoom-in',  // 검색바씬
]

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

/** 프레임 배열 → 배경 MP4 (알파 없음) */
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

/** 프레임 배열 → 텍스트 MKV (알파 보존, PNG 코덱) */
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

/** 배경 + static overlay + 타이핑 애니메이션 → 씬 MP4 */
async function buildSceneWithText(
    bgBuf: Buffer,
    motionType: BgMotionType,
    sceneNumber: number,
    title: string,
    desc: string,
    isSearch: boolean,
    duration: number,
    tmpDir: string,
    sceneIdx: number,
    ffmpegPath: string,
    startT: number = 0,
    endT: number = 1,
): Promise<string> {
    const bgPath      = join(tmpDir, `bg-${sceneIdx}.mp4`)
    const overlayPath = join(tmpDir, `overlay-${sceneIdx}.png`)
    const textPath    = join(tmpDir, `text-${sceneIdx}.mp4`)
    const outPath     = join(tmpDir, `scene-${sceneIdx}.mp4`)

    // 1. 배경 모션 MP4 (알파 불필요)
    const bgFrames = await createBackgroundFrames(bgBuf, motionType, duration, FPS, startT, endT)
    await buildBgVideo(bgFrames, bgPath, ffmpegPath, FPS)

    // 2. Static overlay PNG (로고 + 타이틀)
    const overlayBuf = isSearch
        ? await createSearchSceneOverlay()
        : await createSceneTextOverlay(sceneNumber, title, desc)
    await writeFile(overlayPath, overlayBuf)

    // 3. 타이핑 애니메이션 MKV (알파 보존 — PNG 코덱)
    const textPath_mkv = textPath.replace('.mp4', '.mkv')
    const textFrames = isSearch
        ? await createSearchTypingFrames(duration)
        : await createTypingFrames(title, desc, sceneNumber, duration)
    await buildTextVideo(textFrames, textPath_mkv, ffmpegPath, FPS, duration)

    // 4. 세 레이어 합성
    const filter =
        `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
        `[0:v][struct]overlay=0:0[bgs];` +
        `[2:v]format=rgba[textanim];` +
        `[bgs][textanim]overlay=0:0[vout]`

    await exec(
        `"${ffmpegPath}" -i "${bgPath}" -loop 1 -i "${overlayPath}" -i "${textPath_mkv}" ` +
        `-filter_complex "${filter}" -map "[vout]" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 23 -t ${duration.toFixed(4)} -y "${outPath}"`
    )

    return outPath
}

/** 씬 MP4들 → 합본 */
async function concatScenes(
    scenePaths: string[],
    outputPath: string,
    ffmpegPath: string,
    tmpDir: string,
): Promise<void> {
    const listPath = join(tmpDir, 'concat.txt')
    const lines = scenePaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
    await writeFile(listPath, lines)
    await exec(
        `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 23 "${outputPath}"`
    )
}

async function buildComposite(
    motions: BgMotionType[],
    outputPath: string,
    ffmpegPath: string,
    label: string,
): Promise<void> {
    const tmpDir = outputPath + '_tmp'
    await mkdir(tmpDir, { recursive: true })
    const scenePaths: string[] = []
    let prevBgBuf: Buffer | null = null

    const splitT = SCENE_DURATION / (SCENE_DURATION * 2)  // 0.5 고정 (동일 길이 기준)

    for (let i = 0; i < motions.length; i++) {
        const isSearch         = i === motions.length - 1
        const isLastBeforeSearch = i === motions.length - 2
        const sceneNum         = i + 1
        const imageUrl         = SAMPLE_IMAGES[i % SAMPLE_IMAGES.length]
        const sceneData        = SCENE_DATA[i % SCENE_DATA.length]

        // 검색바씬: 이전 씬과 동일 모션 + 동일 배경 + 이어받기
        const motionType = isSearch ? motions[motions.length - 2] : motions[i]
        const startT     = isSearch ? splitT : 0
        const endT       = isLastBeforeSearch ? splitT : 1

        process.stdout.write(
            `  [${label}] 씬${isSearch ? '(검색바)' : sceneNum} ${motionType} 생성... `
        )
        const t0 = Date.now()

        const bgBuf = isSearch && prevBgBuf
            ? prevBgBuf
            : await createBackgroundScene(imageUrl)

        const scenePath = await buildSceneWithText(
            bgBuf, motionType,
            sceneNum,
            sceneData.title, sceneData.desc,
            isSearch,
            isSearch ? SEARCH_SCENE_DURATION : SCENE_DURATION, tmpDir, i, ffmpegPath, startT, endT,
        )
        scenePaths.push(scenePath)
        if (!isSearch) prevBgBuf = bgBuf
        console.log(`완료 (${Date.now() - t0}ms)`)
    }

    process.stdout.write(`  [${label}] 합본 인코딩... `)
    const t1 = Date.now()
    await concatScenes(scenePaths, outputPath, ffmpegPath, tmpDir)
    console.log(`완료 (${Date.now() - t1}ms) → ${outputPath}`)

    await rm(tmpDir, { recursive: true, force: true })
}

async function main() {
    const outputDir  = join(process.cwd(), 'output')
    const ffmpegPath = getFfmpegPath()
    await mkdir(outputDir, { recursive: true })

    console.log('\n씬 합본 테스트 영상 생성 시작\n')

    await buildComposite(
        MOTIONS_3,
        join(outputDir, 'test-composite-3scene.mp4'),
        ffmpegPath,
        '3scene',
    )

    await buildComposite(
        MOTIONS_5,
        join(outputDir, 'test-composite-5scene.mp4'),
        ffmpegPath,
        '5scene',
    )

    console.log('\n완료.')
    console.log('결과 파일:')
    console.log('  output/test-composite-3scene.mp4')
    console.log('  output/test-composite-5scene.mp4')
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
