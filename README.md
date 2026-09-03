# 2026학년도 2학년 2반 학급 포털 (Classroom Portal)

> Google Sheets 기반 실시간 비동기 연동 학급 웹사이트 & 관리자 대시보드

---

## 📌 주요 기능

1. **메인 대시보드 (`index.html`)**
   - 실시간 우선순위 공지사항 피드
   - 지능형 시험 D-Day 카운터 (지난 시험 자동 제외 & 실시간 최우선 시험 계산)
   - 월간 학사 캘린더 엔진 (단일 일정 및 `~` 연속 기간 리본 바 지원)
   - 익명 건의함 및 바로가기 카드

2. **공지사항 전용관 (`notice.html`)**
   - 실시간 텍스트 검색 및 `/` 키보드 단축키 지원
   - 탭 필터링 (`전체`, `공지`, `알림/필독`)
   - 상세 공지 팝업 모달 & 클립보드 복사

3. **학급 자유게시판 (`board.html`)**
   - 카테고리 필터링 (`전체`, `공지`, `분실물`, `선택과목`, `기타`)
   - 카드형 게시글 레이아웃 & 실시간 본문 검색

4. **선생님 & 임원 관리자 센터 (`admin.html`)**
   - PIN 번호 보안 잠금 화면
   - 공지/학사일정 즉시 등록기 (날짜 없음/단일/연속기간 3단계 토글)
   - Google Apps Script Web App 연동 시 1클릭 실시간 구글 시트 자동 저장

---

## 🛠 기술 스택

- **Frontend**: Pure Static Web (HTML5, Vanilla CSS, Vanilla JavaScript)
- **Typography**: Pretendard, JetBrains Mono
- **Design System**: Hallmark Workbench Stance, OKLCH Color Palette
- **Database / Backend**: Google Sheets (CSV Export + GViz JSONP Fallback), Google Forms, Google Apps Script

---

## ⚙️ 설정 방법

`data.js` 파일에서 학급 기본 정보 및 구글 시트/폼 URL을 설정합니다:

```javascript
const CONFIG = {
  portalTitle: "2학년 2반 학급 포털",
  classBadge: "2026학년도",
  schoolName: "2026 고등학교",
  googleSheetUrl: "https://docs.google.com/spreadsheets/d/...",
  googleFormUrl: "https://docs.google.com/forms/d/...",
  adminPin: "202622", // 관리자 PIN
  gasApiUrl: ""       // Google Apps Script Web App URL (선택)
};
```
