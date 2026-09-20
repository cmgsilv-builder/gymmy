/* Gymmy — UI + router. Vanilla JS, no build step. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

let PENDING = null; // the workout being logged (with per-lift results)

/* ---------- ROUTER ---------- */
function go(tab) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + tab).classList.add('active');
  $$('nav.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  render(tab);
}
$$('nav.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

function render(tab) {
  ({ train: renderTrain, nutrition: renderNutrition, analytics: renderAnalytics,
     coach: renderCoach, settings: renderSettings })[tab]();
  const st = state();
  $('#headerSub').textContent = TEMPLATES[st.profile.templateId].name;
}

/* ---------- TRAIN ---------- */
function renderTrain() {
  const el = $('#view-train');
  const st = state();
  if (!PENDING) PENDING = { workout: nextWorkout(deloadMode), results: {} };
  const wk = PENDING.workout;

  const curTpl = TEMPLATES[st.profile.templateId];
  let html = `
    <div class="card">
      <label class="field" style="margin-bottom:10px">
        <span>Program</span>
        <select onchange="setTemplate(this.value)">
          ${Object.values(TEMPLATES).map(t => `<option value="${t.id}"${t.id === st.profile.templateId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
      </label>
      ${curTpl.desc ? `<div class="muted small" style="margin:-4px 0 10px">${esc(curTpl.desc)}</div>` : ''}
      <div class="row">
        <div style="display:flex;align-items:center;gap:8px">
          <h2 style="margin:0">Workout&nbsp;#</h2>
          <input type="number" min="1" value="${wk.number}" onchange="setNumber(this.value)"
            style="width:78px;font-size:1.3rem;font-weight:700;padding:6px 8px;text-align:center" aria-label="workout number">
        </div>
        <span class="chip">${new Date().toLocaleDateString()}</span>
      </div>
      <div class="muted small" style="margin-top:4px">${esc(wk.dayName)}${wk.deload ? ' · DE-LOAD' : ''} · tap the number to change it</div>
    </div>`;

  if (deloadSuggested() && !wk.deload) {
    html += `<div class="alert warn">🛑 Your reps have been slipping. A <b>de-load week</b> may help.
      <button class="btn sm" onclick="startDeload()">Start de-load</button></div>`;
  }

  wk.blocks.forEach((b, bi) => {
    if (b.type === 'lift') {
      const res = PENDING.results[b.lift] || {};
      if (b.light) {
        html += `<div class="card">
          <div class="row"><h3 style="margin:0">${esc(b.name)}</h3><span class="chip">light</span></div>
          <div class="muted small" style="margin:6px 0">Auto: 85% of your ${esc(LIFTS[b.lift].name)} top set (${st.lifts[b.lift].top} kg). Keeps the movement fresh.</div>`;
      } else {
        html += `<div class="card">
          <div class="row"><h3 style="margin:0">${esc(b.name)}</h3>
            <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted)">Top set
              <input type="number" step="${wk.deload ? '0.5' : LIFTS[b.lift].step}" value="${st.lifts[b.lift].top}"
                onchange="setTop('${b.lift}', this.value)"
                style="width:88px;font-weight:700;text-align:center;padding:7px 8px" aria-label="${esc(b.name)} top set kg"> kg</label>
          </div>
          <div class="muted small" style="margin:6px 0">Warm-ups &amp; back-off auto-calculate from the top set${wk.deload ? ' (de-load: 90%)' : ''}.</div>`;
      }
      b.sets.forEach((s) => {
        html += `<div class="setrow"><span class="w">${esc(s.label)}</span>
          <span class="badge ${s.kind === 'top' ? 'top' : s.kind === 'backoff' ? 'now' : 'done'}">${s.kind}</span></div>`;
      });
      // rep loggers for top + back-off
      const topSet = b.sets.find(s => s.kind === 'top');
      const boSet = b.sets.find(s => s.kind === 'backoff');
      if (topSet) html += repLogger(b.lift, 'topReps', 'Top set reps', topSet.range || [3,5], res.topReps);
      if (boSet && !wk.deload) html += repLogger(b.lift, 'backoffReps', 'Back-off reps', boSet.range || [5,8], res.backoffReps, true);
      html += `</div>`;
    } else if (!b.hidden) {
      html += `<div class="card"><h3>${esc(b.name)}</h3>
        <div class="muted small">${esc(b.scheme)}</div>
        ${b.options.length > 1 ? `<div class="muted small">Pick one you have gear for.</div>` : ''}
      </div>`;
    }
  });

  html += `
    <label class="field"><span>Workout note (optional)</span>
      <textarea id="wkNote" rows="2" placeholder="how it felt, tweaks…">${esc((PENDING.results._note)||'')}</textarea></label>
    <button class="btn primary block" onclick="finishWorkout()">Finish & log workout #${wk.number}</button>
    <div style="height:10px"></div>
    <button class="btn ghost block sm" onclick="editStartingWeights()">Edit my top-set weights (kg)</button>`;

  el.innerHTML = html;
}

function repLogger(lift, field, title, range, current, isBackoff) {
  const [lo, hi] = range;
  const max = hi + (isBackoff ? 4 : 0);
  let btns = '';
  for (let r = 0; r <= max; r++) {
    const sel = current === r ? (r < (isBackoff ? lo : hi) ? 'selfail' : 'sel') : '';
    btns += `<button class="${sel}" onclick="setReps('${lift}','${field}',${r})">${r}${r === max && isBackoff ? '+' : ''}</button>`;
  }
  return `<div style="margin-top:8px"><div class="muted small">${esc(title)} (goal ${hi}${isBackoff?'+':''})</div>
    <div class="repbtns" style="flex-wrap:wrap;margin-top:5px">${btns}</div></div>`;
}
function setReps(lift, field, r) {
  PENDING.results[lift] = PENDING.results[lift] || {};
  PENDING.results[lift][field] = r;
  renderTrain();
}
let deloadMode = false;
function startDeload() { deloadMode = true; PENDING = null; renderTrain(); }

// Pick which program you're doing (dropdown in the Train view).
function setTemplate(id) {
  if (!TEMPLATES[id]) return;
  state().profile.templateId = id;
  state().nextDayKey = 'A';        // start on Day A of the chosen program
  save();
  deloadMode = false; PENDING = null;
  $('#headerSub').textContent = TEMPLATES[id].name;
  renderTrain();
}

// Edit a lift's top set inline → warm-ups + back-off recompute automatically.
function setTop(lift, val) {
  const v = parseFloat(val);
  if (isNaN(v) || v < BAR_KG) { renderTrain(); return; }
  state().lifts[lift].top = v; save();
  rebuildPendingSets();
  renderTrain();
}
// Rebuild the set lists for the current workout after a weight change (keeps number, day, logged reps).
function rebuildPendingSets() {
  if (!PENDING) return;
  const tpl = TEMPLATES[state().profile.templateId];
  const day = tpl.days.find(d => d.key === PENDING.workout.dayKey) || tpl.days[0];
  PENDING.workout.blocks.forEach((b) => {
    if (b.type !== 'lift') return;
    const item = day.items.find(it => it.lift === b.lift && !!it.light === !!b.light);
    if (item) b.sets = buildSets(b.lift, item.scheme, PENDING.workout.deload, item.light);
  });
}
// Edit the workout number (you may not start at #1).
function setNumber(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) { renderTrain(); return; }
  PENDING.workout.number = n; state().nextNumber = n; save();
  renderTrain();
}

let _confirmFinish = false;
function finishWorkout() {
  PENDING.results._note = $('#wkNote') ? $('#wkNote').value : '';
  const missing = PENDING.workout.blocks.filter(b => b.type === 'lift' && (PENDING.results[b.lift]?.topReps == null));
  if (missing.length && !_confirmFinish) {
    _confirmFinish = true;
    toast('Tap finish again to log with missing reps');
    const btn = $('#view-train .btn.primary');
    if (btn) { btn.textContent = 'Finish anyway →'; btn.classList.add('danger'); }
    return;
  }
  _confirmFinish = false;
  commitWorkout(PENDING.workout, PENDING.results);
  deloadMode = false; PENDING = null;
  toast('Workout logged 💪');
  go('coach');
}

function editStartingWeights() {
  const st = state();
  const html = Object.keys(LIFTS).map(k => `
    <label class="field"><span>${LIFTS[k].name} top set (kg)</span>
      <input type="number" step="0.5" id="lw_${k}" value="${st.lifts[k].top}"></label>`).join('');
  showModal('Your top-set weights', html + `<button class="btn primary block" onclick="saveWeights()">Save</button>`);
}
function saveWeights() {
  const st = state();
  Object.keys(LIFTS).forEach(k => { const v = parseFloat($('#lw_' + k).value); if (!isNaN(v)) { st.lifts[k].top = v; st.lifts[k].backoff = Math.round(v * 0.85 / 1.25) * 1.25; } });
  save(); closeModal(); PENDING = null; renderTrain();
}

/* ---------- NUTRITION ---------- */
function renderNutrition() {
  const el = $('#view-nutrition');
  const { seg, meals } = todaysMeals();
  const dm = dayMacros();
  let html = `
    <div class="card">
      <div class="row"><h2>Today's food</h2><span class="chip">${esc(seg.label)}</span></div>
      <div class="grid2" style="margin-top:8px">
        <div class="stat card2" style="background:var(--card2);border-radius:12px"><div class="v tabular">${dm.kcal}</div><div class="t">kcal</div></div>
        <div class="stat" style="background:var(--card2);border-radius:12px"><div class="v tabular">${dm.p}g</div><div class="t">protein</div></div>
      </div>
      <div class="muted small" style="margin-top:6px">Carbs ${dm.c} g · Fat ${dm.f} g · all amounts raw/dry</div>
    </div>
    <div class="alert info">🔀 Weigh-in stalled 2 weeks? Move up a row for fewer calories.
      <button class="btn sm" onclick="go('settings')">Change row</button></div>
    <div class="alert ${state().profile.lowCarb ? 'warn' : 'ok'}">🥩 <b>Low-carb plan</b> — ${state().profile.lowCarb ? 'ON (rice removed, for a plateau)' : 'off'}.
      <button class="btn sm" onclick="toggleLowCarb()">${state().profile.lowCarb ? 'Back to normal plan' : 'Use low-carb plan'}</button></div>`;

  meals.forEach((meal) => {
    if (meal.choice) {
      html += `<div class="card"><div class="row"><h3>Meal ${meal.slot}</h3><span class="chip">pick one</span></div>`;
      meal.options.forEach(r => html += recipeBlock(r));
      html += `</div>`;
    } else {
      html += `<div class="card"><div class="row"><h3>Meal ${meal.slot}</h3><span class="chip tabular">${meal.recipe.macros.kcal} kcal</span></div>${recipeBlock(meal.recipe)}</div>`;
    }
  });

  html += `
    <div class="card">
      <h3>🛒 Weekly shopping list</h3>
      <div class="muted small">7 days · cooking for ${state().profile.servingsMargin} (you + household)</div>
      <ul class="plain list">${weeklyShoppingList().map(x => `<li class="row"><span>${esc(x.item)}</span><span class="muted small">${esc(x.amount)}</span></li>`).join('')}</ul>
    </div>
    <button class="btn ghost block" onclick="openSwaps()">🔁 Food swaps (no banana, macro-matched)</button>`;

  el.innerHTML = html;
}
function recipeBlock(r) {
  return `<div style="margin-top:6px">
    <div class="row"><b>${esc(r.name)}</b><span class="muted small">${esc(r.time)}</span></div>
    <ul class="plain small" style="margin:6px 0">${r.ings.map(i => `<li class="row"><span>${esc(i.item)}</span><span class="muted">${esc(fmtAmount(i))}</span></li>`).join('')}</ul>
    ${r.note ? `<div class="muted small">ℹ️ ${esc(r.note)}</div>` : ''}
    <details><summary class="muted small">Steps</summary><ol class="small">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
  </div>`;
}
function toggleLowCarb() {
  state().profile.lowCarb = !state().profile.lowCarb;
  save();
  renderNutrition();
}
function openSwaps() {
  const groups = { fruit: '🍓 Fruit', protein: '🥩 Protein', carb: '🍚 Carb', veg: '🥦 Veg' };
  let html = '';
  for (const [k, title] of Object.entries(groups)) {
    const s = SWAPS[k];
    html += `<h4>${title}</h4><div class="muted small">≈ matches ${s.refG} g ${esc(s.ref)}</div>
      <ul class="plain small" style="margin:6px 0 12px">${s.options.map(o => `<li class="row"><span>${esc(o.item)}</span><span class="muted">${o.g} g${o.note ? ' · ' + esc(o.note) : ''}</span></li>`).join('')}</ul>`;
  }
  showModal('Food swaps', html);
}

/* ---------- ANALYTICS ---------- */
function renderAnalytics() {
  const el = $('#view-analytics');
  const st = state();
  const weightPts = st.weights.map(w => ({ x: w.date, y: w.kg }));
  const liftSeries = {};
  Object.keys(LIFTS).forEach(k => liftSeries[k] = []);
  st.workouts.forEach(w => {
    Object.entries(w.results || {}).forEach(([lift, r]) => {
      if (LIFTS[lift] && r && r.topReps != null) {
        // record the top-set weight used that day (reconstruct from stored? use current-ish: we stored reps only)
      }
    });
  });
  // Build load progression from stored per-lift top over time (we log top weight snapshots)
  const loadSeries = st._loadHistory || {};

  let html = `
    <div class="card">
      <div class="row"><h2>Weight</h2><button class="btn sm primary" onclick="logWeight()">Log weight</button></div>
      ${lineChart(weightPts, { unit: ' kg', label: 'bodyweight' })}
      <div class="muted small">${weightPts.length ? 'Latest ' + weightPts[weightPts.length-1].y + ' kg' : 'Weigh yourself AM, naked, after the toilet — average the week.'}</div>
    </div>`;

  html += `<div class="card"><h2>Strength (top set, kg)</h2>`;
  Object.keys(LIFTS).forEach(k => {
    const pts = (loadSeries[k] || []).map(p => ({ x: p.date, y: p.kg }));
    html += `<h4 style="margin-top:10px">${LIFTS[k].name} <span class="muted small">now ${st.lifts[k].top} kg</span></h4>
      ${lineChart(pts, { unit: ' kg', label: k })}`;
  });
  html += `</div>`;

  html += `<div class="card"><div class="row"><h2>Photos</h2><button class="btn sm" onclick="go('settings')">Weekly checkpoint →</button></div>
    <div id="photoStrip" class="muted small">Loading…</div></div>`;

  html += `<div class="card"><h2>Workout log</h2><ul class="plain list" id="wlog">${
    st.workouts.slice().reverse().slice(0, 12).map(w => `<li class="row"><span>#${w.number} · ${esc(w.dayName)}${w.deload?' · de-load':''}</span><span class="muted small">${new Date(w.date).toLocaleDateString()}</span></li>`).join('') || '<li class="muted">No workouts yet.</li>'
  }</ul></div>`;

  el.innerHTML = html;
  renderPhotoStrip();
}
async function renderPhotoStrip() {
  const st = state();
  const cps = st.checkpoints.slice(-4);
  if (!cps.length) { const e = $('#photoStrip'); if (e) e.textContent = 'No checkpoints yet — add one under You.'; return; }
  let html = '<div class="grid2">';
  for (const cp of cps) {
    let thumb = '';
    for (const view of ['front','side','back']) {
      const blob = await getPhoto(cp.id + '_' + view);
      if (blob) { thumb = URL.createObjectURL(blob); break; }
    }
    html += `<div class="photo-slot">${thumb ? `<img src="${thumb}">` : '📷'}<span style="position:absolute;bottom:4px;left:4px;font-size:.7rem;background:rgba(0,0,0,.5);padding:1px 6px;border-radius:6px">${esc(cp.weekLabel || new Date(cp.date).toLocaleDateString())} · ${cp.weightKg||'?'}kg</span></div>`;
  }
  html += '</div>';
  const e = $('#photoStrip'); if (e) e.innerHTML = html;
}
function logWeight() {
  const v = prompt('Bodyweight now (kg):', state().profile.weightKg);
  const kg = parseFloat(v); if (isNaN(kg)) return;
  state().weights.push({ date: new Date().toISOString(), kg });
  state().profile.weightKg = kg; save(); renderAnalytics();
}

/* ---------- COACH ---------- */
function renderCoach() {
  const el = $('#view-coach');
  const st = state();
  const last = st.workouts[st.workouts.length - 1];
  let html = `<div class="card"><h2>📣 Coach</h2><div class="muted small">Advice straight from the book's rules.</div></div>`;

  if (last && last.coach && last.coach.length) {
    html += `<div class="card"><h3>After workout #${last.number}</h3>` +
      last.coach.map(c => `<div class="alert ${c.reset ? 'warn' : c.status === 'done' ? 'ok' : 'info'}"><b>${esc(c.name)}</b> — got ${c.topReps} reps.<br>${esc(c.advice)}</div>`).join('') + `</div>`;
  } else {
    html += `<div class="alert info">Log a workout and I'll tell you exactly what to do next.</div>`;
  }

  // static rule reference
  html += `<div class="card"><h3>The rules</h3>
    <table style="width:100%;border-collapse:collapse;font-size:.88rem">
      <tr><td style="padding:6px 0;border-bottom:1px solid var(--line)">Missed top set once</td><td class="muted" style="border-bottom:1px solid var(--line)">repeat weight</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid var(--line)">Missed 2–3× in a row</td><td class="muted" style="border-bottom:1px solid var(--line)">reset −5–10%</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid var(--line)">Squat fails (novice)</td><td class="muted" style="border-bottom:1px solid var(--line)">switch template</td></tr>
      <tr><td style="padding:6px 0">Trend down over weeks</td><td class="muted">de-load week</td></tr>
    </table></div>`;

  if (deloadSuggested()) html += `<div class="alert warn">🛑 De-load suggested. <button class="btn sm" onclick="startDeload();go('train')">Start it</button></div>`;

  el.innerHTML = html;
}

/* ---------- SETTINGS / YOU ---------- */
function renderSettings() {
  const el = $('#view-settings');
  const p = state().profile;
  el.innerHTML = `
    <div class="card"><h2>You</h2>
      <label class="field"><span>Name</span><input id="p_name" value="${esc(p.name)}"></label>
      <div class="grid2">
        <label class="field"><span>Weight (kg)</span><input id="p_weight" type="number" step="0.1" value="${p.weightKg}"></label>
        <label class="field"><span>Height (cm)</span><input id="p_height" type="number" value="${p.heightCm}"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Age</span><input id="p_age" type="number" value="${p.age}"></label>
        <label class="field"><span>Cook for (people)</span><input id="p_margin" type="number" value="${p.servingsMargin}"></label>
      </div>
      <label class="field"><span>Goal</span>
        <select id="p_goal">${opt('lose_fat','Lose fat',p.goal)}${opt('recomp','Recomp',p.goal)}${opt('gain','Gain muscle',p.goal)}${opt('maintain','Maintain',p.goal)}</select></label>
      <label class="field"><span>Meal-plan row (bodyweight segment)</span>
        <select id="p_seg">${SEGMENTS.map(s => opt(s.id, s.label, p.segmentId)).join('')}</select></label>
      <label class="field"><span>Training template</span>
        <select id="p_tpl">${Object.values(TEMPLATES).map(t => opt(t.id, t.name, p.templateId)).join('')}</select></label>
      <button class="btn primary block" onclick="saveProfile()">Save</button>
    </div>

    <div class="card"><h3>📷 Weekly checkpoint</h3>
      <div class="muted small">Add this week's weight + front/side/back photos (stored only on this phone).</div>
      <label class="field" style="margin-top:8px"><span>Week label</span><input id="cp_label" placeholder="e.g. Week 1"></label>
      <label class="field"><span>Weight (kg)</span><input id="cp_weight" type="number" step="0.1" value="${p.weightKg}"></label>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
        ${['front','side','back'].map(v => `<label class="photo-slot" id="slot_${v}"><span>${v}</span><input type="file" accept="image/*" onchange="pickPhoto(event,'${v}')"></label>`).join('')}
      </div>
      <button class="btn primary block" style="margin-top:10px" onclick="saveCheckpoint()">Save checkpoint</button>
    </div>

    <div class="card"><h3>💾 Backup</h3>
      <div class="muted small">Everything lives on this phone. Export a file to keep it safe.</div>
      <div class="grid2" style="margin-top:8px">
        <button class="btn ghost" onclick="doExport()">Export backup</button>
        <label class="btn ghost" style="text-align:center">Import<input type="file" accept="application/json" style="display:none" onchange="doImport(event)"></label>
      </div>
    </div>

    <div class="card"><h3>Data</h3>
      <div class="muted small">${state().workouts.length} workouts · ${state().weights.length} weigh-ins · ${state().checkpoints.length} checkpoints</div>
      <button class="btn danger block sm" style="margin-top:8px" onclick="resetAll()">Reset all data</button>
    </div>
    <div id="modalRoot"></div>`;
}
function opt(v, label, cur) { return `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`; }
function saveProfile() {
  const p = state().profile;
  p.name = $('#p_name').value; p.weightKg = parseFloat($('#p_weight').value) || p.weightKg;
  p.heightCm = parseInt($('#p_height').value) || p.heightCm; p.age = parseInt($('#p_age').value) || p.age;
  p.servingsMargin = parseInt($('#p_margin').value) || 1; p.goal = $('#p_goal').value;
  p.segmentId = $('#p_seg').value; p.templateId = $('#p_tpl').value;
  save(); PENDING = null; toast('Saved'); renderSettings();
}
let _cpPhotos = {};
async function pickPhoto(e, view) {
  const file = e.target.files[0]; if (!file) return;
  _cpPhotos[view] = file;
  const url = URL.createObjectURL(file);
  const slot = $('#slot_' + view);
  slot.innerHTML = `<img src="${url}"><input type="file" accept="image/*" onchange="pickPhoto(event,'${view}')">`;
}
async function saveCheckpoint() {
  const st = state();
  const id = 'cp_' + Date.now();
  const cp = { id, date: new Date().toISOString(), weekLabel: $('#cp_label').value || ('Week ' + (st.checkpoints.length + 1)), weightKg: parseFloat($('#cp_weight').value) || null, photos: {} };
  for (const view of ['front','side','back']) {
    if (_cpPhotos[view]) { await putPhoto(id + '_' + view, _cpPhotos[view]); cp.photos[view] = true; }
  }
  st.checkpoints.push(cp);
  if (cp.weightKg) st.weights.push({ date: cp.date, kg: cp.weightKg });
  save(); _cpPhotos = {}; toast('Checkpoint saved'); renderSettings();
}
async function doExport() {
  const json = await exportBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'gymmy-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
}
async function doImport(e) {
  const file = e.target.files[0]; if (!file) return;
  try { await importBackup(await file.text()); toast('Imported'); PENDING = null; go('train'); }
  catch (err) { alert('Import failed: ' + err.message); }
}
function resetAll() {
  if (!confirm('Erase ALL Gymmy data on this phone? This cannot be undone.')) return;
  localStorage.removeItem(LS_KEY); location.reload();
}

/* ---------- MODAL / TOAST ---------- */
function showModal(title, bodyHtml) {
  let root = $('#modalRoot'); if (!root) { root = document.createElement('div'); root.id = 'modalRoot'; document.body.appendChild(root); }
  root.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;align-items:flex-end" onclick="if(event.target===this)closeModal()">
    <div style="background:var(--card);width:100%;max-width:680px;margin:0 auto;border-radius:18px 18px 0 0;max-height:85vh;overflow:auto;padding:16px">
      <div class="row"><h2>${esc(title)}</h2><button class="btn sm ghost" onclick="closeModal()">Close</button></div>
      <div style="margin-top:8px">${bodyHtml}</div></div></div>`;
}
function closeModal() { const r = $('#modalRoot'); if (r) r.innerHTML = ''; }
function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:var(--accent);color:#06210f;padding:10px 18px;border-radius:999px;font-weight:700;z-index:60';
  document.body.appendChild(t); setTimeout(() => t.remove(), 1400);
}

/* ---------- BOOT ---------- */
// snapshot top-set weights into a load history whenever they change
(function trackLoads() {
  const st = state();
  st._loadHistory = st._loadHistory || {};
  const stamp = () => {
    Object.keys(LIFTS).forEach(k => {
      st._loadHistory[k] = st._loadHistory[k] || [];
      const arr = st._loadHistory[k];
      const kg = st.lifts[k].top;
      if (!arr.length || arr[arr.length - 1].kg !== kg) arr.push({ date: new Date().toISOString(), kg });
    });
    save();
  };
  const origSave = window.save;
  stamp();
  window._stampLoads = stamp;
})();
// re-stamp loads after committing a workout
const _origCommit = commitWorkout;
commitWorkout = function (w, r) { const out = _origCommit(w, r); if (window._stampLoads) window._stampLoads(); return out; };

go('train');
