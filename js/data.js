/* Gymmy — book data from "Radically Simple Strength"
   All weights raw/dry. Units: kg for lifting, g/ml for food. */

const BAR_KG = 20;          // Olympic barbell
const PLATE_MIN_KG = 1.25;  // smallest plate the user owns (per side => 2.5 kg jump)

/* ---------- TRAINING ---------- */

// Main-lift warmup/work scheme, as % of the top set (100%).
// reps === null on the top set means "range" (see topRange).
const NOVICE_MAIN = [
  { pct: 0,   label: 'Bar', reps: 10, bar: true },
  { pct: 60,  reps: 5 },
  { pct: 70,  reps: 5 },
  { pct: 80,  reps: 5 },
  { pct: 90,  reps: 5 },
  { pct: 100, reps: 5, top: true },
];
const NOVICE_DEADLIFT = [
  { pct: 60,  reps: 5 },
  { pct: 70,  reps: 3 },
  { pct: 80,  reps: 2 },
  { pct: 90,  reps: 1 },
  { pct: 100, reps: 5, top: true },
];

// Intermediate: warmups + top set (range 3–5) + back-off (85%, range 5–8+)
const INT_MAIN = [
  { pct: 0,   label: 'Bar', reps: 10, bar: true },
  { pct: 45,  reps: 5 },
  { pct: 65,  reps: 3 },
  { pct: 85,  reps: 2 },
  { pct: 100, reps: 5, top: true, range: [3, 5] },
  { pct: 85,  reps: 8, backoff: true, range: [5, 8], plus: true },
];
const INT_DEADLIFT = [
  { pct: 45,  reps: 5 },
  { pct: 65,  reps: 3 },
  { pct: 85,  reps: 2 },
  { pct: 100, reps: 5, top: true, range: [3, 5] },
  { pct: 85,  reps: 8, backoff: true, range: [5, 8], plus: true, optional: true },
];

// Assistance exercises (progressed by feel / reps, not % of a 1RM top set)
const ASSIST = {
  chinups:   { name: 'Chin-ups',      scheme: '3 × AMRAP',  note: 'as many reps as possible' },
  pulldowns: { name: 'Lat-pulldowns', scheme: '1 × 8–10 + back-off 8–10+' },
  ltes:      { name: 'LTEs (lying triceps ext.)', scheme: '1 × 8–10 + back-off 8–10+' },
  rows:      { name: 'Rows',          scheme: '1 × 8–10 + back-off 8–10+' },
  curls:     { name: 'Curls',         scheme: '1 × 8–10 + back-off 8–10+' },
  lateral:   { name: 'Lateral raises',scheme: '2–3 × 10–15' },
};

// Program templates. Each "day" lists its exercises in order.
const TEMPLATES = {
  novice_c: {
    id: 'novice_c', name: 'Novice Template C', level: 'novice',
    days: [
      { key: 'A', name: 'Day A', items: [
        { lift: 'squat',  scheme: NOVICE_MAIN },
        { lift: 'bench',  scheme: NOVICE_MAIN },
        { assist: ['chinups', 'pulldowns'] },
      ]},
      { key: 'B', name: 'Day B', items: [
        { lift: 'press',    scheme: NOVICE_MAIN },
        { lift: 'deadlift', scheme: NOVICE_DEADLIFT },
        { assist: ['curls'] },
        { assist: ['ltes'] },
      ]},
    ],
  },
  int_a: {
    id: 'int_a', name: 'Intermediate Template A', level: 'intermediate',
    desc: '2 days/week · full body',
    days: [
      { key: 'A', name: 'Day A', items: [
        { lift: 'squat', scheme: INT_MAIN },
        { lift: 'bench', scheme: INT_MAIN },
        { assist: ['chinups', 'pulldowns'] },
        { assist: ['ltes'] },
      ]},
      { key: 'B', name: 'Day B', items: [
        { lift: 'press',    scheme: INT_MAIN },
        { lift: 'deadlift', scheme: INT_DEADLIFT },
        { assist: ['rows'] },
        { assist: ['curls'] },
        { assist: ['lateral'] },
      ]},
    ],
  },
};

