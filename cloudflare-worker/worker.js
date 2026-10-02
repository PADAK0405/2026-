/**
 * 가온고등학교 급식 실시간 중계 API (Cloudflare Worker)
 * 
 * - 가온고 공식 홈페이지(gaon-h.goean.kr) 주간 급식표를 실시간으로 스크래핑하여 JSON으로 변환
 * - 조식, 중식, 석식 전체 및 칼로리,대표 메뉴 추출 지원
 * - CORS 완전 허용 (Access-Control-Allow-Origin: *)
 * - Cloudflare 엣지 캐싱(30분)으로 학교 서버 부하 최소화 및 초고속 응답
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

function parseMealHtml(html) {
  const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/i);
  if (!theadMatch) return {};
  const dates = [...theadMatch[0].matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0]);

  const tbodyMatch = html.match(/<tbody>[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch) return {};
  const rows = [...tbodyMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);

  const weekMeals = {};
  dates.forEach(d => {
    const ymd = d.replace(/-/g, '');
    weekMeals[ymd] = {
      '1': null,
      '2': null,
      '3': null
    };
  });

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

      // 식단 메뉴 추출
      const pMatch = td.match(/<p class="">([\s\S]*?)<\/p>/i);
      if (pMatch) {
        const rawDishes = pMatch[1].split(/<br\s*\/?>|\r\n|\n/gi);
        const dishes = rawDishes.map(d => {
          let cleaned = d.replace(/<[^>]+>/g, '');
          cleaned = cleaned.replace(/\([0-9.,\s*]+\)/g, '');
          cleaned = cleaned.replace(/[*#]/g, '');
          cleaned = cleaned.replace(/^\s*[-/&]\s*/, '');
          cleaned = cleaned.replace(/\s+/g, ' ').trim();
          return cleaned;
        }).filter(d => d.length > 0 && !d.includes('상세보기'));

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

  // 급식 없는 끼니는 빈 객체로 정돈
  for (const [ymd, meals] of Object.entries(weekMeals)) {
    const timeLabels = { '1': '오전 8:00까지', '2': '오후 1:30까지', '3': '오후 6:30까지' };
    const names = { '1': '조식', '2': '중식', '3': '석식' };
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

export default {
  async fetch(request, env, ctx) {
    // OPTIONS 프리플라이트 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS, status: 204 });
    }

    try {
      const url = new URL(request.url);

      // 요청 날짜 파라미터 확인 (없으면 오늘 날짜 한국시간 KST 기준)
      let targetDate = url.searchParams.get('date');
      if (!targetDate) {
        const nowKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
        const y = nowKst.getFullYear();
        const m = String(nowKst.getMonth() + 1).padStart(2, '0');
        const d = String(nowKst.getDate()).padStart(2, '0');
        targetDate = `${y}-${m}-${d}`;
      } else if (targetDate.length === 8 && !targetDate.includes('-')) {
        // YYYYMMDD -> YYYY-MM-DD
        targetDate = `${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}`;
      }

      // 가온고 홈페이지 주간 식단표 요청
      const gaonFetchUrl = `${GAON_MEAL_URL}&schDt=${encodeURIComponent(targetDate)}`;
      const gaonRes = await fetch(gaonFetchUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        cf: {
          cacheTtl: 1800, // Cloudflare 엣지 캐시 30분
          cacheEverything: true
        }
      });

      if (!gaonRes.ok) {
        throw new Error(`학교 사이트 응답 오류: ${gaonRes.status}`);
      }

      const html = await gaonRes.text();
      const weekMeals = parseMealHtml(html);

      const responseBody = JSON.stringify({
        success: true,
        targetDate: targetDate,
        data: weekMeals
      });

      return new Response(responseBody, {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=UTF-8',
          'Cache-Control': 'public, max-age=1800' // 브라우저 캐시 30분
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
