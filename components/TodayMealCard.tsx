"use client";

import React, { useEffect, useState } from "react";
import { Utensils, Sunrise, Sun, Moon, Image as ImageIcon, X, Flame, AlertCircle } from "lucide-react";

export interface MealDetail {
  code: "1" | "2" | "3";
  name: "조식" | "중식" | "석식";
  menu: string[];
  rawMenu: string[];
  calorie: string | null;
  photoUrl: string | null;
}

export interface MealResponse {
  date: string;
  meals: {
    breakfast: MealDetail | null;
    lunch: MealDetail | null;
    dinner: MealDetail | null;
  };
}

type MealTab = "breakfast" | "lunch" | "dinner";

export default function TodayMealCard() {
  const [data, setData] = useState<MealResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MealTab>("lunch");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // 현재 시간에 맞춘 기본 탭 자동 선택
  useEffect(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    if (minutes < 8 * 60 + 30) {
      setActiveTab("breakfast"); // 08:30 이전 -> 조식
    } else if (minutes <= 13 * 60 + 40) {
      setActiveTab("lunch");     // 08:30 ~ 13:40 -> 중식
    } else {
      setActiveTab("dinner");    // 13:40 이후 -> 석식
    }
  }, []);

  // 식단 API 호출
  useEffect(() => {
    async function loadMeal() {
      try {
        setLoading(true);
        const res = await fetch("/api/meal");
        if (!res.ok) throw new Error("식단 데이터를 가져오지 못했습니다.");
        const json: MealResponse = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    loadMeal();
  }, []);

  const currentMeal = data?.meals[activeTab];

  const tabs: { key: MealTab; label: string; icon: React.ReactNode }[] = [
    { key: "breakfast", label: "조식", icon: <Sunrise className="w-4 h-4" /> },
    { key: "lunch", label: "중식", icon: <Sun className="w-4 h-4" /> },
    { key: "dinner", label: "석식", icon: <Moon className="w-4 h-4" /> },
  ];

  return (
    <>
      <section
        className="w-full bg-[hsl(210,16%,93%)] dark:bg-[hsl(222,18%,14%)] rounded-2xl p-6 shadow-sm border border-transparent transition-all duration-200"
        aria-labelledby="meal-heading"
      >
        {/* 카드 헤더 */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[hsl(210,14%,88%)] dark:border-[hsl(222,16%,20%)]">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-[#EA580C]" />
            <h2 id="meal-heading" className="text-xl font-bold text-[hsl(222,47%,11%)] dark:text-[hsl(210,40%,96%)]">
              오늘의 급식
            </h2>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[hsl(210,14%,88%)] dark:bg-[hsl(222,16%,22%)] text-[hsl(215,16%,42%)] dark:text-[hsl(215,20%,65%)]">
              {data?.date || "오늘"}
            </span>
          </div>

          {currentMeal?.calorie && (
            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#EA580C] bg-[#EA580C]/10 px-2.5 py-1 rounded-full border border-[#EA580C]/20">
              <Flame className="w-3 h-3" />
              {currentMeal.calorie}
            </span>
          )}
        </div>

        {/* 조식 / 중식 / 석식 세그먼트 Pill 탭 */}
        <div className="flex items-center gap-1.5 p-1 bg-[hsl(210,14%,88%)] dark:bg-[hsl(222,16%,20%)] rounded-full mb-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-semibold rounded-full transition-all duration-150 select-none ${
                  isActive
                    ? "bg-[#EA580C] text-white shadow-sm font-bold"
                    : "text-[hsl(215,16%,42%)] dark:text-[hsl(215,20%,65%)] hover:text-[hsl(222,47%,11%)] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 식단 컨텐츠 바디 */}
        <div className="min-h-[160px] flex flex-col justify-center">
          {loading ? (
            <div className="space-y-2 py-2 animate-pulse">
              <div className="h-9 bg-[hsl(210,14%,88%)] dark:bg-[hsl(222,16%,22%)] rounded-lg w-full" />
              <div className="h-9 bg-[hsl(210,14%,88%)] dark:bg-[hsl(222,16%,22%)] rounded-lg w-full" />
              <div className="h-9 bg-[hsl(210,14%,88%)] dark:bg-[hsl(222,16%,22%)] rounded-lg w-3/4" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-6 text-center text-red-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          ) : !currentMeal || currentMeal.menu.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-[hsl(215,14%,55%)]">
              <Utensils className="w-9 h-9 mb-2 opacity-50" />
              <p className="text-base font-semibold text-[hsl(222,47%,11%)] dark:text-[hsl(210,40%,96%)] mb-0.5">
                해당 식사는 제공되지 않습니다.
              </p>
              <p className="text-xs">주말, 공휴일 또는 미운영 식사입니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentMeal.menu.map((dish, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-[hsl(210,20%,98%)] dark:bg-[hsl(222,24%,9%)] border border-[hsl(210,14%,88%)]/50 dark:border-[hsl(222,16%,20%)] shadow-sm hover:-translate-y-0.5 transition-transform"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] shrink-0" />
                    <span className="text-sm font-medium text-[hsl(222,47%,11%)] dark:text-[hsl(210,40%,96%)] break-keep">
                      {dish}
                    </span>
                  </li>
                ))}
              </ul>

              {/* 하단 푸터: 식단 사진 버튼 & 출처 안내 */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-dashed border-[hsl(210,14%,88%)] dark:border-[hsl(222,16%,20%)]">
                <span className="text-[11px] text-[hsl(215,14%,55%)] font-mono">가온고 자체 식단 시스템</span>

                {currentMeal.photoUrl && (
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(currentMeal.photoUrl)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#EA580C] hover:text-[#C2410C] bg-[#EA580C]/10 hover:bg-[#EA580C]/15 px-2.5 py-1 rounded-md transition-colors"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>식단 사진 보기</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 식단 사진 모달 팝업 */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white dark:bg-[hsl(222,24%,9%)] rounded-2xl overflow-hidden shadow-2xl p-4 border border-black/10 dark:border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#EA580C]" />
                오늘의 급식 사진
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-3 aspect-video w-full rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPhoto}
                alt="오늘의 급식 실물 사진"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
