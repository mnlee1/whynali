# Supabase 프로젝트 복구 절차

## 프로젝트 정보
- Project Ref: banhuygrqgezhlpyytyc
- 삭제 시점: 7일 이내 (복구 가능 기간)

## 복구 단계

### 1단계: 대시보드에서 복구

1. Supabase 대시보드 접속
   https://supabase.com/dashboard

2. 삭제된 프로젝트 찾기
   - 프로젝트 목록에서 "삭제된 프로젝트" 또는 "Paused" 탭 확인
   - 또는 Settings > General에서 "Restore" 옵션 확인

3. 복구 버튼 클릭
   - "Restore this project" 버튼 클릭
   - 복구 확인 (몇 분 소요)

### 2단계: 복구 완료 후 확인

복구가 완료되면:
1. 프로젝트 상태가 "Active"로 변경
2. API 접근 가능 여부 확인

### 3단계: 환경변수 원복

.env.local에서 주석 제거:
```bash
# 주석 제거 (2-4번 줄)
NEXT_PUBLIC_SUPABASE_URL=https://banhuygrqgezhlpyytyc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 새 프로젝트 주석 처리 (5-7번 줄)
# NEXT_PUBLIC_SUPABASE_URL=https://daiwwuofyqjhknidkois.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
```

### 4단계: 연결 테스트

```bash
npm run dev
```

로컬 서버 실행 후:
- http://localhost:3000 접속
- 로그인 테스트
- 이슈 목록 확인

## 복구 실패 시

7일이 지났거나 복구 불가능한 경우:
1. Supabase 지원팀에 문의
2. 또는 새 프로젝트에 dev_setup.sql 실행하여 스키마 재생성
