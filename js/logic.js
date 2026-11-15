// Pure business logic: dates, periods, scores, targets, progression, patterns, merge, export.
// No DOM, no storage — fully unit-testable in Node.

// ---------- Dates (all dates are local calendar keys 'YYYY-MM-DD') ----------
const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utc = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (k, n) => fromUtc(utc(k) + n * 86400000);
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000); // b - a
export const dayOfWeek = (k) => new Date(utc(k)).getUTCDay(); // 0 = Sunday
export const isValidKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && fromUtc(utc(k)) === k;
export const dayOfYear = (k) => diffDays(`${k.slice(0, 4)}-01-01`, k);
export const yearOf = (k) => Number(k.slice(0, 4));
export function daysBetween(start, end) { const out = []; for (let k = start; diffDays(k, end) >= 0; k = addDays(k, 1)) out.push(k); return out; }
export const fmtShort = (k) => new Date(utc(k)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ---------- Periods (week = Sunday → Saturday) ----------
export const weekStart = (k) => addDays(k, -dayOfWeek(k));
const FORTNIGHT_ANCHOR = '2023-01-01'; // a Sunday; fortnights are aligned to it
export function periodRange(kind, ref) {
  if (kind === 'weekly') { const s = weekStart(ref); return { start: s, end: addDays(s, 6) }; }
  if (kind === 'biweekly') {
    const ws = weekStart(ref);
    const weeks = Math.floor(diffDays(FORTNIGHT_ANCHOR, ws) / 7);
    const s = addDays(ws, -((((weeks % 2) + 2) % 2) * 7));
    return { start: s, end: addDays(s, 13) };
  }
  if (kind === 'monthly') {
    const [y, m] = ref.split('-').map(Number);
    const s = `${y}-${pad(m)}-01`;
    const e = fromUtc(Date.UTC(y, m, 0));
    return { start: s, end: e };
  }
  throw new Error(`Unknown period ${kind}`);
}
export function previousRange(kind, range) {
  if (kind === 'monthly') return periodRange('monthly', addDays(range.start, -1));
  const len = diffDays(range.start, range.end) + 1;
  return { start: addDays(range.start, -len), end: addDays(range.start, -1) };
}

// ---------- Entry access ----------
export function getEntry(state, k) { return state.years?.[yearOf(k)]?.days?.[k] || null; }
export function allEntries(state) {
  const out = [];
  for (const y of Object.keys(state.years || {})) for (const [k, e] of Object.entries(state.years[y].days || {})) out.push([k, e]);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
export const isLogged = (e) => !!e && !e.restDay;
export const activeItems = (config) => config.items.filter((i) => !i.archived).sort((a, b) => a.order - b.order);
export const primaryField = (item) => (item.fields || []).find((f) => f.primary) || (item.fields || [])[0];

// ---------- Normalisation & Growth Score ----------
// Returns 0–100 or null (no data) for one item on one entry.
export function itemValue(item, entry) {
  const v = entry?.items?.[item.id];
  if (!v) return null;
  if (item.type === 'metric') {
    const f = primaryField(item);
    const raw = v.values?.[f.key];
    const parts = [];
    if (raw != null && f.goal) parts.push(Math.min(raw / f.goal, 1) * 100);
    if (item.hasScore && v.score != null) parts.push((v.score / 5) * 100);
    return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
  }
  return v.score == null ? null : (v.score / 5) * 100;
}

export function categoryScores(config, entry) {
  const res = {};
  if (!isLogged(entry)) return res;
  for (const cat of config.categories) {
    const vals = activeItems(config).filter((i) => i.category === cat.id && !i.excludeFromScore)
      .map((i) => itemValue(i, entry)).filter((x) => x != null);
    if (vals.length) res[cat.id] = vals.reduce((s, x) => s + x, 0) / vals.length;
  }
  return res;
}

export function growthScore(config, entry) {
  const cs = categoryScores(config, entry);
  let wSum = 0; let total = 0;
  for (const [cat, score] of Object.entries(cs)) { const w = config.weights?.[cat] ?? 0; wSum += w; total += w * score; }
  return wSum > 0 ? Math.round(total / wSum) : null;
}

// ---------- Consistency & streaks ----------
export function loggingConsistency(state, range, today) {
  const end = diffDays(range.end, today) < 0 ? today : range.end;
  if (diffDays(range.start, end) < 0) return null;
  let denom = 0; let logged = 0;
  for (const k of daysBetween(range.start, end)) {
    const e = getEntry(state, k);
    if (e?.restDay) continue;
    denom++; if (e) logged++;
  }
  return denom ? Math.round((logged / denom) * 100) : null;
}

export function showedUpStreak(state, today) {
  let k = getEntry(state, today) ? today : addDays(today, -1);
  let n = 0;
  while (getEntry(state, k)) { if (!getEntry(state, k).restDay) n++; k = addDays(k, -1); }
  return n;
}

export function performanceStreak(state, today, threshold = 60) {
  let k = getEntry(state, today) ? today : addDays(today, -1);
  let n = 0;
  for (;;) {
    const e = getEntry(state, k);
    if (!e) break;
    if (!e.restDay) { const g = growthScore(state.config, e); if (g == null || g < threshold) break; n++; }
    k = addDays(k, -1);
  }
  return n;
}

export function missedDays(state, today, lookback = 7) {
  const out = [];
  for (let i = 1; i <= lookback; i++) { const k = addDays(today, -i); if (!getEntry(state, k)) out.push(k); }
  return out;
}

export function missNudge(state, today) {
  const y1 = addDays(today, -1); const y2 = addDays(today, -2);
  const firstEver = allEntries(state)[0]?.[0];
  if (!firstEver || diffDays(firstEver, y1) < 0) return null;
  const m1 = !getEntry(state, y1);
  const m2 = !getEntry(state, y2) && diffDays(firstEver, y2) >= 0;
  if (m1 && m2) return { level: 'twice', days: [y2, y1] };
  if (m1) return { level: 'once', days: [y1] };
  return null;
}

export const isEditedLate = (dateKey, todayKey, graceDays = 7) => diffDays(dateKey, todayKey) > graceDays;

// ---------- Series helpers ----------
export function metricSeries(state, itemId, fieldKey, start, end) {
  return daysBetween(start, end).map((k) => {
    const e = getEntry(state, k);
    const v = e && !e.restDay ? e.items?.[itemId]?.values?.[fieldKey] : null;
    return [k, v ?? null];
  });
}
export function rollingAvg(series, window) {
  return series.map((_, i) => {
    const vals = series.slice(Math.max(0, i - window + 1), i + 1).map((x) => x[1]).filter((x) => x != null);
    return [series[i][0], vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null];
  });
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function itemAverage(state, item, range) {
  const vals = daysBetween(range.start, range.end).map((k) => getEntry(state, k)).filter(isLogged)
    .map((e) => itemValue(item, e)).filter((x) => x != null);
  return mean(vals);
}

// ---------- Targets ----------
export const STATUS = { ON: 'on', SLIGHT: 'slight', BEHIND: 'behind', BASELINE: 'baseline', DONE: 'done' };
export function statusFor(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return STATUS.ON;
  if (ratio >= 1) return STATUS.ON;
  if (ratio >= 0.85) return STATUS.SLIGHT;
  return STATUS.BEHIND;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round1 = (x) => Math.round(x * 10) / 10;

function isJogDay(e) {
  const j = e?.items?.jogging; if (!j || e.restDay) return false;
  return (j.score ?? 0) >= 1 || (j.values?.km ?? 0) > 0;
}

export function evaluateTarget(state, t, today) {
  const asOf = t.deadline && diffDays(t.deadline, today) > 0 ? t.deadline : today;
  const total = t.deadline ? Math.max(1, diffDays(t.startDate, t.deadline)) : null;
  const elapsed = Math.max(0, diffDays(t.startDate, asOf));
  const frac = total ? clamp01(elapsed / total) : 1;
  const daysLeft = t.deadline ? Math.max(0, diffDays(today, t.deadline)) : null;
  const base = { id: t.id, kind: t.kind, name: t.name, daysLeft, frac };

  if (t.kind === 'milestones') {
    const list = state.milestones?.lists?.[t.itemIds[0]] || [];
    const totalM = list.length;
    const done = list.filter((m) => m.done && (!m.doneDate || diffDays(m.doneDate, asOf) >= 0)).length;
    const expected = totalM * frac;
    const ratio = expected <= 0 ? 1 : done / expected;
    const remaining = totalM - done;
    const weeksLeft = daysLeft != null ? Math.max(daysLeft / 7, 1 / 7) : null;
    const recentDone = list.filter((m) => m.done && m.doneDate && diffDays(m.doneDate, today) < 28 && diffDays(m.doneDate, today) >= 0).length;
    const recentRate = recentDone / 4; // per week
    const requiredRate = weeksLeft ? remaining / weeksLeft : null;
    const projected = remaining === 0 ? null : recentRate > 0 ? addDays(today, Math.ceil((remaining / recentRate) * 7)) : null;
    const next = list.find((m) => !m.done);
    let status = remaining === 0 ? STATUS.DONE : statusFor(ratio);
    let plan = null;
    if (status === STATUS.BEHIND || status === STATUS.SLIGHT) {
      const behind = Math.max(1, Math.ceil(expected - done));
      const by = addDays(today, Math.min(7, Math.max(2, daysLeft ?? 7)));
      plan = `${behind} milestone${behind > 1 ? 's' : ''} behind. Next: finish “${next?.title}” by ${fmtShort(by)}, then keep ~${round1(requiredRate)}/week to be back on track.`;
    } else if (status === STATUS.ON && next) {
      plan = `On pace. Next up: “${next.title}”. Keep ~${round1(requiredRate ?? 0)}/week.`;
    } else if (status === STATUS.DONE) plan = 'All milestones complete — time to set the next target! 🎉';
    return { ...base, status, done, total: totalM, expected: round1(expected), ratio, requiredRate: requiredRate != null ? round1(requiredRate) : null, recentRate: round1(recentRate), projected, unit: 'milestones', plan, next: next?.title };
  }

  if (t.kind === 'dailyMetric') {
    const start = addDays(today, -13);
    const days = daysBetween(diffDays(t.startDate, start) > 0 ? start : t.startDate, today)
      .map((k) => getEntry(state, k)).filter(isLogged)
      .map((e) => e.items?.[t.itemIds[0]]?.values?.[t.field]).filter((v) => v != null);
    if (!days.length) return { ...base, status: STATUS.ON, met: 0, of: 0, pct: null, plan: 'No data yet in the last 14 days.' };
    const met = days.filter((v) => v >= t.targetValue).length;
    const pct = Math.round((met / days.length) * 100);
    const need = t.successPct ?? 80;
    const ratio = pct / need;
    const status = statusFor(ratio);
    const avg = mean(days) >= 100 ? Math.round(mean(days)) : round1(mean(days));
    const plan = status === STATUS.ON
      ? `Hit on ${met}/${days.length} logged days (goal ${need}%). Great consistency.`
      : `Hit on ${met}/${days.length} days (goal ${need}%). Avg ${avg}. Aim to reach ${t.targetValue} on ${Math.ceil(days.length * need / 100) - met} more of the next ${days.length} days.`;
    return { ...base, status, met, of: days.length, pct, avg, ratio, plan };
  }

  if (t.kind === 'daysPerWeek') {
    const thisWeek = weekStart(today);
    const thisCount = daysBetween(thisWeek, today).filter((k) => isJogDay(getEntry(state, k))).length;
    const weeks = [];
    for (let i = 1; i <= 4; i++) {
      const ws = addDays(thisWeek, -7 * i);
      if (diffDays(t.startDate, addDays(ws, 6)) < 0) break;
      weeks.push(daysBetween(ws, addDays(ws, 6)).filter((k) => isJogDay(getEntry(state, k))).length);
    }
    const avg = weeks.length ? mean(weeks) : thisCount;
    const ratio = avg / t.targetValue;
    const status = statusFor(ratio);
    const left = Math.max(0, t.targetValue - thisCount);
    const daysLeftInWeek = 6 - dayOfWeek(today);
    const plan = left === 0 ? `This week's ${t.targetValue} days done. 🙌`
      : `${thisCount}/${t.targetValue} this week — ${left} more in the next ${daysLeftInWeek + 1} day${daysLeftInWeek ? 's' : ''}. 4-week avg ${round1(avg)}/week.`;
    return { ...base, status, thisCount, avg: round1(avg), ratio, plan };
  }

  if (t.kind === 'avgScore') {
    const item = state.config.items.find((i) => i.id === t.itemIds[0]);
    const range = { start: t.startDate, end: asOf };
    const avgPct = item ? itemAverage(state, item, range) : null;
    const avg = avgPct == null ? null : round1((avgPct / 100) * 5);
    const ratio = avg == null ? null : avg / t.targetValue;
    const status = avg == null ? STATUS.ON : statusFor(ratio);
    const plan = avg == null ? 'No scores yet.' : status === STATUS.ON ? `Average ${avg}/5 — at or above ${t.targetValue}.` : `Average ${avg}/5 vs goal ${t.targetValue}. A couple of 4–5 days lifts this quickly.`;
    return { ...base, status, avg, ratio, plan };
  }

  if (t.kind === 'metricTrend') {
    const series = metricSeries(state, t.itemIds[0], t.field, t.startDate, today).filter((x) => x[1] != null);
    if (series.length < 14) return { ...base, status: STATUS.BASELINE, have: series.length, plan: `Collecting your baseline: ${series.length}/14 days with data.` };
    const baseline = t.baseline ?? mean(series.slice(0, 14).map((x) => x[1]));
    const last28 = series.filter((x) => diffDays(x[0], today) < 28).map((x) => x[1]);
    const last7 = series.filter((x) => diffDays(x[0], today) < 7).map((x) => x[1]);
    const current = mean(last28.length ? last28 : series.slice(-14).map((x) => x[1]));
    const goal = baseline * (1 + (t.targetPct ?? 10) / 100);
    const expectedNow = baseline + (goal - baseline) * frac;
    const gain = current - baseline;
    const need = expectedNow - baseline;
    const ratio = need <= 0 ? 1 : gain / need;
    const status = statusFor(ratio);
    const pct = round1((gain / baseline) * 100);
    const plan = status === STATUS.ON
      ? `28-day avg ${round1(current)} vs baseline ${round1(baseline)} (${pct >= 0 ? '+' : ''}${pct}%). Trending well — keep sleep and easy cardio steady.`
      : `28-day avg ${round1(current)} vs expected ${round1(expectedNow)} by now. Prioritise 8 h sleep, easy aerobic jogs and a few minutes of slow breathing.`;
    return { ...base, status, baseline: round1(baseline), current: round1(current), avg7: last7.length ? round1(mean(last7)) : null, goal: round1(goal), expectedNow: round1(expectedNow), pct, ratio, plan };
  }
  return { ...base, status: STATUS.ON, plan: '' };
}

// ---------- Progression engine ----------
export function progressionSuggestions(state, today) {
  const out = [];
  for (const t of state.targets?.targets || []) {
    if (t.status && t.status !== 'active') continue;
    if (!['dailyMetric', 'daysPerWeek'].includes(t.kind) || t.fixed) continue;
    const last = t.lastProgressionCheck || t.startDate;
    if (diffDays(last, today) < 14) continue;
    const window = daysBetween(addDays(today, -13), today).map((k) => getEntry(state, k)).filter(isLogged);
    if (window.length < 7) continue;
    let hitPct;
    if (t.kind === 'dailyMetric') {
      const vals = window.map((e) => e.items?.[t.itemIds[0]]?.values?.[t.field]).filter((v) => v != null);
      if (vals.length < 7) continue;
      hitPct = vals.filter((v) => v >= t.targetValue).length / vals.length;
    } else {
      const w1 = daysBetween(addDays(weekStart(today), -14), addDays(weekStart(today), -8)).filter((k) => isJogDay(getEntry(state, k))).length;
      const w2 = daysBetween(addDays(weekStart(today), -7), addDays(weekStart(today), -1)).filter((k) => isJogDay(getEntry(state, k))).length;
      hitPct = [w1, w2].filter((c) => c >= t.targetValue).length / 2;
    }
    if (hitPct >= 0.8) {
      let to = null; let note = '';
      if (t.kind === 'dailyMetric' && t.field === 'steps') { to = t.targetValue + 500; note = '+500 steps/day'; }
      else if (t.kind === 'daysPerWeek') {
        if (t.targetValue < 5) { to = t.targetValue + 1; note = '+1 jogging day/week'; }
        else note = 'You are at 5 days/week — add a weekly km target (+10%) next.';
      } else if (t.kind === 'dailyMetric' && t.stepUp) { to = round1(t.targetValue + t.stepUp); note = `+${t.stepUp}`; }
      out.push({ targetId: t.id, name: t.name, action: 'stepUp', from: t.targetValue, to, note, hitPct: Math.round(hitPct * 100) });
    } else if (hitPct < 0.5) {
      out.push({ targetId: t.id, name: t.name, action: 'hold', from: t.targetValue, to: t.targetValue, note: 'Hold steady for 2 more weeks and rebuild consistency.', hitPct: Math.round(hitPct * 100) });
    }
  }
  return out;
}

export function applyProgression(targetsFile, suggestion, accepted, today, now = new Date().toISOString()) {
  const t = targetsFile.targets.find((x) => x.id === suggestion.targetId);
  if (!t) return targetsFile;
  t.lastProgressionCheck = today;
  t.history = t.history || [];
  if (accepted && suggestion.action === 'stepUp' && suggestion.to != null) {
    t.history.push({ date: today, from: t.targetValue, to: suggestion.to, reason: 'progression' });
    t.targetValue = suggestion.to;
  } else {
    t.history.push({ date: today, from: t.targetValue, to: t.targetValue, reason: accepted ? 'hold' : 'declined' });
  }
  targetsFile.updatedAt = now;
  return targetsFile;
}

// ---------- Plateau detection ----------
export function detectPlateau(state, itemId, field, today, weeks = 6, tolerance = 0.02) {
  const start = addDays(today, -(weeks * 7 + 28));
  const series = rollingAvg(metricSeries(state, itemId, field, start, today), 28);
  const points = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const k = addDays(today, -7 * w);
    const p = series.find((x) => x[0] === k);
    if (!p || p[1] == null) return null;
    points.push(p[1]);
  }
  // need enough raw data (≥ 60% coverage) to judge
  const raw = metricSeries(state, itemId, field, start, today).filter((x) => x[1] != null).length;
  if (raw < (weeks * 7 + 28) * 0.6) return null;
  const m = mean(points);
  const flat = points.every((p) => Math.abs(p - m) / m <= tolerance);
  return flat ? { itemId, field, avg: round1(m) } : null;
}

// ---------- Why-low patterns ----------
export function whyLowPatterns(state, range) {
  const lows = [];
  for (const k of daysBetween(range.start, range.end)) {
    const e = getEntry(state, k);
    if (!isLogged(e)) continue;
    const g = growthScore(state.config, e);
    if (e.roughDay || (e.whyLow?.length) || (g != null && g < 45)) lows.push([k, e]);
  }
  const res = { lowDays: lows.length, chips: {}, insights: [] };
  for (const [, e] of lows) for (const c of e.whyLow || []) res.chips[c] = (res.chips[c] || 0) + 1;
  if (!lows.length) return res;
  const shortSleep = lows.filter(([, e]) => { const h = e.items?.sleep?.values?.hours; return h != null && h < 6; }).length;
  if (shortSleep >= 2) res.insights.push(`${shortSleep} of ${lows.length} low days followed < 6 h sleep.`);
  const top = Object.entries(res.chips).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) res.insights.push(`Most common reason: “${top[0]}” (${top[1]}×).`);
  const byDow = {};
  for (const [k] of lows) { const d = dayOfWeek(k); byDow[d] = (byDow[d] || 0) + 1; }
  const dowTop = Object.entries(byDow).sort((a, b) => b[1] - a[1])[0];
  const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  if (dowTop && dowTop[1] >= 2 && lows.length >= 3) res.insights.push(`Low days cluster on ${names[dowTop[0]]}.`);
  return res;
}

// ---------- Period summary (Insights + Saturday review) ----------
export function periodSummary(state, range, today) {
  const cfg = state.config;
  const days = daysBetween(range.start, range.end).filter((k) => diffDays(k, today) >= 0);
  const entries = days.map((k) => getEntry(state, k)).filter(isLogged);
  const gs = entries.map((e) => growthScore(cfg, e)).filter((x) => x != null);
  const cat = {};
  for (const c of cfg.categories) {
    const v = entries.map((e) => categoryScores(cfg, e)[c.id]).filter((x) => x != null);
    cat[c.id] = v.length ? Math.round(mean(v)) : null;
  }
  const items = activeItems(cfg).filter((i) => !i.excludeFromScore).map((i) => ({ id: i.id, name: i.name, avg: itemAverage(state, i, range) }))
    .filter((x) => x.avg != null);
  const lagging = [...items].sort((a, b) => a.avg - b.avg).slice(0, 3);
  const minutes = {};
  for (const i of activeItems(cfg).filter((x) => x.type === 'learning' || x.type === 'score+minutes')) {
    minutes[i.id] = entries.reduce((s, e) => s + (e.items?.[i.id]?.minutes || 0), 0);
  }
  const milestonesDone = Object.entries(state.milestones?.lists || {}).reduce((s, [, list]) =>
    s + list.filter((m) => m.done && m.doneDate && diffDays(range.start, m.doneDate) >= 0 && diffDays(m.doneDate, range.end) >= 0).length, 0);
  return {
    range, loggedDays: entries.length,
    consistency: loggingConsistency(state, range, today),
    growth: gs.length ? Math.round(mean(gs)) : null,
    categories: cat, lagging,
    strongest: Object.entries(cat).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    weakest: Object.entries(cat).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0]?.[0] || null,
    minutes, milestonesDone,
  };
}

// ---------- Merge (sync) ----------
export function mergeYear(local, remote) {
  const out = { ...(remote || {}), ...(local || {}), days: { ...(remote?.days || {}) } };
  for (const [k, e] of Object.entries(local?.days || {})) {
    const r = out.days[k];
    if (!r || (e.updatedAt || '') >= (r.updatedAt || '')) out.days[k] = e;
  }
  return out;
}
export function mergeFile(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  return (local.updatedAt || '') >= (remote.updatedAt || '') ? local : remote;
}
export const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Autofill URL params (from Apple Shortcut) ----------
const RANGES = { steps: [0, 100000], km: [0, 100], sleep: [0, 16], hrv: [1, 300] };
export function parseAutofill(search) {
  const p = new URLSearchParams(search || '');
  const out = {}; const rejected = [];
  if (p.has('date')) { const d = p.get('date'); if (isValidKey(d)) out.date = d; else rejected.push('date'); }
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    if (!p.has(key)) continue;
    const raw = String(p.get(key)).replace(',', '.').trim();
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n) && n >= lo && n <= hi) out[key] = key === 'steps' ? Math.round(n) : Math.round(n * 10) / 10;
    else rejected.push(key);
  }
  return { values: out, rejected };
}

