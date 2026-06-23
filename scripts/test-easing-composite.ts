/**
 * scripts/test-easing-composite.ts
 *
 * 씬 위치별 easing 분리 테스트 (generate-scenes.ts 미수정)
 *
 * 원리: createBackgroundFrames는 위치가 선형인 프레임을 반환함.
 *       각 프레임의 duration만 재조정해서 시각적 easing 구현.
 *       - 씬1 (첫 번째): ease-in  → 시작 느리게, 끝 빠르게
 *       - 씬2~N-1 (중간): linear  → 일정 속도 (전환 경계에서 멈춤 없음)
 *       - 씬N + 검색바: ease-out → 시작 빠르게, 끝 느리게
 *
 * 실행: npx tsx scripts/test-easing-composite.ts
 * 출력: output/test-easing-5scene.mp4
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

const SAMPLE_IMAGES = [
    'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?w=1280',
    'https://images.pexels.com/photos/5668481/pexels-photo-5668481.jpeg?w=1280',
    'https://images.pexels.com/photos/6929210/pexels-photo-6929210.jpeg?w=1280',
    'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?w=1280',
    'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?w=1280',
]

const SCENE_DATA = [
    { title: '"최신 이슈 터졌다"',       desc: '지금 가장 뜨거운 소식이 나왔다' },
    { title: '왜 터진 걸까?',             desc: '내부 갈등이 수면 위로 올랐다' },
    { title: '여론은?',                   desc: '의견이 극명하게 갈리고 있다' },
    { title: '속사정은?',                 desc: '알고 보니 오래된 문제였다' },
    { title: '앞으로는?',                 desc: '다음 행보에 관심이 집중됐다' },
]

const SCENE_DURATION = 3
const FPS = 24

const MOTIONS_5: BgMotionType[] = [
    'pan-left+zoom-in',
    'pan-right',
    'pan-up',
    'pan-right+zoom-in',
    'pan-left+zoom-in',
    'pan-left+zoom-in', // 검색바씬
]

type EasingType = 'ease-in' | 'ease-out' | 'linear'

/**
 * 프레임 duration 재조정으로 시각적 easing 구현.
 * 프레임 위치(position)는 그대로 — duration만 변경.
 *
 * ease-in:  초반 프레임 duration 길게(느리게) → 후반 짧게(빠르게)
 * ease-out: 초반 프레임 duration 짧게(빠르게) → 후반 길게(느리게)
 * linear:   변경 없음
 */
function applyEasing(
    frames: { buffer: Buffer; duration: number }[],
    easing: EasingType,
): { buffer: Buffer; duration: number }[] {
    if (easing === 'linear' || frames.length <= 1) return frames

    const totalDuration = frames.reduce((sum, f) => sum + f.duration, 0)
    const N = frames.length

    // weight 범위: 0.3 ~ 1.0 (너무 극단적이지 않게)
    const weights = frames.map((_, i) => {
        const t = N > 1 ? i / (N - 1) : 0
        if (easing === 'ease-in')  return 1 - t * 0.7   // 1.0 → 0.3 (초반 길게)
        else                        return t * 0.7 + 0.3  // 0.3 → 1.0 (후반 길게)
    })

    const sumW = weights.reduce((s, w) => s + w, 0)

    return frames.map((frame, i) => ({
        buffer: frame.buffer,
        duration: (weights[i] / sumW) * totalDuration,
    }))
}

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
    easing: EasingType,
    startT: number = 0,
    endT: number = 1,
): Promise<string> {
    const bgPath      = join(tmpDir, `bg-${sceneIdx}.mp4`)
    const overlayPath = join(tmpDir, `overlay-${sceneIdx}.png`)
    const textPath    = join(tmpDir, `text-${sceneIdx}.mkv`)
    const outPath     = join(tmpDir, `scene-${sceneIdx}.mp4`)

    // 1. 배경 모션 프레임 생성 → easing duration 적용 → MP4
    const rawFrames   = await createBackgroundFrames(bgBuf, motionType, duration, FPS, startT, endT)
    const easedFrames = applyEasing(rawFrames, easing)
    await buildBgVideo(easedFrames, bgPath, ffmpegPath, FPS)

    // 2. Static overlay
    const overlayBuf = isSearch
        ? await createSearchSceneOverlay()
        : await createSceneTextOverlay(sceneNumber, title, desc)
    await writeFile(overlayPath, overlayBuf)

    // 3. 타이핑 애니메이션
    const textFrames = isSearch
        ? await createSearchTypingFrames(duration)
        : await createTypingFrames(title, desc, sceneNumber, duration)
    await buildTextVideo(textFrames, textPath, ffmpegPath, FPS, duration)

    // 4. 세 레이어 합성
    const filter =
        `[1:v]format=rgba,colorchannelmixer=aa=1[struct];` +
        `[0:v][struct]overlay=0:0[bgs];` +
        `[2:v]format=rgba[textanim];` +
        `[bgs][textanim]overlay=0:0[vout]`

    await exec(
        `"${ffmpegPath}" -i "${bgPath}" -loop 1 -i "${overlayPath}" -i "${textPath}" ` +
        `-filter_complex "${filter}" -map "[vout]" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 23 -t ${duration.toFixed(4)} -y "${outPath}"`
    )

    return outPath
}

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

