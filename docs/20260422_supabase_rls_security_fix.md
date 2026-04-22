## Supabase 보안 경고 해결 가이드

### 문제 요약

2개 테이블에 Row-Level Security(RLS)가 비활성화되어 프로젝트 URL을 가진 누구나 데이터를 읽고 수정할 수 있는 상태입니다.

**영향받는 프로젝트:**
- whynali-dev (daiwuuofyqjhknidkois)
- whynali-main (ndxshmfmcdcotteevwgi)

**영향받는 테이블:**
1. `timeline_summaries` - 이슈별 AI 타임라인 요약 캐시
2. `app_settings` - TikTok 토큰 등 민감 정보 저장

### 해결 방법

#### 1. Supabase 대시보드 접속

각 프로젝트별로 다음 작업을 수행합니다:

- whynali-dev: https://supabase.com/dashboard/project/daiwuuofyqjhknidkois
- whynali-main: https://supabase.com/dashboard/project/ndxshmfmcdcotteevwgi

#### 2. SQL Editor에서 마이그레이션 실행

1. 좌측 메뉴에서 **SQL Editor** 클릭
2. **New query** 버튼 클릭
3. 다음 SQL 복사 후 실행:

```sql
-- timeline_summaries: 공개 읽기 허용
ALTER TABLE timeline_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timeline_summaries_public_read" ON timeline_summaries
    FOR SELECT USING (true);

-- app_settings: 클라이언트 접근 완전 차단 (서비스 롤만)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
```

4. **Run** 버튼 클릭하여 실행

#### 3. 다른 프로젝트에도 동일하게 적용

whynali-dev와 whynali-main 모두에 적용해야 합니다.

#### 4. 보안 경고 해소 확인

1. Supabase 대시보드 → **Advisors** 메뉴 이동
2. "Table publicly accessible" 경고가 사라졌는지 확인
3. 1-2시간 후에도 경고가 남아있다면 Supabase가 재스캔할 때까지 대기

### 적용된 RLS 정책 설명

#### timeline_summaries
- **공개 읽기 허용**: 클라이언트가 타임라인 요약을 조회할 수 있어야 하므로 SELECT 허용
- **쓰기 차단**: 정책이 없어 클라이언트는 INSERT/UPDATE/DELETE 불가
- **서비스 롤**: 백엔드 API에서는 RLS 우회 권한으로 정상 작동

#### app_settings
- **완전 차단**: 정책 없이 RLS만 활성화 = anon/authenticated 롤 모든 접근 차단
- **서비스 롤만**: 백엔드 API만 TikTok 토큰 등 민감 정보 접근 가능

### 참고 파일

- `supabase/rls_setup.sql` - 전체 RLS 정책 정의 (업데이트됨)
- `supabase/migrations/20260422_enable_rls_for_missing_tables.sql` - 이번 수정 마이그레이션

### 향후 주의사항

새 테이블 생성 시 반드시 다음을 확인하세요:

1. 테이블 생성 후 즉시 RLS 활성화
2. 필요한 정책(SELECT/INSERT/UPDATE/DELETE) 정의
3. `rls_setup.sql`에 정책 문서화
4. Supabase Advisors에서 보안 경고 확인
