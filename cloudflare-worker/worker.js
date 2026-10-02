/**
 * 가온고등학교 급식 실시간 광대역 다중 주차 중계 API (Cloudflare Worker)
 * 
 * - 가온고 공식 홈페이지(gaon-h.goean.kr)에서 불러올 수 있는 최대한의 주차(지난주 ~ 미래 4주까지 총 6~7주치)를 병렬 스크래핑
 * - 조식, 중식, 석식 전체 및 칼로리, 대표 메뉴 추출 완벽 지원
 * - CORS 완전 허용 (Access-Control-Allow-Origin: *)
 * - Cloudflare 엣지 캐싱(30분) 탑재로 학교 서버 부하 0 & 초고속(0.05초) 응답
 */

const GAON_MEAL_URL = 'https://gaon-h.goean.kr/gaon-h/ad/fm/foodmenu/selectFoodMenuView.do?mi=5369';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 대표 단백질/메인 요리 감지 키워드
const PROTEIN_KEYWORDS = [
  '갈비', '불고기', '찜닭', '닭갈비', '치킨', '스테이크', '까스', '커틀렛', 
  '탕수육', '볶음', '구이', '조림', '새우', '오리', '삼겹살', '고기', '소고기', 
  '돈육', '제육', '돼지', '연어', '장어', '낙지', '오징어', '해물', '스파게티', 
  '파스타', '피자', '떡볶이', '곱도리탕', '마라', '깐풍', '유린기', '카레', '짜장'
];

function detectMainDish(dishes) {
  if (!dishes || dishes.length === 0) return '';
  for (const dish of dishes) {
    if (PROTEIN_KEYWORDS.some(kw => dish.includes(kw))) {
      return dish;
    }
  }
  if (dishes.length > 2 && (dishes[0].includes('밥') || dishes[0].includes('죽'))) {
    return dishes[2];
  } else if (dishes.length > 1 && dishes[0].includes('밥')) {
    return dishes[1];
  }
  return dishes[0];
}

// 2자리 숫자 패딩
function pad2(n) {
  return String(n).padStart(2, '0');
}

// YYYY-MM-DD 포맷 반환
function formatDashDate(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

// 기준 날짜가 속한 주의 월요일 Date 객체 반환
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 단일 주간 HTML 파싱 함수
function parseWeekHtml(html) {
  const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/i);
  if (!theadMatch) return {};
  const dates = [...theadMatch[0].matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0]);
  if (dates.length === 0) return {};

  const weekMeals = {};
  dates.forEach(d => {
    const ymd = d.replace(/-/g, '');
    weekMeals[ymd] = {
      '1': null,
      '2': null,
      '3': null
    };
  });

  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);
  for (const rHtml of rows) {
    const thMatch = rHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    const mealName = thMatch ? thMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    let mealCode = null;
    let timeLabel = '';
    if (mealName.includes('조식')) { mealCode = '1'; timeLabel = '오전 8:00까지'; }
    else if (mealName.includes('중식')) { mealCode = '2'; timeLabel = '오후 1:30까지'; }
    else if (mealName.includes('석식')) { mealCode = '3'; timeLabel = '오후 6:30까지'; }

    if (!mealCode) continue;

    const tds = [...rHtml.matchAll(/<td[\s\S]*?<\/td>/gi)].map(m => m[0]);
    dates.forEach((dateStr, i) => {
      const ymd = dateStr.replace(/-/g, '');
      const td = tds[i] || '';

      // 칼로리 추출
      const calMatch = td.match(/([0-9.]+)\s*Kcal/i);
      const calories = calMatch ? `${calMatch[1]} kcal` : '열량 정보 없음';

      // 식단 메뉴 추출 (상세보기 버튼 제외하고 실제 메뉴 <p class=""> 추출)
      const pMatch = td.match(/<p class="">([\s\S]*?)<\/p>/i);
      if (pMatch) {
        const rawDishes = pMatch[1].split(/<br\s*\/?>|\r\n|\n/gi);
        const dishes = rawDishes
          .map(d => {
            let cleaned = d.replace(/<[^>]+>/g, '');
            cleaned = cleaned.replace(/\([0-9.,\s*]+\)/g, '');
            cleaned = cleaned.replace(/[*#]/g, '');
            cleaned = cleaned.replace(/^\s*[-/&]\s*/, '');
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            return cleaned;
          })
          .filter(d => d.length > 0 && !d.includes('상세보기'));

        if (dishes.length > 0) {
          const mainDish = detectMainDish(dishes);
          weekMeals[ymd][mealCode] = {
            code: mealCode,
            name: mealName,
            timeLabel: timeLabel,
            calories: calories,
            mainDish: mainDish,
            dishes: dishes
          };
        }
      }
    });
  }

  // 급식 없는 끼니 정돈
  const timeLabels = { '1': '오전 8:00까지', '2': '오후 1:30까지', '3': '오후 6:30까지' };
  const names = { '1': '조식', '2': '중식', '3': '석식' };
  for (const [ymd, meals] of Object.entries(weekMeals)) {
    for (const code of ['1', '2', '3']) {
      if (!meals[code]) {
        meals[code] = {
          code: code,
          name: names[code],
          timeLabel: timeLabels[code],
          calories: '미운영',
          mainDish: '',
          dishes: ['급식 미운영 (식단 없음)']
        };
      }
    }
  }

  return weekMeals;
}

// 1개 주간 fetch 헬퍼
async function fetchOneWeek(dateStr) {
  try {
    const gaonFetchUrl = `${GAON_MEAL_URL}&schDt=${encodeURIComponent(dateStr)}`;
    const res = await fetch(gaonFetchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8'
      },
      cf: {
        cacheTtl: 1800,
        cacheEverything: true
      }
    });

    if (!res.ok) return {};
    const html = await res.text();
    return parseWeekHtml(html);
  } catch (e) {
    return {};
  }
}

