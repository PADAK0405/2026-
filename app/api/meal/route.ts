import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface MealDetail {
  code: "1" | "2" | "3";
  name: "조식" | "중식" | "석식";
  menu: string[];
  rawMenu: string[];
  calorie: string | null;
  photoUrl: string | null;
}

export interface MealApiResponse {
  date: string;
  meals: {
    breakfast: MealDetail | null;
    lunch: MealDetail | null;
    dinner: MealDetail | null;
  };
}

const GAON_BASE_URL = "https://gaon-h.goean.kr";
const MENU_VIEW_URL = `${GAON_BASE_URL}/gaon-h/ad/fm/foodmenu/selectFoodMenuView.do?mi=5369`;
const FOOD_DATA_URL = `${GAON_BASE_URL}/gaon-h/ad/fm/foodmenu/selectFoodData.do`;

/**
 * 알레르기 유발 번호 및 특수문자 제거
 * 예: "토란탕.**가을 (5.6.16)" -> "토란탕"
 */
function cleanMenuText(rawLines: string[]): { cleanMenu: string[]; rawMenu: string[] } {
  const cleanMenu: string[] = [];
  const rawMenu: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rawMenu.push(trimmed);

    let cleaned = trimmed.replace(/\([0-9.,\s*]+\)/g, "");
    cleaned = cleaned.replace(/[*#]/g, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    if (cleaned.length > 0) {
      cleanMenu.push(cleaned);
    }
  }

  return { cleanMenu, rawMenu };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // 한국 표준시(KST) 기준 오늘 날짜 기본값 (YYYY-MM-DD)
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const targetDate = searchParams.get("date") || today;

    // -------------------------------------------------------------------------
    // Step 1: 가온고 주간 식단 HTML 조회
    // -------------------------------------------------------------------------
    const viewRes = await fetch(MENU_VIEW_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      body: new URLSearchParams({
        schDt: targetDate,
        restSeq: "",
        schSysId: "",
      }).toString(),
      next: { revalidate: 3600 },
    });

    if (!viewRes.ok) {
      throw new Error(`주간 식단 페이지 조회 실패 (Status: ${viewRes.status})`);
    }

    const html = await viewRes.text();
    const $ = cheerio.load(html);

    // -------------------------------------------------------------------------
    // Step 2: 당일 조식/중식/석식의 fmSeq 파싱
    // -------------------------------------------------------------------------
    const headerDates: string[] = [];
    $("table thead tr th").each((_, th) => {
      const text = $(th).text();
      const match = text.match(/\d{4}-\d{2}-\d{2}/);
      if (match) {
        headerDates.push(match[0]);
      }
    });

    const targetDateIndex = headerDates.indexOf(targetDate);
    const mealFmSeqs: { [key in "조식" | "중식" | "석식"]?: string } = {};

    if (targetDateIndex !== -1) {
      $("table tbody tr").each((_, tr) => {
        const rowHeader = $(tr).find("th").first().text().trim();
        if (rowHeader.includes("조식") || rowHeader.includes("중식") || rowHeader.includes("석식")) {
          const mealKey = (rowHeader.includes("조식") ? "조식" : rowHeader.includes("중식") ? "중식" : "석식") as "조식" | "중식" | "석식";
          const targetTd = $(tr).find("td").eq(targetDateIndex);

          const tdHtml = targetTd.html() || "";
          const seqMatch = tdHtml.match(/fn_layer_pop_trigger2\([^,]+,\s*['"]?(\d+)['"]?\)/) ||
                           tdHtml.match(/fn_food_view\(['"]?(\d+)['"]?\)/) ||
                           tdHtml.match(/['"](\d{4,})['"]/);

          if (seqMatch) {
            mealFmSeqs[mealKey] = seqMatch[1];
          }
        }
      });
    }

    // -------------------------------------------------------------------------
    // Step 3: 각 끼니별 상세 식단 JSON 병렬 호출 (Promise.allSettled)
    // -------------------------------------------------------------------------
    const mealKeys: Array<{ code: "1" | "2" | "3"; name: "조식" | "중식" | "석식"; key: "breakfast" | "lunch" | "dinner" }> = [
      { code: "1", name: "조식", key: "breakfast" },
      { code: "2", name: "중식", key: "lunch" },
      { code: "3", name: "석식", key: "dinner" },
    ];

    const results = await Promise.allSettled(
      mealKeys.map(async (m) => {
        const seq = mealFmSeqs[m.name];
        if (!seq) return null;

        const detailRes = await fetch(FOOD_DATA_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          body: `fmSeq=${encodeURIComponent(seq)}`,
          next: { revalidate: 3600 },
        });

        if (!detailRes.ok) return null;

        const data = await detailRes.json();
        const rawContent = data.fmCn || "";
        const rawLines = rawContent.split(/\r\n|\n|\r/);
        const { cleanMenu, rawMenu } = cleanMenuText(rawLines);

        const rawTitle = (data.fmTitle || "").trim();
        const calMatch = rawTitle.match(/([0-9.]+)/);
        const calorie = calMatch ? `${calMatch[1]} kcal` : null;

        const rawPhotoPath = data.filePath || data.food?.fmcnImagePath || null;
        const photoUrl = rawPhotoPath ? (rawPhotoPath.startsWith("http") ? rawPhotoPath : `${GAON_BASE_URL}${rawPhotoPath}`) : null;

        const detail: MealDetail = {
          code: m.code,
          name: m.name,
          menu: cleanMenu,
          rawMenu: rawMenu,
          calorie: calorie,
          photoUrl: photoUrl,
        };

        return { key: m.key, detail };
      })
    );

    // -------------------------------------------------------------------------
    // Step 4: 최종 응답 조립
    // -------------------------------------------------------------------------
    const finalMeals: MealApiResponse["meals"] = {
      breakfast: null,
      lunch: null,
      dinner: null,
    };

    results.forEach((res) => {
      if (res.status === "fulfilled" && res.value) {
        finalMeals[res.value.key] = res.value.detail;
      }
    });

    const responseData: MealApiResponse = {
      date: targetDate,
      meals: finalMeals,
    };

    return NextResponse.json(responseData, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error: any) {
    console.error("[API Error] /api/meal:", error);
    return NextResponse.json(
      { error: "가온고 식단 정보를 불러오는 데 실패했습니다.", details: error.message },
      { status: 500 }
    );
  }
}
