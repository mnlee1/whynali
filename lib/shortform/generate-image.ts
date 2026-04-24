/**
 * lib/shortform/generate-image.ts
 * 
 * 숏폼 이미지 카드 생성 (9:16 세로형)
 * 
 * Sharp 라이브러리를 사용하여 SVG 템플릿을 1080×1920px PNG로 렌더링합니다.
 * Gemini가 생성한 텍스트를 통합하여 매력적인 카드를 제작합니다.
 * 본문 요약은 사용하지 않으며, 이슈 메타데이터만 사용합니다.
 * 
 * 3-Scene 모드: 스톡 이미지 배경 + 3단계 슬라이드쇼
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ShortformJob } from '@/types/shortform'
import { generateShortformText, type ShortformTextInput } from './generate-text'
import { fetch3StockImages } from './fetch-stock-images'
import { createScene1, createScene2, createScene3 } from './generate-scenes'
import { create3SceneVideo, type SceneContent } from './create-multi-video'

const WIDTH = 1080
const HEIGHT = 1920

/**
 * 화력 등급별 색상
 */
const HEAT_COLORS = {
    '높음': { bg: '#FEE2E2', text: '#991B1B' },  // red-100, red-800
    '보통': { bg: '#FEF3C7', text: '#92400E' },  // yellow-100, yellow-800
    '낮음': { bg: '#F3F4F6', text: '#374151' },  // gray-100, gray-700
}

/**
 * 이슈 상태별 색상
 */
const STATUS_COLORS = {
    '점화': { bg: '#FED7AA', text: '#9A3412' },  // orange-200, orange-800
    '논란중': { bg: '#FCA5A5', text: '#991B1B' },  // red-300, red-800
    '종결': { bg: '#E5E7EB', text: '#374151' },  // gray-200, gray-700
}

/**
 * 텍스트 이스케이프 (SVG용)
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/**
 * 텍스트 줄바꿈 처리 (최대 너비 기준)
 */
function wrapText(text: string, maxLength: number): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        if (testLine.length <= maxLength) {
            currentLine = testLine
        } else {
            if (currentLine) lines.push(currentLine)
            currentLine = word
        }
    }
    if (currentLine) lines.push(currentLine)

    return lines
}

/**
 * 로고 이미지를 Base64로 인코딩
 */
