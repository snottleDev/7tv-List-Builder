/* 7TV Cast Builder — vanilla JS, no build step. */
(() => {
  'use strict';

  const TYPES = ['star', 'co-star', 'extra', 'vehicle'];
  const TYPE_LABEL = { star: 'Star', 'co-star': 'Co-Star', extra: 'Extra', vehicle: 'Vehicle' };
  const TYPE_PLURAL = { star: 'Stars', 'co-star': 'Co-Stars', extra: 'Extras', vehicle: 'Vehicles' };
  const TYPE_COLOR = { star: 'var(--star)', 'co-star': 'var(--costar)', extra: 'var(--extra)', vehicle: 'var(--vehicle)', unit: 'var(--unit)' };
  const AFF_LABEL = { heroic: 'Heroic', villainous: 'Villainous', neutral: 'Neutral' };
  const STAT_COLORS = { fight: '#b6232a', shoot: '#e07a10', defence: '#d4a20a', mind: '#5ba02e', body: '#2f8f73', spirit: '#3871c1' };
  const ICONS = {
    fight: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.5C3 5.7 3.7 5 4.5 5h1V3.8c0-.8.6-1.3 1.3-1.3s1.2.6 1.2 1.3V5h.5V3.4c0-.7.6-1.3 1.3-1.3s1.2.6 1.2 1.3V5h.3V4c0-.7.6-1.2 1.2-1.2S13.7 3.3 13.7 4v5.2c0 2.6-2.1 4.8-4.8 4.8H7.6C5 14 3 12 3 9.4z"/></svg>',
    shoot: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a.8.8 0 0 1 .8.8v1.3a5 5 0 0 1 4.1 4.1h1.3a.8.8 0 0 1 0 1.6h-1.3a5 5 0 0 1-4.1 4.1v1.3a.8.8 0 0 1-1.6 0v-1.3a5 5 0 0 1-4.1-4.1H1.8a.8.8 0 0 1 0-1.6h1.3a5 5 0 0 1 4.1-4.1V1.8A.8.8 0 0 1 8 1zm0 3.6A3.4 3.4 0 1 0 8 11.4 3.4 3.4 0 0 0 8 4.6zm0 2.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z"/></svg>',
    presence: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .5l1.4 3 3.2-1.2-1 3.2 3.1 1.5-3.1 1.5 1 3.2-3.2-1.2L8 13.5l-1.4-3-3.2 1.2 1-3.2L1.3 7l3.1-1.5-1-3.2 3.2 1.2z"/></svg>'
  };

  /* ---------- data ---------- */
  const DB = { sources: [], profiles: [], byId: new Map(), units: [], unitById: new Map(), genres: [], genreRules: [], genreCards: [], notes: [] };

  async function loadData() {
    const idx = await (await fetch('data/sources.json', { cache: 'no-cache' })).json();
    for (const s of idx.sources) {
      try {
        const d = await (await fetch(s.file, { cache: 'no-cache' })).json();
        DB.sources.push({ ...s, data: d });
      } catch (e) { console.error('Could not load', s.file, e); }
    }
  }

  /** Rebuild the active profile pool from enabled sources. Earlier (lower priority) sources win on name clashes. */
  function buildPool() {
    const enabled = DB.sources.filter(s => state.sources.includes(s.id)).sort((a, b) => a.priority - b.priority);
    DB.profiles = []; DB.byId = new Map(); DB.units = []; DB.unitById = new Map();
    DB.genres = []; DB.genreRules = []; DB.genreCards = []; DB.notes = [];
    const seenName = new Map();
    const addGenre = g => { if (!DB.genres.includes(g)) DB.genres.push(g); };
    for (const s of enabled) {
      const d = s.data;
      (d.genres || []).forEach(g => addGenre(typeof g === 'string' ? g : g.name));
      (d.genreCards || d.genres || []).forEach(g => { const n = typeof g === 'string' ? g : g.name; if (!DB.genreCards.includes(n)) DB.genreCards.push(n); });
      (d.genreRules || []).forEach(r => DB.genreRules.push({ ...r, source: s.id }));
      (d.notes || []).forEach(n => DB.notes.push({ source: s.short, text: n }));
      for (const p of d.profiles || []) {
        const key = normName(p.name) + '|' + p.type;
        if (seenName.has(key)) continue; // core (or the earlier book) is leading
        seenName.set(key, p.id);
        const prof = { ...p, sourceShort: s.short };
        DB.profiles.push(prof); DB.byId.set(p.id, prof);
      }
      for (const u of d.units || []) {
        if (DB.unitById.has(u.id)) continue;
        const unit = { ...u, sourceShort: s.short };
        DB.units.push(unit); DB.unitById.set(u.id, unit);
      }
    }
    // Profiles can also be referenced by any id of a duplicate (e.g. a supplement re-print) via aliases.
    for (const s of enabled) for (const p of s.data.profiles || []) {
      if (!DB.byId.has(p.id)) { const k = normName(p.name) + '|' + p.type; const winner = DB.byId.get(seenName.get(k)); if (winner) DB.byId.set(p.id, winner); }
    }
    // Explicit per-profile genre additions from supplements
    for (const s of enabled) for (const add of s.data.profileGenres || []) {
      const p = DB.byId.get(add.id) || DB.profiles.find(x => normName(x.name) === normName(add.name || ''));
      if (p) p.extraGenres = [...new Set([...(p.extraGenres || []), ...add.genres])];
    }
    DB.profiles.forEach(p => { p.effGenres = effectiveGenres(p); });
  }
  const normName = n => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function effectiveGenres(p) {
    const set = new Set([...(p.genres || []), ...(p.extraGenres || [])]);
    // Rule form: { when: ['Fantasy'], add: ['Sword & Sorcery'], types?: ['star', ...], sources?: ['core'] }
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of DB.genreRules) {
        if (r.types && !r.types.includes(p.type)) continue;
        if (r.sources && !r.sources.includes(p.source)) continue;
        const when = r.when || [];
        const hit = r.match === 'all' ? when.every(g => set.has(g)) : when.some(g => set.has(g));
        if (hit) for (const g of r.add) if (!set.has(g)) { set.add(g); changed = true; }
      }
    }
    return DB.genres.filter(g => set.has(g)).concat([...set].filter(g => !DB.genres.includes(g)));
  }

  /* ---------- state ---------- */
  const DEFAULT = () => ({ name: '', affiliation: 'heroic', limit: 25, genreCard: '', sources: DB.sources.map(s => s.id), entries: [] });
  let state;
  let uidN = 1;
  const uid = () => 'e' + (uidN++) + Math.random().toString(36).slice(2, 6);
  const ui = { type: 'star', search: '', genre: '', fitOnly: false, showAll: false };

  /* ---------- rules ---------- */
  function allowedAff(p) {
    const a = state.affiliation;
    if (p.affiliation === 'neutral') return true;
    if (a === 'neutral') return p.type === 'extra' || p.type === 'vehicle';
    return p.affiliation === a;
  }

  function castModels() {
    // Flatten to [{pid, count, where}] including unit leaders and members
    const out = [];
    for (const e of state.entries) {
      if (e.kind === 'model') out.push({ pid: e.pid, count: e.count, entry: e });
      else if (e.kind === 'unit') {
        out.push({ pid: e.leader, count: 1, entry: e, leader: true });
        for (const m of e.members) if (m.count > 0) out.push({ pid: m.pid, count: m.count, entry: e, slot: m.slot });
      }
    }
    return out.filter(m => DB.byId.has(m.pid));
  }

  function castGenres() {
    const gs = new Set();
    for (const m of castModels()) {
      const p = DB.byId.get(m.pid);
      if (p.type === 'star' || p.type === 'co-star') p.effGenres.forEach(g => gs.add(g));
    }
    return gs;
  }
  function hasLeads() { return castModels().some(m => ['star', 'co-star'].includes(DB.byId.get(m.pid).type)); }
  function fitsGenre(p, gs = castGenres()) {
    if (p.type === 'star' || p.type === 'co-star') return true;
    if (!gs.size) return true;
    return p.effGenres.some(g => gs.has(g));
  }

  function costFor(p, n) {
    if (!n) return 0;
    const gp = p.groupPrice;
    if (gp && gp.models > 1) return Math.floor(n / gp.models) * gp.ratings + (n % gp.models) * p.ratings;
    return n * p.ratings;
  }
  function totals() {
    const per = new Map();
    for (const m of castModels()) per.set(m.pid, (per.get(m.pid) || 0) + m.count);
    let total = 0, flat = 0;
    for (const [pid, n] of per) { const p = DB.byId.get(pid); total += costFor(p, n); flat += n * p.ratings; }
    return { total, flat, per };
  }

  /* ---------- actions ---------- */
  function addModel(pid) {
    const p = DB.byId.get(pid);
    if (!p) return;
    const single = p.type === 'star' || p.type === 'co-star';
    const ex = !single && state.entries.find(e => e.kind === 'model' && e.pid === pid);
    if (ex) ex.count++;
    else state.entries.push({ kind: 'model', uid: uid(), pid, count: 1 });
    toast(`Added ${p.name}`);
    commit();
  }
  function addUnit(unitId, picks) {
    const u = DB.unitById.get(unitId);
    state.entries.push({
      kind: 'unit', uid: uid(), unit: unitId, leader: u.leader,
      members: u.members.map((m, i) => ({ slot: i, pid: (picks && picks[i] && picks[i].pid) || m.any[0], count: (picks && picks[i] ? picks[i].count : 0) }))
    });
    toast(`Added ${u.name} unit`);
    commit();
  }

  /* ---------- rendering: browse ---------- */
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function genreChips(p, gs) {
    return `<span class="genres">${p.effGenres.map(g => `<span class="g ${gs && gs.has(g) ? 'hit' : ''}">${esc(g)}</span>`).join('')}</span>`;
  }
  function priceText(p) {
    const gp = p.groupPrice;
    return `${p.ratings}${gp ? ` <small>or ${gp.ratings} for ${gp.models}</small>` : ''}`;
  }
  function searchBlob(p) {
    return [p.name, ...(p.attacks || []).map(a => a.name), p.starQuality, ...(p.specialEffects || []), ...(p.stunts || []), ...(p.effGenres || [])].join(' ').toLowerCase();
  }

  function renderBrowse() {
    const list = $('#profileList');
    const gs = castGenres();
    const q = ui.search.trim().toLowerCase();
    if (ui.type === 'unit') return renderUnitBrowse(list, gs, q);
    let ps = DB.profiles.filter(p => p.type === ui.type);
    if (q) ps = ps.filter(p => searchBlob(p).includes(q));
    if (ui.genre) ps = ps.filter(p => p.effGenres.includes(ui.genre));
    if (!ui.showAll) ps = ps.filter(allowedAff);
    if (ui.fitOnly) ps = ps.filter(p => fitsGenre(p, gs));
    ps.sort((a, b) => a.name.localeCompare(b.name));
    if (!ps.length) { list.innerHTML = `<li class="empty">No ${TYPE_PLURAL[ui.type].toLowerCase()} match these filters. Clear the search or untick “Fits my cast”.</li>`; return; }
    list.innerHTML = ps.map(p => {
      const affOk = allowedAff(p);
      const fit = fitsGenre(p, gs);
      const flags = [];
      if (!affOk) flags.push(`<span class="flag bad">Not allowed in a ${state.affiliation} cast</span>`);
      if (affOk && !fit && gs.size) flags.push(`<span class="flag bad">Off-genre for your cast</span>`);
      if (p.source !== 'core') flags.push(`<span class="flag src">${esc(p.sourceShort)}</span>`);
      const leads = DB.units.filter(u => u.leader === p.id).map(u => u.name);
      if (leads.length) flags.push(`<span class="flag">Leads ${esc(leads.join(', '))}</span>`);
      return `<li class="prow ${affOk && (fit || !gs.size) ? '' : 'dim'}" style="--c:${TYPE_COLOR[p.type]}">
        <span class="stripe"></span>
        <div class="pmain" data-card="${p.id}" tabindex="0" role="button" aria-label="Show ${esc(p.name)} card">
          <div class="ptop"><span class="pname">${esc(p.name)}</span><span class="pcost">${priceText(p)}</span></div>
          <div class="pmeta"><span>${AFF_LABEL[p.affiliation]}</span>${genreChips(p, gs)}</div>
          ${flags.length ? `<div class="pflags">${flags.join('')}</div>` : ''}
        </div>
        <button class="padd" data-add="${p.id}" aria-label="Add ${esc(p.name)}" title="Add to cast">+</button>
      </li>`;
    }).join('');
  }

  function renderUnitBrowse(list, gs, q) {
    let us = DB.units.slice();
    if (q) us = us.filter(u => (u.name + ' ' + unitMemberNames(u)).toLowerCase().includes(q));
    if (!us.length) { list.innerHTML = `<li class="empty">No units match.</li>`; return; }
    list.innerHTML = us.map(u => {
      const L = DB.byId.get(u.leader);
      const members = u.members.map(m => `${m.max === 1 ? '1' : 'up to ' + m.max} ${m.any.map(id => DB.byId.get(id)?.name).filter(Boolean).join(' or ')}`).join(', ');
      const affOk = L && allowedAff(L);
      return `<li class="prow ${affOk ? '' : 'dim'}" style="--c:var(--unit)">
        <span class="stripe"></span>
        <div class="pmain" data-unit-info="${u.id}">
          <div class="ptop"><span class="pname">${esc(u.name)}</span><span class="pcost"><small>led by</small> ${esc(L ? L.name : '?')}</span></div>
          <div class="pmeta"><span>${esc(members)}</span></div>
          ${!affOk ? `<div class="pflags"><span class="flag bad">Leader not allowed in a ${state.affiliation} cast</span></div>` : ''}
        </div>
        <button class="padd" data-add-unit="${u.id}" aria-label="Add ${esc(u.name)} unit" title="Add unit">+</button>
      </li>`;
    }).join('');
  }
  const unitMemberNames = u => u.members.flatMap(m => m.any.map(id => DB.byId.get(id)?.name || '')).join(' ');

  /* ---------- rendering: cast ---------- */
  function renderCast() {
    const el = $('#castList');
    const gs = castGenres();
    const t = totals();
    const loose = state.entries.filter(e => e.kind === 'model' && DB.byId.has(e.pid));
    const units = state.entries.filter(e => e.kind === 'unit' && DB.unitById.has(e.unit));
    if (!loose.length && !units.length) {
      el.innerHTML = `<div class="cast-empty"><strong>Nobody’s cast yet</strong>Start with a Star or Co-Star: their genres decide which Extras fit.</div>`;
    } else {
      let html = '';
      for (const type of TYPES) {
        const rows = loose.filter(e => DB.byId.get(e.pid).type === type);
        if (!rows.length) continue;
        const sub = rows.reduce((s, e) => s + costFor(DB.byId.get(e.pid), e.count), 0);
        html += `<div class="cast-group" style="--c:${TYPE_COLOR[type]}"><h3><span>${TYPE_PLURAL[type]}</span><span>${sub}</span></h3>`;
        html += rows.map(e => castRow(e, gs)).join('');
        html += `</div>`;
      }
      if (units.length) {
        html += `<div class="cast-group" style="--c:var(--unit)"><h3><span>Units</span></h3>`;
        html += units.map(e => unitBlock(e, gs)).join('');
        html += `</div>`;
      }
      el.innerHTML = html;
    }
    // meter
    $('#ratingsTotal').textContent = t.total;
    $('#ratingsLimitOut').textContent = state.limit || '–';
    const pct = state.limit ? Math.min(100, t.total / state.limit * 100) : 0;
    $('#meterFill').style.width = pct + '%';
    $('#ratingsMeter').classList.toggle('over', !!state.limit && t.total > state.limit);
    const n = castModels().reduce((s, m) => s + m.count, 0);
    $('#tabCount').textContent = n ? `(${t.total})` : '';
    renderChecks(t, gs);
  }

  function castRow(e, gs) {
    const p = DB.byId.get(e.pid);
    const single = p.type === 'star' || p.type === 'co-star';
    const warn = [];
    if (!allowedAff(p)) warn.push(`${AFF_LABEL[p.affiliation]}`);
    if (!fitsGenre(p, gs) && gs.size) warn.push('off-genre');
    return `<div class="crow" style="--c:${TYPE_COLOR[p.type]}">
      <span class="stripe"></span>
      <div><div class="cname" data-card="${p.id}" tabindex="0" role="button">${esc(p.name)}</div>
        <div class="csub">${genreChips(p, gs)}${warn.length ? ` <span class="flag bad">${esc(warn.join(', '))}</span>` : ''}</div></div>
      ${single ? `<span></span>` : stepper(e.uid, e.count, 1, 99)}
      <div style="display:flex;align-items:center;gap:2px"><span class="ccost">${costFor(p, e.count)}</span><button class="iconbtn" data-remove="${e.uid}" aria-label="Remove ${esc(p.name)}" title="Remove">✕</button></div>
    </div>`;
  }
  function stepper(id, val, min, max, slot) {
    const s = slot != null ? ` data-slot="${slot}"` : '';
    return `<span class="stepper"><button data-step="-1" data-uid="${id}"${s} ${val <= min ? 'disabled' : ''} aria-label="One fewer">−</button><span>${val}</span><button data-step="1" data-uid="${id}"${s} ${val >= max ? 'disabled' : ''} aria-label="One more">+</button></span>`;
  }

  function unitBlock(e, gs) {
    const u = DB.unitById.get(e.unit);
    const L = DB.byId.get(e.leader);
    let cost = costFor(L, 1);
    const slots = u.members.map((m, i) => {
      const mm = e.members[i] || (e.members[i] = { slot: i, pid: m.any[0], count: 0 });
      const p = DB.byId.get(mm.pid) || DB.byId.get(m.any[0]);
      cost += costFor(p, mm.count);
      const choose = m.any.length > 1
        ? `<select data-unit-pick="${e.uid}" data-slot="${i}" aria-label="Choose model">${m.any.map(id => `<option value="${id}" ${id === mm.pid ? 'selected' : ''}>${esc(DB.byId.get(id)?.name || id)}</option>`).join('')}</select>`
        : `<span class="cname" data-card="${p.id}" tabindex="0" role="button">${esc(p.name)}</span>`;
      const warn = mm.count && ((!allowedAff(p) && AFF_LABEL[p.affiliation]) || (gs.size && !fitsGenre(p, gs) && 'off-genre'));
      return `<div class="unit-slot" style="--c:${TYPE_COLOR[p.type]}"><span class="stripe"></span>
        <div>${choose} <span class="cap">up to ${m.max}</span>${warn ? ` <span class="flag bad">${esc(warn)}</span>` : ''}</div>
        ${stepper(e.uid, mm.count, 0, m.max, i)}
        <span class="ccost">${costFor(p, mm.count)}</span></div>`;
    }).join('');
    const lw = (!allowedAff(L) && AFF_LABEL[L.affiliation]) || (gs.size && !fitsGenre(L, gs) && 'off-genre');
    return `<div class="unit-block">
      <div class="unit-head"><span class="uname">${esc(u.name)}</span><span style="display:flex;align-items:center;gap:2px"><span class="ucost">${cost}</span><button class="iconbtn" data-remove="${e.uid}" aria-label="Remove unit" title="Remove unit">✕</button></span></div>
      <div class="unit-slot" style="--c:${TYPE_COLOR[L.type]}"><span class="stripe"></span>
        <div><span class="cname" data-card="${L.id}" tabindex="0" role="button">${esc(L.name)}</span><span class="leader-tag">Unit leader</span>${lw ? ` <span class="flag bad">${esc(lw)}</span>` : ''}</div>
        <span></span><span class="ccost">${costFor(L, 1)}</span></div>
      ${slots}
    </div>`;
  }

  /* ---------- checks ---------- */
  function renderChecks(t, gs) {
    const items = [];
    const W = (txt) => items.push(['warn', '!', txt]);
    const I = (txt) => items.push(['info', 'i', txt]);
    const O = (txt) => items.push(['ok', '✓', txt]);
    const models = castModels();
    if (!models.length) { $('#checks').innerHTML = ''; return; }

    if (state.limit && t.total > state.limit) W(`<b>${t.total - state.limit} over</b> your ${state.limit}-rating limit.`);
    if (t.flat > t.total) I(`Group prices save you ${t.flat - t.total} rating${t.flat - t.total === 1 ? "" : "s"}.`);

    if (!hasLeads()) W('Add at least one Star or Co-Star. Their genres decide which Extras fit the cast.');
    else O(`Cast genres: <b>${[...gs].join(', ')}</b>.`);

    const bad = new Map(), off = new Map();
    for (const m of models) {
      const p = DB.byId.get(m.pid);
      if (!allowedAff(p)) bad.set(p.name, p);
      else if (gs.size && !fitsGenre(p, gs)) off.set(p.name, p);
    }
    if (bad.size) {
      const rule = state.affiliation === 'neutral' ? 'A neutral cast needs neutral Stars and Co-Stars (Extras can be any affiliation).' : `A ${state.affiliation} cast can only take ${state.affiliation} or neutral models.`;
      W(`${[...bad.keys()].join(', ')}: not allowed. ${rule}`);
    }
    if (off.size) W(`Off-genre: ${[...off.values()].map(p => `${p.name} (${p.effGenres.join(', ')})`).join('; ')}. Extras should share a genre with one of your Stars or Co-Stars.`);

    // Unique profiles
    for (const [pid, n] of t.per) {
      const p = DB.byId.get(pid);
      if (n > 1 && (p.specialEffects || []).some(s => /^Unique\b/.test(s))) W(`${p.name} is Unique: only one model with this profile name per cast.`);
    }
    // Stars/Co-stars duplicates
    const leadCount = new Map();
    for (const m of models) { const p = DB.byId.get(m.pid); if (p.type === 'star' || p.type === 'co-star') leadCount.set(p.name, (leadCount.get(p.name) || 0) + m.count); }
    for (const [n, c] of leadCount) if (c > 1) I(`${c} × ${n}. Fine if they’re different characters, but check with your opponent.`);
    // Carriage needs a Steed
    if (t.per.has('core-carriage') && !t.per.has('core-steed')) W('Carriage (Horse-Drawn): you must include at least one Steed to include a Carriage.');

    // Units
    for (const e of state.entries.filter(e => e.kind === 'unit' && DB.unitById.has(e.unit))) {
      const u = DB.unitById.get(e.unit);
      const n = e.members.reduce((s, m) => s + m.count, 0);
      if (!n) I(`${u.name} has no members yet. Use + on the member rows.`);
    }
    // Loose models that could act as a unit
    const looseCount = new Map();
    for (const e of state.entries) if (e.kind === 'model') looseCount.set(e.pid, (looseCount.get(e.pid) || 0) + e.count);
    for (const u of DB.units) {
      if (!looseCount.get(u.leader)) continue;
      const qual = u.members.map(m => { const have = m.any.reduce((s, id) => s + (looseCount.get(id) || 0), 0); return have ? { m, have } : null; }).filter(Boolean);
      if (!qual.length) continue;
      const parts = qual.map(({ m, have }) => {
        const nm = m.any.map(id => DB.byId.get(id).name).join(' or ');
        return have > m.max ? `${m.max} of your ${have} ${nm} (max ${m.max})` : `${have} ${nm}`;
      });
      I(`Your ${DB.byId.get(u.leader).name} can lead these as a <b>${u.name}</b> unit: ${parts.join(', ')}.`);
    }

    // Genre card
    if (state.genreCard) {
      const g = state.genreCard;
      const star = models.some(m => { const p = DB.byId.get(m.pid); return p.type === 'star' && p.effGenres.includes(g); });
      const co = star || models.some(m => { const p = DB.byId.get(m.pid); return p.type === 'co-star' && p.effGenres.includes(g); });
      const xn = models.filter(m => { const p = DB.byId.get(m.pid); return (p.type === 'extra' || p.type === 'vehicle') && p.effGenres.includes(g); }).reduce((s, m) => s + m.count, 0);
      const txt = `${g} genre card: free effect activates ${xn} Extra${xn === 1 ? '' : 's'}; ✪ effect ${co ? 'available' : 'needs a Star or Co-Star of this genre'}; ✪✪ effect ${star ? 'available' : 'needs a Star of this genre'}.`;
      (star ? O : co ? I : W)(txt);
    }

    $('#checks').innerHTML = items.map(([k, ic, txt]) => `<div class="check-item ${k}"><span class="ic">${ic}</span><span>${txt}</span></div>`).join('');
  }

  /* ---------- card view ---------- */
  function cardHTML(p) {
    const color = TYPE_COLOR[p.type];
    const gp = p.groupPrice ? `<div class="pcard-group">or ${p.groupPrice.ratings} for ${p.groupPrice.models} models</div>` : '';
    let stats = '';
    if (p.stats) {
      const order = [['fight', 'Fight'], ['mind', 'Mind'], ['shoot', 'Shoot'], ['body', 'Body'], ['defence', 'Defence'], ['spirit', 'Spirit']];
      stats = `<div class="stat-grid">${order.map(([k, l]) => `<div class="stat" style="--sc:${STAT_COLORS[k]}"><span>${l}</span><b>${p.stats[k]}</b></div>`).join('')}</div>`;
    } else if (p.vehicleStats) {
      const v = p.vehicleStats;
      stats = `<div class="stat-grid">${[['Capacity', v.capacity, '#5ba02e'], ['Defence', v.defence, '#d4a20a'], ['Speed', v.speed, '#2f8f73'], ['Armour', v.armour, '#3871c1']].map(([l, val, c]) => `<div class="stat" style="--sc:${c}"><span>${l}</span><b>${esc(val)}</b></div>`).join('')}</div>`;
    }
    const atks = (p.attacks || []).length ? `<table class="atk"><thead><tr><th>Attack</th><th>Range</th><th>Strike</th><th>Weapon effect</th></tr></thead><tbody>${p.attacks.map(a => `<tr>
      <td><span class="akind" title="${a.kind} attack">${ICONS[a.kind] || ''}</span>${esc(a.name)}${a.orNext ? '<span class="or">OR</span>' : ''}</td>
      <td>${esc(a.range)}</td><td class="strike">${esc(a.strike)}</td><td>${esc(a.effect)}</td></tr>`).join('')}</tbody></table>` : '';
    const list = (title, arr) => arr && arr.length ? `<div><h4>${title}</h4><ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    const back = [p.starQuality ? list('Star quality', [p.starQuality]) : '', list('Special effects', p.specialEffects), list('Stunts', p.stunts), list('Weapon effects', p.weaponEffects)].join('');
    const units = DB.units.filter(u => u.leader === p.id).map(u => u.name);
    const memberOf = DB.units.filter(u => u.members.some(m => m.any.includes(p.id))).map(u => u.name);
    return `<article class="pcard" style="--c:${color}">
      <div class="pcard-head"><div class="pcard-name">${esc(p.name)}</div><div class="pcard-rating">${p.ratings}</div>
        <div class="pcard-type">${AFF_LABEL[p.affiliation]} ${TYPE_LABEL[p.type]}</div>${gp}</div>
      ${stats}${atks}
      <div class="pcard-health"><span>Health</span><span class="pips">${'<i></i>'.repeat(p.health || 0)}</span>${genreChips(p)}</div>
      ${back ? `<div class="pcard-back">${back}</div>` : ''}
      ${units.length ? `<div class="pcard-src">Unit leader for ${esc(units.join(', '))}.</div>` : ''}
      ${memberOf.length ? `<div class="pcard-src">Can join: ${esc(memberOf.join(', '))}.</div>` : ''}
      <div class="pcard-src">${esc(p.sourceShort || p.source)} p.${p.page}. Effect names only — see the book for the rules.</div>
    </article>`;
  }
  function openCard(pid) {
    const p = DB.byId.get(pid); if (!p) return;
    $('#cardDialogBody').innerHTML = cardHTML(p);
    $('#cardDialog').showModal();
  }
  function openUnitInfo(uid_) {
    const u = DB.unitById.get(uid_); if (!u) return;
    const L = DB.byId.get(u.leader);
    const body = $('#unitDialogBody');
    const picks = u.members.map(m => ({ pid: m.any[0], count: 0 }));
    const draw = () => {
      let cost = costFor(L, 1) + picks.reduce((s, pk) => s + costFor(DB.byId.get(pk.pid), pk.count), 0);
      body.innerHTML = `<div class="unit-pick"><h2>${esc(u.name)}</h2>
        <p class="muted small">Unit Leader lets the leader activate unit members within 6” for free. Members beyond the maximums can still be in your cast, they just don’t benefit. Core p.${u.page}.</p>
        <div class="unit-slot" style="--c:${TYPE_COLOR[L.type]}"><span class="stripe"></span><div><b>${esc(L.name)}</b><span class="leader-tag">Unit leader</span></div><span></span><span class="ccost">${costFor(L, 1)}</span></div>
        ${u.members.map((m, i) => { const p = DB.byId.get(picks[i].pid); return `<div class="unit-slot" style="--c:${TYPE_COLOR[p.type]}"><span class="stripe"></span>
          <div>${m.any.length > 1 ? `<select data-dpick="${i}">${m.any.map(id => `<option value="${id}" ${id === picks[i].pid ? 'selected' : ''}>${esc(DB.byId.get(id).name)}</option>`).join('')}</select>` : `<b>${esc(p.name)}</b>`} <span class="cap">up to ${m.max}</span></div>
          ${stepper('dlg', picks[i].count, 0, m.max, i)}<span class="ccost">${costFor(p, picks[i].count)}</span></div>`; }).join('')}
        <div class="unit-head" style="margin-top:10px"><span>Unit total</span><span class="ucost">${cost} ratings</span></div>
      </div>
      <div class="dialog-foot"><button class="btn" data-dclose>Cancel</button><button class="btn primary" data-dadd>Add unit to cast</button></div>`;
    };
    body.onclick = ev => {
      const st = ev.target.closest('[data-step]');
      if (st) { const i = +st.dataset.slot; picks[i].count = Math.max(0, Math.min(u.members[i].max, picks[i].count + +st.dataset.step)); draw(); return; }
      if (ev.target.closest('[data-dclose]')) { $('#unitDialog').close(); return; }
      if (ev.target.closest('[data-dadd]')) { $('#unitDialog').close(); addUnit(u.id, picks); }
    };
    body.onchange = ev => { const s = ev.target.closest('[data-dpick]'); if (s) { picks[+s.dataset.dpick].pid = s.value; draw(); } };
    draw();
    $('#unitDialog').showModal();
  }

  /* ---------- persistence & sharing ---------- */
  function serialize() {
    return {
      v: 1, n: state.name, a: state.affiliation, l: state.limit, g: state.genreCard, s: state.sources,
      e: state.entries.map(e => e.kind === 'model' ? [e.pid, e.count] : ['u', e.unit, e.leader, e.members.map(m => [m.slot, m.pid, m.count])])
    };
  }
  function deserialize(o) {
    const s = DEFAULT();
    if (!o) return s;
    s.name = o.n || ''; s.affiliation = o.a || 'heroic'; s.limit = Number.isFinite(o.l) ? o.l : 25; s.genreCard = o.g || '';
    if (Array.isArray(o.s)) s.sources = o.s.filter(id => DB.sources.some(x => x.id === id));
    if (!s.sources.includes('core')) s.sources.unshift('core');
    s.entries = (o.e || []).map(x => x[0] === 'u'
      ? { kind: 'unit', uid: uid(), unit: x[1], leader: x[2], members: (x[3] || []).map(([slot, pid, count]) => ({ slot, pid, count })) }
      : { kind: 'model', uid: uid(), pid: x[0], count: x[1] || 1 });
    return s;
  }
  const b64e = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = str => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  function shareURL() { return location.origin + location.pathname + '#c=' + b64e(JSON.stringify(serialize())); }
  const LS_CUR = '7tv.current', LS_SAVED = '7tv.saved';
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

  function commit() {
    lsSet(LS_CUR, serialize());
    renderAll();
  }
  function renderAll() { renderBrowse(); renderCast(); syncSettings(); }

  function castText() {
    const t = totals();
    const lines = [`${state.name || 'Untitled cast'} — ${AFF_LABEL[state.affiliation]} cast, ${t.total}${state.limit ? '/' + state.limit : ''} ratings`];
    const gs = castGenres();
    if (gs.size) lines.push(`Genres: ${[...gs].join(', ')}${state.genreCard ? ` · Genre card: ${state.genreCard}` : ''}`);
    for (const type of TYPES) {
      const rows = state.entries.filter(e => e.kind === 'model' && DB.byId.get(e.pid)?.type === type);
      if (!rows.length) continue;
      lines.push('', TYPE_PLURAL[type] + ':');
      rows.forEach(e => { const p = DB.byId.get(e.pid); lines.push(`  ${e.count > 1 ? e.count + '× ' : ''}${p.name} (${costFor(p, e.count)})`); });
    }
    const units = state.entries.filter(e => e.kind === 'unit');
    if (units.length) lines.push('', 'Units:');
    for (const e of units) {
      const u = DB.unitById.get(e.unit); const L = DB.byId.get(e.leader);
      lines.push(`  ${u.name}: ${L.name} (leader)` + e.members.filter(m => m.count).map(m => `, ${m.count}× ${DB.byId.get(m.pid).name}`).join(''));
    }
    if (t.flat > t.total) lines.push('', `Includes group prices (saves ${t.flat - t.total}).`);
    return lines.join('\n');
  }

  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch { window.prompt('Copy this:', text); }
  }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

  function renderPrint() {
    const t = totals();
    const pids = [...new Set(castModels().map(m => m.pid))];
    $('#printArea').innerHTML = `<div class="print-sheet"><h1>${esc(state.name || 'Untitled cast')}</h1>
      <pre style="font-family:var(--body);white-space:pre-wrap">${esc(castText())}</pre>
      <div class="print-cards">${pids.map(id => cardHTML(DB.byId.get(id))).join('')}</div></div>`;
    void t;
  }

  function openSaved() {
    const saved = lsGet(LS_SAVED) || [];
    $('#savedList').innerHTML = saved.length ? saved.map((s, i) => `<li><span><span class="sname">${esc(s.data.n || 'Untitled cast')}</span> <span class="muted small">${esc(AFF_LABEL[s.data.a] || '')} · ${new Date(s.at).toLocaleDateString()}</span></span>
      <span><button class="btn" data-load="${i}">Open</button> <button class="btn ghost" data-del="${i}">Delete</button></span></li>`).join('')
      : `<li class="muted">No saved casts yet. Build one and press Save.</li>`;
    $('#loadDialog').showModal();
  }

  /* ---------- settings ---------- */
  function syncSettings() {
    $('#castName').value = state.name;
    $('#ratingsLimit').value = state.limit;
    document.querySelectorAll('#affSeg button').forEach(b => b.classList.toggle('on', b.dataset.aff === state.affiliation));
    const gc = $('#genreCard');
    gc.innerHTML = `<option value="">None chosen</option>` + DB.genreCards.map(g => `<option ${g === state.genreCard ? 'selected' : ''}>${esc(g)}</option>`).join('');
    const gf = $('#genreFilter');
    gf.innerHTML = `<option value="">All genres</option>` + DB.genres.map(g => `<option ${g === ui.genre ? 'selected' : ''}>${esc(g)}</option>`).join('');
    $('#sourceToggles').innerHTML = DB.sources.map(s => `<label class="check"><input type="checkbox" data-src="${s.id}" ${state.sources.includes(s.id) ? 'checked' : ''} ${s.id === 'core' ? 'disabled' : ''}> ${esc(s.name)}</label>`).join('');
  }

  function bind() {
    document.addEventListener('click', ev => {
      const a = ev.target.closest('[data-add]'); if (a) return addModel(a.dataset.add);
      const au = ev.target.closest('[data-add-unit]'); if (au) return openUnitInfo(au.dataset.addUnit);
      const ui_ = ev.target.closest('[data-unit-info]'); if (ui_) return openUnitInfo(ui_.dataset.unitInfo);
      const c = ev.target.closest('[data-card]'); if (c) return openCard(c.dataset.card);
      const r = ev.target.closest('[data-remove]');
      if (r) { state.entries = state.entries.filter(e => e.uid !== r.dataset.remove); return commit(); }
      const st = ev.target.closest('#castList [data-step]');
      if (st) {
        const e = state.entries.find(x => x.uid === st.dataset.uid); if (!e) return;
        const d = +st.dataset.step;
        if (e.kind === 'model') { e.count = Math.max(1, e.count + d); }
        else { const i = +st.dataset.slot; const max = DB.unitById.get(e.unit).members[i].max; e.members[i].count = Math.max(0, Math.min(max, e.members[i].count + d)); }
        return commit();
      }
      const tab = ev.target.closest('#typeTabs button');
      if (tab) { ui.type = tab.dataset.type; document.querySelectorAll('#typeTabs button').forEach(b => b.classList.toggle('on', b === tab)); return renderBrowse(); }
      const aff = ev.target.closest('#affSeg button'); if (aff) { state.affiliation = aff.dataset.aff; return commit(); }
      const mt = ev.target.closest('.mobile-tabs button');
      if (mt) { document.body.dataset.view = mt.dataset.view; document.querySelectorAll('.mobile-tabs button').forEach(b => b.classList.toggle('on', b === mt)); window.scrollTo(0, 0); return; }
      const ld = ev.target.closest('[data-load]');
      if (ld) { const s = (lsGet(LS_SAVED) || [])[+ld.dataset.load]; if (s) { state = deserialize(s.data); buildPool(); commit(); } $('#loadDialog').close(); return; }
      const dl = ev.target.closest('[data-del]');
      if (dl) { const saved = lsGet(LS_SAVED) || []; saved.splice(+dl.dataset.del, 1); lsSet(LS_SAVED, saved); openSaved(); return; }
    });
    document.addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-card][role=button]')) { ev.preventDefault(); openCard(ev.target.dataset.card); }
    });
    document.addEventListener('change', ev => {
      const up = ev.target.closest('[data-unit-pick]');
      if (up) { const e = state.entries.find(x => x.uid === up.dataset.unitPick); e.members[+up.dataset.slot].pid = up.value; return commit(); }
      const src = ev.target.closest('[data-src]');
      if (src) {
        const id = src.dataset.src;
        state.sources = src.checked ? [...new Set([...state.sources, id])] : state.sources.filter(x => x !== id);
        buildPool(); return commit();
      }
    });
    $('#search').addEventListener('input', e => { ui.search = e.target.value; renderBrowse(); });
    $('#genreFilter').addEventListener('change', e => { ui.genre = e.target.value; renderBrowse(); });
    $('#fitOnly').addEventListener('change', e => { ui.fitOnly = e.target.checked; renderBrowse(); });
    $('#showAll').addEventListener('change', e => { ui.showAll = e.target.checked; renderBrowse(); });
    $('#castName').addEventListener('input', e => { state.name = e.target.value; lsSet(LS_CUR, serialize()); });
    $('#ratingsLimit').addEventListener('input', e => { state.limit = Math.max(0, parseInt(e.target.value, 10) || 0); lsSet(LS_CUR, serialize()); renderCast(); });
    $('#genreCard').addEventListener('change', e => { state.genreCard = e.target.value; commit(); });
    $('#btnShare').addEventListener('click', () => copy(shareURL(), 'Share link copied'));
    $('#btnText').addEventListener('click', () => copy(castText(), 'Cast list copied'));
    $('#btnPrint').addEventListener('click', () => { renderPrint(); window.print(); });
    $('#btnSave').addEventListener('click', () => {
      const saved = lsGet(LS_SAVED) || [];
      const data = serialize();
      const i = saved.findIndex(s => (s.data.n || '') === (data.n || '') && data.n);
      if (i >= 0) saved[i] = { at: Date.now(), data }; else saved.unshift({ at: Date.now(), data });
      lsSet(LS_SAVED, saved); toast(`Saved “${data.n || 'Untitled cast'}” in this browser`);
    });
    $('#btnLoad').addEventListener('click', openSaved);
    $('#btnNew').addEventListener('click', () => {
      if (state.entries.length && !confirm('Start a new cast? Unsaved changes to this one will be lost.')) return;
      state = DEFAULT(); buildPool(); commit();
    });
    window.addEventListener('hashchange', loadFromHash);
  }

  function loadFromHash() {
    const m = location.hash.match(/#c=([A-Za-z0-9_-]+)/);
    if (!m) return false;
    try { state = deserialize(JSON.parse(b64d(m[1]))); buildPool(); commit(); toast('Loaded shared cast'); }
    catch (e) { toast('That share link is damaged'); return false; }
    history.replaceState(null, '', location.pathname);
    return true;
  }

  async function init() {
    document.body.dataset.view = 'browse';
    await loadData();
    state = deserialize(lsGet(LS_CUR));
    if (!lsGet(LS_CUR)) state = DEFAULT();
    buildPool();
    bind();
    if (!loadFromHash()) renderAll();
  }
  init();
})();
