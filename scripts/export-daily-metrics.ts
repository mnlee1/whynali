import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import path from 'path'

const supabase = createClient(
  'https://mdxshmfmcdcotteevwgi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1keHNobWZtY2Rjb3R0ZWV2d2dpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYyNzAyMCwiZXhwIjoyMDkxMjAzMDIwfQ.Eo354xCPQxr2XOdxwvQfu0X-E6d9cdm7lqSJP6DkcRM'
)

function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start)
  const last = new Date(end)
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

async function main() {
  // --- 데이터 수집 ---
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 100 })
  const users = allUsers?.users ?? []

  const { data: reactions } = await supabase.from('reactions').select('created_at').order('created_at')
  const { data: votes } = await supabase.from('votes').select('created_at').order('created_at')
  const { data: comments } = await supabase.from('comments').select('created_at').order('created_at')
  const { data: pageViews } = await supabase
    .from('page_views')
    .select('created_at')
    .not('page_path', 'like', '/admin%')
    .order('created_at')
  const { data: issues } = await supabase.from('issues').select('created_at').order('created_at')
  const { data: approvedIssues } = await supabase
    .from('issues')
    .select('approved_at')
    .eq('approval_status', '승인')
    .not('approved_at', 'is', null)
    .order('approved_at')
  const { data: shortforms } = await supabase
    .from('shortform_jobs')
    .select('created_at, upload_status')
    .order('created_at')

  // 날짜별 집계
  const toMap = (rows: { created_at: string }[] | null) => {
    const m: Record<string, number> = {}
    rows?.forEach(r => { const d = r.created_at.slice(0, 10); m[d] = (m[d] || 0) + 1 })
    return m
  }

  const newUserMap = toMap(users.map(u => ({ created_at: u.created_at })))
  const reactionMap = toMap(reactions)
  const voteMap = toMap(votes)
  const commentMap = toMap(comments)
  const pvMap = toMap(pageViews)
  const issueMap = toMap(issues)
  const approvedMap = toMap(approvedIssues?.map(i => ({ created_at: i.approved_at! })))

  // 숏폼: 플랫폼별 업로드 성공 날짜 기준
  type PlatformMap = Record<string, number>
  const sfYoutube: PlatformMap = {}
  const sfInstagram: PlatformMap = {}
  const sfTiktok: PlatformMap = {}
  shortforms?.forEach(sf => {
    const us = sf.upload_status as Record<string, { status: string; uploaded_at?: string; uploadedAt?: string }> | null
    if (!us) return
    const getDay = (dateStr?: string) => dateStr?.slice(0, 10)
    const yt = us.youtube; if (yt?.status === 'success') { const d = getDay(yt.uploaded_at); if (d) sfYoutube[d] = (sfYoutube[d] || 0) + 1 }
    const ig = us.instagram; if (ig?.status === 'success') { const d = getDay(ig.uploadedAt); if (d) sfInstagram[d] = (sfInstagram[d] || 0) + 1 }
    const tt = us.tiktok; if (tt?.status === 'success') { const d = getDay(tt.uploadedAt); if (d) sfTiktok[d] = (sfTiktok[d] || 0) + 1 }
  })

  // 날짜 범위: 첫 가입일 ~ 오늘
  const allDates = [
    ...Object.keys(newUserMap),
    ...Object.keys(reactionMap),
    ...Object.keys(voteMap),
    ...Object.keys(commentMap),
    ...Object.keys(pvMap),
  ]
  const startDate = allDates.sort()[0]
  const today = new Date().toISOString().slice(0, 10)
  const dates = dateRange(startDate, today)

  // --- 일별 시트 데이터 ---
  let cumUsers = 0, cumReactions = 0, cumVotes = 0, cumComments = 0, cumIssues = 0, cumApproved = 0
  let cumYt = 0, cumIg = 0, cumTt = 0
  const dailyRows: (string | number)[][] = []

  for (const date of dates) {
    const nu = newUserMap[date] || 0
    const re = reactionMap[date] || 0
    const vo = voteMap[date] || 0
    const co = commentMap[date] || 0
    const pv = pvMap[date] || 0
    const is = issueMap[date] || 0
    const ap = approvedMap[date] || 0
    const yt = sfYoutube[date] || 0
    const ig = sfInstagram[date] || 0
    const tt = sfTiktok[date] || 0

    cumUsers += nu
    cumReactions += re
    cumVotes += vo
    cumComments += co
    cumIssues += is
    cumApproved += ap
    cumYt += yt
    cumIg += ig
    cumTt += tt

    dailyRows.push([date, nu, cumUsers, is, ap, cumApproved, re, cumReactions, vo, cumVotes, co, cumComments, yt, ig, tt, pv])
  }

  const dailySheet = XLSX.utils.aoa_to_sheet([
    ['날짜', '신규가입', '누적가입', '신규이슈', '승인이슈', '누적승인이슈', '반응', '누적반응', '투표', '누적투표', '댓글', '누적댓글', '숏폼_유튜브', '숏폼_인스타', '숏폼_틱톡', '페이지뷰(운영자 포함)'],
    ...dailyRows
  ])

  dailySheet['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
    { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 6 },
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
  ]

  // --- 월별 요약 시트 ---
  type MonthData = { users: number, issues: number, approved: number, reactions: number, votes: number, comments: number, yt: number, ig: number, tt: number, pv: number }
  const monthMap: Record<string, MonthData> = {}
  const empty = (): MonthData => ({ users: 0, issues: 0, approved: 0, reactions: 0, votes: 0, comments: 0, yt: 0, ig: 0, tt: 0, pv: 0 })
  const addMonth = (map: typeof monthMap, date: string, key: keyof MonthData, cnt: number) => {
    const m = date.slice(0, 7); if (!map[m]) map[m] = empty(); map[m][key] += cnt
  }
  for (const [d, c] of Object.entries(newUserMap)) addMonth(monthMap, d, 'users', c)
  for (const [d, c] of Object.entries(issueMap)) addMonth(monthMap, d, 'issues', c)
  for (const [d, c] of Object.entries(approvedMap)) addMonth(monthMap, d, 'approved', c)
  for (const [d, c] of Object.entries(reactionMap)) addMonth(monthMap, d, 'reactions', c)
  for (const [d, c] of Object.entries(voteMap)) addMonth(monthMap, d, 'votes', c)
  for (const [d, c] of Object.entries(commentMap)) addMonth(monthMap, d, 'comments', c)
  for (const [d, c] of Object.entries(sfYoutube)) addMonth(monthMap, d, 'yt', c)
  for (const [d, c] of Object.entries(sfInstagram)) addMonth(monthMap, d, 'ig', c)
  for (const [d, c] of Object.entries(sfTiktok)) addMonth(monthMap, d, 'tt', c)
  for (const [d, c] of Object.entries(pvMap)) addMonth(monthMap, d, 'pv', c)

  let cumMUsers = 0, cumMIssues = 0, cumMApproved = 0, cumMReactions = 0, cumMVotes = 0, cumMComments = 0
  let cumMYt = 0, cumMIg = 0, cumMTt = 0
  const monthlyRows: (string | number)[][] = []
  for (const month of Object.keys(monthMap).sort()) {
    const d = monthMap[month]
    cumMUsers += d.users; cumMIssues += d.issues; cumMApproved += d.approved
    cumMReactions += d.reactions; cumMVotes += d.votes; cumMComments += d.comments
    cumMYt += d.yt; cumMIg += d.ig; cumMTt += d.tt
    monthlyRows.push([month, d.users, cumMUsers, d.issues, d.approved, cumMApproved, d.reactions, cumMReactions, d.votes, cumMVotes, d.comments, cumMComments, d.yt, d.ig, d.tt, d.pv])
  }

  const monthlySheet = XLSX.utils.aoa_to_sheet([
    ['월', '신규가입', '누적가입', '신규이슈', '승인이슈', '누적승인이슈', '반응', '누적반응', '투표', '누적투표', '댓글', '누적댓글', '숏폼_유튜브', '숏폼_인스타', '숏폼_틱톡', '페이지뷰(운영자 포함)'],
    ...monthlyRows
  ])
  monthlySheet['!cols'] = [
    { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
    { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 6 },
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
  ]

  // --- Workbook 생성 ---
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, dailySheet, '일별 지표')
  XLSX.utils.book_append_sheet(wb, monthlySheet, '월별 요약')

  const outPath = path.join(process.env.HOME!, 'Desktop', `왜난리_일별지표_${today}.xlsx`)
  XLSX.writeFile(wb, outPath)
  console.log(`\n✅ 저장 완료: ${outPath}`)
}

main().catch(console.error)