// ---------- Quotes ----------
export function quoteFor(dateKey, bundled, user = []) {
  const doy = dayOfYear(dateKey) + yearOf(dateKey) * 366;
  if (user.length && doy % 2 === 0) return user[(doy / 2) % user.length];
  return bundled[doy % bundled.length];
}

// ---------- Export ----------
const csvCell = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(state) {
  const items = state.config.items;
  const head = ['date', 'growth_score', 'rough_day', 'rest_day', 'why_low', 'edited_late', 'note'];
  for (const i of items) {
    if (i.type !== 'metric' || i.hasScore) head.push(`${i.id}_score`);
    if (i.type === 'learning' || i.type === 'score+minutes') head.push(`${i.id}_minutes`);
    for (const f of i.fields || []) head.push(`${i.id}_${f.key}`);
  }
  const rows = [head.join(',')];
  for (const [k, e] of allEntries(state)) {
    const r = [k, growthScore(state.config, e), e.roughDay ? 1 : 0, e.restDay ? 1 : 0, (e.whyLow || []).join('|'), e.editedLate ? 1 : 0, e.note || ''];
    for (const i of items) {
      const v = e.items?.[i.id] || {};
      if (i.type !== 'metric' || i.hasScore) r.push(v.score);
      if (i.type === 'learning' || i.type === 'score+minutes') r.push(v.minutes);
      for (const f of i.fields || []) r.push(v.values?.[f.key]);
    }
    rows.push(r.map(csvCell).join(','));
  }
  return rows.join('\n');
}

