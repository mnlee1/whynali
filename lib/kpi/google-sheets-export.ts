/**
 * lib/kpi/google-sheets-export.ts
 *
 * KPI 데이터를 Google Sheets로 내보냅니다.
 * - "KPI보고서" 시트: 오늘/이번주/이번달 기간별 데이터 + 월 달성 현황
 */

import { google, sheets_v4 } from 'googleapis'
import type { calculateKPI } from './calculator'

type KPIResult = Awaited<ReturnType<typeof calculateKPI>>
type GColor    = sheets_v4.Schema$Color
type CellData  = sheets_v4.Schema$CellData
type RowData   = sheets_v4.Schema$RowData
type Req       = sheets_v4.Schema$Request

const REPORT_SHEET = 'KPI보고서'
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

function statusCell(rate: number): CellData {
    if (rate >= 100) return cell('✅  달성',   { bg: C.achievedBg, fg: C.achievedFg, bold: true, align: 'CENTER', border: true })
    if (rate >= 50)  return cell('🟡  진행중', { bg: C.warningBg,  fg: C.warningFg,  bold: true, align: 'CENTER', border: true })
    return               cell('🔴  위험',   { bg: C.dangerBg,   fg: C.dangerFg,   bold: true, align: 'CENTER', border: true })
}

function rateCell(rate: number): CellData {
    const fmt: Fmt = { bold: true, align: 'CENTER', border: true }
    if (rate >= 100)      { fmt.bg = C.achievedBg; fmt.fg = C.achievedFg }
    else if (rate >= 50)  { fmt.bg = C.warningBg;  fmt.fg = C.warningFg  }
    else                  { fmt.bg = C.dangerBg;   fmt.fg = C.dangerFg   }
    return cell(`${rate.toFixed(1)}%`, fmt)
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
    const ps  = metrics.periodStats
    const vs  = metrics.visitorsBySource
    const label      = `${year}-${String(month).padStart(2, '0')}`
    const exportedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    const period     = kpi.goalInfo
        ? `${kpi.goalInfo.periodStart} ~ ${kpi.goalInfo.periodEnd}`
        : `${year}년 ${month}월`

    // 현재 월 여부 (KST 기준)
    const kstParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric',
    }).formatToParts(new Date())
    const kstYear  = Number(kstParts.find(p => p.type === 'year')?.value)
    const kstMonth = Number(kstParts.find(p => p.type === 'month')?.value)
    const pastMonth = !(year === kstYear && month === kstMonth)

    const auth   = buildAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // ── 시트 확보 ────────────────────────────────────────────────────────────
    const ss0 = await sheets.spreadsheets.get({ spreadsheetId })
    const existing0 = ss0.data.sheets ?? []
    const toCreate: Req[] = []

    if (!existing0.find(s => s.properties?.title === REPORT_SHEET))
        toCreate.push({ addSheet: { properties: { title: REPORT_SHEET, gridProperties: { rowCount: 80, columnCount: NCOLS } } } })

    // 기본 빈 시트("시트1"/"Sheet1") 삭제
    const defaultSheet = existing0.find(s =>
        s.properties?.title === '시트1' || s.properties?.title === 'Sheet1'
    )
    if (defaultSheet?.properties?.sheetId !== undefined && (existing0.length > 1 || toCreate.length > 0))
        toCreate.push({ deleteSheet: { sheetId: defaultSheet.properties.sheetId } })

    // 이력 시트가 남아 있으면 삭제
    const oldHistSheet = existing0.find(s => s.properties?.title === '이력')
    if (oldHistSheet?.properties?.sheetId !== undefined)
        toCreate.push({ deleteSheet: { sheetId: oldHistSheet.properties.sheetId } })

    if (toCreate.length > 0)
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: toCreate } })

    const ss1 = await sheets.spreadsheets.get({ spreadsheetId })
    const reportId = ss1.data.sheets?.find(s => s.properties?.title === REPORT_SHEET)?.properties?.sheetId ?? 0

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
    // 기간별 3컬럼 공통 헤더
    function periodHeader(label0: string) {
        const d1Lbl  = pastMonth ? '말일'     : '오늘'
        const d7Lbl  = pastMonth ? '마지막7일' : '이번주'
        const d30Lbl = pastMonth ? '해당월'   : '이번달'
        addRow([hdr(label0), hdr(d1Lbl), hdr(d7Lbl), hdr(d30Lbl), pad(C.hdrBg), pad(C.hdrBg), pad(C.hdrBg)])
        merge(4, NCOLS)
    }
    // 기간별 3컬럼 데이터 행
    function periodRow(lbl: string, d1: number, d7: number, d30: number, i: number) {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        addRow([dat(lbl, 'LEFT', bg), dat(d1, 'CENTER', bg), dat(d7, 'CENTER', bg), dat(d30, 'CENTER', bg), pad(bg), pad(bg), pad(bg)])
        merge(4, NCOLS)
    }

    // ── 제목 ─────────────────────────────────────────────────────────────────
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

    // ── ① 이달 달성 현황 ─────────────────────────────────────────────────────
    secRow('① 이달 달성 현황')
    addRow([hdr('지표'), hdr('목표'), hdr('현재'), hdr('달성률'), hdr('상태'), hdr(''), hdr('')])
    merge(5, NCOLS)

    ;([
        ['가입자 (명)',  metrics.targets.users,     metrics.currentUsers,     metrics.userProgress     ],
        ['댓글 (개)',    metrics.targets.comments,  metrics.currentComments,  metrics.commentProgress  ],
        ['반응 (개)',    metrics.targets.reactions, metrics.currentReactions, metrics.reactionProgress ],
        ['투표 (개)',    metrics.targets.votes,     metrics.currentVotes,     metrics.voteProgress     ],
    ] as [string, number, number, number][]).forEach(([lbl, tgt, cur, rate], i) => {
        const bg = i % 2 === 0 ? C.white : C.rowAlt
        addRow([dat(lbl, 'LEFT', bg), dat(tgt, 'CENTER', bg), dat(cur, 'CENTER', bg), rateCell(rate), statusCell(rate), pad(bg), pad(bg)])
        merge(5, NCOLS)
    })

    spacer()

    // ── ② 콘텐츠 등록 ────────────────────────────────────────────────────────
    secRow('② 콘텐츠 등록')
    periodHeader('항목')

    ;([
        ['이슈 (승인)', ps.d1.issues,     ps.d7.issues,     ps.d30.issues    ],
        ['숏폼 등록 (유튜브,인스타,틱톡)',    ps.d1.shortforms, ps.d7.shortforms, ps.d30.shortforms],
        ['카드뉴스 등록 (인스타,스레드,X)', ps.d1.cardNews,   ps.d7.cardNews,   ps.d30.cardNews  ],
    ] as [string, number, number, number][]).forEach(([lbl, d1, d7, d30], i) => periodRow(lbl, d1, d7, d30, i))

    spacer()

    // ── ③ 주요 지표 ──────────────────────────────────────────────────────────
    secRow('③ 주요 지표')
    periodHeader('항목')

    ;([
        ['신규 가입자 (명)', ps.d1.newUsers,   ps.d7.newUsers,   ps.d30.newUsers  ],
        ['댓글 (개)',        ps.d1.comments,   ps.d7.comments,   ps.d30.comments  ],
        ['반응 (개)',        ps.d1.reactions,  ps.d7.reactions,  ps.d30.reactions ],
        ['투표 (개)',        ps.d1.votes,      ps.d7.votes,      ps.d30.votes     ],
    ] as [string, number, number, number][]).forEach(([lbl, d1, d7, d30], i) => periodRow(lbl, d1, d7, d30, i))

    spacer()

    // ── ④ 유입 경로 ──────────────────────────────────────────────────────────
    secRow('④ 유입 경로')
    periodHeader('채널')

    ;([
        ['인스타그램',  vs.d1.instagram, vs.d7.instagram, vs.d30.instagram],
        ['유튜브',      vs.d1.youtube,   vs.d7.youtube,   vs.d30.youtube  ],
        ['틱톡',        vs.d1.tiktok,    vs.d7.tiktok,    vs.d30.tiktok   ],
        ['X (트위터)',  vs.d1.x,         vs.d7.x,         vs.d30.x        ],
        ['스레드',      vs.d1.threads,   vs.d7.threads,   vs.d30.threads  ],
        ['검색',        vs.d1.organic,   vs.d7.organic,   vs.d30.organic  ],
    ] as [string, number, number, number][]).forEach(([lbl, d1, d7, d30], i) => periodRow(lbl, d1, d7, d30, i))

    spacer()

    // ── 푸터 ─────────────────────────────────────────────────────────────────
    addRow([cell('이 보고서는 왜난리 관리자 시스템에서 자동 생성되었습니다.', { fg: C.muted, size: 9, italic: true })])
    merge(0, NCOLS)

    // ── batchUpdate 실행 ──────────────────────────────────────────────────────
    const colWidths = [155, 90, 90, 90, 90, 90, 110]
    const requests: Req[] = [
        { unmergeCells: { range: { sheetId: reportId, startRowIndex: 0, endRowIndex: 80, startColumnIndex: 0, endColumnIndex: NCOLS } } },
        { repeatCell: { range: { sheetId: reportId, startRowIndex: 0, endRowIndex: 80 }, cell: {}, fields: 'userEnteredValue,userEnteredFormat' } },
        { updateDimensionProperties: { range: { sheetId: reportId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },  properties: { pixelSize: 42 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: reportId, dimension: 'ROWS', startIndex: 1, endIndex: 80 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } },
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

    return { action: 'exported' as const, label }
}
