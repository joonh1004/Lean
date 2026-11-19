import React from "react";
import { createRoot } from "react-dom/client";
import Workspace from "./Workspace";
import DailyEntry from "./DailyEntry";
import "./style.css";
import "./flow.css";
const titles = [
  "미적분 오답 정리와 풀이 과정 비교 — 치환적분부터 부분적분까지",
  "지문 분석",
  "탐구 보고서",
  "논문 읽기",
  "기록 정리",
  "문제 풀이",
];
const initialTasks = [
  ...titles.map((title, i) => ({
    id: `t${i}`,
    date: "2026-08-13",
    title,
    subject: ["수학", "영어", "물리", "AI", "독서", "수학"][i],
    done: i === 1,
    due: i === 2,
  })),
  ...[
    [3, "수학", "미적분 개념 복습"],
    [5, "AI", "신경망 실험 노트"],
    [10, "영어", "단어 복습"],
    [18, "물리", "역학 문제 풀이"],
    [21, "독서", "책 읽고 기록하기"],
    [25, "AI", "프로젝트 아이디어 정리"],
    [28, "수학", "주간 오답 복습"],
  ].map(([day, subject, title], i) => ({
    id: `s${i}`,
    date: `2026-08-${String(day).padStart(2, "0")}`,
    subject,
    title,
    done: false,
  })),
];
const events = [
  {
    id: "e1",
    date: "2026-08-13",
    title: "학원 상담",
    time: "16:00",
    subject: "상담",
  },
  {
    id: "e2",
    date: "2026-08-13",
    title: "친구들과 프로젝트 회의",
    time: "19:30",
    subject: "모임",
  },
  {
    id: "e3",
    date: "2026-08-07",
    title: "과학관 방문",
    time: "14:00",
    subject: "체험",
  },
  {
    id: "e4",
    date: "2026-08-22",
    title: "AI 진로 특강",
    time: "10:00",
    subject: "강연",
  },
];
createRoot(document.getElementById("root")).render(
  <DailyEntry>
    <Workspace sampleTasks={initialTasks} sampleEvents={events} />
  </DailyEntry>,
);
