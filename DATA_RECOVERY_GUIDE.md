# 삭제된 Supabase 프로젝트 데이터 복구 방법

## 프로젝트 정보
- 삭제된 프로젝트: banhuygrqgezhlpyytyc
- URL: https://banhuygrqgezhlpyytyc.supabase.co

## 복구 시도 방법

### 1. Supabase Support에 문의
가장 확실한 방법입니다.

**문의 방법:**
1. https://supabase.com/dashboard/support 접속
2. 또는 help@supabase.io 로 이메일 발송

**요청 내용:**
```
Subject: Data Recovery Request - Deleted Project

Project Reference: banhuygrqgezhlpyytyc
Project URL: https://banhuygrqgezhlpyytyc.supabase.co
Deletion Date: [삭제한 날짜]
Organization: [조직명]

I accidentally deleted my Supabase project and need to recover the data.
Is there any way to restore the database backup?

Key tables I need:
- issues
- users
- votes
- comments
- news_data
- collectors
```

### 2. 플랜별 백업 정책

**Free 플랜:**
- 7일 보관
- 삭제 후 7일 이내 복구 가능
- 이후에는 Support 문의 필요

**Pro/Team/Enterprise 플랜:**
- Point-in-Time Recovery (PITR) 가능
- 일정 기간 백업 보관
- Support 팀이 복구 가능성 높음

### 3. 대안 - 부분 복구 가능성

다음 방법으로 일부 데이터를 복구할 수도 있습니다:

**A. 브라우저 캐시 확인**
- 개발자 도구 > Application > Local Storage
- IndexedDB에 일부 데이터가 남아있을 수 있음

**B. 로컬 개발 데이터**
- 로컬에서 테스트하며 쌓인 데이터
- .next/cache 폴더 확인

**C. 다른 팀원**
- 다른 팀원이 로컬에 데이터를 가지고 있을 수 있음

### 4. 실패 시 - 새 프로젝트 구축

데이터 복구가 불가능한 경우:
1. 새 프로젝트에 dev_setup.sql 실행
2. 스키마 재구축
3. 데이터는 새로 수집

## 즉시 실행 가능한 액션

1. **Supabase Support 문의 (최우선)**
   - https://supabase.com/dashboard/support
   - 삭제 후 시간이 지날수록 복구 가능성 낮아짐

2. **플랜 확인**
   - Dashboard > Organization Settings > Billing
   - Pro 플랜 이상이면 복구 가능성 높음

3. **삭제 일시 확인**
   - 이메일에서 "Project deleted" 메일 검색
   - 정확한 삭제 시간 확인

## 참고
- Free 플랜: 7일 이후 완전 삭제
- Pro 플랜: 백업 보관 기간 더 김
- 빠를수록 복구 가능성 높음
