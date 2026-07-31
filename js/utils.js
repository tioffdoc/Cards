// utils.js — date math, formatting, and the stats/analysis calculations
// shared by the Home screen and Performance Analysis.

export function getGreeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
  return name ? `${part}, ${name}` : `${part}`;
}

export function formatDate(dateLike, format) {
  const d = new Date(dateLike);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  switch (format) {
    case "dd/mm/yyyy": return `${dd}/${mm}/${yyyy}`;
    case "yyyy/mm/dd": return `${yyyy}/${mm}/${dd}`;
    case "mm/dd/yyyy":
    default: return `${mm}/${dd}/${yyyy}`;
  }
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export function startOfWeek(date = new Date()) {
  const d = startOfDay(date);
  const dow = d.getDay(); // 0 = Sunday
  return addDays(d, -dow);
}

export function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.toDateString() === db.toDateString();
}
export function inRange(date, from, to) {
  const t = new Date(date).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

const DIFF_VALUE = { easy: 1, medium: 2, hard: 3, veryhard: 4 };

function topicName(topics, id) {
  return topics.find((t) => t.id === id)?.name || "Unknown topic";
}

/* ---------------- Today card ---------------- */

export function computeTodayStats(logs, topics) {
  const from = startOfDay();
  const today = logs.filter((l) => inRange(l.date, from, addDays(from, 1)));
  const completed = today.length;
  const correct = today.filter((l) => l.correct).length;
  const incorrect = completed - correct;

  const byTopic = groupByTopic(today);
  const allTimeByTopic = groupByTopic(logs);

  const perTopic = Object.entries(byTopic).map(([topicId, entries]) => {
    const avgMs = average(entries.map((e) => e.responseMs));
    const allTimeAvg = average((allTimeByTopic[topicId] || []).map((e) => e.responseMs));
    const slow = allTimeAvg > 0 && avgMs > allTimeAvg * 1.3;
    return { topicId, name: topicName(topics, topicId), avgMs, slow };
  }).sort((a, b) => b.avgMs - a.avgMs);

  return { completed, correct, incorrect, perTopic };
}

/* ---------------- Weekly Progress + Performance Analysis ---------------- */

function groupByTopic(logs) {
  return logs.reduce((acc, l) => {
    (acc[l.topicId] = acc[l.topicId] || []).push(l);
    return acc;
  }, {});
}

function average(arr) {
  const nums = arr.filter((n) => typeof n === "number" && !isNaN(n));
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeWeeklyStats(logs, topics) {
  const thisFrom = startOfWeek();
  const thisTo = addDays(thisFrom, 7);
  const lastFrom = addDays(thisFrom, -7);
  const lastTo = thisFrom;

  const thisWeek = logs.filter((l) => inRange(l.date, thisFrom, thisTo));
  const lastWeek = logs.filter((l) => inRange(l.date, lastFrom, lastTo));

  const correct = thisWeek.filter((l) => l.correct).length;
  const incorrect = thisWeek.length - correct;

  const byTopicThis = groupByTopic(thisWeek);
  const byTopicLast = groupByTopic(lastWeek);
  const overallAvgMs = average(thisWeek.map((l) => l.responseMs)) || 1;

  const topicIds = Object.keys(byTopicThis);
  const weakest = topicIds.map((topicId) => {
    const entries = byTopicThis[topicId];
    const incorrectCount = entries.filter((e) => !e.correct).length;
    const avgDiff = average(entries.map((e) => DIFF_VALUE[e.difficulty] || 2));
    const avgMs = average(entries.map((e) => e.responseMs));
    const timeRatio = overallAvgMs ? avgMs / overallAvgMs : 1;
    const score = incorrectCount * 2 + avgDiff + timeRatio;
    return {
      topicId,
      name: topicName(topics, topicId),
      incorrectCount,
      avgDiff,
      avgMs,
      score,
    };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  const improved = topicIds.map((topicId) => {
    const correctThis = byTopicThis[topicId].filter((e) => e.correct).length;
    const correctLast = (byTopicLast[topicId] || []).filter((e) => e.correct).length;
    return { topicId, name: topicName(topics, topicId), delta: correctThis - correctLast };
  }).filter((t) => t.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);

  const perTopicAvgMs = topicIds.map((topicId) => ({
    topicId,
    name: topicName(topics, topicId),
    avgMs: average(byTopicThis[topicId].map((e) => e.responseMs)),
  }));

  return { correct, incorrect, weakest, improved, perTopicAvgMs };
}

/* ---------------- daily / weekly trend series for charts ---------------- */

export function dailyTrend(logs, days = 7) {
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(startOfDay(), -i);
    const next = addDays(day, 1);
    const entries = logs.filter((l) => inRange(l.date, day, next));
    const correct = entries.filter((l) => l.correct).length;
    points.push({ label: day.toLocaleDateString(undefined, { weekday: "short" }), value: correct, total: entries.length });
  }
  return points;
}

export function weeklyTrend(logs, weeks = 6) {
  const points = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(startOfWeek(), -7 * i);
    const to = addDays(from, 7);
    const entries = logs.filter((l) => inRange(l.date, from, to));
    const correct = entries.filter((l) => l.correct).length;
    points.push({ label: `W${weeks - i}`, value: correct, total: entries.length });
  }
  return points;
}
