'use strict';

/* ---------- Stockage ---------- */
const LS = 'halage:';
const load = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  me: load('me', null),
  cfg: Object.assign({ goal: 4, voice: true, url: HALAGE_DB.url, key: HALAGE_DB.key }, load('cfg', {})),
  events: load('events', []),
  pending: load('pending', []),
  health: load('health', []),   // lignes halage_health : { user_id, day, data, source }
  tab: 'today',
  view: null,          // 'player' | 'finish' | 'log'
  sync: { state: 'off', msg: '' },
  syncing: false,
};
function persist() { save('me', S.me); save('cfg', S.cfg); save('events', S.events); save('pending', S.pending); save('health', S.health); }

function addEvent(kind, data) {
  const ev = { id: uid(), user_id: S.me.id, kind, data, created_at: new Date().toISOString() };
  S.events.push(ev); S.pending.push(ev.id); persist(); sync();
  return ev;
}

/* ---------- Invitation (#join=...) ---------- */
(function readInvite() {
  const m = location.hash.match(/join=([^&]+)/);
  if (!m) return;
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
    Object.assign(S.cfg, { url: j.u, key: j.k, couple: j.c, invited: true });
    persist();
  } catch { /* lien invalide */ }
  history.replaceState(null, '', location.pathname);
})();
function inviteLink() {
  const raw = JSON.stringify({ u: S.cfg.url, k: S.cfg.key, c: S.cfg.couple });
  return location.origin + location.pathname + '#join=' + encodeURIComponent(btoa(unescape(encodeURIComponent(raw))));
}

