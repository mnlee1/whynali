/**
 * lib/kpi/google-sheets-export.ts
 *
 * KPI 데이터를 Google Sheets로 내보냅니다.
 * - "주간보고서" 시트: 이번 주 현재값 + 전주대비 증감 + 이번 주 목표·달성률
 * - "월간보고서" 시트: 이번 달 현재값 + 전월대비 증감 + 이번 달 목표·달성률·참여율
 * 관리자 화면(①콘텐츠 제작 ②유입·성장 ③참여·반응) 구성과 동일한 항목을 담습니다.
 */

import { google, sheets_v4 } from 'googleapis'
import type { calculateKPI } from './calculator'
import { CHANNEL_ORDER, CHANNEL_LABEL, type ChannelKey } from './channels'

type KPIResult = Awaited<ReturnType<typeof calculateKPI>>
type DeltaStat = { current: number; previous: number; delta: number; deltaPercent: number | null }
type ReportKind = 'weekly' | 'monthly'
type GColor    = sheets_v4.Schema$Color
type CellData  = sheets_v4.Schema$CellData
type RowData   = sheets_v4.Schema$RowData
type Req       = sheets_v4.Schema$Request

const SHEET_NAME: Record<ReportKind, string> = { weekly: '주간보고서', monthly: '월간보고서' }
const NCOLS = 12
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

// ── 색상 팔레트 ──────────────────────────────────────────────────────────────
const C = {
    titleBg:    { red: 0.22, green: 0.25, blue: 0.64 } as GColor,
    titleFg:    { red: 1,    green: 1,    blue: 1    } as GColor,
    titleSub:   { red: 0.78, green: 0.80, blue: 0.96 } as GColor,
    secBg:      { red: 0.91, green: 0.92, blue: 0.97 } as GColor,
    secFg:      { red: 0.20, green: 0.23, blue: 0.60 } as GColor,
    hdrBg:      { red: 0.96, green: 0.97, blue: 1.00 } as GColor,
    hdrFg:      { red: 0.28, green: 0.31, blue: 0.56 } as GColor,
    achievedBg: { red: 0.88, green: 0.98, blue: 0.92 } as GColor,
    achievedFg: { red: 0.05, green: 0.62, blue: 0.38 } as GColor,
    warningBg:  { red: 1.00, green: 0.97, blue: 0.84 } as GColor,
    warningFg:  { red: 0.76, green: 0.54, blue: 0.02 } as GColor,
    dangerBg:   { red: 1.00, green: 0.91, blue: 0.91 } as GColor,
    dangerFg:   { red: 0.80, green: 0.10, blue: 0.12 } as GColor,
    border:     { red: 0.84, green: 0.86, blue: 0.92 } as GColor,
    text:       { red: 0.11, green: 0.13, blue: 0.18 } as GColor,
    muted:      { red: 0.52, green: 0.55, blue: 0.62 } as GColor,
    white:      { red: 1,    green: 1,    blue: 1    } as GColor,
    rowAlt:     { red: 0.98, green: 0.99, blue: 1.00 } as GColor,
}

// ── 셀 빌더 ──────────────────────────────────────────────────────────────────
type Fmt = {
    bg?: GColor; fg?: GColor
    bold?: boolean; italic?: boolean; size?: number
    align?: 'LEFT' | 'CENTER' | 'RIGHT'
    border?: boolean
}

function cell(value: string | number | null, fmt: Fmt = {}): CellData {
    const uv: sheets_v4.Schema$ExtendedValue =
        typeof value === 'number' ? { numberValue: value } :
        value === null            ? {} :
                                    { stringValue: value }
    const bd: sheets_v4.Schema$Borders | undefined = fmt.border ? {
        top:    { style: 'SOLID', color: C.border, width: 1 },
        bottom: { style: 'SOLID', color: C.border, width: 1 },
        left:   { style: 'SOLID', color: C.border, width: 1 },
        right:  { style: 'SOLID', color: C.border, width: 1 },
    } : undefined
    return {
        userEnteredValue: uv,
        userEnteredFormat: {
            backgroundColor: fmt.bg ?? C.white,
            textFormat: {
                foregroundColor: fmt.fg ?? C.text,
                bold:   fmt.bold   ?? false,
                italic: fmt.italic ?? false,
                fontSize: fmt.size ?? 10,
            },
            horizontalAlignment: fmt.align ?? 'LEFT',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'OVERFLOW_CELL',
            padding: { top: 4, bottom: 4, left: 8, right: 8 },
            borders: bd,
        },
    }
}

