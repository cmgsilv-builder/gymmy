/* Gymmy — persistence.
   App state (profile, lifts, workouts, weights) lives in localStorage as JSON.
   Progress photos (large blobs) live in IndexedDB, keyed by checkpoint id. */

const LS_KEY = 'gymmy.state.v1';

const defaultState = () => ({
  profile: {
    name: '', sex: 'male', age: 33, heightCm: 173, weightKg: 80,
    goal: 'lose_fat', segmentId: 's160', templateId: 'int_a',
    servingsMargin: 2, // cook for 2 people (user + wife)
    lowCarb: false,    // low-carb meal plan for fat-loss plateaus
  },
  // top-set weight (kg) per main lift + independent back-off weight
  lifts: {
    squat:    { top: 100, backoff: 85 },
    bench:    { top: 70,  backoff: 60 },
    press:    { top: 50,  backoff: 42.5 },
    deadlift: { top: 120, backoff: 102.5 },
  },
  nextDayKey: 'A',          // which day is up next (alternates A/B)
  nextNumber: 1,            // number of the next workout (editable — you may not start at 1)
  workouts: [],             // logged workouts, each with an incrementing number
  weights: [],              // [{date, kg}]
  checkpoints: [],          // [{id, date, weekLabel, weightKg, photos:{front,side,back}(bool)}]
  swapChoices: {},          // remembered swaps per component
  settings: { theme: 'dark' },
});

let STATE = load();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { console.warn('load failed', e); }
  return defaultState();
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }
  catch (e) { console.warn('save failed', e); }
}
function state() { return STATE; }

/* ---- IndexedDB for photos ---- */
let _db = null;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const req = indexedDB.open('gymmy-photos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => { _db = req.result; res(_db); };
    req.onerror = () => rej(req.error);
  });
}
async function putPhoto(key, blob) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(blob, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function getPhoto(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', 'readonly');
    const r = tx.objectStore('photos').get(key);
    r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
  });
}
async function allPhotoKeys() {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', 'readonly');
    const r = tx.objectStore('photos').getAllKeys();
    r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  });
}

/* ---- export / import (full backup incl. photos as data URLs) ---- */
function blobToDataURL(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = (head.match(/:(.*?);/) || [,'image/jpeg'])[1];
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
async function exportBackup() {
  const keys = await allPhotoKeys();
  const photos = {};
  for (const k of keys) { const b = await getPhoto(k); if (b) photos[k] = await blobToDataURL(b); }
  return JSON.stringify({ v: 1, exportedAt: new Date().toISOString(), state: STATE, photos }, null, 2);
}
async function importBackup(json) {
  const data = JSON.parse(json);
  if (!data.state) throw new Error('Not a Gymmy backup');
  STATE = Object.assign(defaultState(), data.state); save();
  if (data.photos) for (const [k, url] of Object.entries(data.photos)) await putPhoto(k, dataURLtoBlob(url));
}