/* ---------- Dates ---------- */
const DAY = 86400000;
const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
function mondayOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const weekKey = d => ymd(mondayOf(d));
function programWeek() { return Math.max(1, Math.round((mondayOf(new Date()) - mondayOf(S.me.start)) / (7 * DAY)) + 1); }
function fmtDur(sec) { const m = Math.round(sec / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); }
function fmtClock(sec) { sec = Math.max(0, sec); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
function ago(iso) {
  const d = new Date(iso), diff = (Date.now() - d) / 1000;
  if (diff < 3600) return 'il y a ' + Math.max(1, Math.round(diff / 60)) + ' min';
  if (ymd(d) === ymd(new Date())) return "aujourd'hui " + d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  if (ymd(d) === ymd(Date.now() - DAY)) return 'hier';
  return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---------- Données dérivées ---------- */
function profiles() {
  const p = {};
  for (const e of S.events) if (e.kind === 'profile') p[e.user_id] = { ...e.data, id: e.user_id };
  if (S.me) p[S.me.id] = { ...S.me };
  return p;
}
const partner = () => Object.values(profiles()).find(p => p.id !== S.me.id) || null;
/* ---------- Données santé (téléphone / montre) ---------- */
const num = v => parseFloat(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.'));
const fmtN = (n, d = 0) => Number(n).toLocaleString('fr-BE', { maximumFractionDigits: d });
function healthDay(uidv, day) {
  const row = S.health.find(r => r.user_id === uidv && r.day === day);
  if (!row) return null;
  const d = row.data || {};
  return { steps: num(d.steps) || 0, kcal: num(d.active_kcal) || 0, km: num(d.distance_km) || 0, source: row.source };
}
// Séances enregistrées par la montre ou le téléphone, sans doublon avec celles faites dans FIOSSO SPORT.
function watchActs() {
  const out = [];
  for (const row of S.health) for (const w of (row.data && Array.isArray(row.data.workouts) ? row.data.workouts : [])) {
    const min = num(w.minutes), t = new Date(w.start).getTime();
    if (!(min >= 10) || isNaN(t)) continue;
    const end = t + min * 60000;
    if (S.events.some(e => e.kind === 'activity' && e.user_id === row.user_id && Math.abs(new Date(e.created_at).getTime() - end) < 90 * 60000)) continue;
    out.push({
      id: 'hw:' + row.user_id + ':' + w.start, user_id: row.user_id, kind: 'activity', created_at: new Date(end).toISOString(),
      data: { type: w.type || 'autre', titre: (TYPE_LABEL[w.type] || 'Activité') + ' (montre)', seance: 'montre', duree: Math.round(min * 60),
              distance: num(w.km) > 0 ? Math.round(num(w.km) * 10) / 10 : null, kcal: num(w.kcal) > 0 ? Math.round(num(w.kcal)) : null },
    });
  }
  return out;
}
// Les pesées venues de l'app santé remplissent la courbe de poids (une par jour au maximum).
function mergeHealthWeights() {
  if (!S.me) return;
  const ws = S.me.weights || (S.me.weights = []);
  for (const r of S.health) {
    if (r.user_id !== S.me.id) continue;
    const kg = num(r.data && r.data.weight_kg);
    if (!(kg > 30 && kg < 300) || ws.some(w => ymd(w.d) === r.day)) continue;
    ws.push({ d: r.day + 'T08:00:00', kg: Math.round(kg * 10) / 10, src: 'sante' });
  }
  ws.sort((a, b) => (a.d < b.d ? -1 : 1));
}
function healthCode() {
  const raw = JSON.stringify({ u: S.cfg.url, k: S.cfg.key, c: S.cfg.couple, i: S.me.id });
  return btoa(unescape(encodeURIComponent(raw)));
}

const acts = () => S.events.filter(e => e.kind === 'activity').concat(watchActs()).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
const actsOf = (uidv, wk) => acts().filter(e => e.user_id === uidv && (!wk || weekKey(e.created_at) === wk));
const cheersFor = id => S.events.filter(e => e.kind === 'cheer' && e.data.target === id);
const colorOf = p => COLORS[p?.color] || COLORS.teal;

function weekStreak(ids) {
  // Semaines d'affilée où chacun a atteint l'objectif. La semaine en cours compte si elle est déjà réussie.
  const goal = S.cfg.goal;
  const ok = wk => ids.every(id => actsOf(id, wk).length >= goal);
  let n = 0, d = mondayOf(new Date());
  if (ok(ymd(d))) n++;
  for (let i = 0; i < 104; i++) { d = new Date(d.getTime() - 7 * DAY + 3 * 3600000); d = mondayOf(d); if (ok(ymd(d))) n++; else break; }
  return n;
}

/* ---------- Corps : poids, taille, calories ---------- */
// Le poids reste sur ce téléphone : il n'est jamais envoyé à la base partagée.
const lastWeight = () => S.me.weights?.length ? S.me.weights[S.me.weights.length - 1].kg : null;
function bodyStats() {
  const w = lastWeight(), hcm = S.me.height, age = S.me.age;
  if (!w || !hcm || !age) return null;
  const h = hcm / 100, bmi = w / (h * h);
  const bmr = 10 * w + 6.25 * hcm - 5 * age + (S.me.sex === 'h' ? 5 : -161);          // Mifflin-St Jeor
  const n = actsOf(S.me.id).filter(e => Date.now() - new Date(e.created_at) < 7 * DAY).length;
  const af = n >= 6 ? 1.725 : n >= 4 ? 1.55 : n >= 2 ? 1.375 : 1.2;                     // activité réelle des 7 derniers jours
  const tdee = bmr * af;
  let target = S.me.goal === 'muscle' ? tdee * 1.1 : S.me.goal === 'recompo' ? tdee * 0.9 : tdee - Math.min(500, tdee * 0.2);
  target = Math.max(target, bmr, S.me.sex === 'h' ? 1500 : 1200);                       // jamais sous le métabolisme de base
  const refW = bmi > 27 ? 25 * h * h : w;                                                // protéines sur un poids de référence si surpoids
  return {
    w, bmi, bmr, tdee, af, n, target: Math.round(target / 10) * 10,
    prot: Math.round(refW * 1.8), water: Math.round(w * 0.033 * 10) / 10,
    healthy: [18.5 * h * h, 24.9 * h * h],
    cat: bmi < 18.5 ? 'Maigreur' : bmi < 25 ? 'Corpulence normale' : bmi < 30 ? 'Surpoids' : 'Obésité',
  };
}
const kcal = (type, secs) => { const w = lastWeight(); return w ? Math.round((MET[type] || 4) * w * secs / 3600) : null; };

/* ---------- Construction des séances ---------- */
const lvl = () => (S.me.level || 1) - 1;
const progFactor = () => 1 + 0.08 * Math.min(programWeek() - 1, 6);
const pick = v => Array.isArray(v) ? v[lvl()] : v;
const adj = id => (S.me.adj && S.me.adj[id]) || 0;   // ajusté par le ressenti après chaque séance

function buildSeance(id) {
  const s = SEANCES[id], L = lvl(), f = Math.min(1.8, Math.max(0.6, progFactor() + adj(id))), rounds = s.rounds[L], steps = [];
  for (let r = 1; r <= rounds; r++) {
    s.items.forEach(([key0, mode, vals], i) => {
      const key = S.me.lowImpact && LOW_IMPACT[key0] ? LOW_IMPACT[key0] : key0;
      const ex = EXOS[key], v = Math.round(vals[L] * f);
      steps.push({ kind: 'work', label: ex.n, cue: ex.c, [mode === 'r' ? 'reps' : 'secs']: v, round: r, rounds });
      const last = i === s.items.length - 1;
      if (!(last && r === rounds)) steps.push({ kind: 'rest', label: last ? 'Repos entre les tours' : 'Repos', secs: last ? s.restRound : pick(s.restEx), round: r, rounds });
    });
  }
  return steps;
}
const courseIndex = () => Math.max(0, Math.min(programWeek() - 1 + COURSE_OFFSET[lvl()] + adj('run'), COURSE.length - 1));
function buildCourse() {
  const [run, walk, reps] = COURSE[courseIndex()].b;
  const steps = [{ kind: 'walk', label: 'Échauffement', cue: 'Marche rapide, ouvre les épaules.', secs: 300 }];
  for (let i = 1; i <= reps; i++) {
    steps.push({ kind: 'run', label: 'Cours', cue: 'Allure où tu peux encore parler.', secs: run, round: i, rounds: reps });
    if (walk && i < reps) steps.push({ kind: 'walk', label: 'Marche', cue: 'Récupère, respire profondément.', secs: walk, round: i, rounds: reps });
  }
  steps.push({ kind: 'walk', label: 'Retour au calme', cue: 'Marche tranquille, puis étire les mollets.', secs: 300 });
  return steps;
}
const estimate = steps => steps.reduce((t, s) => t + (s.secs || s.reps * 3.5), 0);
function sessionInfo(id) {
  if (id === 'run') { const st = buildCourse(); return { titre: 'Course sur le halage', sub: COURSE[courseIndex()].t, dur: estimate(st) }; }
  const s = SEANCES[id], st = buildSeance(id);
  return { titre: s.titre, sub: s.items.length + ' exercices · ' + s.rounds[lvl()] + ' tours', dur: estimate(st) };
}

/* ---------- Son, voix, écran allumé ---------- */
let AC = null;
function unlockAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch { /* pas de son */ } }
function beep(freq = 880, dur = 0.15) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.value = freq; o.connect(g); g.connect(AC.destination);
  g.gain.setValueAtTime(0.25, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  o.start(); o.stop(AC.currentTime + dur);
}
const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };
function say(text) {
  if (!S.cfg.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 1.05;
  speechSynthesis.speak(u);
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* refusé */ }
}

/* ---------- Lecteur de séance ---------- */
const P = { steps: [], i: 0, endAt: 0, remaining: 0, paused: false, startedAt: 0, meta: null, timer: null, lastSec: null };

function startSession(id) {
  unlockAudio();
  const isRun = id === 'run';
  P.steps = isRun ? buildCourse() : buildSeance(id);
  P.meta = isRun ? { type: 'course', titre: COURSE[courseIndex()].t, seance: 'run' }
                 : { type: SEANCES[id].type, titre: SEANCES[id].titre, seance: id };
  P.meta.week = programWeek();
  P.i = 0; P.paused = false; P.startedAt = Date.now();
  S.view = 'player';
  keepAwake(true);
  enterStep();
  clearInterval(P.timer); P.timer = setInterval(tick, 200);
}
function enterStep() {
  const st = P.steps[P.i], nx = P.steps[P.i + 1];
  P.lastSec = null;
  if (st.secs) { P.remaining = st.secs * 1000; P.endAt = Date.now() + P.remaining; }
  render();
  if (st.kind === 'work') say(st.label + (st.reps ? ', ' + st.reps + ' répétitions' : ', ' + st.secs + ' secondes'));
  else if (st.kind === 'rest') say('Repos' + (nx ? '. Ensuite : ' + nx.label : ''));
  else if (st.kind === 'run') say('Cours, ' + humanSecs(st.secs));
  else say(st.label + ', ' + humanSecs(st.secs));
}
function humanSecs(s) { return s >= 60 ? (s % 60 ? Math.floor(s / 60) + ' minutes ' + (s % 60) : s / 60 + (s === 60 ? ' minute' : ' minutes')) : s + ' secondes'; }
function tick() {
  if (S.view !== 'player' || P.paused) return;
  const st = P.steps[P.i];
  if (!st || !st.secs) return;
  const left = P.endAt - Date.now(), sec = Math.ceil(left / 1000);
  if (sec !== P.lastSec) {
    P.lastSec = sec;
    if (sec <= 3 && sec > 0) beep(660, 0.08);
    const clock = document.getElementById('clock'), bar = document.getElementById('stepbar');
    if (clock) clock.textContent = fmtClock(sec);
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, 1 - left / (st.secs * 1000)) + ')';
  }
  if (left <= 0) nextStep();
}
function nextStep() {
  beep(880, 0.2); vibrate(250);
  P.i++;
  if (P.i >= P.steps.length) return endSession();
  enterStep();
}
function prevStep() { if (P.i > 0) { P.i--; enterStep(); } }
function togglePause() {
  if (P.paused) { P.endAt = Date.now() + P.remaining; P.paused = false; }
  else { P.remaining = P.endAt - Date.now(); P.paused = true; }
  render();
}
function endSession() {
  clearInterval(P.timer); keepAwake(false);
  P.meta.duree = Math.round((Date.now() - P.startedAt) / 1000);
  say('Bravo, séance terminée !');
  S.view = 'finish'; render();
}
function quitSession() {
  if (!confirm('Arrêter la séance ? Elle ne sera pas enregistrée.')) return;
  clearInterval(P.timer); keepAwake(false); speechSynthesis?.cancel();
  S.view = null; render();
}

