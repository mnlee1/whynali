# Supabase 테이블 확인 방법

97_1단계_기초픽스.md §3.1 스키마대로 테이블이 생성되었는지 확인하는 방법.

---

## 1. 대시보드에서 확인

1. [Supabase Dashboard](https://supabase.com/dashboard) 로그인 후 프로젝트 선택.
2. 왼쪽 **Table Editor** 클릭.
3. 테이블 목록에 아래가 있는지 확인.

| 테이블명 | 담당 |
|----------|------|
| issues | A |
| timeline_points | A |
| news_data | A |
| community_data | A |
| users | B |
| reactions | B |
| comments | B |
| votes | B |
| vote_choices | B |
| user_votes | B |
| discussion_topics | B |
| safety_rules | B |
| admin_logs | A·B |

각 테이블 클릭 후 컬럼 이름·타입이 97_1단계_기초픽스 §3.1과 일치하는지 확인.

---

## 2. SQL Editor에서 확인

1. 대시보드 왼쪽 **SQL Editor** 클릭.
2. 새 쿼리에 아래 SQL 붙여넣고 **Run** 실행.

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

3. 결과에 위 13개 테이블이 모두 나오는지 확인.

컬럼까지 보려면:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

---

## 3. 프로젝트 API로 확인

환경 변수(`.env.local`)에 Supabase URL·키가 설정된 상태에서:

1. `npm run dev` 로 서버 실행.
2. 브라우저 또는 터미널에서 요청:

```bash
curl http://localhost:3000/api/dev/check-tables
```

응답 예시:

```json
{
  "ok": true,
  "existing": ["issues", "timeline_points", ...],
  "missing": [],
  "details": [
    { "table": "issues", "exists": true },
    { "table": "timeline_points", "exists": true },
    ...
  ]
}
```

`ok: false`이면 `missing` 배열에 없는 테이블 이름이 나옴. `details`에서 각 테이블별 에러 메시지 확인 가능.

---

## 4. 테이블이 없을 때

- 97_1단계_기초픽스.md §3.1 컬럼 정의를 보고 Supabase **SQL Editor**에서 `CREATE TABLE ...` 로 직접 생성하거나,
- 팀에서 쓰는 스키마 마이그레이션/스크립트가 있으면 그걸로 생성.

배포 환경에서는 보안상 `/api/dev/check-tables` 접근을 제한하거나 제거해도 됨.
