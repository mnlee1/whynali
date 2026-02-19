# GitHub Actions Cron 설정 가이드

## 개요

Vercel Hobby 플랜의 Cron 제한을 피하기 위해 GitHub Actions를 사용합니다.

## 장점

- 완전 무료 (public 저장소)
- 무제한 실행 횟수
- 월 2,000분 무료 (private 저장소)
- 수동 실행 가능 (workflow_dispatch)

## 설정된 Cron

| Workflow | 스케줄 | 실행 |
|----------|--------|------|
| 뉴스 수집 | `0 */2 * * *` | 2시간마다 |
| 커뮤니티 수집 | `*/30 * * * *` | 30분마다 |
| 자동 연결 | `15 * * * *` | 매시간 15분 |
| 화력 분석 | `30 * * * *` | 매시간 30분 |

## 초기 설정

### 1. GitHub Secrets 설정

1. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
3. Name: `CRON_SECRET`
4. Value: `.env.local`의 `CRON_SECRET` 값 입력
5. **Add secret** 클릭

### 2. Vercel 배포 URL 확인

`.github/workflows/*.yml` 파일에서 URL을 실제 배포 URL로 변경:

```yaml
# 현재 (예시)
https://whynali-git-develop-mnlee1s-projects.vercel.app

# 실제 프로덕션 URL로 변경
https://your-actual-domain.vercel.app
```

또는 Vercel Dashboard에서 확인:
- Deployments → Production → Domain

### 3. 배포

```bash
git add .github/workflows vercel.json
git commit -m "feat: GitHub Actions Cron 추가 (Vercel Cron 제거)"
git push origin develop
```

### 4. 확인

1. GitHub 저장소 → **Actions** 탭
2. 왼쪽에 4개 workflow 표시
3. 스케줄에 따라 자동 실행됨

## 수동 실행

GitHub Actions 탭에서:
1. 원하는 workflow 선택
2. **Run workflow** 버튼 클릭
3. **Run workflow** 확인

## 스케줄 변경

각 `.github/workflows/*.yml` 파일의 `cron` 값 수정:

```yaml
on:
  schedule:
    - cron: '0 */2 * * *'  # 여기를 수정
```

### Cron 표현식 예시

```
*/5 * * * *      # 5분마다
*/15 * * * *     # 15분마다
0 * * * *        # 매시간 정각
0 */2 * * *      # 2시간마다
0 9 * * *        # 매일 오전 9시
0 9,18 * * *     # 매일 9시, 18시
0 9 * * 1        # 매주 월요일 9시
```

## 로그 확인

GitHub Actions 탭에서:
1. workflow 선택
2. 최근 실행 클릭
3. job 클릭하여 로그 확인

## 비용

### Public 저장소
- ✅ **완전 무료**
- ✅ 무제한 실행

### Private 저장소
- ✅ 월 2,000분 무료
- 현재 설정: 약 100분/월 사용 (충분히 무료 범위)
  - 뉴스: 12회/일 × 10초 = 40분/월
  - 커뮤니티: 48회/일 × 10초 = 160분/월 (무료 범위)

## 문제 해결

### Workflow가 실행되지 않음

**원인**: GitHub는 60일간 commit이 없으면 workflow를 비활성화

**해결**: 
1. GitHub 저장소 → Actions 탭
2. 비활성화된 workflow 클릭
3. **Enable workflow** 클릭

### API 호출 실패 (401 Unauthorized)

**원인**: `CRON_SECRET`이 설정되지 않았거나 틀림

**해결**:
1. GitHub Secrets에 `CRON_SECRET` 확인
2. `.env.local`의 값과 일치하는지 확인

### API 호출 실패 (500 Error)

**원인**: Vercel 서버 에러

**해결**:
1. Vercel Dashboard → Functions → Logs
2. 에러 로그 확인
3. 해당 API route 코드 수정

## Vercel Cron vs GitHub Actions 비교

| 항목 | Vercel Cron | GitHub Actions |
|------|-------------|----------------|
| 무료 횟수 | 하루 1회만 | 무제한 (public) |
| 설정 | vercel.json | .github/workflows |
| Cold Start | 없음 | 있을 수 있음 |
| 실행 환경 | Vercel Edge | GitHub Runners |
| 로그 확인 | Vercel Dashboard | GitHub Actions |
| 수동 실행 | X | O |

## 추천 설정

### 개발/테스트 단계
- GitHub Actions 사용 (무료, 유연함)

### 프로덕션
- Vercel Pro ($20/월) + Vercel Cron
  - Cold start 없음
  - 더 안정적
  - 1일 1,000회 실행 가능

또는

- GitHub Actions 계속 사용
  - 완전 무료
  - 충분히 안정적
  - Cold start는 보통 1-2초 (API는 빠름)
