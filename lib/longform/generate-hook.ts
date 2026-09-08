/**
 * lib/longform/generate-hook.ts
 *
 * 옴니버스 롱폼 오프닝 훅 클립 생성.
 * - 배경: Pexels 신규 검색 이미지(본편 이슈 영상과 중복 방지) + 기존 숏폼과 동일한 딤 처리(밝기 0.65 + 검은 마스크 20%) + 줌인 모션
 * - 텍스트: 타이틀A는 0초부터 완성된 상태로 고정 표시(로고 포함), 타이틀B는 문장A TTS 길이(dA) 시점부터
 *   기존 숏폼 desc와 동일하게 한 단어씩 타이핑되어 나타나 A와 함께 유지됨
 * - 오디오(TTS 2개)는 끊김 없이 이어붙여 하나의 연속된 나레이션으로 재생
 */

import { writeFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'
import sharp from 'sharp'

import { createSceneTextOverlay, createBackgroundFrames, createTypingFrames } from '../shortform/generate-scenes'
import { generateGoogleTTS } from '../shortform/generate-voice'
import { fetchPexelsImages, extractKeywordsAndTone } from '../pexels'
import { downloadImage } from '../shortform/fetch-stock-images'

import { WIDTH, HEIGHT, FPS } from './constants'
import { probeDuration, buildFrameSequenceVideo, buildAlphaFrameSequenceVideo } from './ffmpeg-helpers'

const exec = promisify(execCallback)

const DEFAULT_HOOK_IMAGE_QUERY = '뉴스 브리핑 속보 사무실'
const DEFAULT_HOOK_IMAGE_CATEGORY = '종합'

/**
 * 훅 배경 생성. 이슈 영상 재사용 대신 Pexels 신규 검색으로 가져와 본편과 이미지가 중복되지 않게 함.
 * lib/shortform/generate-scenes.ts의 createBackgroundScene과 동일하게 밝기 0.65 + 검은 반투명 마스크(20%) 이중 적용.
 * cleanImagePath는 16:9 변환 시 블러 배경용(텍스트 없는 순수 이미지)으로 재사용.
 *
 * keywords를 넘기지 않으면 query/category로 AI 키워드 추출을 새로 수행한다 — 미리보기 때 이미 추출된
 * 키워드가 있다면 반드시 넘겨서 재사용해야, 같은 seed로도 AI가 매번 조금씩 다른 키워드를 뽑아
 * 미리본 이미지와 실제 생성 이미지가 어긋나는 문제를 막을 수 있다.
 */
export async function createHookBackground(
    tmpDir: string,
    query: string = DEFAULT_HOOK_IMAGE_QUERY,
    category: string = DEFAULT_HOOK_IMAGE_CATEGORY,
    seed?: number,
    keywords?: string
): Promise<{ buffer: Buffer; cleanImagePath: string; keywords?: string }> {
    const resolvedKeywords = keywords ?? (await extractKeywordsAndTone(query, category))?.keywords
    const [imageUrl] = await fetchPexelsImages(query, category, seed, 1, resolvedKeywords)

    const dimMaskSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="${WIDTH}" height="${HEIGHT}" fill="black" opacity="0.2"/></svg>`

    const buffer = imageUrl
        ? await sharp(
            await sharp(await sharp(await downloadImage(imageUrl)).resize(WIDTH, HEIGHT, { fit: 'cover' }).toBuffer())
                .modulate({ brightness: 0.65 })
                .toBuffer()
        )
            .composite([{ input: Buffer.from(dimMaskSvg), blend: 'over' }])
            .png()
            .toBuffer()
        : await sharp({
            create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 17, g: 20, b: 26 } },
        }).png().toBuffer()

    const cleanImagePath = join(tmpDir, 'hook-bg-clean.png')
    await writeFile(cleanImagePath, buffer)

    return { buffer, cleanImagePath, keywords: resolvedKeywords }
}

export interface TwoBeatHookOptions {
    highlightsA?: string[]
    highlightsB?: string[]
}

/**
 * 배경 하나(줌인 모션) + 타이틀A는 0초부터 완성된 상태로 고정 표시(로고 포함),
 * 타이틀B는 dA(문장A TTS 길이) 시점부터 기존 숏폼과 동일하게 한 단어씩 타이핑되어 나타나 A와 함께 유지되는 훅 클립 생성.
 */
export async function createTwoBeatHookClip(
    textA: string,
    textB: string,
    bg: Buffer,
    outPath: string,
    tmpDir: string,
    ffmpegPath: string,
    options: TwoBeatHookOptions = {}
): Promise<void> {
    const { highlightsA = [], highlightsB = [] } = options

    // TTS 각각 생성 (실패 시 1.5초 무음으로 대체)
    const audioAPath = join(tmpDir, 'hookA.mp3')
    const audioBPath = join(tmpDir, 'hookB.mp3')
    const [audioBufA, audioBufB] = await Promise.all([generateGoogleTTS(textA), generateGoogleTTS(textB)])

    let dA = 1.5
    let dB = 1.5
    if (audioBufA) { await writeFile(audioAPath, audioBufA); dA = await probeDuration(audioAPath, ffmpegPath, 1.5) }
    else await exec(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${dA} -q:a 9 "${audioAPath}"`)
    if (audioBufB) { await writeFile(audioBPath, audioBufB); dB = await probeDuration(audioBPath, ffmpegPath, 1.5) }
    else await exec(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${dB} -q:a 9 "${audioBPath}"`)

    // 오디오 이어붙이기 — 끊김 없는 하나의 연속된 나레이션
    const audioConcatListPath = join(tmpDir, 'hook-audio-concat.txt')
    const combinedAudioPath = join(tmpDir, 'hook-audio.mp3')
    await writeFile(
        audioConcatListPath,
        `file '${audioAPath.replace(/\\/g, '/')}'\nfile '${audioBPath.replace(/\\/g, '/')}'`
    )
    await exec(`"${ffmpegPath}" -y -f concat -safe 0 -i "${audioConcatListPath}" -c copy "${combinedAudioPath}"`)

    const totalDuration = dA + dB

    // 배경: 전체 구간 동안 하나로 이어지는 줌인 모션 (기존 숏폼 createBackgroundFrames 재사용)
    const bgFrames = await createBackgroundFrames(bg, 'zoom-in', totalDuration, FPS)
    const bgVideoPath = await buildFrameSequenceVideo(bgFrames, tmpDir, 'hook-bg', ffmpegPath, totalDuration, FPS)

    // A: 로고 포함 정적 타이틀(0초부터 끝까지 고정, sceneNumber≠1 → createSceneTextOverlay가 즉시 완성된 상태로 렌더링)
    const overlayA = await createSceneTextOverlay(2, textA, '', highlightsA)
    const overlayAPath = join(tmpDir, 'hook-overlayA.png')
    await writeFile(overlayAPath, overlayA)

    // B: dA 시점까지는 빈 투명 프레임으로 대기하다가, 기존 숏폼 desc와 동일하게 한 단어씩 타이핑되어 등장.
    // createTypingFrames의 sceneDuration*0.85 로직이 dB 안에서 자동으로 홀드 타임을 남겨줌
    const blankFrame = await sharp({
        create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer()
    const typingFramesB = await createTypingFrames('', textB, 2, dB, highlightsB)
    const framesB = [{ buffer: blankFrame, duration: dA }, ...typingFramesB]
    const textVideoBPath = await buildAlphaFrameSequenceVideo(framesB, tmpDir, 'hook-textB', ffmpegPath, totalDuration, FPS)

    const videoOnlyPath = join(tmpDir, 'hook-video.mp4')
    await exec(
        `"${ffmpegPath}" -y -i "${bgVideoPath}" -loop 1 -i "${overlayAPath}" -i "${textVideoBPath}" ` +
        `-filter_complex "[0:v][1:v]overlay=0:0[bg1];[bg1][2:v]overlay=0:0[vout]" ` +
        `-map "[vout]" -t ${totalDuration.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${videoOnlyPath}"`
    )

    // 비디오(dA+dB, 연속 줌인) + 연속 오디오(dA+dB) 합치기
    await exec(
        `"${ffmpegPath}" -y -i "${videoOnlyPath}" -i "${combinedAudioPath}" ` +
        `-c:v copy -c:a aac -ar 44100 -ac 2 -shortest "${outPath}"`
    )
}
