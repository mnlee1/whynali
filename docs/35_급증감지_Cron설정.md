# GitHub Actions Cron 설정 가이드

**날짜**: 2026-03-06

이 문서는 GitHub Actions를 사용한 Cron 설정 방법을 설명합니다.

---

## 프로젝트 Cron 구성

### 기존 Workflows

| Workflow | 파일 | 주기 | API |
|----------|------|------|-----|
| 뉴스 수집 | `prod-cron-collect-news.yml` | 30분 | `/api/cron/collect-news` |
| 커뮤니티 수집 | `prod-cron-collect-community.yml` | 30분 | `/api/cron/collect-community` |
| 이슈 자동 생성 | `prod-cron-auto-create-issue.yml` | 30분 | `/api/cron/auto-create-issue` |

### 신규 추가

| Workflow | 파일 | 주기 | API |
|----------|------|------|-----|
| **커뮤니티 급증 감지** | **`prod-cron-detect-community-burst.yml`** | **3분** | **`/api/cron/detect-community-burst`** |

---

## Workflow 파일 구조

**파일**: `.github/workflows/prod-cron-detect-community-burst.yml`

```yaml
name: 커뮤니티 급증 감지 Cron (Production)

on:
  schedule:
    - cron: '*/3 * * * *'  # 3분마다 실행
  workflow_dispatch:         # 수동 실행 버튼

jobs:
  detect-community-burst:
    runs-on: ubuntu-latest
    steps:
      - name: 커뮤니티 급증 감지 API 호출 (Production)
        run: |
          curl -X GET https://whynali.vercel.app/api/cron/detect-community-burst \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "User-Agent: GitHub-Actions" \
            --max-time 60 \
            --retry 2
```

---

## 설정 방법

### 1. Secrets 설정

**위치**: GitHub 저장소 → Settings → Secrets and variables → Actions

**필수 Secret**:
- `CRON_SECRET`: API 인증 키 (이미 설정되어 있어야 함)

### 2. Workflow 활성화

1. Git Push 후 자동으로 활성화됨
2. GitHub → Actions 탭에서 확인
3. 좌측 사이드바에 "커뮤니티 급증 감지 Cron (Production)" 표시

### 3. 수동 실행

1. GitHub → Actions 탭
2. "커뮤니티 급증 감지 Cron (Production)" 클릭
3. 우측 상단 "Run workflow" 버튼
4. Branch 선택 → "Run workflow"

---

## 실행 주기

```
매 3분:
  - 커뮤니티 급증 감지

매 30분:
  - 뉴스 수집
  - 커뮤니티 수집
  - 이슈 자동 생성
```

---

## 모니터링

### 실행 로그 확인

1. GitHub → Actions 탭
2. 최근 실행 기록 클릭
3. "커뮤니티 급증 감지 API 호출" 단계 확인

**성공 로그**:
```
< HTTP/2 200
{"success":true,"created":0,"elapsed_ms":63}
```

**실패 로그**:
```
< HTTP/2 401
{"error":"Unauthorized"}
```

### 실행 히스토리

- GitHub Actions UI에서 모든 실행 기록 확인 가능
- 실패 시 자동 알림 (Settings → Notifications)

---

## 비용

**GitHub Actions 무료 한도**:
- Public 저장소: 무제한
- Private 저장소: 월 2,000분

**커뮤니티 급증 감지 사용량**:
- 실행 시간: ~1초
- 주기: 3분
- 월 사용량: 20회/시간 × 24시간 × 30일 = 14,400회 ≈ 240분

**여유**: 충분 (Private 기준 월 2,000분 - 240분 = 1,760분)

---

## 문제 해결

### Workflow가 실행 안 됨

**원인**: GitHub Actions 비활성화

**해결**:
1. Settings → Actions → General
2. "Allow all actions and reusable workflows" 선택

### 401 Unauthorized

**원인**: CRON_SECRET 미설정 또는 잘못됨

**해결**:
1. Settings → Secrets → Actions
2. CRON_SECRET 확인 및 수정

### 타임아웃

**원인**: API 응답 60초 초과

**해결**:
```yaml
# Workflow 파일 수정
--max-time 120  # 60 → 120
```

---

## 참고

- **Vercel Cron 사용 안 함**: 무료 플랜 제한
- **cron-job.org 사용 안 함**: GitHub Actions로 충분
- **비용 효율적**: 무료 한도 내 사용

---

**다음**: `docs/31_급증감지_빠른시작.md` 참고
