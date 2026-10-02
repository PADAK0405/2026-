/**
 * 2026 학급 포털 - 주간 및 일별 급식 식단표 (Weekly & Daily Meal Engine)
 * 
 * - 가온고등학교(7530907) 사이트 100% 실시간 식단 직접 연동
 * - 하드코딩 0개! Cloudflare Worker API를 통해 학교 사이트에서 실시간으로 직접 뽑아옵니다.
 * - [주단위 보기]:
 *   - 주차별 탐색 (‹ 이전 주 / 이번 주 / 다음 주 ›)
 *   - 평일 5일 (월·화·수·목·금) 요일 버튼 바 & '오늘' 스마트 인디케이터
 *   - [일별 상세] 3열 카드 뷰 (조·중·석식 상세, 지금 식사 실시간 하이라이트)
 *   - [주간 한눈에] 5일치 종합 식단표 보드 뷰 (중식 중심 대표메뉴 & 조·석식 요약)
 */

(function () {
  'use strict';

  const CONFIG = {
    // Cloudflare Worker 주소 (배포한 Worker URL을 여기에 입력)
    workerApiUrl: 'https://gaon-meal-api.pgwcoding1.workers.dev/',
    officeCode: 'J10',
    schoolCode: '7530907', // 가온고등학교 NEIS 행정코드
    neisBaseUrl: 'https://open.neis.go.kr/hub/mealServiceDietInfo',
    gaonWebUrl: 'https://gaon-h.goean.kr/gaon-h/ad/fm/foodmenu/selectFoodMenuView.do?mi=5369'
  };

  // 실시간 식단 런타임 메모리 DB (하드코딩 데이터 없음, Worker API에서 실시간 수신)
  let runtimeMealsDb = {};

  // 2자리 숫자 패딩
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // YYYYMMDD 포맷 문자열 반환
  function formatYMD(date) {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}${m}${d}`;
  }

  // YYYY-MM-DD 포맷 문자열 반환
  function formatDashYMD(date) {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}-${m}-${d}`;
  }

  // 기준 날짜가 속한 주의 월요일 Date 객체 반환 (월요일 00:00:00)
  function getMondayOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    // 일요일(0)이면 -6일, 월요일(1)이면 0일, 화(2)면 -1일...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // 주간 평일(월~금 5일) 메타데이터 배열 생성
  function getWeekDaysInfo(mondayDate, todayYmd) {
    const dayNames = ['월', '화', '수', '목', '금'];
    const list = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(mondayDate);
      d.setDate(mondayDate.getDate() + i);
      const ymd = formatYMD(d);
      const m = d.getMonth() + 1;
      const dt = d.getDate();
      list.push({
        dateObj: d,
        ymd: ymd,
        dayName: dayNames[i],
        monthDay: `${pad2(m)}.${pad2(dt)}`,
        displayFull: `${d.getFullYear()}.${pad2(m)}.${pad2(dt)} (${dayNames[i]})`,
        shortFull: `${m}월 ${dt}일 (${dayNames[i]})`,
        isToday: ymd === todayYmd
      });
    }
    return list;
  }

  // 현재 시각 기준 현재 끼니 코드 계산 (오늘 날짜일 때만 유효)
  function getActiveMealCode(dateObj = new Date()) {
    const totalMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
    if (totalMinutes <= 8 * 60) {
      return '1'; // 00:00 ~ 08:00 : 조식
    } else if (totalMinutes <= 13 * 60 + 30) {
      return '2'; // 08:00 ~ 13:30 : 중식
    } else if (totalMinutes <= 18 * 60 + 30) {
      return '3'; // 13:30 ~ 18:30 : 석식
    }
    return 'none'; // 18:30 이후 : 당일 식사 마감
  }

  function getEmptyMeal(code, name, isLoading = false) {
    const timeLabels = {
      '1': '오전 8:00까지',
      '2': '오후 1:30까지',
      '3': '오후 6:30까지'
    };
    return {
      code,
      name,
      timeLabel: timeLabels[code] || '',
      calories: isLoading ? '조회 중...' : '미운영',
      mainDish: '',
      dishes: isLoading ? ['실시간 식단을 불러오는 중...'] : ['급식 미운영 (식단 없음)'],
      isLoading: isLoading
    };
  }

  /**
   * Cloudflare Worker API로부터 실시간 식단 데이터 동기화
   */
  async function fetchLiveMealsFromWorker(mondayDate) {
    const mondayYmd = formatYMD(mondayDate);
    const targetDateStr = formatDashYMD(mondayDate);

    // 1. 세션 캐시 확인
    const cachedAll = sessionStorage.getItem('gaon_worker_all_meals');
    if (cachedAll) {
      try {
        const parsed = JSON.parse(cachedAll);
        runtimeMealsDb = Object.assign({}, runtimeMealsDb, parsed);
        if (runtimeMealsDb[mondayYmd]) {
          return runtimeMealsDb[mondayYmd];
        }
      } catch (e) { }
    }

    // 2. Cloudflare Worker API 호출
    if (CONFIG.workerApiUrl && CONFIG.workerApiUrl.trim().length > 0) {
      try {
        const workerUrl = `${CONFIG.workerApiUrl.replace(/\/$/, '')}?date=${targetDateStr}`;
        const res = await fetch(workerUrl);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            runtimeMealsDb = Object.assign({}, runtimeMealsDb, json.data);
            try {
              sessionStorage.setItem('gaon_worker_all_meals', JSON.stringify(runtimeMealsDb));
            } catch (e) { }
            return json.data;
          }
        }
      } catch (err) {
        console.warn('[Meal Engine] Cloudflare Worker 호출 실패:', err);
      }
    }

    // 3. Worker 미설정 시 NEIS API 안전 폴백
    try {
      const fridayDate = new Date(mondayDate);
      fridayDate.setDate(fridayDate.getDate() + 4);
      const fridayYmd = formatYMD(fridayDate);
      const neisUrl = `${CONFIG.neisBaseUrl}?Type=json&ATPT_OFCDC_SC_CODE=${CONFIG.officeCode}&SD_SCHUL_CODE=${CONFIG.schoolCode}&MLSV_FROM_YMD=${mondayYmd}&MLSV_TO_YMD=${fridayYmd}`;
      const res = await fetch(neisUrl);
      if (res.ok) {
        const json = await res.json();
        if (json.mealServiceDietInfo && Array.isArray(json.mealServiceDietInfo) && json.mealServiceDietInfo[1]?.row) {
          const rows = json.mealServiceDietInfo[1].row;
          rows.forEach(row => {
            const ymd = String(row.MLSV_YMD);
            const code = String(row.MMEAL_SC_CODE);
            const rawDish = (row.DDISH_NM || '').split(/<br\s*\/?>|\r\n|\n/gi).map(s => s.replace(/<[^>]+>/g, '').replace(/\([0-9.,\s*]+\)/g, '').replace(/[*#]/g, '').trim()).filter(Boolean);
            if (rawDish.length > 0) {
              if (!runtimeMealsDb[ymd]) {
                runtimeMealsDb[ymd] = {
                  '1': getEmptyMeal('1', '조식'),
                  '2': getEmptyMeal('2', '중식'),
                  '3': getEmptyMeal('3', '석식')
                };
              }
              const rawCal = (row.CAL_INFO || '').replace(/[^0-9.]/g, '');
              runtimeMealsDb[ymd][code] = {
                code: code,
                name: code === '1' ? '조식' : code === '2' ? '중식' : '석식',
                timeLabel: code === '1' ? '오전 8:00까지' : code === '2' ? '오후 1:30까지' : '오후 6:30까지',
                calories: rawCal ? `${Math.round(parseFloat(rawCal))} kcal` : '열량 정보 없음',
                mainDish: rawDish[0] || '',
                dishes: rawDish
              };
            }
          });
        }
      }
    } catch (e) { }

    return null;
  }

  /**
   * 해당 일자의 급식 데이터를 메모리에서 반환합니다.
   */
  function getDayMealsFromMemory(ymd, isLoading = false) {
    const baseDay = runtimeMealsDb[ymd];
    if (baseDay) {
      return {
        '1': baseDay['1'] ? { ...baseDay['1'] } : getEmptyMeal('1', '조식', false),
        '2': baseDay['2'] ? { ...baseDay['2'] } : getEmptyMeal('2', '중식', false),
        '3': baseDay['3'] ? { ...baseDay['3'] } : getEmptyMeal('3', '석식', false)
      };
    }
    return {
      '1': getEmptyMeal('1', '조식', isLoading),
      '2': getEmptyMeal('2', '중식', isLoading),
      '3': getEmptyMeal('3', '석식', isLoading)
    };
  }

  /**
   * 주간 및 일별 급식 통합 컨트롤러 (Creative Weekly Meal Engine)
   */
  class CreativeWeeklyMealCard {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) return;

      const now = new Date();
      this.todayYmd = formatYMD(now);
      this.activeMealCode = getActiveMealCode(now);

      // 주말(토, 일) 접속 시 다음 주 월요일로 자동 안내
      const dayOfWeek = now.getDay();
      if (dayOfWeek === 6) { // 토요일: 다음 주 월요일
        const nextMon = new Date(now);
        nextMon.setDate(now.getDate() + 2);
        this.currentMonday = getMondayOfWeek(nextMon);
        this.selectedYmd = formatYMD(nextMon);
      } else if (dayOfWeek === 0) { // 일요일: 다음 주 월요일
        const nextMon = new Date(now);
        nextMon.setDate(now.getDate() + 1);
        this.currentMonday = getMondayOfWeek(nextMon);
        this.selectedYmd = formatYMD(nextMon);
      } else { // 평일: 이번 주 월요일 및 오늘 날짜
        this.currentMonday = getMondayOfWeek(now);
        this.selectedYmd = this.todayYmd;
      }

      this.viewMode = 'day'; // 'day' (일별 상세 3열) | 'week' (주간 한눈에 5일 그리드)
      this.mealsCache = {};
      this.isLoading = true;

      this.init();
    }

    async init() {
      // 1. 초기 렌더링 (캐시 데이터 또는 로딩 상태 표시)
      this.updateLocalCache();
      this.render();

      // 2. 실시간 Worker API 데이터 fetch
      await this.syncLiveWeekData();
      this.isLoading = false;
      this.updateLocalCache();
      this.render();
    }

    updateLocalCache() {
      const weekDays = getWeekDaysInfo(this.currentMonday, this.todayYmd);
      weekDays.forEach(day => {
        this.mealsCache[day.ymd] = getDayMealsFromMemory(day.ymd, this.isLoading);
      });
    }

    async syncLiveWeekData() {
      await fetchLiveMealsFromWorker(this.currentMonday);
      const weekDays = getWeekDaysInfo(this.currentMonday, this.todayYmd);
      weekDays.forEach(day => {
        this.mealsCache[day.ymd] = getDayMealsFromMemory(day.ymd, false);
      });
    }

    // 주차 이동 (+1: 다음 주, -1: 이전 주)
    async changeWeek(delta) {
      const newMon = new Date(this.currentMonday);
      newMon.setDate(newMon.getDate() + delta * 7);
      this.currentMonday = newMon;

      const weekDays = getWeekDaysInfo(this.currentMonday, this.todayYmd);
      const todayInWeek = weekDays.find(d => d.isToday);
      if (todayInWeek) {
        this.selectedYmd = this.todayYmd;
      } else {
        this.selectedYmd = weekDays[0].ymd;
      }

      this.isLoading = true;
      await this.init();
    }

    // 오늘이 속한 주로 즉시 복귀
    async goThisWeek() {
      const now = new Date();
      this.currentMonday = getMondayOfWeek(now);
      this.selectedYmd = this.todayYmd;
      this.isLoading = true;
      await this.init();
    }

    // 특정 요일 선택
    selectDay(ymd) {
      this.selectedYmd = ymd;
      this.viewMode = 'day';
      this.render();
    }

    // 뷰 모드 토글 ('day' <-> 'week')
    setViewMode(mode) {
      this.viewMode = mode;
      this.render();
    }

    // 특정 날짜의 3끼니 데이터 반환
    getDayMealData(ymd) {
      if (this.mealsCache[ymd]) return this.mealsCache[ymd];
      return getDayMealsFromMemory(ymd, this.isLoading);
    }

    render() {
      const weekDays = getWeekDaysInfo(this.currentMonday, this.todayYmd);
      const startDay = weekDays[0];
      const endDay = weekDays[4];
      const weekRangeText = `${startDay.monthDay} (${startDay.dayName}) ~ ${endDay.monthDay} (${endDay.dayName})`;

      let selectedDayInfo = weekDays.find(d => d.ymd === this.selectedYmd);
      if (!selectedDayInfo) {
        selectedDayInfo = weekDays[0];
        this.selectedYmd = selectedDayInfo.ymd;
      }

      // 1. 헤더 HTML
      const headerHtml = `
        <div class="panel-header meal-header-wrap">
          <div class="meal-header-left">
            <h2 id="meal-heading" class="panel-title">주간 급식 식단표</h2>
            <span class="meal-date-tag mono-text" title="현재 표시 중인 주간 기간">${weekRangeText}</span>
          </div>

          <div class="meal-header-actions">
            <!-- 뷰 모드 토글 (일별 상세 vs 주간 한눈에) -->
            <div class="meal-view-toggle" role="group" aria-label="식단 보기 모드">
              <button id="btn-mode-day" type="button" class="btn-meal-mode ${this.viewMode === 'day' ? 'is-active' : ''}" aria-pressed="${this.viewMode === 'day'}">
                <span>일별 상세</span>
              </button>
              <button id="btn-mode-week" type="button" class="btn-meal-mode ${this.viewMode === 'week' ? 'is-active' : ''}" aria-pressed="${this.viewMode === 'week'}">
                <span>주간 한눈에</span>
              </button>
            </div>

            <a href="${CONFIG.gaonWebUrl}" target="_blank" rel="noopener noreferrer" class="panel-action-link" aria-label="가온고 공식 주간식단표 새창 열기" title="학교 공식 식단안내">
              <span>학교식단표</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </a>
          </div>
        </div>
      `;

      // 2. 주간 네비게이션 & 요일 버튼 바 HTML (클린 5분할 버튼)
      const weekdayButtonsHtml = weekDays.map(d => {
        const isSelected = d.ymd === this.selectedYmd && this.viewMode === 'day';
        return `
          <button type="button" class="btn-weekday ${isSelected ? 'is-selected' : ''} ${d.isToday ? 'is-today' : ''}" data-ymd="${d.ymd}" aria-label="${d.displayFull} 식단 선택">
            <span class="weekday-name">${d.dayName}</span>
            <span class="weekday-date mono-text">${d.monthDay}</span>
            ${d.isToday ? '<span class="weekday-today-chip">오늘</span>' : ''}
          </button>
        `;
      }).join('');

      const toolbarHtml = `
        <div class="meal-week-toolbar">
          <div class="meal-nav-row">
            <div class="meal-nav-actions" role="group" aria-label="주간 이동 컨트롤">
              <button id="btn-meal-prev-week" type="button" class="btn-week-nav" aria-label="이전 주 급식 보기">
                <span>‹ 이전 주</span>
              </button>
              <button id="btn-meal-this-week" type="button" class="btn-week-nav btn-week-today" aria-label="이번 주 급식으로 복귀">
                <span>이번 주</span>
              </button>
              <button id="btn-meal-next-week" type="button" class="btn-week-nav" aria-label="다음 주 급식 보기">
                <span>다음 주 ›</span>
              </button>
            </div>
          </div>

          <div class="meal-weekday-buttons">
            ${weekdayButtonsHtml}
          </div>
        </div>
      `;

      // 3. 본문 뷰 렌더링
      let bodyHtml = '';
      if (this.viewMode === 'day') {
        bodyHtml = this.renderDayView(selectedDayInfo);
      } else {
        bodyHtml = this.renderWeekView(weekDays);
      }

      this.container.innerHTML = headerHtml + toolbarHtml + bodyHtml;

      // 4. 이벤트 리스너 바인딩
      this.bindEvents();
    }

    // [모드 1] 일별 상세 3열 뷰 렌더링
    renderDayView(dayInfo) {
      const meals = this.getDayMealData(dayInfo.ymd);
      const isSelectedDayToday = dayInfo.isToday;
      const mealCodes = ['1', '2', '3'];

      const mealIcons = {
        '1': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
        '2': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/></svg>`,
        '3': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
      };

      const columnsHtml = mealCodes.map(code => {
        const meal = meals[code] || getEmptyMeal(code, code === '1' ? '조식' : code === '2' ? '중식' : '석식', this.isLoading);
        const isCurrent = isSelectedDayToday && (this.activeMealCode === code);
        const dishes = meal.dishes || [];
        const isOperated = dishes.length > 0 && !dishes[0].includes('미운영') && !dishes[0].includes('불러오는');

        const dishItemsHtml = isOperated ? dishes.map(dish => {
          const isHighlight = meal.mainDish && dish === meal.mainDish;
          return `
            <li class="dish-row ${isHighlight ? 'dish-highlight' : ''}">
              <span class="dish-dot" aria-hidden="true"></span>
              <span class="dish-text">${dish}</span>
              ${isHighlight ? '<span class="dish-tag">메인</span>' : ''}
            </li>
          `;
        }).join('') : `
          <li class="dish-row" style="color: var(--color-ink-muted); justify-content: center; padding: 1.5rem 0; font-size: 0.85rem;">
            <span>${dishes[0] || (this.isLoading ? '실시간 식단을 불러오는 중...' : '급식 미운영')}</span>
          </li>
        `;

        return `
          <div class="creative-meal-card ${isCurrent ? 'is-active-meal' : ''}">
            <div class="meal-card-top">
              <div class="meal-title-group">
                <span class="meal-icon-pill" aria-hidden="true">${mealIcons[code]}</span>
                <span class="meal-time-title">${meal.name}</span>
              </div>

              ${isCurrent ? `
                <span class="meal-badge-current mono-text">지금 식사</span>
              ` : `
                <span class="meal-cal-badge mono-text">${meal.calories || ''}</span>
              `}
            </div>

            ${isCurrent ? `
              <div class="meal-calorie-strip mono-text">
                <span>열량</span>
                <span class="meal-cal-num">${meal.calories || '-'}</span>
              </div>
            ` : ''}

            <ul class="dish-list-wrap">
              ${dishItemsHtml}
            </ul>
          </div>
        `;
      }).join('');

      return `
        <div class="selected-day-banner">
          <div class="selected-day-title">
            <span>${dayInfo.displayFull} 식단 안내</span>
            ${isSelectedDayToday ? '<span class="selected-day-indicator">오늘 식단</span>' : ''}
          </div>
          <div style="font-size: 0.72rem; color: var(--color-ink-muted);">
            ${this.isLoading ? '실시간 식단 조회 중...' : '조식 · 중식 · 석식 실시간 연동'}
          </div>
        </div>

        <div class="creative-meal-grid">
          ${columnsHtml}
        </div>
      `;
    }

    // [모드 2] 주간 한눈에 5일치 그리드 뷰 렌더링
    renderWeekView(weekDays) {
      const cardsHtml = weekDays.map(d => {
        const meals = this.getDayMealData(d.ymd);
        const lunch = meals['2'] || getEmptyMeal('2', '중식', this.isLoading);
        const breakfast = meals['1'] || getEmptyMeal('1', '조식', this.isLoading);
        const dinner = meals['3'] || getEmptyMeal('3', '석식', this.isLoading);

        const lunchDishes = lunch.dishes || [];
        const isLunchOperated = lunchDishes.length > 0 && !lunchDishes[0].includes('미운영') && !lunchDishes[0].includes('불러오는');
        const hasAnyMeal = (breakfast.dishes?.length > 0 && !breakfast.dishes[0].includes('미운영') && !breakfast.dishes[0].includes('불러오는')) ||
          isLunchOperated ||
          (dinner.dishes?.length > 0 && !dinner.dishes[0].includes('미운영') && !dinner.dishes[0].includes('불러오는'));

        const lunchSummaryDishes = lunchDishes.slice(0, 4).join(', ');
        const bkMain = breakfast.mainDish || (breakfast.dishes && breakfast.dishes[0] && !breakfast.dishes[0].includes('미운영') ? breakfast.dishes[0] : (this.isLoading ? '조회 중...' : '미운영'));
        const dinMain = dinner.mainDish || (dinner.dishes && dinner.dishes[0] && !dinner.dishes[0].includes('미운영') ? dinner.dishes[0] : (this.isLoading ? '조회 중...' : '미운영'));

        return `
          <div class="weekly-day-card ${d.isToday ? 'is-today-card' : ''}" data-ymd="${d.ymd}" title="클릭하여 ${d.dayName}요일 상세 식단 보기">
            <div class="weekly-card-header">
              <div class="weekly-card-daytitle">
                <span class="weekly-card-name">${d.dayName}</span>
                <span class="weekly-card-date mono-text">${d.monthDay}</span>
                ${d.isToday ? '<span class="weekly-card-badge-today">오늘</span>' : ''}
              </div>
              <button type="button" class="weekly-card-btn-zoom" data-ymd="${d.ymd}" aria-label="${d.dayName}요일 상세 보기">
                상세 ↗
              </button>
            </div>

            ${hasAnyMeal ? `
              <div class="weekly-sections-wrap">
                <!-- 중식 (점심) 강조 박스 -->
                <div class="weekly-lunch-box">
                  <div class="weekly-box-top">
                    <span class="weekly-meal-name">☀️ 중식 (점심)</span>
                    <span class="weekly-cal-text mono-text">${lunch.calories || ''}</span>
                  </div>
                  <div class="weekly-main-dish">${lunch.mainDish || (this.isLoading ? '식단 조회 중...' : '식단 정보 참조')}</div>
                  <div class="weekly-dish-summary">${lunchSummaryDishes || '메뉴 정보 없음'}</div>
                </div>

                <!-- 조식 요약 -->
                <div class="weekly-mini-box">
                  <div class="weekly-mini-title">
                    <span>🌅 조식 (아침)</span>
                    <span class="mono-text" style="font-size: 0.62rem;">${breakfast.calories || ''}</span>
                  </div>
                  <div class="weekly-mini-dish">${bkMain}</div>
                </div>

                <!-- 석식 요약 -->
                <div class="weekly-mini-box">
                  <div class="weekly-mini-title">
                    <span>🌙 석식 (저녁)</span>
                    <span class="mono-text" style="font-size: 0.62rem;">${dinner.calories || ''}</span>
                  </div>
                  <div class="weekly-mini-dish">${dinMain}</div>
                </div>
              </div>
            ` : `
              <div class="weekly-empty-day">
                <span>${this.isLoading ? '실시간 식단 조회 중...' : '급식 미운영'}<br><small style="color: var(--color-ink-muted); font-size: 0.72rem;">${this.isLoading ? '잠시만 기다려주세요' : '(공휴일 / 재량휴업)'}</small></span>
              </div>
            `}
          </div>
        `;
      }).join('');

      return `
        <div class="weekly-meals-grid">
          ${cardsHtml}
        </div>
      `;
    }

    // 인터랙션 이벤트 핸들러 바인딩
    bindEvents() {
      // 뷰 모드 토글
      const btnModeDay = this.container.querySelector('#btn-mode-day');
      const btnModeWeek = this.container.querySelector('#btn-mode-week');
      if (btnModeDay) {
        btnModeDay.addEventListener('click', () => this.setViewMode('day'));
      }
      if (btnModeWeek) {
        btnModeWeek.addEventListener('click', () => this.setViewMode('week'));
      }

      // 주간 이동 버튼
      const btnPrev = this.container.querySelector('#btn-meal-prev-week');
      const btnThis = this.container.querySelector('#btn-meal-this-week');
      const btnNext = this.container.querySelector('#btn-meal-next-week');
      if (btnPrev) btnPrev.addEventListener('click', () => this.changeWeek(-1));
      if (btnThis) btnThis.addEventListener('click', () => this.goThisWeek());
      if (btnNext) btnNext.addEventListener('click', () => this.changeWeek(1));

      // 요일 선택 버튼
      const weekdayBtns = this.container.querySelectorAll('.btn-weekday, .btn-weekday-pill');
      weekdayBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const ymd = btn.getAttribute('data-ymd');
          if (ymd) this.selectDay(ymd);
        });
      });

      // 주간 카드 클릭 시 상세 전환
      const weekCards = this.container.querySelectorAll('.weekly-day-card');
      weekCards.forEach(card => {
        card.addEventListener('click', () => {
          const ymd = card.getAttribute('data-ymd');
          if (ymd) this.selectDay(ymd);
        });
      });
    }
  }

  window.TodayMealCard = CreativeWeeklyMealCard;

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('today-meal-card')) {
      new CreativeWeeklyMealCard('today-meal-card');
    }
  });

})();