function getLogoBase64(): string {
    try {
        const logoPath = join(process.cwd(), 'public', 'whynali-logo.png')
        const logoBuffer = readFileSync(logoPath)
        return `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (error) {
        console.error('[로고 로드 실패]', error)
        return ''
    }
}

/**
 * SVG 템플릿 생성 (레거시)
 * @deprecated generate3SceneShortform 사용 권장
 */
function generateSvgTemplate(
    job: ShortformJob,
    generatedText: { scene1: string; scene2: string; scene3: string }
): string {
    const heatColor = HEAT_COLORS[job.heat_grade as keyof typeof HEAT_COLORS]
    const statusColor = STATUS_COLORS[job.issue_status as keyof typeof STATUS_COLORS]
    
    const title = escapeXml(job.issue_title)
    const titleLines = wrapText(title, 20)
    
    const shortUrl = job.issue_url.replace('https://', '')
    const logoBase64 = getLogoBase64()

    return `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <rect width="${WIDTH}" height="${HEIGHT}" fill="#FFFFFF"/>
            <rect x="0" y="0" width="${WIDTH}" height="160" fill="#1F2937"/>
            ${logoBase64 ? `<image href="${logoBase64}" x="${WIDTH / 2 - 120}" y="30" width="240" height="100" preserveAspectRatio="xMidYMid meet"/>` : ''}
            ${titleLines.map((line, i) => `
                <text x="${WIDTH / 2}" y="${360 + i * 100}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="#111827">
                    ${escapeXml(line)}
                </text>
            `).join('')}
            <rect x="${WIDTH / 2 - 150}" y="800" width="300" height="80" rx="40" fill="${statusColor.bg}"/>
            <text x="${WIDTH / 2}" y="855" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="${statusColor.text}">
                ${escapeXml(job.issue_status)}
            </text>
            <rect x="${WIDTH / 2 - 180}" y="920" width="360" height="80" rx="40" fill="${heatColor.bg}"/>
            <text x="${WIDTH / 2}" y="975" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="${heatColor.text}">
                🔥 화력 ${escapeXml(job.heat_grade)}
            </text>
            <text x="${WIDTH / 2}" y="1080" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#374151">
                ${escapeXml(generatedText.scene2)}
            </text>
            <text x="${WIDTH / 2}" y="1140" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#6B7280">
                뉴스 ${job.source_count.news}건 • 커뮤니티 ${job.source_count.community}건
            </text>
            <rect x="0" y="1600" width="${WIDTH}" height="320" fill="#EFF6FF"/>
            <rect x="${WIDTH / 2 - 300}" y="1680" width="600" height="110" rx="55" fill="#1E40AF"/>
            <text x="${WIDTH / 2}" y="1755" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="bold" fill="#FFFFFF">
                지금 바로 확인하기
            </text>
            <text x="${WIDTH / 2}" y="1850" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#6B7280">
                왜난리에서 실시간 여론·토론·타임라인 확인
            </text>
            <text x="${WIDTH / 2}" y="1895" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#93C5FD">
                ${escapeXml(shortUrl)}
            </text>
        </svg>
    `.trim()
}

export interface GenerateImageInput {
    issueTitle: string
    issueCategory: string
    issueStatus: string
    heatGrade: string
    newsCount: number
    communityCount: number
    issueUrl: string
}

/**
 * 숏폼 이미지 카드 생성
 * 
 * @param job - 숏폼 job 정보 (전체) 또는 간소화된 입력
 * @returns PNG 이미지 버퍼
 */
export async function generateShortformImage(job: ShortformJob | GenerateImageInput): Promise<Buffer> {
    const jobData: ShortformJob = 'issue_id' in job ? job : {
        id: '',
        issue_id: '',
        issue_title: job.issueTitle,
        issue_status: job.issueStatus,
        heat_grade: job.heatGrade as any,
        source_count: { news: job.newsCount, community: job.communityCount },
        issue_url: job.issueUrl,
        video_path: null,
        approval_status: 'pending',
        upload_status: null,
        trigger_type: 'daily_batch',
        created_at: '',
        updated_at: '',
    }
    
    const category = 'issue_id' in job ? '' : job.issueCategory
    
    const generatedText = await generateShortformText({
        title: jobData.issue_title,
        category: category,
        status: jobData.issue_status,
        heatGrade: jobData.heat_grade,
        newsCount: jobData.source_count.news,
        communityCount: jobData.source_count.community,
    })
    
    const svg = generateSvgTemplate(jobData, {
        scene1: generatedText.scene1Title,
        scene2: generatedText.scene2Title,
        scene3: generatedText.scene3Title,
    })
    const svgBuffer = Buffer.from(svg)
    
    const image = await sharp(svgBuffer)
        .resize(WIDTH, HEIGHT)
        .png()
        .toBuffer()
    
    return image
}

/**
 * 파일명 생성 (타임스탬프 포함)
 */
export function generateImageFilename(jobId: string): string {
    const timestamp = Date.now()
    return `shortform-${jobId}-${timestamp}.png`
}

/**
 * 3-Scene 슬라이드쇼 동영상 생성
 * 
 * @param input - 이슈 정보
 * @param duration - 총 길이 (초, 기본값 10)
 * @returns MP4 Buffer
 */
export async function generate3SceneShortform(
    input: GenerateImageInput,
    duration: number = 10,
    previewImages?: string[]
): Promise<Buffer> {
    // 1. Groq Scene별 자막 생성 (이슈 제목 기반)
    const generatedText = await generateShortformText({
        title: input.issueTitle,
        category: input.issueCategory,
        status: input.issueStatus,
        heatGrade: input.heatGrade,
        newsCount: input.newsCount,
        communityCount: input.communityCount,
    })

    console.log('[생성된 Scene 자막]', generatedText)

    // 2. 스톡 이미지 3장 가져오기 (미리보기 이미지 있으면 재사용, 없으면 새로 검색)
    const stockImages = (previewImages && previewImages.length >= 3)
        ? previewImages
        : await fetch3StockImages(input.issueCategory, input.issueTitle)
    
    // Fallback: API 실패 시 단색 배경 사용
    if (stockImages.length === 0) {
        console.warn('[3-Scene] 스톡 이미지 없음 - 기존 방식 사용')
        return await generateShortformImage(input)
    }
    
    // 3. 배경 이미지 3개 생성 (텍스트 없이)
    const { createBackgroundScene, createSceneTextOverlay } = await import('./generate-scenes')
    const scene1Bg = await createBackgroundScene(stockImages[0])
    const scene2Bg = await createBackgroundScene(stockImages[1])
    const scene3Bg = await createBackgroundScene(stockImages[2])
    
    // 4. Scene별 구조 레이어 생성 (로고 + CTA 버튼 rect) — title/desc로 수직 중앙 위치 계산
    const text1 = await createSceneTextOverlay(1, generatedText.scene1Title, generatedText.scene1Desc)
    const text2 = await createSceneTextOverlay(2, generatedText.scene2Title, generatedText.scene2Desc)
    const text3 = await createSceneTextOverlay(3, generatedText.scene3Title, generatedText.scene3Desc)

    // 5. 동영상 합성 (씬 슬라이드 전환 + FFmpeg drawtext로 Pretendard 텍스트 렌더링)
    const sceneContents: [SceneContent, SceneContent, SceneContent] = [
        { title: generatedText.scene1Title, desc: generatedText.scene1Desc },
        { title: generatedText.scene2Title, desc: generatedText.scene2Desc },
        { title: generatedText.scene3Title, desc: generatedText.scene3Desc },
    ]
    const videoBuffer = await create3SceneVideo(
        [scene1Bg, scene2Bg, scene3Bg],
        [text1, text2, text3],
        duration,
        undefined,
        sceneContents
    )
    
    return videoBuffer
}
