/**
 * lib/longform/create-omnibus-video.ts
 *
 * 완료된 숏폼 여러 개를 그대로 재사용해 이어붙인 "옴니버스형 롱폼" 영상 생성.
 *
 * - 오프닝: 훅 클립(generate-hook.ts) — 배경 고정 + 줌인 모션, 타이틀A→B 순차 등장
 * - 마지막 이슈를 제외한 나머지는 끝의 검색씬(실측 트림값 SEARCH_SCENE_TRIM)을 잘라내고 이어붙임
 * - 마지막 이슈는 원래 검색씬 그대로 남겨 롱폼 전체의 클로징(CTA)으로 사용 — 별도 클로징 카드 없음
 * - 신규 API 호출: Groq 0회, Google TTS 2회(훅 문장A/B), Pexels 1회(훅 배경)
 */

import { writeFile, mkdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { exec as execCallback } from 'child_process'

import { WIDTH, HEIGHT, FPS, SEARCH_SCENE_TRIM, FADE_DUR } from './constants'
import { getFfmpegPath, probeDuration, hasAudioStream, downloadFile } from './ffmpeg-helpers'
import { createHookBackground, createTwoBeatHookClip } from './generate-hook'

const exec = promisify(execCallback)

export interface OmnibusJob {
    id: string
    issueTitle: string
    videoPath: string   // shortform_jobs.video_path (storage-relative 경로 또는 완전한 URL)
}

export interface OmnibusHookConfig {
    sentenceA: string
    sentenceB?: string
    highlightsA?: string[]
    highlightsB?: string[]
    imageQuery?: string
    imageCategory?: string
    /** 훅 이미지 미리보기 시 고정된 시드 — 생성 시에도 같은 값을 넘기면 미리본 이미지와 동일한 이미지가 선택됨 */
    imageSeed?: number
}

export interface GenerateOmnibusOptions {
    /** 'vertical' = 기존 9:16 그대로, 'landscape' = 16:9 캔버스 중앙 배치 + 양옆 블러 배경 (레터박스 변환) */
    outputMode?: 'vertical' | 'landscape'
}

const DEFAULT_SENTENCE_B = '화제된 이슈, 빠짐없이 담았습니다'
const DEFAULT_HIGHLIGHTS_B = ['화제된 이슈']

function toPublicUrl(videoPath: string): string {
    if (videoPath.startsWith('http')) return videoPath
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return `${base}/storage/v1/object/public/shortform/${videoPath}`
}

interface NormalizeOptions {
    hasAudio: boolean
    trimEndSeconds?: number
    fadeIn?: boolean
    fadeOut?: boolean
    /** 지정 시 16:9 블러 배경을 본 영상(텍스트 포함)에서 split하지 않고 이 텍스트 없는 이미지에서 만듦 (훅씬 전용) */
    cleanBgImagePath?: string
}

/** 해상도/코덱/프레임레이트 통일 + (옵션) 끝부분 트림 + (옵션) 컷 사이 페이드. concat demuxer(-c copy)로 안전하게 이어붙이기 위한 사전 정규화. 실제 반영된 길이(초)를 반환 — 챕터 타임스탬프 계산용. */
async function normalizeClip(
    inputPath: string,
    outPath: string,
    ffmpegPath: string,
    outputMode: 'vertical' | 'landscape',
    opts: NormalizeOptions
): Promise<number> {
    const { hasAudio, trimEndSeconds = 0, fadeIn = false, fadeOut = false, cleanBgImagePath } = opts
    const outW = outputMode === 'landscape' ? 1280 : WIDTH
    const outH = outputMode === 'landscape' ? 720 : HEIGHT

    const rawDuration = await probeDuration(inputPath, ffmpegPath, 5)
    const targetDuration = Math.max(rawDuration - trimEndSeconds, 0.5)

    const inputs = hasAudio ? `-i "${inputPath}"` : `-i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo`
    const cleanBgInputIndex = hasAudio ? 1 : 2
    const fullInputs = cleanBgImagePath ? `${inputs} -loop 1 -i "${cleanBgImagePath}"` : inputs

    const videoGraph = outputMode === 'landscape'
        ? (cleanBgImagePath
            ? `[${cleanBgInputIndex}:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},gblur=sigma=20[bgblur];` +
              `[0:v]scale=-2:${outH}[fgs];` +
              `[bgblur][fgs]overlay=(W-w)/2:(H-h)/2[ov];` +
              `[ov]fps=${FPS},format=yuv420p`
            : `[0:v]split=2[bg][fg];` +
              `[bg]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},gblur=sigma=20[bgblur];` +
              `[fg]scale=-2:${outH}[fgs];` +
              `[bgblur][fgs]overlay=(W-w)/2:(H-h)/2[ov];` +
              `[ov]fps=${FPS},format=yuv420p`)
        : `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,` +
          `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,fps=${FPS},format=yuv420p`

    const vFade: string[] = []
    const aFade: string[] = []
    if (fadeIn) {
        vFade.push(`fade=t=in:st=0:d=${FADE_DUR}`)
        aFade.push(`afade=t=in:st=0:d=${FADE_DUR}`)
    }
    if (fadeOut) {
        const st = Math.max(targetDuration - FADE_DUR, 0)
        vFade.push(`fade=t=out:st=${st.toFixed(2)}:d=${FADE_DUR}`)
        aFade.push(`afade=t=out:st=${st.toFixed(2)}:d=${FADE_DUR}`)
    }

    const videoOut = vFade.length > 0 ? `${videoGraph},${vFade.join(',')}[vout]` : `${videoGraph}[vout]`
    const audioLabel = hasAudio ? '0:a' : '1:a'
    const audioOut = aFade.length > 0 ? `[${audioLabel}]${aFade.join(',')}[aout]` : `[${audioLabel}]anull[aout]`

    const filterComplex = `${videoOut};${audioOut}`

    await exec(
        `"${ffmpegPath}" -y ${fullInputs} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" ` +
        `-t ${targetDuration.toFixed(2)} -c:v libx264 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2 "${outPath}"`
    )

    return targetDuration
}

export interface OmnibusChapter {
    label: string
    startSeconds: number
}

export interface GenerateOmnibusResult {
    videoBuffer: Buffer
    /** 유튜브 챕터(타임스탬프) 용 — 훅 구간 다음 각 이슈가 실제로 시작하는 지점(초) */
    chapters: OmnibusChapter[]
}

/**
 * 완료된 숏폼 job 배열(순서 = 등장 순서, 첫 번째가 훅 대상)을 받아 옴니버스 롱폼 mp4를 생성해 Buffer로 반환.
 * 실제 Storage 업로드/DB 기록은 호출부(API 라우트)에서 처리 (숏폼 generateNSceneShortform과 동일한 패턴).
 */
export async function generateOmnibusLongform(
    jobs: OmnibusJob[],
    hook: OmnibusHookConfig,
    options: GenerateOmnibusOptions = {}
): Promise<GenerateOmnibusResult> {
    if (jobs.length < 2) {
        throw new Error(`옴니버스 롱폼은 최소 2개 이슈가 필요합니다 (${jobs.length}개 전달됨)`)
    }

    const outputMode = options.outputMode ?? 'vertical'
    const ffmpegPath = getFfmpegPath()
    const tmpDir = join(tmpdir(), `omnibus-longform-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })

    try {
        // 1. 이슈 영상 다운로드와 2. 훅 클립 생성은 서로 독립적 — 동시 진행
        const [issuePaths, hookClip] = await Promise.all([
            Promise.all(jobs.map((job, i) => {
                const dest = join(tmpDir, `issue-${i}.mp4`)
                return downloadFile(toPublicUrl(job.videoPath), dest).then(() => dest)
            })),
            (async () => {
                // 배경: Pexels 신규 검색, 이슈 영상과 중복 방지
                const { buffer: heroBg, cleanImagePath } = await createHookBackground(tmpDir, hook.imageQuery, hook.imageCategory, hook.imageSeed)
                const hookPath = join(tmpDir, 'hook.mp4')
                await createTwoBeatHookClip(
                    hook.sentenceA,
                    hook.sentenceB ?? DEFAULT_SENTENCE_B,
                    heroBg,
                    hookPath,
                    tmpDir,
                    ffmpegPath,
                    {
                        highlightsA: hook.highlightsA ?? [],
                        highlightsB: hook.highlightsB ?? DEFAULT_HIGHLIGHTS_B,
                    }
                )
                return { hookPath, cleanImagePath }
            })(),
        ])

        // 3. 훅 클립(A→B 등장 포함, 하나의 파일) + 이슈들 순서로 정규화.
        //    마지막 이슈만 검색씬을 남기고, 나머지는 끝의 검색씬 트림 제거
        const sequence: { path: string; isFirst: boolean; isLast: boolean; trim: number; cleanBgImagePath?: string }[] = [
            { path: hookClip.hookPath, isFirst: true, isLast: false, trim: 0, cleanBgImagePath: hookClip.cleanImagePath },
            ...issuePaths.map((p, i) => ({
                path: p,
                isFirst: false,
                isLast: i === issuePaths.length - 1,
                trim: i === issuePaths.length - 1 ? 0 : SEARCH_SCENE_TRIM,
            })),
        ]

        // 각 구간 정규화(ffmpeg 인코딩)도 서로 독립적 — 동시 진행 (Promise.all은 입력 순서대로 결과 반환)
        const normalizeResults = await Promise.all(sequence.map(async (item, i) => {
            const audioPresent = await hasAudioStream(item.path, ffmpegPath)
            const normPath = join(tmpDir, `norm-${i}.mp4`)
            const duration = await normalizeClip(item.path, normPath, ffmpegPath, outputMode, {
                hasAudio: audioPresent,
                trimEndSeconds: item.trim,
                fadeIn: !item.isFirst,
                fadeOut: !item.isLast,
                cleanBgImagePath: item.cleanBgImagePath,
            })
            return { normPath, duration }
        }))
        const normalizedPaths = normalizeResults.map(r => r.normPath)
        const segmentDurations = normalizeResults.map(r => r.duration)

        // 챕터 타임스탬프 계산 — sequence[0]은 훅, 이후 jobs와 1:1 대응
        const chapters: OmnibusChapter[] = [{ label: '인트로', startSeconds: 0 }]
        let cursor = segmentDurations[0]
        for (let i = 0; i < jobs.length; i++) {
            chapters.push({ label: jobs[i].issueTitle, startSeconds: Math.round(cursor) })
            cursor += segmentDurations[i + 1]
        }

        // 4. 최종 이어붙이기
        const concatListPath = join(tmpDir, 'concat.txt')
        const concatList = normalizedPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
        await writeFile(concatListPath, concatList)

        const finalPath = join(tmpDir, 'final.mp4')
        await exec(`"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalPath}"`)

        return { videoBuffer: await readFile(finalPath), chapters }
    } finally {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
}
