/**
 * lib/generate-issue-thumbnail.ts
 * 이슈 그래픽 썸네일 생성 (1280×720 PNG)
 * - 좌측: 텍스트 영역 (다크, 클린)
 * - 우측: 피그마 블롭 이미지 합성
 */

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'

const W = 1280
const H = 720

// ─── 테마 ────────────────────────────────────────────────────────────────────

type Theme = {
    bg1: string
    bg2: string
    badgeStroke: string
    badgeText:   string
    label:       string
    ink:         string  // OG 이미지 제목 텍스트 색상
}

const THEMES: Record<string, Theme> = {
    '연예':    { bg1:'#F5F0FF', bg2:'#EDE9FE', badgeStroke:'#7C3AED', badgeText:'#3B0764', label:'rgba(109,40,217,.55)',  ink:'#2E1065' },
    '스포츠':  { bg1:'#EFF6FF', bg2:'#DBEAFE', badgeStroke:'#2563EB', badgeText:'#1E3A8A', label:'rgba(37,99,235,.55)',   ink:'#1E3A8A' },
    '정치':    { bg1:'#F8FAFC', bg2:'#F1F5F9', badgeStroke:'#475569', badgeText:'#1E293B', label:'rgba(71,85,105,.55)',   ink:'#0F172A' },
    '사회':    { bg1:'#FFF1F2', bg2:'#FFE4E6', badgeStroke:'#E11D48', badgeText:'#881337', label:'rgba(225,29,72,.55)',   ink:'#4C0519' },
    '경제':    { bg1:'#F0FDF4', bg2:'#DCFCE7', badgeStroke:'#16A34A', badgeText:'#14532D', label:'rgba(22,163,74,.55)',   ink:'#052E16' },
    '기술':    { bg1:'#F0F9FF', bg2:'#E0F2FE', badgeStroke:'#0284C7', badgeText:'#0C4A6E', label:'rgba(2,132,199,.55)',   ink:'#082F49' },
    '세계':    { bg1:'#EEF2FF', bg2:'#E0E7FF', badgeStroke:'#4F46E5', badgeText:'#1E1B4B', label:'rgba(79,70,229,.55)',   ink:'#1E1B4B' },
    '생활문화': { bg1:'#FFFBEB', bg2:'#FEF3C7', badgeStroke:'#D97706', badgeText:'#78350F', label:'rgba(217,119,6,.55)',   ink:'#451A03' },
}

// ─── 카테고리별 블롭 배정 ─────────────────────────────────────────────────────

const CATEGORY_BLOB: Record<string, string> = {
    '연예':    'neon-01',
    '스포츠':  'dark-01',
    '정치':    'dark-03',
    '사회':    'dark-02',
    '경제':    'bright-01',
    '기술':    'neon-02',
    '세계':    'bright-02',
    '생활문화': 'light-01',
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}

function readBase64(path: string, mime: string): string {
    try { return `data:${mime};base64,${readFileSync(join(process.cwd(), path)).toString('base64')}` }
    catch { return '' }
}

function wrapKorean(text: string, maxChars: number): string[] {
    const words = text.split(' ')
    if (words.length > 1) {
        const lines: string[] = []
        let cur = ''
        for (const w of words) {
            const next = cur ? `${cur} ${w}` : w
            if (next.length <= maxChars) { cur = next }
            else { if (cur) lines.push(cur); cur = w }
        }
        if (cur) lines.push(cur)
        return lines
    }
    const lines: string[] = []
    let cur = ''
    for (const ch of text) {
        cur += ch
        if (cur.length >= maxChars) { lines.push(cur); cur = '' }
    }
    if (cur) lines.push(cur)
    return lines
}

function getTitleConfig(len: number) {
    if (len <=  8) return { fontSize: 96, maxChars:  8 }
    if (len <= 13) return { fontSize: 82, maxChars: 12 }
    if (len <= 20) return { fontSize: 70, maxChars: 14 }
    return             { fontSize: 60, maxChars: 16 }
}

// ─── 배경 전용 (텍스트 없음) ─────────────────────────────────────────────────