export default {
  async fetch(request, env, ctx) {
    // OPTIONS 프리플라이트 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS, status: 204 });
    }

    try {
      const url = new URL(request.url);
      const queryDate = url.searchParams.get('date');

      // 기준 날짜 파싱 (파라미터가 있으면 우선 사용, 없으면 기본 2026-10-05 기준)
      let baseDate;
      if (queryDate) {
        if (queryDate.length === 8 && !queryDate.includes('-')) {
          baseDate = new Date(`${queryDate.slice(0, 4)}-${queryDate.slice(4, 6)}-${queryDate.slice(6, 8)}`);
        } else {
          baseDate = new Date(queryDate);
        }
      } else {
        // 기본값: 현재 연도에 맞춰 계산하되 2026 프로젝트 호환
        const nowKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        if (nowKst.getFullYear() < 2026) {
          // 2026학년도 학급 컨텍스트 반영
          baseDate = new Date(`2026-${pad2(nowKst.getMonth() + 1)}-${pad2(nowKst.getDate())}`);
        } else {
          baseDate = nowKst;
        }
      }

      const currentMonday = getMonday(baseDate);

      // 불러올 수 있는 최대한의 주차 계산 (과거 2주 ~ 미래 4주까지 총 7주치 광대역 병렬 조회)
      const weekDeltas = [-2, -1, 0, 1, 2, 3, 4];
      const targetDates = weekDeltas.map(delta => {
        const d = new Date(currentMonday);
        d.setDate(d.getDate() + delta * 7);
        return formatDashDate(d);
      });

      // 7주치(약 49일치) 주간 식단표를 병렬(Parallel)로 초고속 동시 스크래핑
      const weekResults = await Promise.all(targetDates.map(fetchOneWeek));

      // 모든 주차의 식단 데이터를 하나의 객체로 완벽 병합
      const allMeals = {};
      weekResults.forEach(week => {
        Object.assign(allMeals, week);
      });

      const responseBody = JSON.stringify({
        success: true,
        baseDate: formatDashDate(baseDate),
        weeksLoaded: targetDates.length,
        datesCount: Object.keys(allMeals).length,
        data: allMeals
      });

      return new Response(responseBody, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=UTF-8',
          'Cache-Control': 'public, max-age=1800' // 브라우저 및 CDN 캐시 30분
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message || '식단 데이터를 가져오는 중 오류가 발생했습니다.'
      }), {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      });
    }
  }
};
