/**
 * 2026 학급 포털 (Classroom Portal) - 설정 파일
 * 
 * 구글 스프레드시트와 구글 폼 URL, 관리자 PIN을 관리하며,
 * 모든 데이터(공지사항, 학사일정, 게시글)는 app.js에서 실시간으로 스프레드시트를 조회하여 렌더링합니다.
 */

const CONFIG = {
  // 학급 기본 브랜딩 정보
  portalTitle: "2학년 2반 학급 포털",
  classBadge: "2026학년도",
  schoolName: "2026 고등학교",

  // [구글 스프레드시트 실시간 DB URL]
  googleSheetUrl: "https://docs.google.com/spreadsheets/d/1fs-42tnD-60AkSjjE4mUrJIEe-1q0Na7BK2xPn4cqWg/edit?gid=0#gid=0",

  // [Google Forms 익명 건의함 링크]
  googleFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeNpYNzPwAeEYAdoV9FRGV41Hun-ddPtkYnTIRdIU3GQez51A/viewform",

  // [관리자 전용 설정]
  // 추천 관리자 비밀번호: 202622 (2026학년도 2학년 2반)
  adminPin: "202622",

  // [Google Apps Script Web App API URL - 선택 사항]
  // 스프레드시트에 Apps Script 배포 시 여기에 URL을 넣으면 관리자 페이지에서 1클릭으로 시트에 직접 등록됩니다.
  gasApiUrl: ""
};
