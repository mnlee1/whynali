/**
 * lib/kpi/google-sheets-export.ts
 *
 * KPI 데이터를 Google Sheets로 내보냅니다.
 *  - "KPI보고서" 시트: 당월 포맷된 리포트 (매번 덮어씀)
 *  - "이력"     시트: 월별 누적 원시 데이터 (append)
 */

import { google, sheets_v4 } from 'googleapis'
import type { calculateKPI } from './calculator'

type KPIResult  = Awaited<ReturnType<typeof calculateKPI>>
type GColor     = sheets_v4.Schema$Color
type CellData   = sheets_v4.Schema$CellData
type RowData    = sheets_v4.Schema$RowData
type Req        = sheets_v4.Schema$Request

const REPORT_SHEET = 'KPI보고서'
const HISTORY_SHEET = '이력'
const NCOLS = 7
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
    posFg:      { red: 0.05, green: 0.55, blue: 0.35 } as GColor,
    negFg:      { red: 0.80, green: 0.10, blue: 0.12 } as GColor,
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
    border?: boolean; wrap?: boolean
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
            verticalAlignment:   'MIDDLE',
            wrapStrategy: fmt.wrap ? 'WRAP' : 'OVERFLOW_CELL',
            padding: { top: 4, bottom: 4, left: 8, right: 8 },
            borders: bd,
        },
    }
}

// 편의 함수들
const hdr = (t: string) => cell(t, { bg: C.hdrBg, fg: C.hdrFg, bold: true, align: 'CENTER', border: true })
const dat = (v: string | number | null, align: Fmt['align'] = 'LEFT', bg = C.white) =>
    cell(v, { bg, fg: C.text, align, border: true })
const pad = (bg = C.white) => cell(null, { bg, border: true })

function statusCell(rate: number): CellData {
    if (rate >= 100) return cell('✅  달성',   { bg: C.achievedBg, fg: C.achievedFg, bold: true, align: 'CENTER', border: true })
    if (rate >= 50)  return cell('🟡  진행중', { bg: C.warningBg,  fg: C.warningFg,  bold: true, align: 'CENTER', border: true })
    return               cell('🔴  위험',   { bg: C.dangerBg,   fg: C.dangerFg,   bold: true, align: 'CENTER', border: true })
}

function rateCell(rate: number): CellData {
    const fmt: Fmt = { bold: true, align: 'CENTER', border: true }
    if (rate >= 100) { fmt.bg = C.achievedBg; fmt.fg = C.achievedFg }
    else if (rate >= 50) { fmt.bg = C.warningBg; fmt.fg = C.warningFg }
    else { fmt.bg = C.dangerBg; fmt.fg = C.dangerFg }
    return cell(`${rate.toFixed(1)}%`, fmt)
}

function deltaCell(delta: number, pct: number | null): CellData {
    const sign = delta >= 0 ? '+' : ''
    const pctStr = pct !== null ? ` (${delta >= 0 ? '+' : ''}${pct.toFixed(0)}%)` : ''
    return cell(`${sign}${delta}${pctStr}`, {
        fg: delta > 0 ? C.posFg : delta < 0 ? C.negFg : C.muted,
        bold: delta !== 0,
        align: 'CENTER',
        border: true,
    })
}

// ── 인증 ──────────────────────────────────────────────────────────────────────
function buildAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const key   = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!email || !key) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL 또는 GOOGLE_PRIVATE_KEY가 설정되지 않았습니다')
    return new google.auth.JWT({ email, key, scopes: SCOPES })
}