async function buildEasingComposite(
    motions: BgMotionType[],
    outputPath: string,
    ffmpegPath: string,
): Promise<void> {
    const tmpDir = outputPath + '_tmp'
    await mkdir(tmpDir, { recursive: true })
    const scenePaths: string[] = []
    let prevBgBuf: Buffer | null = null

    const contentCount = motions.length - 1  // 검색바씬 제외한 콘텐츠 씬 수
    const splitT = 0.5

    for (let i = 0; i < motions.length; i++) {
        const isSearch           = i === motions.length - 1
        const isLastBeforeSearch = i === motions.length - 2
        const sceneNum           = i + 1
        const imageUrl           = SAMPLE_IMAGES[i % SAMPLE_IMAGES.length]
        const sceneData          = SCENE_DATA[i % SCENE_DATA.length]
        const motionType         = isSearch ? motions[motions.length - 2] : motions[i]
        const startT             = isSearch ? splitT : 0
        const endT               = isLastBeforeSearch ? splitT : 1

        // 씬 위치에 따른 easing 결정
        const easing: EasingType =
            i === 0             ? 'ease-in'  :  // 첫 번째 씬: 느리게 출발
            isSearch            ? 'ease-out' :  // 검색바씬: 느리게 마무리
            isLastBeforeSearch  ? 'linear'   :  // 마지막 콘텐츠 씬: 일정 속도로 검색바에 연결
            'linear'                             // 중간 씬: 일정 속도 유지

        process.stdout.write(
            `  씬${isSearch ? '(검색바)' : sceneNum} [${motionType}] [${easing}] 생성... `
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
            SCENE_DURATION, tmpDir, i, ffmpegPath,
            easing, startT, endT,
        )
        scenePaths.push(scenePath)
        if (!isSearch) prevBgBuf = bgBuf
        console.log(`완료 (${Date.now() - t0}ms)`)
    }

    process.stdout.write(`  합본 인코딩... `)
    const t1 = Date.now()
    await concatScenes(scenePaths, outputPath, ffmpegPath, tmpDir)
    console.log(`완료 (${Date.now() - t1}ms) → ${outputPath}`)

    await rm(tmpDir, { recursive: true, force: true })
}

async function main() {
    const outputDir  = join(process.cwd(), 'output')
    const ffmpegPath = getFfmpegPath()
    await mkdir(outputDir, { recursive: true })

    console.log('\n씬별 easing 분리 테스트 영상 생성')
    console.log('  씬1: ease-in (느리게 출발)')
    console.log('  씬2~3: linear (일정 속도 — 전환 경계 멈춤 없음)')
    console.log('  씬4~검색바: ease-out (느리게 마무리)\n')

    await buildEasingComposite(
        MOTIONS_5,
        join(outputDir, 'test-easing-5scene-24fps-v2.mp4'),
        ffmpegPath,
    )

    console.log('\n완료.')
    console.log('결과: output/test-easing-5scene-24fps-v2.mp4')
    console.log('비교: output/test-easing-5scene-24fps.mp4 (이전 버전)')
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