export async function generateIssueBg(
    category: string,
    blobName?: string,
    opts?: { square?: boolean }   // square=true: 720×720, 블롭 중앙 배치
): Promise<Buffer> {
    const t = THEMES[category] ?? THEMES['사회']
    const blob = blobName ?? CATEGORY_BLOB[category] ?? 'neon-01'
    const blobB64 = readBase64(`public/thumbnails/blobs/${blob}.png`, 'image/png')

    const sq = opts?.square
    const svgW = sq ? H : W           // square면 720×720
    const svgH = H

    // 16:9일 때 블롭은 오른쪽, 정사각형이면 중앙
    const blobSize = sq ? 660 : 780
    const blobX = sq ? Math.round((svgW - blobSize) / 2) : 530
    const blobY = Math.round((svgH - blobSize) / 2)

    const blobCx = blobX + blobSize / 2
    const blobCy = blobY + blobSize / 2
    const blobR  = blobSize / 2

    const svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${t.bg1}"/>
    <stop offset="100%" stop-color="${t.bg2}"/>
  </linearGradient>
  <radialGradient id="bm" cx="${blobCx}" cy="${blobCy}" r="${blobR}" gradientUnits="userSpaceOnUse">
    <stop offset="45%" stop-color="white" stop-opacity="1"/>
    <stop offset="100%" stop-color="white" stop-opacity="0"/>
  </radialGradient>
  <mask id="blobMask">
    <rect width="${svgW}" height="${svgH}" fill="url(#bm)"/>
  </mask>
  <clipPath id="clip"><rect width="${svgW}" height="${svgH}"/></clipPath>
</defs>
<g clip-path="url(#clip)">
  <rect width="${svgW}" height="${svgH}" fill="url(#bg)"/>
  ${blobB64 ? `<image href="${blobB64}" x="${blobX}" y="${blobY}" width="${blobSize}" height="${blobSize}" preserveAspectRatio="xMidYMid meet" mask="url(#blobMask)"/>` : ''}
</g>
</svg>`

    return sharp(Buffer.from(svg)).resize(svgW, svgH).png().toBuffer()
}

// ─── 썸네일 (텍스트 포함 — OG 이미지용) ────────────────────────────────────

export async function generateIssueThumbnail(
    title: string,
    category: string,
    opts?: { hot?: boolean; blob?: string }
): Promise<Buffer> {
    const t = THEMES[category] ?? THEMES['사회']
    const fontB64 = readBase64('public/fonts/Pretendard-Bold.ttf', 'font/truetype')

    // 블롭 이미지 base64 (opts.blob으로 직접 지정 가능)
    const blobName = opts?.blob ?? CATEGORY_BLOB[category] ?? 'neon-01'
    const blobB64 = readBase64(`public/thumbnails/blobs/${blobName}.png`, 'image/png')

    // 블롭 배치: 오른쪽 절반 중앙, 살짝 오른쪽으로 치우침
    const blobSize = 780
    const blobX = 530
    const blobY = Math.round((H - blobSize) / 2)   // -30
    const blobCx = blobX + blobSize / 2
    const blobCy = blobY + blobSize / 2
    const blobR  = blobSize / 2

    const { fontSize, maxChars } = getTitleConfig(title.length)
    const lines   = wrapKorean(title, maxChars)
    const lineH   = fontSize * 1.3
    const bottomY = H - 52
    const firstY  = bottomY - (lines.length - 1) * lineH
    const badgeY  = firstY - fontSize * 0.9 - 22
    const badgePad = 22
    const badgeW  = category.length * 18 + badgePad * 2
    const badgeH  = 40

    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  ${fontB64 ? `<style>@font-face{font-family:'Pretendard';src:url('${fontB64}') format('truetype');font-weight:bold;}</style>` : ''}

  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${t.bg1}"/>
    <stop offset="100%" stop-color="${t.bg2}"/>
  </linearGradient>

  <radialGradient id="bm" cx="${blobCx}" cy="${blobCy}" r="${blobR}" gradientUnits="userSpaceOnUse">
    <stop offset="45%" stop-color="white" stop-opacity="1"/>
    <stop offset="100%" stop-color="white" stop-opacity="0"/>
  </radialGradient>
  <mask id="blobMask">
    <rect width="${W}" height="${H}" fill="url(#bm)"/>
  </mask>

  <filter id="ts" x="-5%" y="-20%" width="110%" height="140%">
    <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="${t.ink}" flood-opacity="0.1"/>
  </filter>

  <linearGradient id="lp" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${t.bg1}" stop-opacity="0.9"/>
    <stop offset="55%"  stop-color="${t.bg1}" stop-opacity="0.6"/>
    <stop offset="100%" stop-color="${t.bg1}" stop-opacity="0"/>
  </linearGradient>

  <clipPath id="clip"><rect width="${W}" height="${H}"/></clipPath>
</defs>

<g clip-path="url(#clip)">

<!-- ① 배경 -->
<rect width="${W}" height="${H}" fill="url(#bg)"/>

<!-- ② 블롭 이미지 (우측, 엣지 페이드) -->
${blobB64 ? `<image href="${blobB64}" x="${blobX}" y="${blobY}" width="${blobSize}" height="${blobSize}" preserveAspectRatio="xMidYMid meet" mask="url(#blobMask)"/>` : ''}

<!-- ③ 좌측 보호 오버레이 -->
<rect width="${W}" height="${H}" fill="url(#lp)"/>

<!-- ④ 카테고리 레이블 -->
<text x="44" y="54"
  font-family="Pretendard,sans-serif" font-size="20" font-style="italic"
  fill="${t.label}">${escapeXml(category)}</text>

<!-- ⑤ HOT 뱃지 -->
${opts?.hot ? `
<rect x="${W-154}" y="18" width="118" height="34" rx="17"
  fill="#EF4444" fill-opacity="0.9"/>
<text x="${W-95}" y="40" text-anchor="middle"
  font-family="Pretendard,sans-serif" font-size="17" font-weight="bold"
  fill="white">🔥 HOT</text>` : ''}

<!-- ⑥ 카테고리 뱃지 -->
<rect x="40" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${badgeH/2}"
  fill="none" stroke="${t.badgeStroke}" stroke-width="1.5" stroke-opacity="0.8"/>
<text x="${40+badgeW/2}" y="${badgeY+badgeH*0.67}" text-anchor="middle"
  font-family="Pretendard,sans-serif" font-size="18" font-weight="bold"
  fill="${t.badgeText}">${escapeXml(category)}</text>

<!-- ⑦ 이슈 제목 -->
${lines.map((line, i) => `
<text x="40" y="${firstY + i*lineH}"
  font-family="Pretendard,sans-serif" font-size="${fontSize}" font-weight="bold"
  fill="${t.ink}" filter="url(#ts)">${escapeXml(line)}</text>`).join('')}

<!-- ⑧ 워터마크 -->
<text x="${W-36}" y="${H-20}" text-anchor="end"
  font-family="Pretendard,sans-serif" font-size="17"
  fill="${t.label}">whynali.com</text>

</g>
</svg>`

    return sharp(Buffer.from(svg)).resize(W, H).png().toBuffer()
}
