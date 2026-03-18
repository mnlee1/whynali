/**
 * lib/shortform/generate-image.ts
 * 
 * 숏폼 이미지 카드 생성 (9:16 세로형)
 * 
 * Sharp 라이브러리를 사용하여 SVG 템플릿을 1080×1920px PNG로 렌더링합니다.
 * 본문 요약은 사용하지 않으며, 이슈 메타데이터만 사용합니다.
 */

import sharp from 'sharp'
import type { ShortformJob } from '@/types/shortform'

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
 * SVG 템플릿 생성
 */
function generateSvgTemplate(job: ShortformJob): string {
    const heatColor = HEAT_COLORS[job.heat_grade as keyof typeof HEAT_COLORS]
    const statusColor = STATUS_COLORS[job.issue_status as keyof typeof STATUS_COLORS]
    
    const title = escapeXml(job.issue_title)
    const titleLines = wrapText(title, 20)
    
    // QR 코드는 나중에 추가할 수 있으므로 일단 텍스트 링크로
    const shortUrl = job.issue_url.replace('https://', '')

    return `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <!-- 배경 -->
            <rect width="${WIDTH}" height="${HEIGHT}" fill="#FFFFFF"/>
            
            <!-- 상단 헤더 -->
            <rect x="0" y="0" width="${WIDTH}" height="200" fill="#1F2937"/>
            <text x="${WIDTH / 2}" y="100" text-anchor="middle" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="#FFFFFF">
                왜난리
            </text>
            <text x="${WIDTH / 2}" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#9CA3AF">
                지금 이슈는?
            </text>
            
            <!-- 이슈 제목 -->
            ${titleLines.map((line, i) => `
                <text x="${WIDTH / 2}" y="${400 + i * 100}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="#111827">
                    ${escapeXml(line)}
                </text>
            `).join('')}
            
            <!-- 상태 배지 -->
            <rect x="${WIDTH / 2 - 150}" y="800" width="300" height="80" rx="40" fill="${statusColor.bg}"/>
            <text x="${WIDTH / 2}" y="855" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="${statusColor.text}">
                ${escapeXml(job.issue_status)}
            </text>
            
            <!-- 화력 배지 -->
            <rect x="${WIDTH / 2 - 180}" y="920" width="360" height="80" rx="40" fill="${heatColor.bg}"/>
            <text x="${WIDTH / 2}" y="975" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="${heatColor.text}">
                🔥 화력 ${escapeXml(job.heat_grade)}
            </text>
            
            <!-- 출처 정보 -->
            <text x="${WIDTH / 2}" y="1080" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="#6B7280">
                뉴스 ${job.source_count.news}건 • 커뮤니티 ${job.source_count.community}건
            </text>
            
            <!-- 하단 CTA -->
            <rect x="0" y="1600" width="${WIDTH}" height="320" fill="#EFF6FF"/>
            <text x="${WIDTH / 2}" y="1720" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#1E40AF">
                자세히 보기
            </text>
            <text x="${WIDTH / 2}" y="1800" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#3B82F6">
                ${escapeXml(shortUrl)}
            </text>
            <text x="${WIDTH / 2}" y="1870" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#6B7280">
                왜난리에서 실시간 업데이트 확인
            </text>
        </svg>
    `.trim()
}

/**
 * 숏폼 이미지 카드 생성
 * 
 * @param job - 숏폼 job 정보
 * @returns PNG 이미지 버퍼
 */
export async function generateShortformImage(job: ShortformJob): Promise<Buffer> {
    const svg = generateSvgTemplate(job)
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
