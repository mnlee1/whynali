# GitHub Actions Cron 환경별 설정

## 구조

### Develop (테스트 서버)
- `cron-collect-news.yml`
- `cron-collect-community.yml`
- `cron-auto-link.yml`
- `cron-recalculate-heat.yml`
- URL: `https://dev-whynali.vercel.app`

### Production (운영 서버)
- `prod-cron-collect-news.yml`
- `prod-cron-collect-community.yml`
- `prod-cron-auto-link.yml`
- `prod-cron-recalculate-heat.yml`
- URL: `https://whynali.vercel.app`

## 초기 설정

### 1. GitHub Secrets 등록

https://github.com/mnlee1/whynali/settings/secrets/actions

필요한 Secrets:
- `CRON_SECRET`: API 인증키

#### CRON_SECRET
- 등록 완료
- Value: `G2dXfG8ZH2KwBIfL7fE3MSQ5GUH+NNoActhiG3D8GPw=`

### 2. Workflow 활성화/비활성화

#### 현재 (Develop 테스트 단계)
✅ **활성화**:
- cron-collect-news.yml
- cron-collect-community.yml
- cron-auto-link.yml
- cron-recalculate-heat.yml

❌ **비활성화** (스케줄 주석 처리):
- prod-cron-*.yml (main 배포 전까지)

#### 운영 배포 후
✅ **활성화**:
- prod-cron-*.yml

❌ **비활성화** (선택):
- cron-*.yml (develop 자동 수집 중단)

## Production Workflow 활성화 방법

### 1. Production workflows 활성화

`.github/workflows/prod-cron-*.yml` 파일들의 스케줄 주석 해제:

```yaml
# 현재 (비활성화)
on:
  # schedule:
  #   - cron: '0 */2 * * *'
  workflow_dispatch:

# 활성화 후
on:
  schedule:
    - cron: '0 */2 * * *'
  workflow_dispatch:
```

### 5. Develop Workflow 비활성화 (선택)

develop 자동 수집을 중단하려면:

`.github/workflows/cron-*.yml` 파일들의 스케줄 주석 처리:

```yaml
on:
  # schedule:
  #   - cron: '0 */2 * * *'
  workflow_dispatch:  # 수동 실행은 가능
```

## 수동 실행

GitHub Actions 탭에서:
1. workflow 선택
2. **Run workflow** 버튼
3. 브랜치 선택 (develop 또는 main)
4. **Run workflow** 확인

## 현재 상태

- ✅ Develop workflows: 활성화 (스케줄 실행 중)
- ⏸️ Production workflows: 대기 (main 배포 후 활성화)
- ✅ CRON_SECRET: 등록 완료

## 다음 단계

1. develop 브랜치에서 충분히 테스트
2. develop → main PR 생성 및 머지
3. Production workflows 활성화 (스케줄 주석 해제)
4. (선택) Develop workflows 비활성화