export function llmReviewPack(state, range, today) {
  const cfg = state.config;
  const sub = { ...state, years: {} };
  for (const [k, e] of allEntries(state)) {
    if (diffDays(range.start, k) < 0 || diffDays(k, range.end) < 0) continue;
    const y = yearOf(k); sub.years[y] = sub.years[y] || { days: {} }; sub.years[y].days[k] = e;
  }
  const L = [];
  L.push(`# Growth Journal — review pack (${range.start} → ${range.end})`, '');
  L.push('## Context', 'This is my personal daily self-tracking data. Scores are 0–5 (0 = did not do it). Missed days are absent (not zero); rest days are planned. Technical and Projects items are milestone-based learning goals; minutes are secondary. Growth Score (0–100) is a weighted mix of categories.', '');
  L.push('## Category weights', ...Object.entries(cfg.weights).map(([k, v]) => `- ${k}: ${v}%`), '');
  L.push('## Items and score anchors');
  for (const i of activeItems(cfg)) L.push(`- **${i.name}** (${i.category}, ${i.type})${i.anchors?.[1] && i.anchors[1] !== '—' ? ` — 1: ${i.anchors[1]}; 3: ${i.anchors[3]}; 5: ${i.anchors[5]}` : ''}`);
  L.push('', '## Targets (with change history)');
  for (const t of state.targets?.targets || []) {
    const ev = evaluateTarget(state, t, today);
    L.push(`- **${t.name}** [${t.kind}] start ${t.startDate}${t.deadline ? `, deadline ${t.deadline}` : ''}, value ${t.targetValue ?? ''} → status: ${ev.status}. ${ev.plan || ''}`);
    for (const h of t.history || []) L.push(`  - ${h.date}: ${h.from} → ${h.to} (${h.reason})`);
  }
  L.push('', '## Milestones');
  for (const [id, list] of Object.entries(state.milestones?.lists || {})) {
    const name = cfg.items.find((i) => i.id === id)?.name || id;
    L.push(`- ${name}: ${list.filter((m) => m.done).length}/${list.length} done — ${list.map((m) => `${m.done ? '✅' : '⬜'} ${m.title}${m.doneDate ? ` (${m.doneDate})` : ''}`).join('; ')}`);
  }
  L.push('', '## Weekly aggregates');
  L.push('| Week starting | Logged days | Consistency % | Growth | ' + cfg.categories.map((c) => c.name).join(' | ') + ' |');
  L.push('|' + ' --- |'.repeat(4 + cfg.categories.length));
  for (let ws = weekStart(range.start); diffDays(ws, range.end) >= 0; ws = addDays(ws, 7)) {
    const s = periodSummary(state, { start: ws, end: addDays(ws, 6) }, today);
    L.push(`| ${ws} | ${s.loggedDays} | ${s.consistency ?? ''} | ${s.growth ?? ''} | ${cfg.categories.map((c) => s.categories[c.id] ?? '').join(' | ')} |`);
  }
  const pat = whyLowPatterns(state, range);
  L.push('', '## Notable patterns', ...(pat.insights.length ? pat.insights.map((x) => `- ${x}`) : ['- (none detected)']));
  L.push('', '## Prompt for the LLM', '> You are an honest, practical coach. Review my data above. Tell me: (1) where I am genuinely progressing, (2) where I am stagnating or slipping and the likely reasons from the data, (3) whether my targets and deadlines are realistic at my current pace, (4) the 3 highest-leverage changes for the next 3 months, with concrete weekly actions. Be direct; do not flatter me.', '');
  L.push('## Raw data (CSV)', '```csv', toCSV(sub), '```');
  return L.join('\n');
}

