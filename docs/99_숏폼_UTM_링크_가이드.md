# 숏폼 UTM 링크 가이드

숏폼/SNS에 링크를 넣을 때 아래 링크를 사용해주세요.
어디서 방문자가 오는지 추적할 수 있어서 채널별 효과 측정에 필요합니다.

---

## 플랫폼별 링크 (깔끔한 단축 링크)

바이오나 설명란에 아래 링크를 그대로 사용하면 됩니다.
클릭하면 자동으로 추적 처리되며, 사용자에게는 `whynali.com`으로 보입니다.

| 플랫폼 | 사용할 링크 |
|--------|------------|
| 인스타그램 | `whynali.com/ig` |
| 틱톡 | `whynali.com/tt` |
| 유튜브 | `whynali.com/yt` |
| Threads | `whynali.com/threads` |
| X (트위터) | `whynali.com/x` |
| 카카오 | `whynali.com/kakao` |

---

## 어디에 넣으면 되나요?

### 인스타그램
- **프로필 바이오 링크**: `whynali.com/ig` 로 변경
- 릴스/피드 설명란 링크는 클릭이 안 되므로 "링크 바이오에 있어요" 안내
- 스토리 링크 스티커에도 `whynali.com/ig` 사용

### 틱톡
- **프로필 바이오 링크**: `whynali.com/tt` 로 변경
- 영상 설명란 링크는 클릭이 안 되므로 "프로필 링크 클릭" 유도

### 유튜브
- 영상 **설명란 상단**에 직접 삽입 (클릭 가능)
- 예: `👉 왜난리 바로가기 → whynali.com/yt`

### Threads
- 포스팅에 `whynali.com/threads` 직접 삽입

---

## 숏폼 설명란에 이슈 링크를 넣을 때

숏폼 설명란에 이슈 상세 링크를 텍스트로 넣는 경우, 플랫폼별로 다르게 처리하세요.

### 유튜브 — UTM 붙이기 (클릭 가능)
유튜브 설명란은 링크 클릭이 가능하므로 UTM을 붙여야 추적이 됩니다.

```
https://whynali.com/i/[이슈ID]?utm_source=youtube
```

예시:
```
https://whynali.com/i/211a2bf4-bf09-4e02-af75-fb13dd85213f?utm_source=youtube
```

### 인스타그램 / 틱톡 — UTM 불필요 (클릭 불가)
설명란 링크는 클릭이 안 되므로 UTM을 붙여도 데이터가 쌓이지 않습니다.
그냥 원래 링크 그대로 텍스트로 노출하면 됩니다.

```
https://whynali.com/i/[이슈ID]
```

인스타/틱톡 유입 추적은 **바이오 링크**(`whynali.com/ig`, `whynali.com/tt`)로만 가능합니다.

---

## 주의사항

- 플랫폼마다 **다른 링크**를 써야 채널별로 구분됩니다
- 같은 플랫폼이면 항상 **같은 링크**를 쓰세요 (중간에 바꾸지 말 것)
- **이슈 상세 페이지의 공유 버튼으로 복사한 링크는 사용하지 마세요**
  공유 버튼 링크(`?utm_source=copy&utm_medium=share`)는 일반 사용자가 퍼뜨릴 때 자동으로 붙는 태그라 채널 구분이 안 됩니다.
  유튜브 설명란에는 반드시 `?utm_source=youtube`를 직접 붙인 링크를 사용하세요.

---

## 개발 가이드 — 숏폼 관리 페이지 UTM 복사 버튼 추가

> 숏폼 업로드 시 팀원이 플랫폼별 UTM 링크를 바로 복사할 수 있도록 어드민 숏폼 관리 페이지에 복사 버튼을 추가해주세요.

### 목표 동작

숏폼 관리 페이지(`/admin/shortform`)의 각 숏폼 카드에서
"유튜브용 복사", "인스타용 복사", "틱톡용 복사" 버튼 클릭 시
해당 이슈의 짧은 URL + 플랫폼 UTM이 클립보드에 복사됩니다.

복사되는 링크 형태:
```
https://whynali.com/i/{short_code}?utm_source=youtube
https://whynali.com/i/{short_code}?utm_source=instagram
https://whynali.com/i/{short_code}?utm_source=tiktok
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `app/admin/(protected)/shortform/page.tsx` | 숏폼 관리 UI — 복사 버튼 추가할 곳 |
| `app/api/admin/shortform/route.ts` | 숏폼 목록 API — `short_code` 조인 필요 |

### Step 1 — API에 short_code 추가

`app/api/admin/shortform/route.ts`의 쿼리에서 `issues` 테이블을 조인해 `short_code`를 가져옵니다.

현재:
```ts
.from('shortform_jobs')
.select('*', { count: 'exact' })
```

변경:
```ts
.from('shortform_jobs')
.select('*, issues!shortform_jobs_issue_id_fkey(short_code)', { count: 'exact' })
```

`ShortformJob` 타입에 필드 추가:
```ts
interface ShortformJob {
    // 기존 필드들...
    issues: { short_code: string | null } | null
}
```

### Step 2 — 복사 버튼 UI 추가

`app/admin/(protected)/shortform/page.tsx`의 각 잡 카드 내부에 추가합니다.

```tsx
{/* UTM 링크 복사 버튼 */}
{(() => {
    const shortCode = job.issues?.short_code
    const baseUrl = shortCode
        ? `https://whynali.com/i/${shortCode}`
        : job.issue_url  // short_code 없을 때 UUID URL 폴백

    const platforms = [
        { label: 'YT', utm: 'youtube', color: 'bg-red-100 text-red-700' },
        { label: 'IG', utm: 'instagram', color: 'bg-pink-100 text-pink-700' },
        { label: 'TT', utm: 'tiktok', color: 'bg-gray-100 text-gray-700' },
    ]

    return (
        <div className="flex gap-1 mt-2">
            {platforms.map(({ label, utm, color }) => (
                <button
                    key={utm}
                    onClick={async () => {
                        await navigator.clipboard.writeText(`${baseUrl}?utm_source=${utm}`)
                        // 복사 완료 피드백은 기존 토스트나 alert 활용
                        alert(`${label} 링크 복사됨`)
                    }}
                    className={`text-xs px-2 py-1 rounded font-medium ${color}`}
                >
                    {label} 복사
                </button>
            ))}
        </div>
    )
})()}
```

### 참고

- `short_code`는 `issues` 테이블의 컬럼입니다 (`VARCHAR(8)`, 예: `JvVXPm`)
- `short_code`가 없는 이슈는 `job.issue_url`(`/issue/{UUID}`)을 폴백으로 사용하세요
- 복사 버튼 위치는 업로드 상태 배지 근처가 자연스럽습니다