const hdr = (t: string) => cell(t, { bg: C.hdrBg, fg: C.hdrFg, bold: true, align: 'CENTER', border: true })
const dat = (v: string | number | null, align: Fmt['align'] = 'LEFT', bg = C.white) =>
    cell(v, { bg, fg: C.text, align, border: true })
const pad = (bg = C.white) => cell(null, { bg, border: true })

function rateCell(rate: number): CellData {
    const fmt: Fmt = { bold: true, align: 'CENTER', border: true }
    if (rate >= 100)      { fmt.bg = C.achievedBg; fmt.fg = C.achievedFg }
    else if (rate >= 50)  { fmt.bg = C.warningBg;  fmt.fg = C.warningFg  }
    else                  { fmt.bg = C.dangerBg;   fmt.fg = C.dangerFg   }
    return cell(`${rate.toFixed(1)}%`, fmt)
}

function deltaCell(d: DeltaStat | undefined, bg = C.white): CellData {
    if (!d) return dat('-', 'CENTER', bg)
    if (d.delta === 0) return dat('(–)', 'CENTER', bg)
    const up = d.delta > 0
    return cell(`(${up ? '▲' : '▼'}${Math.abs(d.delta).toLocaleString()})`, {
        bg, fg: up ? C.achievedFg : C.dangerFg, bold: true, align: 'CENTER', border: true,
    })
}

// ── 평일(월~금) 계산: 숏폼·카드뉴스는 평일에만 올라가는 콘텐츠라 목표를 평일 수 기준으로 잡음 ──
const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6
function countWeekdaysInMonth(year: number, month: number): number {
    const daysInMonth = new Date(year, month, 0).getDate()
    let count = 0
    for (let day = 1; day <= daysInMonth; day++) {
        if (isWeekday(new Date(year, month - 1, day))) count++
    }
    return count
}
const WEEKDAYS_PER_FULL_WEEK = 5

// ── 인증 ──────────────────────────────────────────────────────────────────────
function buildAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const key   = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!email || !key) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL 또는 GOOGLE_PRIVATE_KEY가 설정되지 않았습니다')
    return new google.auth.JWT({ email, key, scopes: SCOPES })
}

