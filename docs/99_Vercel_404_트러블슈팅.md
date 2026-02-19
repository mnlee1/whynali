# Vercel 404 트러블슈팅

자동 배포 후 404가 날 때 확인할 내용. DEPLOYMENT_NOT_FOUND와 NOT_FOUND를 구분해 대응한다.

---

## 404 DEPLOYMENT_NOT_FOUND

### 증상

```
404: NOT_FOUND
Code: DEPLOYMENT_NOT_FOUND
ID: icn1::x55zj-1771461376101-7957ef835d78
This deployment cannot be found.
```

### 원인

1. **삭제된 배포에 접속**  
   Preview는 PR 머지·브랜치 삭제 시 사라짐. 예전 URL로 접속하면 발생.
2. **잘못된 URL**  
   오타, 만료/삭제된 커밋 해시·배포 ID 기반 URL.
3. **배포 미존재**  
   푸시 직후 빌드 중이거나 빌드 실패.
4. **권한**  
   팀/프로젝트 접근 권한 없음.

### 해결 절차

1. 접속 중인 URL이 유효한지 확인(Preview용이면 브랜치 존재 여부, Production이면 기본 도메인).
2. [Vercel 대시보드](https://vercel.com/dashboard) → 프로젝트 → **Deployments** 에서 해당 배포 존재·상태 확인.
3. **Production 404**: Settings → Git에서 Production 브랜치 확인 후 해당 브랜치에 `git push` → Deployments에서 Ready 확인 → `https://프로젝트명.vercel.app` 접속.
4. **Preview 404**: 브랜치가 있으면 `git push origin 브랜치명`으로 재배포. 브랜치 삭제됐으면 해당 Preview URL은 복구 불가.
5. 권한 의심 시 팀/프로젝트 소유자에게 확인.

### 참고

- [Vercel DEPLOYMENT_NOT_FOUND](https://vercel.com/docs/errors/DEPLOYMENT_NOT_FOUND)
- 장기 사용 URL은 Production 또는 커스텀 도메인 사용 권장.

---

## 404 NOT_FOUND (Code: NOT_FOUND)

### 증상

```
404: NOT_FOUND
Code: NOT_FOUND
ID: icn1::26qs6-1771462248900-07167efab680
```

### DEPLOYMENT_NOT_FOUND와 차이

| 코드 | 의미 |
|------|------|
| DEPLOYMENT_NOT_FOUND | **배포 자체**가 없음. 위 섹션 참고. |
| NOT_FOUND | 배포는 있으나 요청한 **경로/페이지**를 찾을 수 없음. |

### 원인

1. **경로 없음**  
   존재하지 않는 path 접속 또는 루트만 되고 하위 경로 404.
2. **SPA 라우팅**  
   SPA인데 서버에서 `index.html`로 넘기지 않아 직접 URL/새로고침 시 404. Next.js App Router는 보통 자동 처리.
3. **Output Directory**  
   Vercel Build Output Directory가 비어 있거나 잘못된 폴더 → 빌드 성공해도 서빙할 파일 없음.
4. **배포 없음**  
   NOT_FOUND가 배포 단위로 나올 수도 있음. 이때는 DEPLOYMENT_NOT_FOUND와 동일 대응.

### 해결 절차

1. **접속 URL 확인**  
   루트 `https://프로젝트.vercel.app/` 는 되는지, 특정 경로만 404인지 구분.
2. **전체 404**  
   → DEPLOYMENT_NOT_FOUND 해결 절차대로(배포 존재·상태 확인, 재푸시).
3. **특정 경로만 404**  
   - Next.js: 해당 경로에 `app/.../page.tsx` 또는 `pages/...` 존재 여부 확인.  
   - 순수 SPA: `vercel.json`에 `"source": "/(.*)", "destination": "/index.html"` rewrites 추가.
4. **빌드 설정**  
   Settings → General에서 Build Output Directory가 프레임워크 기본값과 일치하는지 확인.
5. **로그**  
   Deployments → 해당 배포 → Logs에서 빌드/런타임 에러 확인.

### 참고

- [Vercel NOT_FOUND](https://vercel.com/docs/errors/NOT_FOUND)
- [Vercel KB: Why is my deployed project giving 404?](https://vercel.com/kb/guide/why-is-my-deployed-project-giving-404)

---

## No Output Directory named "public" found

### 증상

빌드는 성공했는데 배포 단계에서:

```
Error: No Output Directory named "public" found after the Build completed.
Configure the Output Directory in your Project Settings.
```

### 원인

Next.js는 결과물을 `.next` 등으로 내보내지, `public`이라는 이름의 단일 출력 디렉터리를 만들지 않음. 그런데 Vercel 프로젝트 설정에서 **Output Directory**가 `public`으로 지정돼 있으면 이 오류 발생.

### 해결

1. **Vercel 대시보드**  
   [vercel.com](https://vercel.com) → 해당 프로젝트 → **Settings** → **General**  
   **Build & Development Settings**에서 **Output Directory** 값을 **비운다**(Next.js는 비워두면 프레임워크 기본값 사용).

2. **프로젝트에 vercel.json**  
   루트에 `vercel.json`이 있고 `"framework": "nextjs"`로 두면, Next.js 프로젝트로 인식되어 출력 디렉터리 오인식이 줄어듦.  
   `builds`나 `outputDirectory: "public"` 같은 건 넣지 말 것(Next.js 프리셋을 덮어써서 같은 오류가 날 수 있음).
