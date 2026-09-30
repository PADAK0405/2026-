const fs = require('fs');

async function scrapeWeek(targetDate) {
  try {
    const res = await fetch('https://gaon-h.goean.kr/gaon-h/ad/fm/foodmenu/selectFoodMenuView.do?mi=5369', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `schDt=${targetDate}`
    });

    const html = await res.text();
    const theadMatch = html.match(/<thead>[\s\S]*?<\/thead>/i);
    if (!theadMatch) return {};
    const dates = [...theadMatch[0].matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0]);

    const tbodyMatch = html.match(/<tbody>[\s\S]*?<\/tbody>/i);
    if (!tbodyMatch) return {};
    const rows = [...tbodyMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)];

    const weekMeals = {};
    dates.forEach(d => {
      const ymd = d.replace(/-/g, '');
      weekMeals[ymd] = {
        '1': null,
        '2': null,
        '3': null
      };
    });

    for (const r of rows) {
      const rHtml = r[0];
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

        // Check calorie
        const calMatch = td.match(/([0-9.]+)\s*Kcal/i);
        const calories = calMatch ? `${calMatch[1]} kcal` : '열량 정보 없음';

        // Check dish lines
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
            // Smart main dish detector
            const proteinKeywords = [
              '갈비', '불고기', '찜닭', '닭갈비', '치킨', '스테이크', '까스', '커틀렛', 
              '탕수육', '볶음', '구이', '조림', '새우', '오리', '삼겹살', '고기', '소고기', 
              '돈육', '제육', '돼지', '연어', '장어', '낙지', '오징어', '해물', '스파게티', 
              '파스타', '피자', '떡볶이', '곱도리탕', '마라'
            ];
            
            let mainDish = '';
            for (const dish of dishes) {
              if (proteinKeywords.some(kw => dish.includes(kw))) {
                mainDish = dish;
                break;
              }
            }
            if (!mainDish) {
              if (dishes.length > 2 && (dishes[0].includes('밥') || dishes[0].includes('죽'))) {
                mainDish = dishes[2];
              } else if (dishes.length > 1 && dishes[0].includes('밥')) {
                mainDish = dishes[1];
              } else {
                mainDish = dishes[0];
              }
            }

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

    return weekMeals;
  } catch (err) {
    console.error('Error scraping date ' + targetDate + ':', err.message);
    return {};
  }
}

async function run() {
  const dates = [
    '2026-08-24', '2026-08-31',
    '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28',
    '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'
  ];
  const allMeals = {};

  for (const d of dates) {
    const wm = await scrapeWeek(d);
    Object.assign(allMeals, wm);
  }

  // Filter out days that have no meals at all (weekends)
  const filtered = {};
  for (const [ymd, meals] of Object.entries(allMeals)) {
    if (meals['1'] || meals['2'] || meals['3']) {
      filtered[ymd] = meals;
    }
  }

  console.log('Scraped dates count:', Object.keys(filtered).length);
  console.log('Available dates:', Object.keys(filtered));
  fs.writeFileSync('meals.json', JSON.stringify(filtered, null, 2), 'utf-8');
  console.log('Saved to meals.json!');
}

run();
