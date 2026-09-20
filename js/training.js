/* Gymmy — training engine. Generates sets from your top set and gives the
   book's advice (repeat / reset / switch template / de-load). */

function roundToPlate(kg, step) {
  // step = smallest total barbell increment (kg). Never below the empty bar.
  const r = Math.round(kg / step) * step;
  return Math.max(BAR_KG, Math.round(r * 100) / 100);
}

// Build the concrete set list for one main lift.
function buildSets(liftKey, scheme, deload = false) {
  const lift = LIFTS[liftKey];
  const top = state().lifts[liftKey].top;
  const backoff = state().lifts[liftKey].backoff;
  const topWeight = deload ? roundToPlate(top * 0.9, lift.step) : top;

  return scheme.map((s) => {
    if (s.bar) return { label: 'Bar × ' + s.reps, weight: BAR_KG, reps: s.reps, kind: 'warmup' };
    let weight;
    if (s.backoff) weight = deload ? null : backoff;         // back-off tracked independently
    else weight = roundToPlate(topWeight * (s.pct / 100), lift.step);
    if (deload && s.backoff) return null;                    // no back-off on de-load
    const kind = s.top ? 'top' : s.backoff ? 'backoff' : 'warmup';
    const repsLabel = s.range ? (s.range[0] + '–' + s.range[1] + (s.plus ? '+' : '')) : String(s.reps);
    return {
      label: weight + ' kg × ' + repsLabel + (s.optional ? ' (optional)' : ''),
      weight, reps: s.reps, range: s.range || null, kind,
      optional: !!s.optional, plus: !!s.plus,
    };
  }).filter(Boolean).concat(
    deload ? [{ label: '100% × 3 × 2 (2 sets of 3)', weight: topWeight, reps: 3, sets: 2, kind: 'top' }] : []
  ).filter((s, i, arr) => !(deload && s.kind === 'top' && i < arr.length - 1)); // de-load keeps just the 2×3
}

// Compose the next workout (day A/B), returning ordered blocks.
function nextWorkout(deload = false) {
  const st = state();
  const tpl = TEMPLATES[st.profile.templateId];
  const day = tpl.days.find(d => d.key === st.nextDayKey) || tpl.days[0];
  const num = (st.workouts.length || 0) + 1;
  const blocks = day.items.map((item) => {
    if (item.lift) {
      return { type: 'lift', lift: item.lift, name: LIFTS[item.lift].name, sets: buildSets(item.lift, item.scheme, deload) };
    }
    // assistance: offer options (e.g. chin-ups or pulldowns)
    const opts = item.assist.map(k => ASSIST[k]);
    return { type: 'assist', options: item.assist, name: opts.map(o => o.name).join(' / '), scheme: opts[0].scheme, hidden: deload };
  }).filter(b => !(deload && b.type === 'assist'));
  return { number: num, dayKey: day.key, dayName: day.name, template: tpl.name, deload, blocks, date: new Date().toISOString() };
}

// Analyse the just-logged main lift and return advice + whether to progress.
function evaluateLift(liftKey, topReps, belowRangeStreakBefore) {
  const target = 5;               // top of the 3–5 range for intermediate main lifts
  const lift = LIFTS[liftKey];
  if (topReps >= target) {
    return { status: 'done', progress: true, streak: 0,
      advice: 'All reps! Adding ' + lift.step + ' kg next session.' };
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

// Apply a logged workout: update lift weights, streaks, advance day, store it.
function commitWorkout(workout, results) {
  const st = state();
  const coach = [];
  workout.blocks.forEach((b) => {
    if (b.type !== 'lift') return;
    const r = results[b.lift];
    if (!r || r.topReps == null) return;
    if (workout.deload) { coach.push({ lift: b.lift, name: b.name, status: 'done', progress: false, advice: 'De-load set logged — recover and reset for next week.', topReps: r.topReps }); return; }
    const prevStreak = (st._streaks && st._streaks[b.lift]) || 0;
    const ev = evaluateLift(b.lift, r.topReps, prevStreak);
    st._streaks = st._streaks || {};
    st._streaks[b.lift] = ev.streak;
    if (ev.progress) st.lifts[b.lift].top = roundToPlate(st.lifts[b.lift].top + LIFTS[b.lift].step, LIFTS[b.lift].step);
    if (ev.reset)   st.lifts[b.lift].top = roundToPlate(st.lifts[b.lift].top * 0.93, LIFTS[b.lift].step);
    // back-off: hit top of 8+ => nudge back-off up
    if (r.backoffReps != null && r.backoffReps >= 8) st.lifts[b.lift].backoff = roundToPlate(st.lifts[b.lift].backoff + LIFTS[b.lift].step, LIFTS[b.lift].step);
    coach.push({ lift: b.lift, name: b.name, ...ev, topReps: r.topReps });
  });

  const record = {
    number: workout.number, date: new Date().toISOString(),
    template: workout.template, dayKey: workout.dayKey, dayName: workout.dayName,
    deload: workout.deload, results, coach,
    note: results._note || '',
  };
  st.workouts.push(record);
  // advance to the other day next time
  const tpl = TEMPLATES[st.profile.templateId];
  const idx = tpl.days.findIndex(d => d.key === workout.dayKey);
  st.nextDayKey = tpl.days[(idx + 1) % tpl.days.length].key;
  save();
  return { record, coach };
}

// Higher-level coach: should we suggest a de-load? (regression trend)
function deloadSuggested() {
  const w = state().workouts.slice(-6);
  const fails = w.flatMap(x => (x.coach || [])).filter(c => c.status === 'fail').length;
  return w.length >= 4 && fails >= 4;
}
