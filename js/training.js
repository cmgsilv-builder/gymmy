/* Gymmy — training engine. Generates sets from your top set and gives the
   book's advice (repeat / reset / switch template / de-load). */

function roundToPlate(kg, step) {
  // step = smallest total barbell increment (kg). Never below the empty bar.
  const r = Math.round(kg / step) * step;
  return Math.max(BAR_KG, Math.round(r * 100) / 100);
}

// Weights are entered/shown per side of the bar; the total is derived.
const fmtKg = (n) => String(Math.round(n * 100) / 100);
const perSide = (total) => Math.max(0, (total - BAR_KG) / 2);
const fromPerSide = (side) => BAR_KG + 2 * (side || 0);

// Local YYYY-MM-DD (date inputs work in local time, not UTC).
function localDay(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

// Suggested top-set increase after hitting all reps (~2.5%, in whole plates).
function progressStep(liftKey, top) {
  const step = LIFTS[liftKey].step;
  return Math.max(step, Math.round(top * PROGRESS_PCT / 100 / step) * step);
}

// Build the concrete set list for one main lift from its (heavy) top set.
function buildSets(liftKey, scheme, deload = false, light = false, top = state().lifts[liftKey].top) {
  const lift = LIFTS[liftKey];
  // light day = 85% of the lift's top set; de-load = 90%; otherwise the top set itself.
  const topWeight = light ? roundToPlate(top * 0.85, lift.step)
                   : deload ? roundToPlate(top * 0.9, lift.step)
                   : top;

  const sets = scheme.map((s) => {
    if (s.bar) return { weight: BAR_KG, repsLabel: String(s.reps), reps: s.reps, kind: 'warmup', nsets: 1 };
    if (deload && (s.backoff || s.top)) return null;        // de-load: no back-off, top becomes 2×3
    // warm-ups, top and back-off all auto-calculate as % of the top set
    const weight = roundToPlate(topWeight * (s.pct / 100), lift.step);
    const kind = s.top ? 'top' : s.backoff ? 'backoff' : 'warmup';
    const repsLabel = s.range ? (s.range[0] + '–' + s.range[1] + (s.plus ? '+' : '')) : String(s.reps);
    return { weight, reps: s.reps, repsLabel, range: s.range || null, kind, nsets: s.sets || 1,
      optional: !!s.optional, plus: !!s.plus };
  }).filter(Boolean);
  if (deload) sets.push({ weight: topWeight, reps: 3, repsLabel: '3', kind: 'top', nsets: 2 });
  return sets;
}

// Latest logged result for a lift (by date), ignoring light days.
function lastLiftLog(liftKey) {
  return state().workouts
    .filter(w => w.results && w.results[liftKey] && w.results[liftKey].topKg != null && !w.results[liftKey].light)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(w => ({ ...w.results[liftKey], number: w.number, date: w.date }))
    .pop() || null;
}
// Latest logged sets for an assistance exercise.
function lastAssistLog(key) {
  const w = state().workouts
    .filter(w => w.results && w.results.assist && Object.values(w.results.assist).some(a => a.key === key))
    .sort((a, b) => a.date.localeCompare(b.date)).pop();
  return w ? Object.values(w.results.assist).find(a => a.key === key) : null;
}

// Compose a workout for one day of the current template (default: the next day up).
function nextWorkout(deload = false, dayKey) {
  const st = state();
  const tpl = TEMPLATES[st.profile.templateId];
  const day = tpl.days.find(d => d.key === (dayKey || st.nextDayKey)) || tpl.days[0];
  const num = st.nextNumber || ((st.workouts.length || 0) + 1);
  const tops = {};
  Object.keys(LIFTS).forEach(k => tops[k] = st.lifts[k].top);
  const blocks = day.items.map((item, i) => {
    if (item.lift) {
      return { type: 'lift', lift: item.lift, light: !!item.light, scheme: item.scheme,
        name: (item.light ? 'Light ' : '') + LIFTS[item.lift].name,
        sets: buildSets(item.lift, item.scheme, deload, item.light, tops[item.lift]) };
    }
    // assistance: offer options (e.g. chin-ups or pulldowns)
    const opts = item.assist.map(k => ASSIST[k]);
    return { type: 'assist', slot: 'a' + i, options: item.assist, name: opts.map(o => o.name).join(' / '), hidden: deload };
  }).filter(b => !(deload && b.type === 'assist'));
  return { number: num, dayKey: day.key, dayName: day.name, template: tpl.name, deload, blocks, tops, date: localDay() };
}

// Analyse the just-logged main lift and return advice + whether to progress.
function evaluateLift(liftKey, topReps, belowRangeStreakBefore, inc) {
  const target = 5;               // top of the 3–5 range for intermediate main lifts
  const lift = LIFTS[liftKey];
  if (topReps >= target) {
    return { status: 'done', progress: true, streak: 0,
      advice: 'All reps! Adding ' + fmtKg(inc / 2) + ' kg per side (' + fmtKg(inc) + ' kg total) next session.' };
  }
  if (topReps >= 3) { // still in range but short of the top => repeat weight
    return { status: 'fail', progress: false, streak: 0,
      advice: 'Got ' + topReps + '/' + target + '. Repeat the same weight next session — aim for all ' + target + '.' };
  }
  // below the range (0–2 reps) => count toward a reset
  const streak = (belowRangeStreakBefore || 0) + 1;
  if (streak >= 2) {
    return { status: 'fail', progress: false, streak: 0, reset: true,
      advice: 'Missed the range ' + streak + '× in a row. Reset ' + lift.name + ' −7% and rebuild.' };
  }
  return { status: 'fail', progress: false, streak,
    advice: 'Only ' + topReps + ' reps. Repeat the weight; if it happens again Gymmy will reset the lift.' };
}

// Apply a logged workout: store weights used, update lift weights, streaks, advance day.
// A back-dated workout (older than the newest logged one) is stored but doesn't move current weights.
function commitWorkout(workout, results) {
  const st = state();
  const coach = [];
  const date = new Date(workout.date + 'T12:00:00').toISOString();
  const backdated = st.workouts.some(w => w.date > date);

  workout.blocks.forEach((b) => {
    if (b.type !== 'lift') return;
    const r = results[b.lift] = results[b.lift] || {};
    const topSet = b.sets.find(s => s.kind === 'top');
    r.topKg = topSet ? topSet.weight : null;    // what was actually on the bar
    r.light = b.light;
    if (b.light || r.topReps == null) return;   // light days don't drive progression
    const base = workout.tops[b.lift];
    if (workout.deload) { coach.push({ lift: b.lift, name: b.name, status: 'done', progress: false, advice: 'De-load set logged — recover and reset for next week.', topReps: r.topReps }); return; }
    const prevStreak = (st._streaks && st._streaks[b.lift]) || 0;
    const inc = progressStep(b.lift, base);
    const ev = evaluateLift(b.lift, r.topReps, prevStreak, inc);
    coach.push({ lift: b.lift, name: b.name, ...ev, topReps: r.topReps });
    if (backdated) return;
    st._streaks = st._streaks || {};
    st._streaks[b.lift] = ev.streak;
    let next = base;
    if (ev.progress) next = roundToPlate(base + inc, LIFTS[b.lift].step);
    if (ev.reset)    next = roundToPlate(base * 0.93, LIFTS[b.lift].step);
    st.lifts[b.lift].top = next;
  });
  // carry the top set even when reps weren't logged (non-backdated only)
  if (!backdated) workout.blocks.forEach((b) => {
    if (b.type === 'lift' && !b.light && results[b.lift].topReps == null && !workout.deload) st.lifts[b.lift].top = workout.tops[b.lift];
  });

  const record = {
    number: workout.number, date,
    template: workout.template, dayKey: workout.dayKey, dayName: workout.dayName,
    deload: workout.deload, results, coach, backdated,
    note: results._note || '',
  };
  st.workouts.push(record);
  st.workouts.sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  if (!backdated) {
    // advance to the other day next time
    const tpl = TEMPLATES[st.profile.templateId];
    const idx = tpl.days.findIndex(d => d.key === workout.dayKey);
    st.nextDayKey = tpl.days[(idx + 1) % tpl.days.length].key;
    st.nextNumber = (workout.number || 0) + 1;   // count up from the (possibly edited) number
  }
  save();
  return { record, coach };
}

// Higher-level coach: should we suggest a de-load? (regression trend)
function deloadSuggested() {
  const w = state().workouts.slice(-6);
  const fails = w.flatMap(x => (x.coach || [])).filter(c => c.status === 'fail').length;
  return w.length >= 4 && fails >= 4;
}