const LIFTS = {
  squat:    { name: 'Squat',      step: 2.5,  micro: false },
  bench:    { name: 'Bench Press',step: 1.25, micro: true },
  press:    { name: 'Press',      step: 1.25, micro: true },
  deadlift: { name: 'Deadlift',   step: 2.5,  micro: false },
};

/* ---------- NUTRITION ---------- */
// Bodyweight segments (book). Rows drive portion sizes. lb kept for reference.
const SEGMENTS = [
  { id: 's160', label: '160–180 lb', kg: [72, 82], rice_g: 90,  extraShake: false, extraWhey: false, oatsBanana: 0 },
  { id: 's200', label: '200–220 lb', kg: [90, 100], rice_g: 180, extraShake: false, extraWhey: true,  oatsBanana: 0 },
  { id: 's240', label: '240–260 lb', kg: [108, 118], rice_g: 270, extraShake: true, extraWhey: false, oatsBanana: 0 },
];

// Recipes. Amounts raw/dry. Macros per the book (highest-cal prep noted).
const RECIPES = {
  oats: {
    name: 'Overnight Oats', time: '3 min', macros: { p: 69, c: 112, f: 18, kcal: 866 },
    ingredients: [
      { item: 'old-fashioned rolled oats', g: 80, raw: true },
      { item: 'chocolate whey protein', scoops: 2 },
      { item: 'frozen blueberries', g: 100 },
      { item: 'chia seeds', g: 24 },
      { item: 'vanilla almond milk', ml: 240 },
    ],
    steps: ['Mix whey + almond milk in a shaker.', 'Combine oats, blueberries, chia, protein mix in a jar; shake.', 'Refrigerate overnight.'],
  },
  protmeal: {
    name: 'Prot-Meal & Eggs', time: '5–10 min', macros: { p: 69, c: 123, f: 15, kcal: 905 },
    ingredients: [
      { item: 'old-fashioned rolled oats', g: 100, raw: true },
      { item: 'chocolate whey protein', scoops: 1 },
      { item: 'frozen blueberries', g: 100 },
      { item: 'liquid egg whites', ml: 240 },
      { item: 'sugar-free maple syrup', ml: 30 },
      { item: 'pinch of salt', g: 0 },
    ],
    note: 'No nut butter at the 160–180 lb segment.',
    steps: ['Cook oats in ~360 ml water on low.', 'Cook egg whites + salt in a nonstick pan, covered.', 'Mix oats with whey + blueberries; fold eggs, add syrup.'],
  },
  bbb: {
    name: 'The Big Beef Bowl', time: '10–15 min', servings: 2, macros: { p: 60, c: 117, f: 25, kcal: 946 },
    ingredients: [
      { item: '90/10 ground beef', g: 454, raw: true },
      { item: 'jasmine rice (dry)', g: 'segment', raw: true },
      { item: 'sweet potato (from freezer)', g: 200, raw: true },
      { item: 'chopped frozen spinach', g: 150 },
      { item: 'Brazilian Steakhouse marinade', unit: '½ packet' },
      { item: 'everything bagel seasoning', unit: 'to taste' },
    ],
    steps: ['Cook rice (rinse well).', 'Microwave sweet potato ~3 min.', 'Brown beef with seasoning in a hot oiled skillet.', 'Add sweet potato + spinach on top, cover 2–3 min, mix.', 'Split into 2 servings over rice.'],
  },
  shake: {
    name: 'Radically Simple Shake', time: '2 min', macros: { p: 52, c: 20, f: 13, kcal: 397 },
    ingredients: [
      { item: 'chocolate whey protein', scoops: 2 },
      { item: 'frozen blueberries', g: 100 },
      { item: 'vanilla almond milk', ml: 480 },
      { item: 'lemon-flavored fish oil', ml: 5 },
    ],
    steps: ['Blend everything. If it is your 2nd shake of the day, omit the fish oil.'],
  },
  whey: {
    name: 'Whey Protein', time: '1 min', macros: { p: 24, c: 3, f: 1, kcal: 120 },
    ingredients: [{ item: 'chocolate whey protein', scoops: 1 }, { item: 'water', ml: 300 }],
    steps: ['Shake with water.'],
  },
  preworkout: {
    name: 'Pre-Workout Drink', time: '2 min', macros: { p: 26, c: 25, f: 1, kcal: 205 },
    ingredients: [
      { item: 'chocolate whey protein', scoops: 1 },
      { item: 'dextrose', g: 24 },
      { item: 'creatine monohydrate', g: 5 },
      { item: 'cold-brew coffee', unit: '1 can' },
    ],
    steps: ['Mix in a shaker; sip before/during workout.'],
    optional: true,
  },
};