// ── 메인 내보내기 ─────────────────────────────────────────────────────────────
export async function exportKPIToGoogleSheets(year: number, month: number, kpi: KPIResult, kind: ReportKind = 'monthly') {
    const spreadsheetId = process.env.KPI_SPREADSHEET_ID
    if (!spreadsheetId) throw new Error('KPI_SPREADSHEET_ID가 설정되지 않았습니다')

    const { metrics } = kpi
    const t = metrics.targets
    const isWeekly  = kind === 'weekly'
    const periodKey = isWeekly ? 'd7' as const : 'd30' as const
    const cmpLabel  = isWeekly ? '전주대비' : '전월대비'
    const ps  = metrics.periodStats[periodKey]
    const cmp = metrics.periodComparison[periodKey]
    const periodDays    = isWeekly ? 7 : 30
    const weekdayCount  = isWeekly ? WEEKDAYS_PER_FULL_WEEK : countWeekdaysInMonth(year, month)
    const uniqueVisitors = isWeekly ? metrics.weeklyUniqueVisitors : metrics.monthlyUniqueVisitors
    const pageViews       = isWeekly ? metrics.weeklyPageViews     : metrics.monthlyPageViews

    const issueTarget     = t.dailyIssues * periodDays
    const shortformTarget = t.dailyShortformsPerPlatform * weekdayCount
    const cardNewsTarget  = weekdayCount
    const userTarget      = t.dailyNewUsers * periodDays
    const commentTarget   = t.dailyComments * periodDays
    const reactionTarget  = t.dailyReactions * periodDays
    const voteTarget      = Math.round(t.votes / 30 * periodDays)
    const pvTarget        = Math.round(t.pageviews / 30 * periodDays)

    const label      = `${year}-${String(month).padStart(2, '0')}`
    const exportedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    const period     = kpi.goalInfo
        ? `${kpi.goalInfo.periodStart} ~ ${kpi.goalInfo.periodEnd}`
        : `${year}년 ${month}월`
    const reportSheetName = SHEET_NAME[kind]
    const reportTitle = isWeekly ? '왜난리  KPI 주간보고서' : '왜난리  KPI 월간보고서'

    const auth   = buildAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // ── 시트 확보 ────────────────────────────────────────────────────────────
    const ss0 = await sheets.spreadsheets.get({ spreadsheetId })
    const existing0 = ss0.data.sheets ?? []
    const toCreate: Req[] = []

    if (!existing0.find(s => s.properties?.title === reportSheetName))
        toCreate.push({ addSheet: { properties: { title: reportSheetName, gridProperties: { rowCount: 100, columnCount: NCOLS } } } })

    // 기본 빈 시트("시트1"/"Sheet1") 삭제
    const defaultSheet = existing0.find(s =>
        s.properties?.title === '시트1' || s.properties?.title === 'Sheet1'
    )
    if (defaultSheet?.properties?.sheetId !== undefined && (existing0.length > 1 || toCreate.length > 0))
        toCreate.push({ deleteSheet: { sheetId: defaultSheet.properties.sheetId } })

    if (toCreate.length > 0)
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: toCreate } })

    const ss1 = await sheets.spreadsheets.get({ spreadsheetId })
    const reportSheet = ss1.data.sheets?.find(s => s.properties?.title === reportSheetName)
    const reportId = reportSheet?.properties?.sheetId ?? 0

    // 예전(컬럼 수가 다르던 시절)에 만들어진 시트가 남아있을 수 있어, 항상 필요한 크기로 맞춰줌
    const needsGridResize =
        (reportSheet?.properties?.gridProperties?.columnCount ?? 0) < NCOLS ||
        (reportSheet?.properties?.gridProperties?.rowCount ?? 0) < 100
    if (needsGridResize) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [{
                    updateSheetProperties: {
                        properties: { sheetId: reportId, gridProperties: { rowCount: 100, columnCount: NCOLS } },
                        fields: 'gridProperties.rowCount,gridProperties.columnCount',
                    },
                }],
            },
        })
    }

    // ── 행 빌드 헬퍼 ─────────────────────────────────────────────────────────
    const rows: RowData[] = []
    const merges: Req[]   = []
    let r = 0

    function addRow(cells: CellData[]) {
        const bg = cells[0]?.userEnteredFormat?.backgroundColor ?? C.white
        while (cells.length < NCOLS) cells.push(pad(bg))
        rows.push({ values: cells })
        r++
    }
    function merge(c1: number, c2: number) {
        merges.push({ mergeCells: {
            range: { sheetId: reportId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: c1, endColumnIndex: c2 },
            mergeType: 'MERGE_ALL',
        }})
    }
    function spacer() { addRow(Array(NCOLS).fill(pad())) }
    function secRow(text: string) {
        addRow([cell(text, { bg: C.secBg, fg: C.secFg, bold: true, size: 11 })])
        merge(0, NCOLS)
    }

    // 현재값 + 전기간 대비 + 목표·달성률(·참여율) 표 헤더
    function metricHeader(withParticipation: boolean) {
        addRow([
            hdr('항목'), hdr('현재'), hdr(cmpLabel), hdr('목표'), hdr('달성률'),
            ...(withParticipation ? [hdr('목표 참여율'), hdr('실제 참여율')] : []),
        ])
        if (!withParticipation) merge(5, NCOLS)
    }
    // 현재값 + 전기간 대비 + 목표·달성률(·참여율) 데이터 행
    function metricRow(
        lbl: string, current: number, delta: DeltaStat | undefined, target: number, i: number,
        participation?: { target: number; actual: number },
    ) {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        const rate = target > 0 ? (current / target) * 100 : 0
        const cells = [
            dat(lbl, 'LEFT', bg),
            dat(current, 'CENTER', bg),
            deltaCell(delta, bg),
            target > 0 ? dat(target, 'CENTER', bg) : dat('-', 'CENTER', bg),
            target > 0 ? rateCell(rate) : dat('-', 'CENTER', bg),
        ]
        if (participation) {
            cells.push(dat(`${participation.target}%`, 'CENTER', bg))
            cells.push(dat(`${participation.actual.toFixed(1)}%`, 'CENTER', bg))
        }
        addRow(cells)
        if (!participation) merge(5, NCOLS)
    }

    // ── 제목 ─────────────────────────────────────────────────────────────────
    addRow([
        cell(reportTitle, { bg: C.titleBg, fg: C.titleFg, bold: true, size: 15 }),
        ...Array(NCOLS - 1).fill(pad(C.titleBg)),
    ])
    merge(0, NCOLS)

    addRow([
        cell(`보고 기간:  ${period}`, { bg: C.titleBg, fg: C.titleSub, size: 10 }),
        cell(null, { bg: C.titleBg }), cell(null, { bg: C.titleBg }),
        cell(`${label}  |  내보낸 시각: ${exportedAt}`, { bg: C.titleBg, fg: C.titleSub, size: 9, align: 'RIGHT', italic: true }),
        cell(null, { bg: C.titleBg }), cell(null, { bg: C.titleBg }), cell(null, { bg: C.titleBg }),
    ])
    merge(0, 3); merge(3, NCOLS)

    spacer()

    // ── 이번 달 목표 요약 ───────────────────────────────────────────────────
    secRow(`${month}월 목표 (일평균 기준)`)
    ;([
        ['① 콘텐츠 제작', [
            `이슈 승인 일 ${t.dailyIssues}개`,
            `숏폼 등록 일 ${t.dailyShortformsPerPlatform}개`,
            `카드뉴스 등록 일 1개`,
        ]],
        ['② 유입 · 성장', [
            `신규 가입자 ${t.users}명`,
            `페이지뷰 ${t.pageviews.toLocaleString()}회 (가입자 목표×10)`,
        ]],
        ['③ 참여 · 반응', [
            `이슈 댓글 ${t.comments}개 (참여율 ${t.commentParticipation}%)`,
            `토론 의견 ${t.comments}개 (참여율 ${t.commentParticipation}%)`,
            `반응 ${t.reactions}개 (참여율 ${t.reactionParticipation}%)`,
            `투표 ${t.votes}회 (참여율 ${t.voteParticipation}%)`,
        ]],
    ] as [string, string[]][]).forEach(([group, items]) => {
        addRow([cell(group, { bold: true, fg: C.secFg, size: 9 })])
        merge(0, NCOLS)
        addRow([cell(items.join('   ·   '), { size: 9, fg: C.muted })])
        merge(0, NCOLS)
    })

    spacer()

    // ── 가입자 현황 ─────────────────────────────────────────────────────────
    secRow('가입자 현황 (누적)')
    addRow([hdr('전체'), hdr('일반 유저'), hdr('내부 계정'), pad(C.hdrBg), pad(C.hdrBg), pad(C.hdrBg), pad(C.hdrBg)])
    merge(3, NCOLS)
    addRow([
        dat(metrics.currentUsers + metrics.internalUsersCount, 'CENTER'),
        dat(metrics.currentUsers, 'CENTER'),
        dat(metrics.internalUsersCount, 'CENTER'),
    ])
    merge(3, NCOLS)

    spacer()

    // ── ① 콘텐츠 제작 ────────────────────────────────────────────────────────
    secRow('① 콘텐츠 제작 — 사이트용(이슈)과 외부 홍보용(숏폼·카드뉴스)을 계획한 만큼 만들고 있는가?')
    metricHeader(false)
    ;([
        ['이슈 승인',   ps.issues,     cmp.issues,     issueTarget],
        ['숏폼 등록',   ps.shortforms, cmp.shortforms, shortformTarget],
        ['카드뉴스 등록', ps.cardNews,  cmp.cardNews,   cardNewsTarget],
    ] as [string, number, DeltaStat, number][]).forEach(([lbl, cur, delta, target], i) => metricRow(lbl, cur, delta, target, i))

    spacer()

    // ── ② 유입 · 성장 ────────────────────────────────────────────────────────
    secRow('② 유입 · 성장 — 사람들이 실제로 우리 서비스를 찾아오고 있는가?')
    metricHeader(false)
    metricRow('신규 가입자', ps.newUsers, cmp.newUsers, userTarget, 0)
    metricRow('순방문자',    uniqueVisitors, cmp.uniqueVisitors, 0, 1)
    metricRow('페이지뷰',    pageViews, undefined, pvTarget, 2)

    spacer()

    // ── 채널별 유입 · 참여 전환율 (방문자는 오늘/이번주/이번달 항상 다 보여줌, 전환율은 이번 달 기준) ──
    secRow('채널별 유입 · 참여 전환율 (전환율은 이번 달, 첫 방문 UTM 기준)')
    addRow([
        hdr('채널'),
        hdr('오늘 방문자'), hdr('전일대비'),
        hdr('이번주 방문자'), hdr('전주대비'),
        hdr('이번달 방문자'), hdr('전월대비'),
        hdr('가입전환율'), hdr('이슈댓글전환율'), hdr('토론의견전환율'), hdr('반응전환율'), hdr('투표전환율'),
    ])

    const cbD1  = metrics.channelInboundByPeriod.d1
    const cbD7  = metrics.channelInboundByPeriod.d7
    const cbD30 = metrics.channelInboundByPeriod.d30
    const cvcD1  = metrics.channelVisitorComparison.d1
    const cvcD7  = metrics.channelVisitorComparison.d7
    const cvcD30 = metrics.channelVisitorComparison.d30

    const channelRows: [string, ChannelKey][] = CHANNEL_ORDER.map(key => [CHANNEL_LABEL[key], key])
    channelRows.forEach(([lbl, key], i) => {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        const stat = cbD30[key]
        addRow([
            dat(lbl, 'LEFT', bg),
            dat(cbD1[key].visitors, 'CENTER', bg), deltaCell(cvcD1[key], bg),
            dat(cbD7[key].visitors, 'CENTER', bg), deltaCell(cvcD7[key], bg),
            dat(cbD30[key].visitors, 'CENTER', bg), deltaCell(cvcD30[key], bg),
            dat(stat.visitors > 0 ? `${stat.signupRate.toFixed(1)}%` : '-', 'CENTER', bg),
            dat(stat.visitors > 0 ? `${stat.commentRate.toFixed(1)}%` : '-', 'CENTER', bg),
            dat(stat.visitors > 0 ? `${stat.discussionCommentRate.toFixed(1)}%` : '-', 'CENTER', bg),
            dat(stat.visitors > 0 ? `${stat.reactionRate.toFixed(1)}%` : '-', 'CENTER', bg),
            dat(stat.visitors > 0 ? `${stat.voteRate.toFixed(1)}%` : '-', 'CENTER', bg),
        ])
    })
    const totalVisitors30 = channelRows.reduce((s, [, key]) => s + cbD30[key].visitors, 0)
    const weightedRate = (sum: number) => totalVisitors30 > 0 ? (sum / totalVisitors30) * 100 : 0
    const sumField = (f: 'signups' | 'comments' | 'discussionComments' | 'reactions' | 'votes') =>
        channelRows.reduce((s, [, key]) => s + cbD30[key][f], 0)
    addRow([
        cell('합계(가중평균)', { bg: C.secBg, fg: C.secFg, bold: true, border: true }),
        dat(channelRows.reduce((s, [, key]) => s + cbD1[key].visitors, 0), 'CENTER', C.secBg), pad(C.secBg),
        dat(channelRows.reduce((s, [, key]) => s + cbD7[key].visitors, 0), 'CENTER', C.secBg), pad(C.secBg),
        dat(totalVisitors30, 'CENTER', C.secBg), pad(C.secBg),
        dat(`${weightedRate(sumField('signups')).toFixed(1)}%`, 'CENTER', C.secBg),
        dat(`${weightedRate(sumField('comments')).toFixed(1)}%`, 'CENTER', C.secBg),
        dat(`${weightedRate(sumField('discussionComments')).toFixed(1)}%`, 'CENTER', C.secBg),
        dat(`${weightedRate(sumField('reactions')).toFixed(1)}%`, 'CENTER', C.secBg),
        dat(`${weightedRate(sumField('votes')).toFixed(1)}%`, 'CENTER', C.secBg),
    ])
    addRow([cell(
        totalVisitors30 === metrics.monthlyUniqueVisitors
            ? `✓ 이번 달 순방문자 일치 (전체 ${metrics.monthlyUniqueVisitors.toLocaleString()}명)`
            : `⚠ 이번 달 순방문자 불일치 — 채널 합계 ${totalVisitors30.toLocaleString()}명 vs 전체 ${metrics.monthlyUniqueVisitors.toLocaleString()}명`,
        { size: 9, fg: totalVisitors30 === metrics.monthlyUniqueVisitors ? C.achievedFg : C.warningFg, italic: true },
    )])
    merge(0, NCOLS)

    spacer()

    // ── ③ 참여 · 반응 ────────────────────────────────────────────────────────
    secRow('③ 참여 · 반응 — 찾아온 사람들이 실제로 반응하고 있는가? (봇 제외)')
    // 참여율(활성 유저 ÷ 전체 가입자)은 "이번 달" 기준으로만 계산되는 지표라 주간보고서에는 표시하지 않음
    metricHeader(!isWeekly)
    metricRow('이슈 댓글', ps.issueComments, cmp.issueComments, commentTarget, 0,
        isWeekly ? undefined : { target: t.commentParticipation, actual: metrics.issueCommentParticipation })
    metricRow('토론 의견', ps.discussionComments, cmp.discussionComments, commentTarget, 1,
        isWeekly ? undefined : { target: t.commentParticipation, actual: metrics.discussionCommentParticipation })
    metricRow('반응', ps.reactions, cmp.reactions, reactionTarget, 2,
        isWeekly ? undefined : { target: t.reactionParticipation, actual: metrics.reactionParticipation })
    metricRow('투표', ps.votes, cmp.votes, voteTarget, 3,
        isWeekly ? undefined : { target: t.voteParticipation, actual: metrics.voteParticipation })

    spacer()

    // ── 푸터 ─────────────────────────────────────────────────────────────────
    addRow([cell('이 보고서는 왜난리 관리자 시스템에서 자동 생성되었습니다.', { fg: C.muted, size: 9, italic: true })])
    merge(0, NCOLS)

    // ── batchUpdate 실행 ──────────────────────────────────────────────────────
    const colWidths = [160, 80, 90, 80, 90, 80, 90, 100, 110, 110, 100, 100]
    const requests: Req[] = [
        { unmergeCells: { range: { sheetId: reportId, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: NCOLS } } },
        { repeatCell: { range: { sheetId: reportId, startRowIndex: 0, endRowIndex: 100 }, cell: {}, fields: 'userEnteredValue,userEnteredFormat' } },
        { updateDimensionProperties: { range: { sheetId: reportId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },  properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: reportId, dimension: 'ROWS', startIndex: 1, endIndex: 100 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } },
        ...colWidths.map((px, i): Req => ({
            updateDimensionProperties: {
                range: { sheetId: reportId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: px }, fields: 'pixelSize',
            },
        })),
        { updateCells: { rows, fields: 'userEnteredValue,userEnteredFormat', start: { sheetId: reportId, rowIndex: 0, columnIndex: 0 } } },
        ...merges,
        { updateSheetProperties: { properties: { sheetId: reportId, tabColorStyle: { rgbColor: C.titleBg } }, fields: 'tabColorStyle' } },
    ]

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })

    return { action: 'exported' as const, label, sheetName: reportSheetName }
}