// ── 메인 내보내기 ─────────────────────────────────────────────────────────────
export async function exportKPIToGoogleSheets(year: number, month: number, kpi: KPIResult) {
    const spreadsheetId = process.env.KPI_SPREADSHEET_ID
    if (!spreadsheetId) throw new Error('KPI_SPREADSHEET_ID가 설정되지 않았습니다')

    const { metrics } = kpi
    const vs      = metrics.visitorsBySource
    const label   = `${year}-${String(month).padStart(2, '0')}`
    const exportedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    const period  = kpi.goalInfo
        ? `${kpi.goalInfo.periodStart} ~ ${kpi.goalInfo.periodEnd}`
        : `${year}년 ${month}월`

    const auth   = buildAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // ── 시트 확보 ────────────────────────────────────────────────────────────
    const ss0 = await sheets.spreadsheets.get({ spreadsheetId })
    const existing0 = ss0.data.sheets ?? []
    const toCreate: Req[] = []
    if (!existing0.find(s => s.properties?.title === REPORT_SHEET))
        toCreate.push({ addSheet: { properties: { title: REPORT_SHEET,  gridProperties: { rowCount: 120, columnCount: NCOLS } } } })
    if (!existing0.find(s => s.properties?.title === HISTORY_SHEET))
        toCreate.push({ addSheet: { properties: { title: HISTORY_SHEET, gridProperties: { rowCount: 1000, columnCount: 32 } } } })
    if (toCreate.length > 0)
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: toCreate } })

    const ss1 = await sheets.spreadsheets.get({ spreadsheetId })
    const reportId  = ss1.data.sheets?.find(s => s.properties?.title === REPORT_SHEET)?.properties?.sheetId  ?? 0
    const historyId = ss1.data.sheets?.find(s => s.properties?.title === HISTORY_SHEET)?.properties?.sheetId ?? 0

    // ── 보고서 행 빌드 ───────────────────────────────────────────────────────
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
    function spacer() { addRow(Array(NCOLS).fill(pad())); }
    function secRow(text: string) {
        addRow([cell(text, { bg: C.secBg, fg: C.secFg, bold: true, size: 11 })])
        merge(0, NCOLS)
    }

    const issuePct = metrics.targets.activeIssues > 0
        ? (metrics.currentActiveIssues / metrics.targets.activeIssues) * 100 : 0

    // ── 제목 영역 ─────────────────────────────────────────────────────────────
    addRow([
        cell(`왜난리  KPI 월간 보고서`, { bg: C.titleBg, fg: C.titleFg, bold: true, size: 15 }),
        ...Array(NCOLS - 1).fill(pad(C.titleBg)),
    ])
    merge(0, NCOLS)

    addRow([
        cell(`보고 기간:  ${period}`, { bg: C.titleBg, fg: C.titleSub, size: 10 }),
        cell(null, { bg: C.titleBg }), cell(null, { bg: C.titleBg }), cell(null, { bg: C.titleBg }),
        cell(`${label}  |  내보낸 시각: ${exportedAt}`, { bg: C.titleBg, fg: C.titleSub, size: 9, align: 'RIGHT', italic: true }),
        cell(null, { bg: C.titleBg }), cell(null, { bg: C.titleBg }),
    ])
    merge(0, 4); merge(4, NCOLS)

    spacer()

    // ── ① 핵심 KPI 달성 현황 ─────────────────────────────────────────────────
    secRow('① 핵심 KPI 달성 현황')
    addRow([hdr('지표'), hdr('목표'), hdr('현재'), hdr('달성률'), hdr('상태'), hdr(''), hdr('')])
    merge(5, NCOLS)

    ;([
        ['가입자 수 (명)',       metrics.targets.users,         metrics.currentUsers,         metrics.userProgress  ],
        ['진행중 이슈 (개)',     metrics.targets.activeIssues,  metrics.currentActiveIssues,  issuePct              ],
        ['누적 댓글 (개)',       metrics.targets.comments,      metrics.currentComments,      metrics.commentProgress  ],
        ['누적 반응 (개)',       metrics.targets.reactions,     metrics.currentReactions,     metrics.reactionProgress ],
        ['투표 참여 (회)',       metrics.targets.votes,         metrics.currentVotes,         metrics.voteProgress     ],
    ] as [string, number, number, number][]).forEach(([lbl, tgt, cur, rate], i) => {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        addRow([dat(lbl, 'LEFT', bg), dat(tgt, 'CENTER', bg), dat(cur, 'CENTER', bg), rateCell(rate), statusCell(rate), pad(bg), pad(bg)])
        merge(5, NCOLS)
    })

    spacer()

    // ── ② 참여율 ─────────────────────────────────────────────────────────────
    secRow('② 참여율  (가입자 대비 활동 비율)')
    addRow([hdr('지표'), hdr('목표'), hdr('현재'), hdr('달성 여부'), hdr(''), hdr(''), hdr('')])
    merge(4, NCOLS)

    ;([
        ['댓글 참여율', metrics.targets.commentParticipation,  metrics.commentParticipation ],
        ['반응 참여율', metrics.targets.reactionParticipation, metrics.reactionParticipation],
        ['투표 참여율', metrics.targets.voteParticipation,     metrics.voteParticipation    ],
    ] as [string, number, number][]).forEach(([lbl, tgt, cur], i) => {
        const bg   = i % 2 === 0 ? C.white : C.rowAlt
        const rate = tgt > 0 ? (cur / tgt) * 100 : 0
        addRow([dat(lbl, 'LEFT', bg), dat(`${tgt.toFixed(1)}%`, 'CENTER', bg), dat(`${cur.toFixed(1)}%`, 'CENTER', bg), statusCell(rate), pad(bg), pad(bg), pad(bg)])
        merge(4, NCOLS)
    })

    spacer()

    // ── ③ 전주 / 전월 비교 ───────────────────────────────────────────────────
    secRow('③ 전주 / 전월 비교')
    addRow([hdr('지표'), hdr('이번 주'), hdr('전주'), hdr('주간 증감'), hdr('이번 달'), hdr('전달'), hdr('월간 증감')])

    ;([
        ['신규 가입 (명)', metrics.weekOverWeek.newUsers,  metrics.monthOverMonth.newUsers ],
        ['댓글 (개)',      metrics.weekOverWeek.comments,  metrics.monthOverMonth.comments ],
        ['반응 (개)',      metrics.weekOverWeek.reactions, metrics.monthOverMonth.reactions],
        ['투표 (회)',      metrics.weekOverWeek.votes,     metrics.monthOverMonth.votes    ],
    ] as [string, typeof metrics.weekOverWeek.newUsers, typeof metrics.monthOverMonth.newUsers][])
    .forEach(([lbl, wow, mom], i) => {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        addRow([
            dat(lbl, 'LEFT', bg),
            dat(wow.current,  'CENTER', bg),
            dat(wow.previous, 'CENTER', bg),
            deltaCell(wow.delta, wow.deltaPercent),
            dat(mom.current,  'CENTER', bg),
            dat(mom.previous, 'CENTER', bg),
            deltaCell(mom.delta, mom.deltaPercent),
        ])
    })

    spacer()

    // ── ④ 유입 경로별 방문자 ─────────────────────────────────────────────────
    secRow('④ 유입 경로별 방문자  (최근 30일)')
    addRow([hdr('채널'), hdr('방문자 수'), hdr('비율'), hdr(''), hdr(''), hdr(''), hdr('')])
    merge(3, NCOLS)

    const totalV = Object.values(vs).reduce((a, b) => a + b, 0)
    ;([
        ['Threads',             vs.threads  ],
        ['Instagram',           vs.instagram],
        ['X (구 트위터)',        vs.x        ],
        ['카카오',               vs.kakao   ],
        ['유튜브',               vs.youtube ],
        ['틱톡',                 vs.tiktok  ],
        ['직접 유입 (Direct)',   vs.direct  ],
        ['검색 유입 (Organic)',  vs.organic ],
        ['기타 (UTM 미분류)',    vs.other   ],
    ] as [string, number][]).forEach(([lbl, cnt], i) => {
        const bg    = i % 2 === 0 ? C.white : C.rowAlt
        const ratio = totalV > 0 ? `${((cnt / totalV) * 100).toFixed(1)}%` : '0.0%'
        addRow([dat(lbl, 'LEFT', bg), dat(cnt, 'CENTER', bg), dat(ratio, 'CENTER', bg), pad(bg), pad(bg), pad(bg), pad(bg)])
        merge(3, NCOLS)
    })

    spacer()

    // ── ⑤ 기타 지표 ──────────────────────────────────────────────────────────
    secRow('⑤ 기타 지표')
    ;([
        ['주간 성장률',        `${metrics.weeklyGrowthRate.toFixed(1)}%` ],
        ['일평균 신규 가입',   `${metrics.dailyNewUsers.toFixed(1)}명`   ],
        ['전체 이슈 (종결 포함)', `${metrics.currentTotalIssues}개`       ],
    ] as [string, string][]).forEach(([lbl, val], i) => {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        addRow([dat(lbl, 'LEFT', bg), cell(val, { bg, fg: C.text, bold: true, align: 'CENTER', border: true }), pad(bg), pad(bg), pad(bg), pad(bg), pad(bg)])
        merge(2, NCOLS)
    })

    spacer()

    // ── 푸터 ─────────────────────────────────────────────────────────────────
    addRow([cell('이 보고서는 왜난리 관리자 시스템에서 자동 생성되었습니다.', { fg: C.muted, size: 9, italic: true })])
    merge(0, NCOLS)

    // ── batchUpdate 실행 ──────────────────────────────────────────────────────
    const colWidths = [155, 90, 90, 120, 90, 90, 140]
    const requests: Req[] = [
        // 기존 머지 해제
        { unmergeCells: { range: { sheetId: reportId, startRowIndex: 0, endRowIndex: 120, startColumnIndex: 0, endColumnIndex: NCOLS } } },
        // 셀 전체 초기화
        { repeatCell: { range: { sheetId: reportId, startRowIndex: 0, endRowIndex: 120 }, cell: {}, fields: 'userEnteredValue,userEnteredFormat' } },
        // 제목 행 높이 42px
        { updateDimensionProperties: { range: { sheetId: reportId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },   properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        // 나머지 행 높이 26px
        { updateDimensionProperties: { range: { sheetId: reportId, dimension: 'ROWS', startIndex: 1, endIndex: 120 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } },
        // 열 너비
        ...colWidths.map((px, i): Req => ({
            updateDimensionProperties: {
                range: { sheetId: reportId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: px },
                fields: 'pixelSize',
            },
        })),
        // 데이터 쓰기
        { updateCells: { rows, fields: 'userEnteredValue,userEnteredFormat', start: { sheetId: reportId, rowIndex: 0, columnIndex: 0 } } },
        // 셀 머지 적용
        ...merges,
        // 시트 탭 색상 (indigo)
        { updateSheetProperties: { properties: { sheetId: reportId, tabColorStyle: { rgbColor: C.titleBg } }, fields: 'tabColorStyle' } },
    ]

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })

    // ── 이력 시트 (월별 누적) ─────────────────────────────────────────────────
    const HIST_HEADERS = [
        '연월', '내보낸 시간',
        '목표 가입자', '현재 가입자', '가입자 달성률(%)',
        '목표 이슈', '현재 이슈', '이슈 달성률(%)',
        '목표 댓글', '현재 댓글', '댓글 달성률(%)',
        '목표 반응', '현재 반응', '반응 달성률(%)',
        '목표 투표', '현재 투표', '투표 달성률(%)',
        '댓글 참여율(%)', '반응 참여율(%)', '투표 참여율(%)',
        '주간 성장률(%)',
        'Threads', 'Instagram', 'X', '카카오', '유튜브', '틱톡', '직접 유입', '검색 유입', '기타',
    ]
    const histRow = [
        label, exportedAt,
        metrics.targets.users,        metrics.currentUsers,        +metrics.userProgress.toFixed(1),
        metrics.targets.activeIssues, metrics.currentActiveIssues, +issuePct.toFixed(1),
        metrics.targets.comments,     metrics.currentComments,     +metrics.commentProgress.toFixed(1),
        metrics.targets.reactions,    metrics.currentReactions,    +metrics.reactionProgress.toFixed(1),
        metrics.targets.votes,        metrics.currentVotes,        +metrics.voteProgress.toFixed(1),
        +metrics.commentParticipation.toFixed(1),
        +metrics.reactionParticipation.toFixed(1),
        +metrics.voteParticipation.toFixed(1),
        +metrics.weeklyGrowthRate.toFixed(1),
        vs.threads, vs.instagram, vs.x, vs.kakao, vs.youtube, vs.tiktok, vs.direct, vs.organic, vs.other,
    ]

    const histExisting = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${HISTORY_SHEET}!A:A` })
    const histRows = histExisting.data.values ?? []
    const existingIdx = histRows.findIndex((row, i) => i > 0 && row[0] === label)

    if (histRows.length === 0) {
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${HISTORY_SHEET}!A1`, valueInputOption: 'USER_ENTERED',
            requestBody: { values: [HIST_HEADERS, histRow] },
        })
    } else if (existingIdx > 0) {
        await sheets.spreadsheets.values.update({
            spreadsheetId, range: `${HISTORY_SHEET}!A${existingIdx + 1}`, valueInputOption: 'USER_ENTERED',
            requestBody: { values: [histRow] },
        })
    } else {
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: `${HISTORY_SHEET}!A:A`, valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS', requestBody: { values: [histRow] },
        })
    }

    return { action: existingIdx > 0 ? 'updated' as const : 'appended' as const, label }
}
