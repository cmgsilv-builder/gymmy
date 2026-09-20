/* Gymmy — nutrition. Builds today's meals for the user's segment, applies
   swaps (banana never appears), and generates a weekly shopping list with a
   margin for cooking for 2 (user + wife). */

const SCOOP_G = 30; // whey scoop assumption

function riceGrams() {
  const seg = SEGMENTS.find(s => s.id === state().profile.segmentId) || SEGMENTS[0];
  return seg.rice_g;
}

// Resolve one recipe into a display object (with segment rice + swaps applied).
// opts: { noRice, scoops, macros } for low-carb / variant meals.
function resolveRecipe(id, half, opts = {}) {
  const base = RECIPES[id];
  const seg = state().profile.segmentId;
  let ings = base.ingredients
    .filter((ing) => !(ing.unless && ing.unless === seg))   // e.g. no nut butter at 160–180
    .map((ing) => {
      let g = ing.g, ml = ing.ml, scoops = ing.scoops, item = ing.item, unit = ing.unit;
      if (g === 'segment') g = riceGrams();
      if (opts.scoops && scoops != null) scoops = opts.scoops;
      if (half) { if (g) g = Math.round(g / 2); if (ml) ml = Math.round(ml / 2); if (scoops) scoops = scoops / 2; }
      return { item, g, ml, scoops, unit, raw: ing.raw };
    });
  if (opts.noRice) ings = ings.filter((i) => !/rice/i.test(i.item));
  const m = base.macros;
  const macros = opts.macros ? opts.macros : (half
    ? { p: Math.round(m.p / 2), c: Math.round(m.c / 2), f: Math.round(m.f / 2), kcal: Math.round(m.kcal / 2) }
    : m);
  const nameSuffix = opts.nameSuffix || (half ? ' (½)' : '');
  return { id, name: base.name + nameSuffix, time: base.time, ings, macros, steps: base.steps, note: opts.note || base.note };
}

// Low-carb meal plan (book p.239) — for fat-loss plateaus.
function lowCarbMeals() {
  const seg = SEGMENTS.find(s => s.id === state().profile.segmentId) || SEGMENTS[0];
  const bbb = () => resolveRecipe('bbb', true, { noRice: true, nameSuffix: ' (no rice)',
    macros: { p: 30, c: 20, f: 13, kcal: 310 }, note: 'Low-carb: no rice. To cut harder, drop the sweet potato too.' });
  return { seg, lowCarb: true, meals: [
    { slot: 1, recipe: resolveRecipe('eggswhey', false) },
    { slot: 2, recipe: bbb() },
    { slot: 3, recipe: resolveRecipe('whey', false, { scoops: 2, nameSuffix: ' (2 scoops)', macros: { p: 48, c: 6, f: 2, kcal: 240 } }) },
    { slot: 4, recipe: bbb() },
  ]};
}

function todaysMeals() {
  if (state().profile.lowCarb) return lowCarbMeals();
  const { seg, meals } = mealPlanFor(state().profile.segmentId);
  const out = meals.map((meal) => {
    if (meal.choices) {
      return { slot: meal.slot, choice: true, options: meal.choices.map(id => resolveRecipe(id, false)) };
    }
    return { slot: meal.slot, recipe: resolveRecipe(meal.recipe, meal.half) };
  });
  return { seg, meals: out };
}

function dayMacros() {
  // sum using default choices (first option for the choice meal)
  const { meals } = todaysMeals();
  let p = 0, c = 0, f = 0, kcal = 0;
  meals.forEach((meal) => {
    const r = meal.choice ? meal.options[0] : meal.recipe;
    p += r.macros.p; c += r.macros.c; f += r.macros.f; kcal += r.macros.kcal;
  });
  return { p, c, f, kcal };
}

function fmtAmount(ing) {
  if (ing.g != null && ing.g !== 0) return ing.g + ' g' + (ing.raw ? ' (raw/dry)' : '');
  if (ing.ml != null) return ing.ml + ' ml';
  if (ing.scoops != null) return ing.scoops + ' scoop' + (ing.scoops === 1 ? '' : 's');
  if (ing.unit) return ing.unit;
  return '';
}

/* Weekly shopping list. daysPerWeek defaults to 7; margin multiplies servings
   (user cooks for the household). Aggregates grams/ml/scoops across all meals. */
function weeklyShoppingList(daysPerWeek = 7) {
  const margin = state().profile.servingsMargin || 1;
  const { meals } = todaysMeals();
  const bag = {}; // item -> {g, ml, scoops, unitCount}
  const add = (ing, mult) => {
    const key = ing.item.replace(/\s*\(.*?\)/, '').trim();
    bag[key] = bag[key] || { g: 0, ml: 0, scoops: 0, unit: 0, raw: ing.raw };
    if (ing.g) bag[key].g += ing.g * mult;
    if (ing.ml) bag[key].ml += ing.ml * mult;
    if (ing.scoops) bag[key].scoops += ing.scoops * mult;
    if (!ing.g && !ing.ml && !ing.scoops && ing.unit) bag[key].unit += mult;
  };
  const perDayMult = daysPerWeek * margin;
  meals.forEach((meal) => {
    const r = meal.choice ? meal.options[0] : meal.recipe;
    r.ings.forEach(ing => add(ing, perDayMult));
  });
  // format
  return Object.entries(bag).map(([item, v]) => {
    const parts = [];
    if (v.g) parts.push((v.g >= 1000 ? (v.g / 1000).toFixed(1) + ' kg' : Math.round(v.g) + ' g') + (v.raw ? ' (raw/dry)' : ''));
    if (v.ml) parts.push((v.ml >= 1000 ? (v.ml / 1000).toFixed(1) + ' L' : Math.round(v.ml) + ' ml'));
    if (v.scoops) parts.push(Math.round(v.scoops) + ' scoops');
    if (v.unit) parts.push(Math.round(v.unit) + '×');
    return { item, amount: parts.join(' · ') };
  }).sort((a, b) => a.item.localeCompare(b.item));
}
