# Vercel 운영 가이드

Vercel 배포, 환경 변수, 404 트러블슈팅 가이드.

## 환경 변수 설정

### 방법 1: 별도 프로젝트 (권장)

dev-whynali와 whynali가 별도 Vercel 프로젝트인 경우.

**dev-whynali 프로젝트:**
1. Vercel 대시보드 → dev-whynali 선택
2. Settings → Environment Variables
3. Add New 클릭
4. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL`
   - Value: `https://dev-whynali.vercel.app`
   - Environments: Production, Preview, Development 모두 체크
5. Save

**whynali 프로젝트:**
1. Vercel 대시보드 → whynali 선택
2. Settings → Environment Variables
3. Add New 클릭
4. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL`
   - Value: `https://whynali.vercel.app`
   - Environments: Production, Preview, Development 모두 체크
5. Save

### 방법 2: 같은 프로젝트에서 환경별 분리

main 브랜치와 dev 브랜치를 사용하는 경우.

**Production 환경 (main):**
1. Settings → Environment Variables → Add New
2. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL`
   - Value: `https://whynali.vercel.app`
   - Environments: **Production만 체크**

**Preview 환경 (dev):**
1. Add New 다시 클릭
2. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL` (같은 이름)
   - Value: `https://dev-whynali.vercel.app`
   - Environments: **Preview만 체크**

화면에 같은 이름의 환경 변수가 2개 나타나며, 각각 다른 환경에 적용됨.

### 재배포
환경 변수 추가/수정 후:
1. Deployments 탭 이동
2. 최신 배포의 ⋯ 메뉴 → Redeploy

### 주의사항
- `NEXT_PUBLIC_` 접두사: 클라이언트에 노출됨
- 환경 변수 변경 후 반드시 재배포 필요
- Preview 배포는 브랜치별로 별도 URL

## 404 트러블슈팅

### 404 DEPLOYMENT_NOT_FOUND

**증상:**
```
404: NOT_FOUND
Code: DEPLOYMENT_NOT_FOUND
This deployment cannot be found.
```

**원인:**
1. 삭제된 배포에 접속 (PR 머지·브랜치 삭제 시)
2. 잘못된 URL (오타, 만료된 커밋 해시)
3. 배포 미존재 (빌드 중이거나 실패)
4. 권한 없음

**해결 절차:**
1. 접속 중인 URL이 유효한지 확인
2. Vercel 대시보드 → Deployments에서 해당 배포 존재·상태 확인
3. Production 404: 해당 브랜치에 `git push` → Ready 확인
4. Preview 404: 브랜치 있으면 재푸시, 삭제됐으면 복구 불가
5. 권한 의심 시 팀 소유자에게 확인

**참고:** 장기 사용 URL은 Production 또는 커스텀 도메인 권장

### 404 NOT_FOUND

**증상:**
```
404: NOT_FOUND
Code: NOT_FOUND
```

**DEPLOYMENT_NOT_FOUND와 차이:**
- DEPLOYMENT_NOT_FOUND: 배포 자체가 없음
- NOT_FOUND: 배포는 있으나 경로/페이지 없음

**원인:**
1. 경로 없음 (존재하지 않는 path)
2. SPA 라우팅 미설정
3. Output Directory 잘못 설정
4. 배포 없음 (DEPLOYMENT_NOT_FOUND와 동일)

**해결 절차:**
1. 루트 URL은 되는지 확인
2. 전체 404: DEPLOYMENT_NOT_FOUND 해결 절차
3. 특정 경로만 404:
   - Next.js: `app/.../page.tsx` 존재 여부 확인
   - SPA: `vercel.json`에 rewrites 추가
4. Build Output Directory 확인 (Settings → General)
5. 빌드/런타임 에러 확인 (Deployments → Logs)

### No Output Directory named "public"

**증상:**
```
Error: No Output Directory named "public" found
```

**원인:**
Next.js는 `.next`로 출력하는데, Vercel 설정이 `public`으로 지정됨.

**해결:**
1. Vercel 대시보드 → Settings → General
2. **Build & Development Settings** → **Output Directory** 비우기
3. `vercel.json`에 `"framework": "nextjs"` 추가 (선택)

## 권장 사항

### 개발 단계
- 환경변수: Preview 환경 별도 설정
- 빈번한 재배포 예상

### 운영 단계
- 환경변수: Production 환경 별도 설정
- 커스텀 도메인 연결

### 모니터링
- Deployments 로그 주기적 확인
- 404 에러 발생 시 즉시 대응