// ---------- Demo data (never synced) ----------
export function demoEntries(config, today, days = 120, seed = 7) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const years = {};
  for (let i = days - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    if (rnd() < 0.08) continue; // missed day
    const trend = (days - i) / days;
    const e = { items: {}, createdAt: '', updatedAt: `${k}T21:30:00.000Z`, whyLow: [], roughDay: false, restDay: rnd() < 0.03 };
    for (const it of config.items) {
      const v = {};
      if (it.type !== 'metric' || it.hasScore) v.score = Math.max(0, Math.min(5, Math.round(1.5 + trend * 2 + (rnd() - 0.5) * 3)));
      if (it.type === 'learning' || it.type === 'score+minutes') v.minutes = v.score ? [15, 30, 45, 60, 90][Math.floor(rnd() * 5)] : 0;
      if (it.id === 'steps') v.values = { steps: Math.round(6500 + trend * 4000 + (rnd() - 0.5) * 4000), km: round1(4 + rnd() * 4) };
      if (it.id === 'sleep') v.values = { hours: round1(6.2 + trend * 1.3 + (rnd() - 0.5) * 1.6) };
      if (it.id === 'hrv') v.values = { hrv: Math.round(38 + trend * 6 + (rnd() - 0.5) * 10) };
      if (it.id === 'jogging') v.values = { km: v.score ? round1(2 + rnd() * 4) : 0 };
      e.items[it.id] = v;
    }
    if (rnd() < 0.12) { e.roughDay = true; e.whyLow = [['tired', 'busy', 'travel', 'motivation'][Math.floor(rnd() * 4)]]; }
    const y = yearOf(k); years[y] = years[y] || { schemaVersion: 1, year: y, days: {} }; years[y].days[k] = e;
  }
  return years;
}