// Meal plan by segment: which meals, and portion tweaks.
function mealPlanFor(segId) {
  const seg = SEGMENTS.find(s => s.id === segId) || SEGMENTS[0];
  const meals = [
    { slot: 1, choices: ['oats', 'protmeal'] },
    { slot: 2, recipe: 'bbb', half: true },
    { slot: 3, recipe: 'shake' },
    { slot: 4, recipe: 'bbb', half: true },
  ];
  if (seg.extraWhey) meals.push({ slot: 5, recipe: 'whey' });
  if (seg.extraShake) meals.push({ slot: 5, recipe: 'shake' });
  return { seg, meals };
}

// Creative swap library. Each entry: grams that roughly macro-match a reference.
// factor = grams of swap per gram of the reference food (by dominant macro).
const SWAPS = {
  fruit: { // reference: 100 g frozen blueberries (~14 g carb)
    ref: 'frozen blueberries', refG: 100,
    options: [
      { item: 'strawberries', g: 180 }, { item: 'raspberries', g: 120 },
      { item: 'frozen mango', g: 90 }, { item: 'pineapple', g: 105 },
      { item: 'peaches', g: 150 }, { item: 'cherries', g: 90 },
      { item: 'blackberries', g: 140 }, { item: 'mixed berries', g: 110 },
    ],
  },
  protein: { // reference: 454 g raw 90/10 beef (~92 g protein, ~41 g fat)
    ref: '90/10 ground beef', refG: 454,
    options: [
      { item: 'chicken breast', g: 560, note: 'leaner — add a little oil' },
      { item: 'chicken thigh', g: 470 },
      { item: 'turkey (93/7)', g: 470 },
      { item: 'lean pork loin', g: 500 },
      { item: 'white fish (cod/tilapia)', g: 620, note: 'very lean' },
      { item: 'salmon', g: 400 },
      { item: 'shrimp', g: 600 },
      { item: '93/7 beef', g: 470 },
    ],
  },
  carb: { // reference: 200 g raw sweet potato (~40 g carb)
    ref: 'sweet potato', refG: 200,
    options: [
      { item: 'yellow / English potato', g: 235 },
      { item: 'jasmine rice (dry)', g: 55 },
      { item: 'basmati rice (dry)', g: 55 },
      { item: 'quinoa (dry)', g: 60 },
      { item: 'whole-grain pasta (dry)', g: 55 },
      { item: 'oats (dry)', g: 60 },
      { item: 'couscous (dry)', g: 55 },
      { item: 'black beans (dry)', g: 65 },
    ],
  },
  veg: { // reference: 150 g frozen spinach (low cal, swap 1:1-ish by volume)
    ref: 'frozen spinach', refG: 150,
    options: [
      { item: 'broccoli', g: 200 }, { item: 'green beans', g: 200 },
      { item: 'mixed frozen veg', g: 180 }, { item: 'bell peppers', g: 200 },
      { item: 'zucchini', g: 220 }, { item: 'asparagus', g: 200 },
      { item: 'cauliflower', g: 200 }, { item: 'kale', g: 150 },
    ],
  },
};
