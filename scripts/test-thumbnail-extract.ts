/**
 * scripts/test-thumbnail-extract.ts
 *
 * 프로덕션 파이프라인(createNSceneVideo + extractThumbnailFromVideo)을
 * 그대로 호출해 scene1TextEndTime 계산값과 실제 캡처된 썸네일 프레임을
 * 로컬에서 눈으로 확인하기 위한 테스트 스크립트.
 *
 * 외부 서비스(TTS/Instagram/Supabase) 호출 없음 — 오디오 없이 기본
 * MIN_SCENE(3.0초) 길이로 씬을 구성한다.
 *
 * 실행: npx tsx scripts/test-thumbnail-extract.ts
 * 출력:
 *   output/thumb-test-video.mp4   (합성된 전체 영상)
 *   output/thumb-test-thumb.jpg   (scene1TextEndTime 시점 캡처)
 *   output/thumb-test-frame0.jpg  (0초 프레임 — 비교용)
 */

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import {
    createBackgroundScene,
    createSceneTextOverlay,
    createSearchSceneOverlay,
} from '../lib/shortform/generate-scenes'
import { createNSceneVideo, extractThumbnailFromVideo, type SceneContent } from '../lib/shortform/create-multi-video'

const ISSUE_TITLE = '미국 이란 공습 개시'
const SCENE_DESCS = [
    '전쟁이 다시 시작됐습니다, 종전 합의 단 20일 만입니다',
    '국제사회는 즉각 규탄 성명을 발표했습니다',
]

const SAMPLE_IMAGES = [
    'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?w=1280',
    'https://images.pexels.com/photos/5668481/pexels-photo-5668481.jpeg?w=1280',
]

async function main() {
    const outputDir = join(process.cwd(), 'output')
    await mkdir(outputDir, { recursive: true })

    console.log('\n[1/4] 배경 씬 생성...')
    const backgrounds = await Promise.all(SAMPLE_IMAGES.map(url => createBackgroundScene(url)))
    const searchBg = backgrounds[backgrounds.length - 1]

    console.log('[2/4] 텍스트 오버레이 생성...')
    const overlays = await Promise.all([
        ...SCENE_DESCS.map((desc, i) => createSceneTextOverlay(i + 1, ISSUE_TITLE, desc)),
        createSearchSceneOverlay(),
    ])

    const sceneContents: SceneContent[] = [
        ...SCENE_DESCS.map(desc => ({ title: ISSUE_TITLE, desc })),
        { title: '', desc: '', isSearchScene: true },
    ]

    console.log('[3/4] createNSceneVideo() 호출 (프로덕션 함수, 오디오 없음)...')
    const { buffer: videoBuffer, scene1TextEndTime } = await createNSceneVideo(
        [...backgrounds, searchBg],
        overlays,
        sceneContents,
        undefined,
    )
    console.log(`  → scene1TextEndTime = ${scene1TextEndTime.toFixed(3)}초`)

    const videoPath = join(outputDir, 'thumb-test-video.mp4')
    await writeFile(videoPath, videoBuffer)
    console.log(`  → 영상 저장: ${videoPath}`)

    console.log('[4/4] extractThumbnailFromVideo() 호출...')
    const thumbAtCalc = await extractThumbnailFromVideo(videoBuffer, scene1TextEndTime)
    const thumbAtZero = await extractThumbnailFromVideo(videoBuffer, 0)

    if (thumbAtCalc) {
        const p = join(outputDir, 'thumb-test-thumb.jpg')
        await writeFile(p, thumbAtCalc)
        console.log(`  → scene1TextEndTime(${scene1TextEndTime.toFixed(2)}s) 캡처 저장: ${p}`)
    } else {
        console.log('  → scene1TextEndTime 캡처 실패 (null 반환)')
    }

    if (thumbAtZero) {
        const p = join(outputDir, 'thumb-test-frame0.jpg')
        await writeFile(p, thumbAtZero)
        console.log(`  → 0초 캡처(비교용) 저장: ${p}`)
    }

    console.log('\n완료. output/thumb-test-thumb.jpg 와 output/thumb-test-frame0.jpg 를 비교해서')
    console.log('scene1TextEndTime 캡처본에 씬1 텍스트가 완성된 상태로 보이는지 확인하세요.')
}

main().catch(err => {
    console.error('오류:', err)
    process.exit(1)
})