/* ---------- Synchronisation (Supabase, REST) ---------- */
function setSync(state, msg = '') { S.sync = { state, msg }; const el = document.getElementById('syncdot'); if (el) el.dataset.state = state; }
async function sync() {
  const { url, key, couple } = S.cfg;
  if (!url || !key || !couple || !S.me) { setSync('off'); return; }
  if (S.syncing) return;
  S.syncing = true; setSync('busy');
  try {
    const base = url.trim().replace(/\/+$/, '') + '/rest/v1/halage_events';
    const h = { apikey: key.trim(), 'x-couple': couple, 'Content-Type': 'application/json' };
    const pend = S.events.filter(e => S.pending.includes(e.id)).map(e => ({ ...e, couple }));
    if (pend.length) {
      const r = await fetch(base + '?on_conflict=id', { method: 'POST', headers: { ...h, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(pend) });
      if (!r.ok) throw new Error('Envoi refusé (' + r.status + ') ' + (await r.text()).slice(0, 140));
      const sent = new Set(pend.map(e => e.id));
      S.pending = S.pending.filter(id => !sent.has(id));
    }
    const r2 = await fetch(base + '?couple=eq.' + encodeURIComponent(couple) + '&select=id,user_id,kind,data,created_at&order=created_at.asc&limit=10000', { headers: h });
    if (!r2.ok) throw new Error('Lecture refusée (' + r2.status + ') ' + (await r2.text()).slice(0, 140));
    const map = new Map(S.events.map(e => [e.id, e]));
    for (const row of await r2.json()) map.set(row.id, row);
    S.events = [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    // Santé : si la table n'existe pas encore, on ignore sans bloquer la synchro.
    const r3 = await fetch(url.trim().replace(/\/+$/, '') + '/rest/v1/halage_health?couple=eq.' + encodeURIComponent(couple) + '&select=user_id,day,data,source&order=day.asc&limit=5000', { headers: h });
    if (r3.ok) { S.health = await r3.json(); mergeHealthWeights(); }
    persist(); setSync('ok', 'Synchronisé ' + new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }));
  } catch (err) {
    setSync('err', navigator.onLine ? err.message : 'Hors ligne : tes séances partiront au retour du réseau.');
  } finally { S.syncing = false; }
  if (!S.view) render();
}

/* ---------- Vues ---------- */
const app = document.getElementById('app');
const avatar = (p, size = '') => `<span class="av ${size}" style="--c:${colorOf(p)}">${esc((p?.name || '?')[0].toUpperCase())}</span>`;

function render() {
  document.documentElement.style.setProperty('--me', S.me ? colorOf(S.me) : COLORS.orange);
  if (!S.me) { app.innerHTML = viewOnboarding(); return; }
  if (S.view === 'player') { app.innerHTML = viewPlayer(); return; }
  if (S.view === 'finish') { app.innerHTML = viewFinish(); return; }
  const body = S.view === 'log' ? viewLog() : S.tab === 'duo' ? viewDuo() : S.tab === 'corps' ? viewBody() : S.tab === 'reglages' ? viewSettings() : viewToday();
  app.innerHTML = `<div class="page">${body}</div>${viewTabs()}`;
}

