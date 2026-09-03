/**
 * 2026 학급 포털 (Classroom Portal) - App Engine (Hallmark Workbench Stance)
 * 
 * 구글 스프레드시트 실시간 비동기 연동 파이프라인 (CSV Fetch + GViz JSONP Fallback),
 * 월간 캘린더 엔진 (단일/연속구간), 실시간 검색/필터링, 8-상태 반응형 마이크로 인터랙션, 모달 및 테마 관리
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. App State & Global Variables
  // =========================================================================
  const state = {
    page: document.body.dataset.page || 'home',
    theme: localStorage.getItem('class_portal_theme') || 'light',
    notices: [],
    events: [],
    posts: [],
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(), // 0 ~ 11
    selectedDateStr: formatDateToISO(new Date()), // 'YYYY-MM-DD'
    noticeFilter: 'all', // 'all', '공지', '알림'
    noticeSearchQuery: '',
    boardFilter: 'all', // 'all', '공지', '분실물', '선택과목', '기타'
    boardSearchQuery: '',
    activeModalItem: null
  };

  // =========================================================================
  // 2. Utility Functions
  // =========================================================================
  function padZero(num) {
    return String(num).padStart(2, '0');
  }

  function formatDateToISO(date) {
    return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
  }

  function getKoreanDayName(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[date.getDay()];
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('~')) return dateStr;
    const cleanStr = dateStr.replace(/\./g, '-').trim();
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(d.getTime())) {
        return `${parts[0]}.${padZero(parts[1])}.${padZero(parts[2])} (${getKoreanDayName(d)})`;
      }
    }
    return dateStr;
  }

  // URL을 안전하게 하이퍼링크로 치환 (XSS 방지 포함)
  function linkify(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    const escaped = div.innerHTML;
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    return escaped.replace(urlRegex, function (url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="linkified-url">${url}</a>`;
    });
  }

  // 뱃지 스타일 클래스 결정 (시트 가이드: 공지 = 빨간색, 알림 = 노란색)
  function getBadgeClass(badge) {
    if (!badge) return 'pill-default';
    const b = badge.trim();
    if (b.includes('공지') || b.includes('필독') || b.includes('긴급') || b.includes('중요')) return 'pill-notice'; // 빨간색
    if (b.includes('알림') || b.includes('안내') || b.includes('주의')) return 'pill-warning'; // 노란색
    if (b.includes('분실')) return 'pill-lost';
    if (b.includes('선택과목') || b.includes('과목')) return 'pill-subject';
    return 'pill-default';
  }

  // =========================================================================
  // 3. Theme & Branding Init
  // =========================================================================
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
      updateThemeToggleIcon(themeToggleBtn);
      themeToggleBtn.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('class_portal_theme', state.theme);
        document.documentElement.setAttribute('data-theme', state.theme);
        updateThemeToggleIcon(themeToggleBtn);
        showToast(state.theme === 'dark' ? '다크 모드로 전환되었습니다.' : '라이트 모드로 전환되었습니다.');
      });
    }
  }

  function updateThemeToggleIcon(btn) {
    btn.setAttribute('aria-label', state.theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    btn.innerHTML = state.theme === 'dark'
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }

  function initBranding() {
    const portalTitleEl = document.getElementById('portal-title');
    if (portalTitleEl && typeof CONFIG !== 'undefined' && CONFIG.portalTitle) {
      portalTitleEl.textContent = CONFIG.portalTitle;
    }

    const classBadgeEl = document.getElementById('class-badge');
    if (classBadgeEl && typeof CONFIG !== 'undefined' && CONFIG.classBadge) {
      classBadgeEl.textContent = CONFIG.classBadge;
    }

    const todayDateEl = document.getElementById('today-date-text');
    if (todayDateEl) {
      const now = new Date();
      todayDateEl.textContent = `${now.getFullYear()}.${padZero(now.getMonth() + 1)}.${padZero(now.getDate())} (${getKoreanDayName(now)})`;
    }

    const suggestionLinkEls = document.querySelectorAll('#suggestion-link');
    if (suggestionLinkEls.length && typeof CONFIG !== 'undefined' && CONFIG.googleFormUrl) {
      suggestionLinkEls.forEach(link => {
        link.href = CONFIG.googleFormUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
    }

    updateNextExamDDay();
  }

  // 실시간 다이내믹 시험 D-Day 감지 및 계산 (하드코딩 배제, 지난 시험 자동 제외)
  function updateNextExamDDay() {
    const chipEls = document.querySelectorAll('#next-exam-chip, .d-day-chip');
    if (!chipEls.length) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 시험/평가 관련 유연한 키워드 패턴 (고사, 평가, 시험, 수능, 모의, 지필, 수행, test, exam 등)
    const examKeywordRegex = /(고사|평가|시험|수능|모의|지필|수행|학력|중간|기말|진단|총괄|test|exam|midterm|final)/i;

    const candidates = [];

    for (const ev of state.events) {
      if (!ev || !ev.date) continue;

      const fullText = [ev.title, ev.badge, ev.category, ev.content].filter(Boolean).join(' ');
      if (!examKeywordRegex.test(fullText)) continue;

      const rawDate = ev.date.trim().replace(/\./g, '-');
      let startStr = rawDate;
      let endStr = rawDate;

      if (rawDate.includes('~')) {
        const parts = rawDate.split('~').map(s => s.trim());
        startStr = parts[0];
        endStr = parts[1] || parts[0];
      }

      const startParts = startStr.split('-').map(Number);
      const endParts = endStr.split('-').map(Number);
      if (startParts.length !== 3 || endParts.length !== 3) continue;

      const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2]);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      // 1. 이미 종료된 지난 시험은 자동으로 제외
      if (today.getTime() > endDate.getTime()) continue;

      // 2. D-Day 계산
      const diffTime = startDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const isOngoing = today.getTime() >= startDate.getTime() && today.getTime() <= endDate.getTime();

      candidates.push({
        title: ev.title || '시험',
        startDate,
        endDate,
        dday: Math.max(0, diffDays),
        isOngoing
      });
    }

    // 3. 다가오는 가장 빠른 시작일 순으로 정렬하여 1순위 시험 선정
    candidates.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    if (candidates.length > 0) {
      const nextExam = candidates[0];
      let ddayText = '';
      if (nextExam.isOngoing) {
        ddayText = 'D-Day (진행 중)';
      } else if (nextExam.dday === 0) {
        ddayText = 'D-Day';
      } else {
        ddayText = `D-${nextExam.dday}`;
      }

      const fullText = `🎯 ${nextExam.title} ${ddayText}`;
      chipEls.forEach(el => {
        el.textContent = fullText;
        el.style.display = 'inline-flex';
      });
    } else {
      chipEls.forEach(el => {
        el.style.display = 'none';
      });
    }
  }

  // =========================================================================
  // 4. Data Loader & Google Sheets Pipeline (CSV + GViz JSONP Fallback)
  // =========================================================================
  function extractSheetInfo(url) {
    if (!url) return null;
    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) return null;
    const sheetId = idMatch[1];
    const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return { sheetId, gid };
  }

  function parseCSV(text) {
    const lines = [];
    let row = [];
    let cell = '';
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          cell += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push(cell.trim());
        cell = '';
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') i++;
        row.push(cell.trim());
        if (row.some(c => c !== '')) lines.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(c => c !== '')) lines.push(row);
    }
    return lines;
  }

  function processParsedRows(rows) {
    if (!rows || rows.length < 2) return null;

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const findCol = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    const colCategory = findCol(['구분', '카테고리', '분류', 'category', 'type']);
    const colDate = findCol(['날짜', '일시', '일자', 'date', '기간']);
    const colTitle = findCol(['제목', '일정명', 'title', 'subject']);
    const colContent = findCol(['내용', '본문', '상세', 'content', 'desc', '비고']);
    const colAuthor = findCol(['작성자', '담당', 'author', 'writer', '이름']);
    const colBadge = findCol(['뱃지', '배지', 'badge', 'tag', '라벨']);

    const notices = [];
    const events = [];
    const posts = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const category = colCategory !== -1 && r[colCategory] ? r[colCategory].trim() : '';
      const date = colDate !== -1 && r[colDate] ? r[colDate].trim() : '';
      const title = colTitle !== -1 && r[colTitle] ? r[colTitle].trim() : '';
      const content = colContent !== -1 && r[colContent] ? r[colContent].trim() : '';
      const author = colAuthor !== -1 && r[colAuthor] ? r[colAuthor].trim() : '학급알리미';
      const badge = colBadge !== -1 && r[colBadge] ? r[colBadge].trim() : category;

      // 템플릿 가이드 행 무시 (예: [선택], [YYYY-MM-DD], 예시 행 제외)
      if (category.startsWith('[') || date.startsWith('[') || title.startsWith('[')) continue;
      if (category === '예시') continue;
      if (!title && !content && !date) continue;

      const item = {
        category: category || '공지',
        date: date,
        title: title,
        content: content,
        author: author || '학급알리미',
        badge: badge || category || '공지'
      };

      const catLower = category.toLowerCase();

      // [엄격한 구분별 라우팅]
      // 1. '일정' 또는 '학사' -> 오직 캘린더(events)에만 등록
      if (catLower.includes('일정') || catLower.includes('학사')) {
        events.push(item);
      }
      // 2. '자유게시판' 관련 키워드 -> 자유게시판(posts)에만 등록
      else if (['분실물', '선택과목', '기타', '자유', '건의', '게시판', 'q&a', '질문'].some(k => catLower.includes(k))) {
        posts.push(item);
      }
      // 3. '공지사항', '공지', '알림', '안내', '필독' -> 오직 공지사항(notices)에만 등록
      else if (catLower.includes('공지') || catLower.includes('알림') || catLower.includes('안내') || catLower.includes('필독')) {
        notices.push(item);
      }
      // 4. 구분이 비어있는 경우: 내용이 없고 날짜만 있거나 기간(~)이면 캘린더, 아니면 공지
      else {
        if (!content && (date.includes('~') || date)) {
          events.push(item);
        } else {
          notices.push(item);
        }
      }
    }

    return { notices, events, posts };
  }

  // Google Sheets GViz JSONP 로더 (로컬 file:/// 프로토콜 및 CORS 제한 Fallback)
  function loadSheetViaGviz(sheetId, gid) {
    return new Promise((resolve) => {
      const callbackName = '__classPortalGvizHandler_' + Date.now();
      const script = document.createElement('script');
      
      const timer = setTimeout(() => {
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(null);
      }, 6000);

      window[callbackName] = function (data) {
        clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);

        if (!data || !data.table || !data.table.rows) {
          resolve(null);
          return;
        }

        const table = data.table;
        const headers = table.cols.map(c => (c.label || '').trim());
        const rows = [headers];

        for (const r of table.rows) {
          if (!r.c) continue;
          const rowData = r.c.map(cell => {
            if (!cell) return '';
            if (cell.f) return cell.f.trim();
            if (cell.v !== null && cell.v !== undefined) {
              const v = cell.v;
              if (typeof v === 'string' && v.startsWith('Date(')) {
                const m = v.match(/Date\((\d+),(\d+),(\d+)\)/);
                if (m) {
                  return `${m[1]}-${padZero(Number(m[2]) + 1)}-${padZero(m[3])}`;
                }
              }
              return String(v).trim();
            }
            return '';
          });
          rows.push(rowData);
        }

        resolve(processParsedRows(rows));
      };

      script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${gid || '0'}`;
      script.onerror = () => {
        clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(null);
      };

      document.body.appendChild(script);
    });
  }

  // 실시간 시트 데이터 비동기 호출
  async function loadData() {
    let sheetData = null;
    const url = typeof CONFIG !== 'undefined' && CONFIG.googleSheetUrl ? CONFIG.googleSheetUrl.trim() : '';

    if (url) {
      const sheetInfo = extractSheetInfo(url);

      if (sheetInfo) {
        const { sheetId, gid } = sheetInfo;

        // 1. CSV Direct Export Fetch 시도
        try {
          const fetchUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
          const response = await fetch(fetchUrl);
          if (response.ok) {
            const csvText = await response.text();
            const rows = parseCSV(csvText);
            sheetData = processParsedRows(rows);
          }
        } catch (err) {
          console.warn('CSV Direct Fetch 시도 중 오류, GViz JSONP Fallback으로 전환합니다:', err);
        }

        // 2. GViz JSONP Fallback (로컬 file:/// 환경 또는 CORS 차단 시)
        if (!sheetData || (!sheetData.notices.length && !sheetData.events.length && !sheetData.posts.length)) {
          try {
            sheetData = await loadSheetViaGviz(sheetId, gid);
          } catch (gvizErr) {
            console.warn('GViz JSONP 로드 실패:', gvizErr);
          }
        }
      }
    }

    if (sheetData) {
      state.notices = sheetData.notices || [];
      state.events = sheetData.events || [];
      state.posts = sheetData.posts || [];
    } else {
      state.notices = [];
      state.events = [];
      state.posts = [];
    }

    state.notices.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    state.posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    updateNextExamDDay();
    renderPage();
  }

  // =========================================================================
  // 5. Page Renderers
  // =========================================================================
  function renderPage() {
    if (state.page === 'home') {
      renderHomeNoticeFeed();
      renderCalendar();
      renderSelectedDateSchedule();
    } else if (state.page === 'notice') {
      renderNoticePage();
    } else if (state.page === 'board') {
      renderBoardPage();
    }
  }

  // -------------------------------------------------------------------------
  // 5-1. Home Page Renderers (index.html)
  // -------------------------------------------------------------------------
  function renderHomeNoticeFeed() {
    const noticeListEl = document.getElementById('notice-list');
    const noticeCountEl = document.getElementById('notice-count');

    if (noticeCountEl) {
      noticeCountEl.textContent = `[${state.notices.length}]`;
    }

    if (!noticeListEl) return;

    if (state.notices.length === 0) {
      noticeListEl.innerHTML = `
        <div class="empty-placeholder">
          <p>등록된 공지사항이 없습니다.</p>
        </div>
      `;
      return;
    }

    const recentNotices = state.notices.slice(0, 4);
    noticeListEl.innerHTML = recentNotices.map((item, idx) => {
      const isUrgent = (item.badge || item.category || '').includes('필독');
      return `
        <article class="notice-card ${isUrgent ? 'is-urgent' : ''}" data-index="${idx}" tabindex="0" role="button" aria-label="${item.title}">
          <div class="notice-card-header">
            <div class="notice-meta-left">
              <span class="notice-pill ${getBadgeClass(item.badge || item.category)}">${item.badge || item.category || '공지'}</span>
              <span class="notice-author">${item.author || '학급알리미'}</span>
            </div>
            ${item.date ? `<time class="notice-date mono-text">${item.date}</time>` : ''}
          </div>
          <h3 class="notice-title">${item.title}</h3>
          <p class="notice-snippet">${item.content || ''}</p>
        </article>
      `;
    }).join('');

    noticeListEl.querySelectorAll('.notice-card').forEach((card, idx) => {
      card.addEventListener('click', () => openModal(recentNotices[idx]));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(recentNotices[idx]);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 5-2. Calendar Engine (index.html)
  // -------------------------------------------------------------------------
  function renderCalendar() {
    const calTitleEl = document.getElementById('calendar-title');
    const calGridEl = document.getElementById('calendar-grid');
    if (!calTitleEl || !calGridEl) return;

    const year = state.currentYear;
    const month = state.currentMonth;

    calTitleEl.textContent = `${year}.${padZero(month + 1)}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDate = new Date(year, month, 0).getDate();

    const today = new Date();
    const todayISO = formatDateToISO(today);

    let html = '';

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDate - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const prevISO = formatDateToISO(prevDate);
      html += createCalendarDayCell(prevISO, dayNum, true, false);
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dateISO = formatDateToISO(dateObj);
      const isToday = dateISO === todayISO;
      const isSelected = dateISO === state.selectedDateStr;
      html += createCalendarDayCell(dateISO, day, false, isToday, isSelected);
    }

    const totalCellsSoFar = firstDayIndex + totalDaysInMonth;
    const nextPadding = totalCellsSoFar <= 35 ? 35 - totalCellsSoFar : 42 - totalCellsSoFar;
    for (let day = 1; day <= nextPadding; day++) {
      const nextDate = new Date(year, month + 1, day);
      const nextISO = formatDateToISO(nextDate);
      html += createCalendarDayCell(nextISO, day, true, false);
    }

    calGridEl.innerHTML = html;

    calGridEl.querySelectorAll('.cal-day-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const clickedISO = cell.dataset.date;
        state.selectedDateStr = clickedISO;
        renderCalendar();
        renderSelectedDateSchedule();
      });
    });
  }

  function getEventsForDate(dateISO) {
    if (!dateISO) return [];
    return state.events.filter(ev => {
      if (!ev.date) return false;
      const d = ev.date.trim();
      if (d.includes('~')) {
        const [start, end] = d.split('~').map(s => s.trim().replace(/\./g, '-'));
        return dateISO >= start && dateISO <= end;
      }
      return d.replace(/\./g, '-') === dateISO;
    });
  }

  function createCalendarDayCell(dateISO, dayNum, isOtherMonth, isToday, isSelected) {
    const d = new Date(dateISO);
    const dayOfWeek = d.getDay();
    const dayEvents = getEventsForDate(dateISO);

    let classes = ['cal-day-cell'];
    if (isOtherMonth) classes.push('other-month');
    if (dayOfWeek === 0) classes.push('is-sun');
    if (dayOfWeek === 6) classes.push('is-sat');
    if (isToday) classes.push('is-today');
    if (isSelected) classes.push('is-selected');

    let eventsHtml = '';
    if (dayEvents.length > 0) {
      const dots = dayEvents.slice(0, 3).map(ev => {
        let dotClass = 'cal-event-dot';
        if (ev.badge === '시험' || ev.title.includes('고사')) dotClass += ' dot-exam';
        else if (ev.badge === '휴일' || ev.badge === '방학') dotClass += ' dot-holiday';
        else if (ev.badge === '행사' || ev.title.includes('여행')) dotClass += ' dot-event';
        return `<span class="${dotClass}" title="${ev.title}"></span>`;
      }).join('');

      const firstTitle = dayEvents[0].title;
      eventsHtml = `
        <div class="cal-events-wrap">
          <div class="cal-dots-row">${dots}</div>
          <span class="cal-event-ribbon">${firstTitle}</span>
        </div>
      `;
    }

    return `
      <div class="${classes.join(' ')}" data-date="${dateISO}" role="button" tabindex="0">
        <span class="cal-day-num mono-text">${dayNum}</span>
        ${eventsHtml}
      </div>
    `;
  }

  function renderSelectedDateSchedule() {
    const panelTitleEl = document.getElementById('selected-date-title');
    const panelListEl = document.getElementById('selected-date-list');
    if (!panelTitleEl || !panelListEl) return;

    const selISO = state.selectedDateStr;
    const parts = selISO.split('-');
    const selDateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const displayTitle = `${parts[0]}년 ${Number(parts[1])}월 ${Number(parts[2])}일 (${getKoreanDayName(selDateObj)}) 일정`;

    panelTitleEl.textContent = displayTitle;

    const dayEvents = getEventsForDate(selISO);
    if (dayEvents.length === 0) {
      panelListEl.innerHTML = `<p style="font-size: var(--text-2xs); color: var(--color-ink-muted); padding: 0.35rem 0;">등록된 학사일정이 없습니다.</p>`;
      return;
    }

    panelListEl.innerHTML = dayEvents.map(ev => `
      <div class="schedule-item">
        <span class="schedule-item-badge ${getBadgeClass(ev.badge)}">${ev.badge || '일정'}</span>
        <div class="schedule-item-content">
          <span class="schedule-item-title">${ev.title}</span>
          ${ev.content ? `<span class="schedule-item-date">${ev.content}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  function initCalendarControls() {
    const prevBtn = document.getElementById('previous-month');
    const nextBtn = document.getElementById('next-month');
    const todayBtn = document.getElementById('today-button');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.currentMonth === 0) {
          state.currentMonth = 11;
          state.currentYear--;
        } else {
          state.currentMonth--;
        }
        renderCalendar();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (state.currentMonth === 11) {
          state.currentMonth = 0;
          state.currentYear++;
        } else {
          state.currentMonth++;
        }
        renderCalendar();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        state.currentYear = now.getFullYear();
        state.currentMonth = now.getMonth();
        state.selectedDateStr = formatDateToISO(now);
        renderCalendar();
        renderSelectedDateSchedule();
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5-3. Notice Page Renderers (notice.html)
  // -------------------------------------------------------------------------
  function renderNoticePage() {
    const listEl = document.getElementById('full-notice-list');
    const countAllEl = document.getElementById('count-notice-all');
    const countNormalEl = document.getElementById('count-notice-normal');
    const countAlertEl = document.getElementById('count-notice-alert');

    const allCount = state.notices.length;
    const normalCount = state.notices.filter(n => (n.category || '').includes('공지')).length;
    const alertCount = state.notices.filter(n => ['알림', '안내', '필독', '긴급'].some(k => (n.category || '').includes(k))).length;

    if (countAllEl) countAllEl.textContent = allCount;
    if (countNormalEl) countNormalEl.textContent = normalCount;
    if (countAlertEl) countAlertEl.textContent = alertCount;

    if (!listEl) return;

    let filtered = state.notices.filter(item => {
      if (state.noticeFilter === '공지' && !(item.category || '').includes('공지')) return false;
      if (state.noticeFilter === '알림' && !['알림', '안내', '필독', '긴급'].some(k => (item.category || '').includes(k))) return false;

      if (state.noticeSearchQuery) {
        const q = state.noticeSearchQuery.toLowerCase();
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const contentMatch = (item.content || '').toLowerCase().includes(q);
        const authorMatch = (item.author || '').toLowerCase().includes(q);
        const dateMatch = (item.date || '').toLowerCase().includes(q);
        if (!titleMatch && !contentMatch && !authorMatch && !dateMatch) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-placeholder">
          <p>조건에 일치하는 공지사항이 없습니다.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map((item, idx) => {
      const isUrgent = (item.badge || item.category || '').includes('필독');
      return `
        <article class="notice-card ${isUrgent ? 'is-urgent' : ''}" data-index="${idx}" tabindex="0" role="button" aria-label="${item.title}">
          <div class="notice-card-header">
            <div class="notice-meta-left">
              <span class="notice-pill ${getBadgeClass(item.badge || item.category)}">${item.badge || item.category || '공지'}</span>
              <span class="notice-author">${item.author || '학급알리미'}</span>
            </div>
            ${item.date ? `<time class="notice-date mono-text">${item.date}</time>` : ''}
          </div>
          <h3 class="notice-title">${item.title}</h3>
          <p class="notice-snippet">${item.content || ''}</p>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('.notice-card').forEach((card, idx) => {
      card.addEventListener('click', () => openModal(filtered[idx]));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(filtered[idx]);
        }
      });
    });
  }

  function initNoticePageControls() {
    const searchInput = document.getElementById('notice-search-input');
    const filterBar = document.getElementById('notice-filter-bar');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.noticeSearchQuery = e.target.value.trim();
        renderNoticePage();
      });
    }

    if (filterBar) {
      filterBar.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          filterBar.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          state.noticeFilter = btn.dataset.filter || 'all';
          renderNoticePage();
        });
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5-4. Board Page Renderers (board.html)
  // -------------------------------------------------------------------------
  function renderBoardPage() {
    const listEl = document.getElementById('post-list');
    const countAll = document.getElementById('count-all');
    const countNotice = document.getElementById('count-notice');
    const countLost = document.getElementById('count-lost');
    const countSubject = document.getElementById('count-subject');
    const countEtc = document.getElementById('count-etc');

    const allCount = state.posts.length;
    const noticeCount = state.posts.filter(p => (p.category || '').includes('공지')).length;
    const lostCount = state.posts.filter(p => (p.category || '').includes('분실물')).length;
    const subjectCount = state.posts.filter(p => (p.category || '').includes('선택과목')).length;
    const etcCount = state.posts.filter(p => ['기타', '자유', 'q&a', '질문'].some(k => (p.category || '').includes(k))).length;

    if (countAll) countAll.textContent = allCount;
    if (countNotice) countNotice.textContent = noticeCount;
    if (countLost) countLost.textContent = lostCount;
    if (countSubject) countSubject.textContent = subjectCount;
    if (countEtc) countEtc.textContent = etcCount;

    if (!listEl) return;

    let filtered = state.posts.filter(item => {
      if (state.boardFilter !== 'all') {
        const cat = item.category || '';
        if (state.boardFilter === '기타') {
          if (!['기타', '자유', 'q&a', '질문'].some(k => cat.includes(k))) return false;
        } else if (!cat.includes(state.boardFilter)) {
          return false;
        }
      }

      if (state.boardSearchQuery) {
        const q = state.boardSearchQuery.toLowerCase();
        const titleMatch = (item.title || '').toLowerCase().includes(q);
        const contentMatch = (item.content || '').toLowerCase().includes(q);
        const authorMatch = (item.author || '').toLowerCase().includes(q);
        if (!titleMatch && !contentMatch && !authorMatch) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-placeholder" style="grid-column: 1 / -1;">
          <p>등록된 게시글이 없습니다.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map((item, idx) => `
      <article class="board-card" data-index="${idx}" tabindex="0" role="button" aria-label="${item.title}">
        <div class="board-card-top">
          <span class="notice-pill ${getBadgeClass(item.badge || item.category)}">${item.badge || item.category || '자유'}</span>
          <span class="notice-date mono-text">${item.date || ''}</span>
        </div>
        <h3 class="board-card-title">${item.title}</h3>
        <p class="board-card-body">${item.content || ''}</p>
        <div class="board-card-footer">
          <span class="board-card-author">작성자: ${item.author || '익명'}</span>
          <span class="mono-text" style="font-weight: 600; color: var(--color-primary-ink);">상세보기 →</span>
        </div>
      </article>
    `).join('');

    listEl.querySelectorAll('.board-card').forEach((card, idx) => {
      card.addEventListener('click', () => openModal(filtered[idx]));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(filtered[idx]);
        }
      });
    });
  }

  function initBoardPageControls() {
    const searchInput = document.getElementById('board-search-input');
    const filterBar = document.getElementById('category-filter-bar');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.boardSearchQuery = e.target.value.trim();
        renderBoardPage();
      });
    }

    if (filterBar) {
      filterBar.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          filterBar.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          state.boardFilter = btn.dataset.category || 'all';
          renderBoardPage();
        });
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5-5. Global Keyboard Shortcuts (Press '/' to focus search)
  // -------------------------------------------------------------------------
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        const searchInput = document.getElementById('notice-search-input') || document.getElementById('board-search-input');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
        }
      }
    });
  }

  // =========================================================================
  // 6. Modal Popup & Clipboard Toast System
  // =========================================================================
  function openModal(item) {
    if (!item) return;
    state.activeModalItem = item;

    const modalOverlay = document.getElementById('detail-modal');
    const badgeEl = document.getElementById('modal-badge');
    const titleEl = document.getElementById('modal-title');
    const authorEl = document.getElementById('modal-author');
    const dateEl = document.getElementById('modal-date');
    const bodyEl = document.getElementById('modal-body');

    if (!modalOverlay) return;

    if (badgeEl) {
      badgeEl.textContent = item.badge || item.category || '공지';
      badgeEl.className = `notice-pill ${getBadgeClass(item.badge || item.category)}`;
    }
    if (titleEl) titleEl.textContent = item.title;
    if (authorEl) authorEl.textContent = item.author ? `작성자: ${item.author}` : '';
    if (dateEl) dateEl.textContent = item.date ? formatDisplayDate(item.date) : '상시 공지';
    if (bodyEl) bodyEl.innerHTML = linkify(item.content);

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modalOverlay = document.getElementById('detail-modal');
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
      document.body.style.overflow = '';
      state.activeModalItem = null;
    }
  }

  function initModalEvents() {
    const modalOverlay = document.getElementById('detail-modal');
    const closeBtns = document.querySelectorAll('#modal-close-btn, .modal-close-trigger');
    const copyBtn = document.getElementById('modal-copy-btn');

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
      });
    }

    closeBtns.forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
        closeModal();
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (!state.activeModalItem) return;
        const textToCopy = `[${state.activeModalItem.title}]\n\n${state.activeModalItem.content}\n\n- ${state.activeModalItem.author || '학급알리미'} (${state.activeModalItem.date || ''})`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('📋 내용이 클립보드에 복사되었습니다.');
        }).catch(() => {
          showToast('복사에 실패했습니다.');
        });
      });
    }
  }

  function showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast-item mono-text';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  // =========================================================================
  // 7. App Initialization
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initBranding();
    initModalEvents();
    initKeyboardShortcuts();

    if (state.page === 'home') {
      initCalendarControls();
    } else if (state.page === 'notice') {
      initNoticePageControls();
    } else if (state.page === 'board') {
      initBoardPageControls();
    }

    loadData();
  });

})();