function viewTabs() {
  const t = (id, label, icon) => `<button class="tab ${S.tab === id && !S.view ? 'on' : ''}" data-a="tab" data-v="${id}" aria-label="${label}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabs">
    ${t('today', "Aujourd'hui", '<svg viewBox="0 0 24 24"><path d="M4 10h16M8 3v4M16 3v4M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg>')}
    ${t('duo', 'À deux', '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5M14.5 14.6c.6-.2 1.3-.3 2-.3 2.2 0 3.9 1.5 4.4 4.7"/></svg>')}
    ${t('corps', 'Corps', '<svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/></svg>')}
    ${t('reglages', 'Réglages', '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>')}
  </nav>`;
}

function viewOnboarding() {
  return `<div class="page onboard">
    <div class="brand"><img src="icons/icon.svg" alt="" width="56" height="56"><h1>FIOSSO SPORT</h1></div>
    <p class="lead">Séances au poids du corps, course sur le halage, et vos progrès à deux.</p>
    ${S.cfg.invited ? '<p class="note ok">Lien d’invitation reçu : vos séances seront partagées.</p>' : ''}
    <form data-form="onboard">
      <label class="field"><span>Ton prénom</span><input name="name" required maxlength="20" autocomplete="given-name"></label>
      ${bodyFields({})}
      <label class="field"><span>Poids actuel (kg)</span><input name="weight" type="number" inputmode="decimal" step="0.1" min="30" max="300" required></label>
      <fieldset class="field"><legend>Ton niveau</legend>
        ${NIVEAUX.map((n, i) => `<label class="choice"><input type="radio" name="level" value="${n.v}" ${i === 0 ? 'checked' : ''}><span><b>${n.t}</b><small>${n.d}</small></span></label>`).join('')}
      </fieldset>
      <button class="btn primary big" type="submit">Commencer</button>
    </form>
  </div>`;
}

function bodyFields(p) {
  return `<div class="grid2">
      <label class="field"><span>Sexe <small>(calcul des calories)</small></span><select name="sex">
        <option value="f" ${p.sex === 'f' ? 'selected' : ''}>Femme</option><option value="h" ${p.sex === 'h' ? 'selected' : ''}>Homme</option></select></label>
      <label class="field"><span>Âge</span><input name="age" type="number" inputmode="numeric" min="14" max="99" value="${p.age || ''}" required></label>
    </div>
    <label class="field"><span>Taille (cm)</span><input name="height" type="number" inputmode="numeric" min="120" max="230" value="${p.height || ''}" required></label>
    <fieldset class="field"><legend>Ton objectif</legend>
      ${OBJECTIFS.map((o, i) => `<label class="choice"><input type="radio" name="goal" value="${o.v}" ${(p.goal ? p.goal === o.v : i === 1) ? 'checked' : ''}><span><b>${o.t}</b><small>${o.d}</small></span></label>`).join('')}
    </fieldset>`;
}

function weightChart(ws) {
  if (ws.length < 2) return '<p class="muted">Pèse-toi une fois par semaine, le matin à jeun : la courbe apparaîtra dès la 2ᵉ pesée.</p>';
  const pts = ws.slice(-30), W = 320, H = 120, pad = 8;
  const kgs = pts.map(p => p.kg), min = Math.min(...kgs) - 0.5, max = Math.max(...kgs) + 0.5;
  const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts[pts.length - 1].d).getTime() || t0 + 1;
  const x = d => pad + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
  const y = kg => pad + (1 - (kg - min) / (max - min)) * (H - 2 * pad);
  const line = pts.map(p => x(p.d).toFixed(1) + ',' + y(p.kg).toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du poids">
    <polyline points="${line}" fill="none" stroke="var(--me)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(p => `<circle cx="${x(p.d).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="${p === last ? 4.5 : 2.5}" fill="var(--me)"/>`).join('')}
  </svg>
  <div class="chart-legend"><span>${new Date(pts[0].d).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</span><span>${new Date(last.d).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</span></div>`;
}

function viewBody() {
  const b = bodyStats(), ws = S.me.weights || [];
  if (!b) return `<header class="top"><h1>Ton corps</h1></header><p class="note">Complète ta taille et ton âge dans <b>Réglages</b> pour voir tes repères.</p>`;
  const first = ws[0].kg, diff = Math.round((b.w - first) * 10) / 10;
  const weekKcal = actsOf(S.me.id).filter(e => Date.now() - new Date(e.created_at) < 7 * DAY).reduce((t, e) => t + (e.data.kcal || 0), 0);
  const fmt = n => String(Math.round(n * 10) / 10).replace('.', ',');
  return `<header class="top"><div><p class="eyebrow">Privé : reste sur ce téléphone</p><h1>Ton corps</h1></div></header>
    <section class="kpis">
      <div><b>${fmt(b.w)} kg</b><span>${ws.length > 1 ? (diff > 0 ? '+' : '') + fmt(diff) + ' kg depuis le début' : 'poids actuel'}</span></div>
      <div><b>${fmt(b.bmi)}</b><span>IMC · ${b.cat}</span></div>
    </section>
    <section><h2>Évolution</h2>${weightChart(ws)}
      <form data-form="weight" class="row inline">
        <input name="kg" type="number" inputmode="decimal" step="0.1" min="30" max="300" placeholder="Poids du jour (kg)" required aria-label="Poids du jour en kg">
        <button class="btn primary" type="submit">Ajouter</button>
      </form>
    </section>
    <section><h2>Tes repères par jour</h2>
      <ul class="targets">
        <li><b>${b.target} kcal</b><span>à manger (${S.me.goal === 'muscle' ? 'léger surplus' : S.me.goal === 'recompo' ? 'petit déficit' : 'déficit modéré'})</span></li>
        <li><b>${b.prot} g</b><span>de protéines (œufs, poulet, poisson, lentilles, skyr)</span></li>
        <li><b>${fmt(b.water)} L</b><span>d’eau, plus 0,5 L par séance</span></li>
      </ul>
      <p class="tiny">Ta dépense estimée : ${Math.round(b.tdee)} kcal par jour (${b.n} séance${b.n > 1 ? 's' : ''} sur 7 jours). Séances de la semaine : ${weekKcal} kcal brûlées. Le calcul s’ajuste à mesure que tu t’entraînes.</p>
    </section>
    <section><h2>À savoir</h2>
      <p class="muted">Poids de forme pour ta taille : ${fmt(b.healthy[0])} à ${fmt(b.healthy[1])} kg. L’IMC ne fait pas la différence entre muscle et graisse : si tu prends du muscle, ton tour de taille dit plus que la balance. Vise 0,5 à 1 % de ton poids perdu par semaine, pas plus.</p>
      <p class="tiny">Ce sont des estimations, pas un avis médical. En cas de problème de santé, demande l’avis d’un médecin avant de commencer.</p>
    </section>`;
}

function weekStrip() {
  const me = S.me, pa = partner(), mon = mondayOf(new Date()), today = ymd(new Date());
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const has = (id, d) => acts().some(e => e.user_id === id && ymd(e.created_at) === d);
  return `<div class="strip">${days.map((l, i) => {
    const d = ymd(new Date(mon.getTime() + i * DAY + 3 * 3600000));
    return `<div class="day ${d === today ? 'now' : ''}"><span>${l}</span>
      <i class="dot ${has(me.id, d) ? 'on' : ''}" style="--c:${colorOf(me)}"></i>
      ${pa ? `<i class="dot ${has(pa.id, d) ? 'on' : ''}" style="--c:${colorOf(pa)}"></i>` : ''}</div>`;
  }).join('')}</div>`;
}

function viewToday() {
  const plan = DAY_PLAN[new Date().getDay()], wk = weekKey(new Date());
  const mine = actsOf(S.me.id, wk), doneIds = new Set(mine.map(e => e.data.seance));
  const runsDone = mine.filter(e => e.data.seance === 'run').length;
  const card = (id, hero) => {
    const info = sessionInfo(id), done = id === 'run' ? runsDone >= 2 : doneIds.has(id);
    return `<article class="session ${hero ? 'hero' : ''} ${done ? 'done' : ''}">
      <div class="s-txt"><h3>${esc(info.titre)}</h3><p>${esc(info.sub)} · ~${fmtDur(info.dur)}</p>
      ${id === 'run' ? `<p class="tiny">${runsDone}/2 cette semaine</p>` : done ? '<p class="tiny">Faite cette semaine ✓</p>' : ''}</div>
      <button class="btn ${hero ? 'primary' : 'ghost'}" data-a="start" data-v="${id}">${hero ? 'Commencer' : 'Lancer'}</button>
    </article>`;
  };
  const others = ['A', 'B', 'C', 'run'].filter(id => id !== plan);
  const hd = healthDay(S.me.id, ymd(new Date()));
  return `<header class="top"><div><p class="eyebrow">Semaine ${programWeek()} du programme</p><h1>Salut ${esc(S.me.name)}</h1></div>${syncDot()}</header>
    ${weekStrip()}
    ${hd ? `<p class="healthline"><b>${fmtN(hd.steps)}</b> pas · <b>${fmtN(hd.kcal)}</b> kcal actives${hd.km ? ' · <b>' + fmtN(hd.km, 1) + '</b> km' : ''}</p>` : ''}
    <section>
      <h2>${plan ? 'Au programme aujourd’hui' : 'Jour de repos'}</h2>
      ${plan ? card(plan, true) : `<p class="muted">Le repos fait partie du programme : c’est là que le muscle se reconstruit. Une marche sur le halage reste une bonne idée.</p>`}
    </section>
    <section><h2>Les autres séances de la semaine</h2>${others.map(id => card(id, false)).join('')}</section>
    <button class="btn ghost wide" data-a="log">+ Noter une activité libre</button>`;
}

function syncDot() {
  return `<button id="syncdot" class="syncdot" data-state="${S.sync.state}" data-a="sync" aria-label="Synchroniser" title="${esc(S.sync.msg || 'Synchronisation')}"></button>`;
}

function stepTitle(st) {
  if (st.kind === 'rest') return { big: st.label, tag: 'Repos' };
  if (st.kind === 'run') return { big: 'Cours', tag: 'Course' };
  if (st.kind === 'walk') return { big: st.label, tag: 'Marche' };
  return { big: st.label, tag: 'Exercice' };
}
function viewPlayer() {
  const st = P.steps[P.i], nx = P.steps[P.i + 1], t = stepTitle(st);
  const pct = Math.round((P.i / P.steps.length) * 100);
  const isRest = st.kind === 'rest' || st.kind === 'walk';
  return `<div class="player k-${st.kind}">
    <div class="p-top">
      <button class="icon" data-a="quit" aria-label="Arrêter"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="p-prog"><i style="width:${pct}%"></i></div>
      <span class="p-round">${st.rounds ? (st.kind === 'run' || st.kind === 'walk' ? 'Bloc ' : 'Tour ') + st.round + '/' + st.rounds : ''}</span>
    </div>
    <div class="p-main">
      <p class="p-tag">${t.tag}</p>
      <h1 class="p-name">${esc(t.big)}</h1>
      ${st.reps
        ? `<div class="p-reps"><b>${st.reps}</b><span>répétitions</span></div>`
        : `<div id="clock" class="p-clock">${fmtClock(Math.ceil((P.paused ? P.remaining : P.endAt - Date.now()) / 1000))}</div>
           <div class="p-bar"><i id="stepbar"></i></div>`}
      ${st.cue ? `<p class="p-cue">${esc(st.cue)}</p>` : ''}
      ${isRest && nx ? `<p class="p-next">Ensuite : <b>${esc(nx.label)}</b>${nx.reps ? ' × ' + nx.reps : nx.secs ? ' · ' + fmtClock(nx.secs) : ''}</p>` : ''}
    </div>
    <div class="p-ctrl">
      <button class="icon lg" data-a="prev" aria-label="Étape précédente" ${P.i === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      ${st.reps
        ? `<button class="btn primary big" data-a="next">Fait ✓</button>`
        : `<button class="btn primary big" data-a="pause">${P.paused ? 'Reprendre' : 'Pause'}</button>`}
      <button class="icon lg" data-a="next" aria-label="Passer"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
  </div>`;
}

function viewFinish() {
  const m = P.meta, run = m.type === 'course';
  m.kcal = kcal(m.type, m.duree);
  return `<div class="page finish">
    <p class="eyebrow">Séance terminée</p>
    <h1>Bravo ${esc(S.me.name)} !</h1>
    <div class="stats"><div><b>${fmtDur(m.duree)}</b><span>durée</span></div><div><b>${m.kcal ?? '–'} kcal</b><span>brûlées (estimation)</span></div></div>
    <p class="muted">${esc(m.titre)}. Ton ressenti règle la difficulté de la prochaine fois.</p>
    <form data-form="finish">
      ${run ? `<label class="field"><span>Distance (km), si tu la connais</span><input name="distance" type="number" inputmode="decimal" step="0.1" min="0" max="100"></label>` : ''}
      <fieldset class="field"><legend>Ressenti</legend><div class="feel">
        ${[['facile', 'Facile'], ['bien', 'Bien'], ['dur', 'Dur']].map(([v, l], i) => `<label><input type="radio" name="feel" value="${v}" ${i === 1 ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div></fieldset>
      <label class="field"><span>Un mot (facultatif)</span><input name="note" maxlength="120" placeholder="Ex. dernier tour très dur"></label>
      <button class="btn primary big" type="submit">Enregistrer</button>
    </form>
  </div>`;
}

function viewLog() {
  return `<header class="top"><h1>Activité libre</h1></header>
    <form data-form="log">
      <label class="field"><span>Type</span><select name="type">
        <option value="course">Course</option><option value="marche">Marche</option><option value="velo">Vélo</option>
        <option value="muscu">Renfo / muscu</option><option value="autre">Autre</option></select></label>
      <label class="field"><span>Durée (minutes)</span><input name="min" type="number" inputmode="numeric" min="1" max="600" required></label>
      <label class="field"><span>Distance (km, facultatif)</span><input name="distance" type="number" inputmode="decimal" step="0.1" min="0" max="300"></label>
      <label class="field"><span>Un mot (facultatif)</span><input name="note" maxlength="120"></label>
      <div class="row"><button class="btn ghost" type="button" data-a="cancel">Annuler</button><button class="btn primary" type="submit">Enregistrer</button></div>
    </form>`;
}

const TYPE_LABEL = { muscu: 'Renfo', hiit: 'Cardio', course: 'Course', marche: 'Marche', velo: 'Vélo', autre: 'Activité' };

function viewDuo() {
  const me = S.me, pa = partner(), wk = weekKey(new Date()), goal = S.cfg.goal;
  const ppl = pa ? [me, pa] : [me];
  const total = ppl.reduce((t, p) => t + Math.min(goal, actsOf(p.id, wk).length), 0), target = goal * ppl.length;
  const streak = weekStreak(ppl.map(p => p.id));
  const rings = ppl.map(p => {
    const n = actsOf(p.id, wk).length, r = 34, c = 2 * Math.PI * r, f = Math.min(1, n / goal);
    return `<div class="ring"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="${r}" class="track"/><circle cx="40" cy="40" r="${r}" class="fill" style="stroke:${colorOf(p)};stroke-dasharray:${c};stroke-dashoffset:${c * (1 - f)}"/></svg>
      <div class="ring-in"><b>${n}</b><span>/${goal}</span></div><p>${esc(p.name)}</p></div>`;
  }).join('');
  const feed = acts().slice().reverse().slice(0, 40);
  const ps = profiles();
  return `<header class="top"><div><p class="eyebrow">Cette semaine</p><h1>${pa ? 'Vous deux' : 'Ton équipe'}</h1></div>${syncDot()}</header>
    ${pa ? '' : `<div class="note">Ta copine n’est pas encore là. Va dans <b>Réglages</b> pour activer le partage et lui envoyer son lien.</div>`}
    <section class="duo">
      <div class="rings">${rings}</div>
      <div class="duo-sum"><div><b>${total}/${target}</b><span>séances ensemble</span></div><div><b>${streak}</b><span>${streak > 1 ? 'semaines réussies d’affilée' : 'semaine réussie d’affilée'}</span></div></div>
    </section>
    ${stepsBlock(ppl)}
    <section><h2>Fil d’activité</h2>
      ${feed.length ? `<ul class="feed">${feed.map(e => {
        const p = ps[e.user_id] || { name: '?' }, d = e.data, cheers = cheersFor(e.id), mineC = cheers.some(c => c.user_id === me.id);
        const bits = [d.duree ? fmtDur(d.duree) : '', d.kcal ? d.kcal + ' kcal' : '', d.distance ? String(d.distance).replace('.', ',') + ' km' : '', d.feel ? 'ressenti ' + d.feel : ''].filter(Boolean).join(' · ');
        return `<li>${avatar(p)}<div class="f-txt"><p><b>${esc(p.name)}</b> · ${esc(d.titre || TYPE_LABEL[d.type] || 'Activité')}</p>
          <p class="muted">${esc(bits)}</p>${d.note ? `<p class="f-note">« ${esc(d.note)} »</p>` : ''}<p class="tiny">${ago(e.created_at)}</p></div>
          ${e.user_id !== me.id
            ? `<button class="cheer ${mineC ? 'on' : ''}" data-a="cheer" data-v="${e.id}" ${mineC ? 'disabled' : ''} aria-label="Encourager">👏${cheers.length ? ' ' + cheers.length : ''}</button>`
            : cheers.length ? `<span class="cheer on">👏 ${cheers.length}</span>` : ''}
        </li>`;
      }).join('')}</ul>` : '<p class="muted">Aucune séance pour l’instant. La première est toujours la plus dure.</p>'}
    </section>`;
}

function stepsBlock(ppl) {
  const today = ymd(new Date());
  const rows = ppl.map(p => {
    const td = healthDay(p.id, today);
    let sum = 0, n = 0;
    for (let i = 0; i < 7; i++) { const d = healthDay(p.id, ymd(Date.now() - i * DAY)); if (d) { sum += d.steps; n++; } }
    return { p, today: td ? td.steps : null, avg: n ? sum / n : null };
  });
  if (rows.every(r => r.today === null && r.avg === null)) return '';
  const max = Math.max(10000, ...rows.map(r => r.today || 0));
  return `<section><h2>Pas aujourd’hui</h2><div class="steps">${rows.map(r => `
    <div class="steprow"><span class="sname">${esc(r.p.name)}</span>
      <div class="sbar"><i style="width:${Math.round(((r.today || 0) / max) * 100)}%;background:${colorOf(r.p)}"></i><em style="left:${Math.round((10000 / max) * 100)}%"></em></div>
      <span class="sval">${r.today === null ? '–' : fmtN(r.today)}</span></div>
    <p class="tiny savg">${r.avg === null ? 'Pas encore de données santé' : 'Moyenne 7 jours : ' + fmtN(r.avg) + ' pas'}</p>`).join('')}
    <p class="tiny">Le trait marque 10 000 pas.</p></div></section>`;
}

function viewSettings() {
  const c = S.cfg, on = c.url && c.key && c.couple;
  return `<header class="top"><h1>Réglages</h1></header>
    <form data-form="profile">
      <section><h2>Toi</h2>
        <label class="field"><span>Prénom</span><input name="name" value="${esc(S.me.name)}" required maxlength="20"></label>
        <label class="field"><span>Niveau</span><select name="level">${NIVEAUX.map(n => `<option value="${n.v}" ${n.v === S.me.level ? 'selected' : ''}>${n.t}</option>`).join('')}</select></label>
        ${bodyFields(S.me)}
        <label class="field"><span>Objectif par semaine (séances chacun)</span><input name="weekGoal" type="number" min="1" max="7" value="${c.goal}"></label>
        <label class="switch"><input type="checkbox" name="lowImpact" ${S.me.lowImpact ? 'checked' : ''}><span>Exercices sans saut (genoux, dos, ou forte corpulence)</span></label>
        <label class="switch"><input type="checkbox" name="voice" ${c.voice ? 'checked' : ''}><span>Annonces vocales pendant la séance</span></label>
        <button class="btn primary" type="submit">Enregistrer</button>
      </section>
    </form>
    <form data-form="sync">
      <section><h2>Partage à deux</h2>
        <p class="muted">Le partage est activé d’office. Pour relier Fiona, envoie-lui le lien ci-dessous : son app rejoindra la tienne. Les champs servent seulement en cas de changement de base.</p>
        <label class="field"><span>URL du projet</span><input name="url" value="${esc(c.url || '')}" placeholder="https://xxxx.supabase.co" inputmode="url" autocapitalize="off"></label>
        <label class="field"><span>Clé publique (anon)</span><input name="key" value="${esc(c.key || '')}" autocapitalize="off" autocomplete="off"></label>
        <label class="field"><span>Code du couple</span><input name="couple" value="${esc(c.couple || '')}" placeholder="généré automatiquement" autocapitalize="off"></label>
        <div class="row"><button class="btn primary" type="submit">Activer</button>${on ? '<button class="btn ghost" type="button" data-a="sync">Synchroniser</button>' : ''}</div>
        <p class="tiny sync-msg" data-state="${S.sync.state}">${esc(S.sync.msg || (on ? '' : 'Partage désactivé : tout reste sur ce téléphone.'))}</p>
        ${on ? `<button class="btn ghost wide" type="button" data-a="invite">Envoyer le lien à ta copine</button>` : ''}
      </section>
    </form>
    ${on ? `<section><h2>Données santé du téléphone</h2>
      <p class="muted">Pas, calories actives, distance, poids et séances de la montre arrivent ici automatiquement.</p>
      <p class="tiny"><b>Samsung / Android :</b> dans l’app FIOSSO Sync, colle ce code :</p>
      <div class="copyrow"><code>${esc(healthCode())}</code><button class="btn ghost" type="button" data-a="copy" data-v="${esc(healthCode())}">Copier</button></div>
      <p class="tiny"><b>iPhone :</b> le Raccourci a besoin de ces 4 valeurs :</p>
      ${[['URL', c.url.replace(/\/+$/, '') + '/rest/v1/halage_health?on_conflict=user_id,day'], ['Clé', c.key], ['Couple', c.couple], ['Identifiant', S.me.id]].map(([l, v]) =>
        `<div class="copyrow"><span class="clabel">${l}</span><code>${esc(v)}</code><button class="btn ghost" type="button" data-a="copy" data-v="${esc(v)}">Copier</button></div>`).join('')}
    </section>` : ''}
    <section><h2>Programme</h2>
      <p class="muted">Tu en es à la semaine ${programWeek()}. Les répétitions augmentent un peu chaque semaine pendant 7 semaines, la course aussi.</p>
      <button class="btn ghost wide" type="button" data-a="restart">Recommencer le programme à la semaine 1</button>
    </section>`;
}

/* ---------- Toast ---------- */
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show';
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ''), 2600);
}

/* ---------- Actions ---------- */
const ACT = {
  tab: d => { S.tab = d.v; S.view = null; render(); window.scrollTo(0, 0); },
  start: d => startSession(d.v),
  next: () => nextStep(),
  prev: () => prevStep(),
  pause: () => togglePause(),
  quit: () => quitSession(),
  log: () => { S.view = 'log'; render(); },
  cancel: () => { S.view = null; render(); },
  sync: () => { sync().then(() => toast(S.sync.state === 'ok' ? 'À jour' : S.sync.msg || 'Partage désactivé')); },
  cheer: d => { addEvent('cheer', { target: d.v }); vibrate(30); render(); },
  restart: () => {
    if (!confirm('Revenir à la semaine 1 ? Ton historique est conservé.')) return;
    S.me.start = new Date().toISOString(); persist(); addEvent('profile', profileData()); render(); toast('Programme relancé');
  },
  copy: async d => { try { await navigator.clipboard.writeText(d.v); toast('Copié'); } catch { prompt('Copie ce texte :', d.v); } },
  invite: async () => {
    const link = inviteLink(), text = 'Rejoins-moi sur FIOSSO SPORT pour qu’on s’entraîne ensemble : ' + link;
    try {
      if (navigator.share) await navigator.share({ title: 'FIOSSO SPORT', text });
      else { await navigator.clipboard.writeText(link); toast('Lien copié'); }
    } catch { /* partage annulé */ }
  },
};
const profileData = () => ({ name: S.me.name, level: S.me.level, color: S.me.color, start: S.me.start });

const FORMS = {
  onboard: f => {
    const kg = num(f.get('weight')), height = +f.get('height');
    if (!S.cfg.couple) S.cfg.couple = uid().replace(/-/g, '').slice(0, 24);   // code secret du couple
    S.me = {
      id: uid(), name: f.get('name').trim(), level: +f.get('level'), color: S.cfg.invited ? 'teal' : 'orange', start: new Date().toISOString(),
      sex: f.get('sex'), age: +f.get('age'), height, goal: f.get('goal'), adj: {},
      weights: [{ d: new Date().toISOString(), kg }],
      lowImpact: kg / ((height / 100) ** 2) >= 30,   // IMC ≥ 30 : exercices sans saut par défaut
    };
    persist(); addEvent('profile', profileData()); render();
  },
  finish: f => {
    const dist = num(f.get('distance')), feel = f.get('feel'), id = P.meta.seance;
    // Adaptation façon Freeletics : « facile » → plus dur la prochaine fois, « dur » → plus doux.
    S.me.adj = S.me.adj || {};
    if (id === 'run') S.me.adj.run = Math.max(-3, Math.min(3, adj('run') + (feel === 'facile' ? 1 : feel === 'dur' ? -1 : 0)));
    else S.me.adj[id] = Math.max(-0.3, Math.min(0.5, Math.round((adj(id) + (feel === 'facile' ? 0.1 : feel === 'dur' ? -0.1 : 0)) * 10) / 10));
    persist();
    addEvent('activity', { ...P.meta, distance: dist > 0 ? Math.round(dist * 10) / 10 : null, feel, note: (f.get('note') || '').trim() || null });
    S.view = null; S.tab = 'duo'; render(); toast('Séance enregistrée');
  },
  log: f => {
    const type = f.get('type'), dist = num(f.get('distance')), duree = +f.get('min') * 60;
    addEvent('activity', { type, titre: TYPE_LABEL[type] + ' libre', seance: type === 'course' ? 'run-free' : 'libre', duree, kcal: kcal(type, duree), distance: dist > 0 ? dist : null, note: (f.get('note') || '').trim() || null });
    S.view = null; S.tab = 'duo'; render(); toast('Activité enregistrée');
  },
  profile: f => {
    S.me.name = f.get('name').trim(); S.me.level = +f.get('level');
    S.me.sex = f.get('sex'); S.me.age = +f.get('age'); S.me.height = +f.get('height'); S.me.goal = f.get('goal');
    S.me.lowImpact = !!f.get('lowImpact');
    S.cfg.goal = Math.min(7, Math.max(1, +f.get('weekGoal') || 4)); S.cfg.voice = !!f.get('voice');
    persist(); addEvent('profile', profileData()); render(); toast('Enregistré');
  },
  weight: f => {
    const kg = num(f.get('kg'));
    if (!(kg > 30)) return;
    S.me.weights = (S.me.weights || []).concat({ d: new Date().toISOString(), kg: Math.round(kg * 10) / 10 });
    persist(); render(); toast('Pesée ajoutée');
  },
  sync: f => {
    S.cfg.url = f.get('url').trim(); S.cfg.key = f.get('key').trim();
    S.cfg.couple = f.get('couple').trim() || uid().replace(/-/g, '').slice(0, 24);
    persist(); render(); sync().then(() => { render(); toast(S.sync.state === 'ok' ? 'Partage activé' : 'Échec : vérifie l’URL et la clé'); });
  },
};

document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (a && !a.disabled && ACT[a.dataset.a]) { e.preventDefault(); ACT[a.dataset.a](a.dataset, a); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (f && FORMS[f.dataset.form]) { e.preventDefault(); FORMS[f.dataset.form](new FormData(f)); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { sync(); if (S.view === 'player' && !P.paused) keepAwake(true); }
});
window.addEventListener('online', () => sync());
setInterval(() => { if (document.visibilityState === 'visible' && !S.view) sync(); }, 60000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

render();
sync();
