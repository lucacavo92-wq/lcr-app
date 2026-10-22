/* LCR - app web mobile-first. Nessun build. Tutto il testo dal database entra nella pagina
   solo con textContent / nodi di testo (mai HTML da stringhe). */
(function () {
'use strict';

const CFG = window.LCR_CONFIG || {};
// Demo SOLO da localhost con ?demo=1: dati inventati in memoria, nessuna chiamata a Supabase.
const DEMO = ['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0 &&
  new URLSearchParams(location.search).get('demo') === '1';

/* ------------------------------------------------------------------ utilita' */
const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const numFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 4, useGrouping: 'always' });
const coll = new Intl.Collator('it', { sensitivity: 'base', numeric: true });
const fmtEur = (n) => eurFmt.format(Number(n) || 0);
const fmtNum = (n) => numFmt.format(Number(n) || 0);
const fmtData = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const isoLocale = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
// "12,5" / "1.234,56" / "12.5" -> numero; vuoto -> NaN
function parseNum(s) {
  s = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (s === '') return NaN;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
const toStr = (n) => (n == null ? '' : String(n).replace('.', ','));

// Crea elementi DOM: attributi, testo e figli sempre come nodi di testo
function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  for (const k in (a || {})) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c);
  return e;
}
const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  schede: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h4',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  back: 'M15 5l-7 7 7 7',
  out: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  x: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  note: 'M6 3h9l4 4v14H6zM9 12h7M9 16h7',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 12h.01M18 12h.01'
};
function ic(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICONS[name]);
  s.append(p);
  return s;
}
const btn = (label, icon, cls, onclick, extra) =>
  h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick }, extra || {}), icon ? ic(icon) : null, label ? h('span', { text: label }) : null);
const ibtn = (icon, label, cls, onclick) =>
  h('button', { type: 'button', class: 'btn ibtn ' + (cls || ''), 'aria-label': label, onclick }, ic(icon));

/* ------------------------------------------------------------------ stato UI: caricamento, avvisi, finestre */
const $ = (id) => document.getElementById(id);
let busyN = 0;
function busy(d) { busyN = Math.max(0, busyN + d); $('bar').classList.toggle('on', busyN > 0); }

let toastEl = null, toastT = 0;
function toast(msg, err) {
  if (!toastEl) { toastEl = h('div', { id: 'toast', role: 'status' }); $('layer').append(toastEl); }
  toastEl.replaceChildren(h('div', { class: 'toast' + (err ? ' err' : ''), text: msg }));
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.replaceChildren(), err ? 5000 : 2200);
}

// Tendina a scorrimento dal basso
const sheets = [];
function openSheet(title) {
  const body = h('div', { class: 'sheet-b' });
  const titleEl = h('h3', { text: title });
  const ov = h('div', { class: 'ov' });
  const api = {
    body,
    setTitle: (t) => { titleEl.textContent = t; },
    set: (...n) => { body.replaceChildren(...n); body.scrollTop = 0; },
    close: () => { const i = sheets.indexOf(api); if (i >= 0) sheets.splice(i, 1); ov.remove(); }
  };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-h' }, titleEl, ibtn('x', 'Chiudi', 'sec', api.close)), body);
  ov.append(panel);
  ov.addEventListener('click', (e) => { if (e.target === ov) api.close(); });
  $('layer').append(ov);
  requestAnimationFrame(() => ov.classList.add('open'));
  sheets.push(api);
  return api;
}
function closeSheets() { sheets.slice().forEach((s) => s.close()); }

function confirmDlg(text, okLabel) {
  return new Promise((res) => {
    const ov = h('div', { class: 'ov dlg open' });
    const fine = (v) => { ov.remove(); res(v); };
    ov.append(h('div', { class: 'box', role: 'alertdialog', 'aria-modal': 'true' },
      h('p', { text }),
      h('div', { class: 'btns' }, btn('Annulla', null, 'sec', () => fine(false)), btn(okLabel || 'Conferma', null, '', () => fine(true)))));
    $('layer').append(ov);
  });
}

// Esegue un'operazione con barra di caricamento e gestione errori
async function run(fn) {
  busy(1);
  try { return await fn(); }
  catch (e) { fail(e); }
  finally { busy(-1); }
}
function fail(e) {
  const m = String((e && e.message) || e || 'Errore');
  if (/jwt|not authenticated|refresh_token|invalid claim/i.test(m) && !DEMO) { showLogin('Sessione scaduta'); return; }
  toast(m, true);
}

/* ------------------------------------------------------------------ strato dati: Supabase */
let sb = null;
function ok(r) { if (r.error) throw r.error; return r.data; }

// Movimenti: prelievo = categoria 'Prelievo personale'; le uscite NON includono i prelievi
const CAT_PRELIEVO = 'Prelievo personale';
const isPrelievo = (m) => m.categoria === CAT_PRELIEVO;
const meseRange = (ym) => { // 'AAAA-MM' -> [inizio, fine escluso]
  const [y, m] = ym.split('-').map(Number);
  const nx = new Date(y, m, 1);
  return [ym + '-01', nx.getFullYear() + '-' + pad(nx.getMonth() + 1) + '-01'];
};
function movFiltro(q, f) {
  if (f.tipo === 'entrate') q = q.eq('tipo', 'Entrata');
  else if (f.tipo === 'uscite') q = q.eq('tipo', 'Uscita').neq('categoria', CAT_PRELIEVO);
  else if (f.tipo === 'prelievi') q = q.eq('categoria', CAT_PRELIEVO);
  if (f.mese) { const r = meseRange(f.mese); q = q.gte('data', r[0]).lt('data', r[1]); }
  return q;
}
function movSomma(t, m) {
  const v = Number(m.totale) || 0;
  if (isPrelievo(m)) t.prelievi += v;
  else if (m.tipo === 'Entrata') t.entrate += v;
  else t.uscite += v;
}

function realApi() {
  const registra = async (operazione, dettagli) => {
    // Le modifiche dirette lasciano traccia nel registro (le RPC lo fanno da sole)
    try { await sb.from('lcr_registro_modifiche').insert({ operazione, dettagli: dettagli || '' }); } catch (e) { /* traccia non riuscita: non blocca */ }
  };
  const det = (o) => Object.keys(o).map((k) => k + '=' + o[k]).join('; ');

  // Guadagno del mese = somma di (prezzo_finale - costo_materiali) delle schede il cui incasso
  // (movimento contabile Entrata non annullato, con scheda_id) cade nel mese corrente.
  // Movimenti senza scheda collegata: non contano. Ogni scheda e' contata una volta sola.
  async function guadagnoMese() {
    const now = new Date();
    const a = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-01';
    const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const b = nx.getFullYear() + '-' + pad(nx.getMonth() + 1) + '-01';
    const mov = ok(await sb.from('lcr_movimenti_contabili').select('scheda_id')
      .eq('tipo', 'Entrata').eq('annullato', false).not('scheda_id', 'is', null).gte('data', a).lt('data', b));
    const ids = Array.from(new Set(mov.map((m) => m.scheda_id)));
    if (!ids.length) return 0;
    const sc = ok(await sb.from('lcr_schede').select('prezzo_finale,costo_materiali').in('id', ids));
    return round2(sc.reduce((t, s) => t + Number(s.prezzo_finale) - Number(s.costo_materiali), 0));
  }

  return {
    // Home: solo schede aperte e lavori da fare (nessun importo)
    async home() {
      const [aperte, lavori] = await Promise.all([
        sb.from('lcr_schede').select('id,codice,cliente_testo,moto_testo,prezzo_finale,stato,pagamento').neq('stato', 'Completato').order('id', { ascending: false }),
        sb.from('lcr_lavori_da_fare').select('*').order('fatto', { ascending: true }).order('id', { ascending: false })
      ]);
      return { schedeAperte: ok(aperte), lavori: ok(lavori) };
    },
    // Contabilita': tutto il blocco soldi
    async riepilogo() {
      const [v, daInc, guad] = await Promise.all([
        sb.from('lcr_v_riepilogo').select('*').single(),
        sb.from('lcr_schede').select('prezzo_finale').neq('pagamento', 'Incassato'),
        guadagnoMese()
      ]);
      const r = ok(v), di = ok(daInc);
      return {
        cassa: Number(r.cassa_teorica), daIncassare: Number(r.da_incassare), daPagare: Number(r.da_pagare_fornitori),
        magazzino: Number(r.valore_magazzino), guadagnoMese: guad, prelievi: Number(r.prelievi) || 0,
        entratePreviste: round2(di.reduce((t, s) => t + Number(s.prezzo_finale), 0)), entrateN: di.length
      };
    },
    async schede() {
      return ok(await sb.from('lcr_schede').select('id,codice,cliente_testo,moto_testo,descrizione,prezzo_finale,stato,pagamento').order('id', { ascending: false }));
    },
    async scheda(id) {
      const [s, r] = await Promise.all([
        sb.from('lcr_schede').select('*').eq('id', id).single(),
        sb.from('lcr_righe_scheda').select('*').eq('scheda_id', id).order('id')
      ]);
      return { scheda: ok(s), righe: ok(r) };
    },
    async updateScheda(id, campi, codice) {
      ok(await sb.from('lcr_schede').update(campi).eq('id', id));
      await registra('Modifica scheda ' + codice + ' (app)', det(campi));
    },
    async ricalcola(id) { ok(await sb.rpc('lcr_ricalcola_scheda', { p_scheda: id, p_registra: true })); },
    async aggiungiRiga(scheda, articolo, q, prezzo, nota) {
      return ok(await sb.rpc('lcr_aggiungi_riga_magazzino', { p_scheda: scheda, p_articolo: articolo, p_quantita: q, p_prezzo: prezzo, p_nota: nota || '' }));
    },
    async rimuoviRiga(riga, motivo) { ok(await sb.rpc('lcr_rimuovi_riga', { p_riga: riga, p_motivo: motivo || '' })); },
    async aggiungiExtra(scheda, voce, prezzo) { ok(await sb.rpc('lcr_aggiungi_extra', { p_scheda: scheda, p_voce: voce, p_prezzo: prezzo })); },
    async rimuoviExtra(riga) { ok(await sb.rpc('lcr_rimuovi_extra', { p_riga: riga })); },
    async articoli() { return ok(await sb.from('lcr_articoli').select('*').order('nome')); },
    async updateArticolo(id, campi, codice) {
      ok(await sb.from('lcr_articoli').update(campi).eq('id', id));
      await registra('Modifica articolo ' + codice + ' (app)', det(campi));
    },
    async creaArticolo(campi) {
      const r = ok(await sb.from('lcr_articoli').insert(campi).select('id').single());
      await registra('Nuovo articolo ' + campi.codice + ' (app)', det(campi));
      return r.id;
    },
    async carico(id, q, costo, nota) { ok(await sb.rpc('lcr_carico_magazzino', { p_articolo: id, p_quantita: q, p_costo: costo, p_nota: nota || '' })); },
    // Movimenti (sola lettura): f = { tipo, mese }; blocchi con range
    async movimenti(f, da, n) {
      return ok(await movFiltro(sb.from('lcr_movimenti_contabili')
        .select('id,data,tipo,categoria,descrizione,controparte,totale,stato_pagamento,fondo,annullato'), f)
        .order('data', { ascending: false }).order('id', { ascending: false }).range(da, da + n - 1));
    },
    async movimentiTotali(f) {
      const t = { entrate: 0, uscite: 0, prelievi: 0 };
      for (let da = 0; ; da += 1000) {
        const b = ok(await movFiltro(sb.from('lcr_movimenti_contabili').select('tipo,categoria,totale').eq('annullato', false), f)
          .order('id').range(da, da + 999));
        b.forEach((m) => movSomma(t, m));
        if (b.length < 1000) break;
      }
      return { entrate: round2(t.entrate), uscite: round2(t.uscite), prelievi: round2(t.prelievi) };
    },
    async prelievo(importo, nota, data) { ok(await sb.rpc('lcr_prelievo', { p_importo: importo, p_nota: nota || '', p_data: data })); },
    async aggiungiLavoro(testo) { ok(await sb.from('lcr_lavori_da_fare').insert({ testo })); },
    async lavoroFatto(id, fatto) { ok(await sb.from('lcr_lavori_da_fare').update({ fatto }).eq('id', id)); },
    async lavoroModifica(id, testo, note) { ok(await sb.from('lcr_lavori_da_fare').update({ testo, note }).eq('id', id)); },
    async lavoroElimina(id) { ok(await sb.from('lcr_lavori_da_fare').delete().eq('id', id)); }
  };
}

/* ------------------------------------------------------------------ strato dati: DEMO (dati inventati, in memoria) */
function demoApi() {
  const oggi = isoLocale(new Date());
  const clienti = ['Marco Bianchi', 'Giulia Verdi', 'Paolo Neri', 'Sara Gallo', 'Luigi Fontana', 'Elena Riva', 'Davide Costa'];
  const A = (id, nome, marchio, sezione, giac, unita, costo, prezzo) =>
    ({ id, codice: 'ART-' + pad(id), nome, marchio, sezione, giacenza: giac, unita, costo_unit: costo, prezzo_vendita: prezzo, scorta_min: 0, note: '' });
  const articoli = [
    A(1, 'Olio motore 10W40 1L', 'Motul', 'Oli', 12, 'pz', 11.5, 15),
    A(2, 'Olio motore 5W40 4L', 'Liqui Moly', 'Oli', 3, 'pz', 38, 49),
    A(3, 'Olio forcella 5W', 'Motorex', 'Oli', 6, 'pz', 14, 18),
    A(4, 'Liquido refrigerante 1L', 'Motocool', 'Liquidi refrigeranti', 8, 'pz', 7, 9),
    A(5, 'Liquido refrigerante pronto 5L', 'Motocool', 'Liquidi refrigeranti', 0, 'pz', 24, 30),
    A(6, 'Pastiglie freno anteriori', 'Nissin', 'Ricambi generici', 4, 'pz', 18, 28),
    A(7, 'Pastiglie freno posteriori', 'Galfer', 'Ricambi generici', 2, 'pz', 15, null),
    A(8, 'Disco freno anteriore', 'Newfren', 'Ricambi generici', 1, 'pz', 62, 90),
    A(9, 'Filtro aria', 'Twin Air', 'Ricambi generici', 5, 'pz', 22, 32),
    A(10, 'Kit catena 520', 'JT', 'Ricambi generici', 0, 'pz', 70, 105),
    A(11, 'Paraolio forcella 48mm', 'KYB', 'Ricambi generici', 6, 'pz', 9, 14),
    A(12, 'Manopole', 'Rtech', 'Ricambi generici', 3, 'pz', 8, 13),
    A(13, 'Spray pulisci freni', '', 'Materiali di consumo', 14, 'pz', 3.2, null),
    A(14, 'Grasso rame', '', 'Materiali di consumo', 2, 'pz', 6, null),
    A(15, 'Straccio industriale', '', 'Materiali di consumo', 40, 'pz', 0.4, null),
    A(16, 'Olio catena spray', 'Motorex', 'Oli', 7, 'pz', 8, 12)
  ];
  const S = (id, cli, moto, desc, ore, stato, pag, extra) =>
    Object.assign({ id, codice: 'LAV-' + String(id).padStart(4, '0'), cliente_testo: cli, moto_testo: moto, descrizione: desc, ore, tariffa: 20,
      costo_materiali: 0, prezzo_finale: 0, prezzo_manuale: false, stato, pagamento: pag, metodo_pagamento: '',
      data_apertura: oggi, data_chiusura: null, note: '' }, extra || {});
  const schede = [
    S(1, clienti[0], 'Honda CBR 600', 'Tagliando completo', 2.5, 'Completato', 'Incassato', { metodo_pagamento: 'Contanti' }),
    S(2, clienti[1], 'Yamaha MT-07', 'Cambio pastiglie e olio', 1.5, 'In lavorazione', 'Da incassare'),
    S(3, clienti[2], 'KTM EXC 250', 'Revisione forcella', 4, 'Aperto', 'Da incassare', { note: 'Cliente passa sabato' }),
    S(4, clienti[3], 'Ducati Monster', 'Kit catena', 2, 'Completato', 'Da incassare'),
    S(5, clienti[4], 'Suzuki GSX-R 750', 'Lavaggio e controllo', 1, 'Aperto', 'Parziale', { prezzo_manuale: true, prezzo_finale: 30 })
  ];
  let righe = [];
  let nRiga = 1, nArt = 17, nLav = 4;
  const gg = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocale(d); };
  const M = (id, off, tipo, categoria, descrizione, controparte, totale, extra) =>
    Object.assign({ id, data: gg(off), tipo, categoria, descrizione, controparte, totale, stato_pagamento: 'Pagato',
      fondo: 'Budget iniziale', annullato: false, scheda_id: null }, extra || {});
  let nMov = 100;
  const movimenti = [
    M(1, 0, 'Entrata', 'Lavori', 'Incasso LAV-0001', 'Marco Bianchi', 150, { scheda_id: 1 }),
    M(2, 0, 'Entrata', 'Vendita', 'Vendita ricambi al banco', '', 45),
    M(3, 3, 'Uscita', 'Materiali', 'Olio e filtri', 'Ricambi Rossi', 120.5),
    M(4, 6, 'Uscita', 'Materiali', 'Kit catena', 'Moto Parts', 70, { stato_pagamento: 'Da pagare' }),
    M(5, 9, 'Entrata', 'Lavori', 'Incasso errato', 'Paolo Neri', 80, { annullato: true }),
    M(6, 12, 'Uscita', 'Prelievo personale', 'Prelievo personale', '', 200, { fondo: 'Conto personale - fuori budget' }),
    M(7, 20, 'Uscita', 'Utenze', 'Luce officina', 'Energia Spa', 96.9),
    M(8, 35, 'Entrata', 'Lavori', 'Incasso tagliando', 'Giulia Verdi', 180),
    M(9, 40, 'Uscita', 'Affitto', 'Affitto locale', 'Immobiliare Sole', 400),
    M(10, 45, 'Uscita', 'Prelievo personale', 'Prelievo personale', '', 100, { fondo: 'Conto personale - fuori budget' })
  ];
  const movFiltra = (f) => movimenti.filter((m) => (
    f.tipo === 'entrate' ? m.tipo === 'Entrata' : f.tipo === 'uscite' ? m.tipo === 'Uscita' && !isPrelievo(m) : f.tipo === 'prelievi' ? isPrelievo(m) : true) &&
    (!f.mese || m.data.slice(0, 7) === f.mese))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.id - a.id));
  const prelieviTot = () => round2(movimenti.filter((m) => isPrelievo(m) && !m.annullato).reduce((t, m) => t + m.totale, 0));
  const lavori = [
    { id: 1, testo: 'Ordinare filtri olio', fatto: false, note: '' }, { id: 2, testo: 'Chiamare il fornitore pneumatici', fatto: false, note: '' },
    { id: 3, testo: 'Pulire il banco', fatto: true, note: '' }
  ];
  const attesa = () => new Promise((r) => setTimeout(r, 120));
  const trova = (id) => schede.find((s) => s.id === id);
  function ricalc(id) {
    const s = trova(id);
    const mine = righe.filter((r) => r.scheda_id === id);
    s.costo_materiali = round2(mine.reduce((t, r) => t + r.quantita * r.costo_unit, 0));
    if (!s.prezzo_manuale) s.prezzo_finale = round2(s.ore * s.tariffa + mine.reduce((t, r) => t + r.quantita * r.prezzo_unit, 0));
  }
  function add(id, a, q, p) {
    const art = articoli.find((x) => x.id === a);
    righe.push({ id: nRiga++, scheda_id: id, articolo_id: a, nome: art.nome, origine: 'magazzino', quantita: q, costo_unit: art.costo_unit, prezzo_unit: p });
    art.giacenza -= q;
    ricalc(id);
  }
  schede.forEach((s) => ricalc(s.id));
  add(1, 1, 1, 15); add(2, 6, 1, 28); add(2, 1, 1, 15); add(4, 7, 2, 24);
  righe.push({ id: nRiga++, scheda_id: 3, articolo_id: null, nome: 'Revisione esterna (lavoro)', origine: 'esterno', quantita: 1, costo_unit: 40, prezzo_unit: 60 });
  ricalc(3);

  const copia = (o) => Object.assign({}, o);
  return {
    async riepilogo() {
      await attesa();
      const di = schede.filter((s) => s.pagamento !== 'Incassato');
      const entrate = schede.filter((s) => s.pagamento === 'Incassato').reduce((t, s) => t + s.prezzo_finale, 0);
      const ym = oggi.slice(0, 7);
      const ids = Array.from(new Set(movimenti.filter((m) => m.tipo === 'Entrata' && !m.annullato && m.scheda_id && m.data.slice(0, 7) === ym).map((m) => m.scheda_id)));
      return {
        cassa: round2(1000 + entrate - 312.4 - prelieviTot()), prelievi: prelieviTot(), daIncassare: round2(di.reduce((t, s) => t + s.prezzo_finale, 0)), daPagare: 245.5,
        magazzino: round2(articoli.reduce((t, a) => t + a.giacenza * a.costo_unit, 0)),
        guadagnoMese: round2(ids.reduce((t, i) => t + trova(i).prezzo_finale - trova(i).costo_materiali, 0)),
        entratePreviste: round2(di.reduce((t, s) => t + s.prezzo_finale, 0)), entrateN: di.length
      };
    },
    async home() {
      await attesa();
      return {
        schedeAperte: schede.filter((s) => s.stato !== 'Completato').sort((a, b) => b.id - a.id).map(copia),
        lavori: lavori.slice().sort((a, b) => (a.fatto - b.fatto) || (b.id - a.id)).map(copia)
      };
    },
    async schede() { await attesa(); return schede.slice().sort((a, b) => b.id - a.id).map(copia); },
    async scheda(id) { await attesa(); return { scheda: copia(trova(id)), righe: righe.filter((r) => r.scheda_id === id).map(copia) }; },
    async updateScheda(id, campi) { await attesa(); Object.assign(trova(id), campi); },
    async ricalcola(id) { await attesa(); ricalc(id); },
    async aggiungiRiga(id, a, q, p) {
      await attesa();
      const art = articoli.find((x) => x.id === a);
      if (art.giacenza < q) throw { message: 'Giacenza insufficiente per ' + art.nome + ': ' + art.giacenza };
      add(id, a, q, p);
    },
    async aggiungiExtra(id, voce, prezzo) {
      await attesa();
      righe.push({ id: nRiga++, scheda_id: id, articolo_id: null, nome: voce, origine: 'esterno', extra: true, quantita: 1, costo_unit: 0, prezzo_unit: prezzo });
      const s = trova(id);
      if (s.prezzo_manuale) s.prezzo_finale = round2(s.prezzo_finale + prezzo); else ricalc(id);
    },
    async rimuoviExtra(riga) {
      await attesa();
      const r = righe.find((x) => x.id === riga);
      righe = righe.filter((x) => x.id !== riga);
      const s = trova(r.scheda_id);
      if (s.prezzo_manuale) s.prezzo_finale = round2(s.prezzo_finale - r.prezzo_unit); else ricalc(r.scheda_id);
    },
    async rimuoviRiga(riga) {
      await attesa();
      const r = righe.find((x) => x.id === riga);
      if (r.articolo_id) articoli.find((x) => x.id === r.articolo_id).giacenza += r.quantita;
      righe = righe.filter((x) => x.id !== riga);
      ricalc(r.scheda_id);
    },
    async articoli() { await attesa(); return articoli.map(copia); },
    async updateArticolo(id, campi) { await attesa(); Object.assign(articoli.find((x) => x.id === id), campi); },
    async creaArticolo(campi) {
      await attesa();
      if (articoli.some((x) => x.codice === campi.codice)) throw { message: 'Codice gia\' esistente' };
      const a = Object.assign({ id: nArt++, scorta_min: 0, note: '' }, campi, { giacenza: 0 });
      articoli.push(a);
      return a.id;
    },
    async carico(id, q) { await attesa(); articoli.find((x) => x.id === id).giacenza += q; },
    async movimenti(f, da, n) { await attesa(); return movFiltra(f).slice(da, da + n).map(copia); },
    async movimentiTotali(f) {
      await attesa();
      const t = { entrate: 0, uscite: 0, prelievi: 0 };
      movFiltra(f).filter((m) => !m.annullato).forEach((m) => movSomma(t, m));
      return { entrate: round2(t.entrate), uscite: round2(t.uscite), prelievi: round2(t.prelievi) };
    },
    async prelievo(importo, nota, data) {
      await attesa();
      movimenti.push(M(nMov++, 0, 'Uscita', CAT_PRELIEVO, nota || 'Prelievo personale', '', importo,
        { data, fondo: 'Conto personale - fuori budget' }));
    },
    async aggiungiLavoro(testo) { await attesa(); lavori.push({ id: nLav++, testo, fatto: false, note: '' }); },
    async lavoroFatto(id, fatto) { await attesa(); lavori.find((x) => x.id === id).fatto = fatto; },
    async lavoroModifica(id, testo, note) { await attesa(); Object.assign(lavori.find((x) => x.id === id), { testo, note }); },
    async lavoroElimina(id) { await attesa(); lavori.splice(lavori.findIndex((x) => x.id === id), 1); }
  };
}

let api = null;

/* ------------------------------------------------------------------ accesso (login, MFA, uscita) */
function showAuth(node) { $('app').hidden = true; $('auth').hidden = false; $('auth').replaceChildren(node); }
function showLogin(msg) {
  closeSheets();
  const err = h('p', { class: 'errtx', role: 'alert', text: msg || '' });
  const em = h('input', { type: 'email', autocomplete: 'username', placeholder: 'Email', 'aria-label': 'Email', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password', required: true });
  const go = btn('Entra', null, 'full', null, { type: 'submit' });
  const form = h('form', { class: 'box' }, h('h1', { text: 'LCR' }),
    h('label', { class: 'f' }, em), h('label', { class: 'f' }, pw), go, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!sb) { err.textContent = 'Collegamento non disponibile'; return; }
    err.textContent = ''; go.disabled = true; busy(1);
    try {
      const r = await sb.auth.signInWithPassword({ email: em.value.trim(), password: pw.value });
      if (r.error) { err.textContent = 'Email o password errate'; return; }
      pw.value = '';
      await dopoLogin();
    } catch (e) { err.textContent = 'Collegamento non riuscito'; }
    finally { go.disabled = false; busy(-1); }
  });
  showAuth(h('div', { class: 'login' }, form));
}
// MFA (TOTP): se l'utente ha un fattore verificato serve il codice a 6 cifre (aal2).
// Non gestita qui: REGISTRAZIONE di un nuovo fattore (enroll) - da fare con Luca se serve.
function showMfa() {
  const err = h('p', { class: 'errtx', role: 'alert' });
  const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000', 'aria-label': 'Codice' });
  const go = btn('Conferma', null, 'full', null, { type: 'submit' });
  const form = h('form', { class: 'box' }, h('h1', { text: 'LCR' }), h('label', { class: 'f' }, code), go,
    h('button', { type: 'button', class: 'btn sec full', onclick: () => sb.auth.signOut() }, ic('out'), h('span', { text: 'Esci' })), err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = ''; go.disabled = true; busy(1);
    try {
      const f = await sb.auth.mfa.listFactors();
      if (f.error) throw f.error;
      const fattore = (f.data.totp || [])[0];
      if (!fattore) { err.textContent = 'Nessun fattore attivo'; return; }
      const ch = await sb.auth.mfa.challenge({ factorId: fattore.id });
      if (ch.error) throw ch.error;
      const v = await sb.auth.mfa.verify({ factorId: fattore.id, challengeId: ch.data.id, code: code.value.trim() });
      if (v.error) { err.textContent = 'Codice errato'; return; }
      startApp();
    } catch (e) { err.textContent = 'Verifica non riuscita'; }
    finally { go.disabled = false; busy(-1); }
  });
  showAuth(h('div', { class: 'login' }, form));
}
async function dopoLogin() {
  const r = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!r.error && r.data.nextLevel === 'aal2' && r.data.currentLevel !== 'aal2') showMfa();
  else startApp();
}

/* ------------------------------------------------------------------ ricerca/filtri articoli (usati da Magazzino e dalla tendina) */
const SEZIONI = ['Oli', 'Materiali di consumo', 'Liquidi refrigeranti', 'Ricambi generici'];
function sezioniDa(list) { return Array.from(new Set(SEZIONI.concat(list.map((a) => a.sezione).filter(Boolean)))); }

function sfoglia(lista, opt) {
  const st = { q: '', cat: '', marchio: '', esauriti: false };
  const cats = Array.from(new Set(lista.map((a) => a.sezione).filter(Boolean))).sort(coll.compare);
  const marchi = Array.from(new Set(lista.map((a) => a.marchio).filter(Boolean))).sort(coll.compare);
  const out = h('div', { class: 'list' });
  function disegna() {
    const q = st.q.trim().toLowerCase();
    const v = lista.filter((a) =>
      (st.esauriti || Number(a.giacenza) > 0) && (!st.cat || a.sezione === st.cat) && (!st.marchio || a.marchio === st.marchio) &&
      (!q || (a.nome + ' ' + (a.marchio || '') + ' ' + a.codice).toLowerCase().indexOf(q) >= 0))
      .sort((a, b) => coll.compare(a.nome, b.nome));
    if (!v.length) { out.replaceChildren(h('div', { class: 'empty', text: 'Nessun articolo' })); return; }
    out.replaceChildren(...v.map((a) => h('button', { type: 'button', class: 'item' + (Number(a.giacenza) > 0 ? '' : ' off'), onclick: () => opt.onPick(a) },
      h('div', { class: 'grow' }, h('div', { class: 't', text: a.nome }),
        h('div', { class: 's', text: [a.marchio, a.sezione].filter(Boolean).join(' · ') })),
      h('div', { class: 'r' }, h('div', { text: fmtNum(a.giacenza) + ' ' + a.unita }),
        h('div', { class: 's', text: a.prezzo_vendita == null ? '—' : fmtEur(a.prezzo_vendita) })))));
  }
  const sel = (ph, vals, key) => {
    const s = h('select', { 'aria-label': ph }, h('option', { value: '', text: ph }), vals.map((x) => h('option', { value: x, text: x })));
    s.addEventListener('change', () => { st[key] = s.value; disegna(); });
    return s;
  };
  const src = h('input', { type: 'search', placeholder: 'Cerca', 'aria-label': 'Cerca', autocomplete: 'off' });
  src.addEventListener('input', () => { st.q = src.value; disegna(); });
  const kids = [h('div', { class: 'src' }, ic('search'), src), sel('Categoria', cats, 'cat'), sel('Marchio', marchi, 'marchio')];
  if (opt.esauriti) {
    const t = h('button', { type: 'button', class: 'tog', 'aria-pressed': 'false' }, h('span', { class: 'sw' }), h('span', { text: 'Esauriti' }));
    t.addEventListener('click', () => { st.esauriti = !st.esauriti; t.setAttribute('aria-pressed', String(st.esauriti)); disegna(); });
    kids.push(t);
  }
  disegna();
  return h('div', {}, h('div', { class: 'bar' }, kids), out);
}

/* ------------------------------------------------------------------ campi di modulo */
function campo(label, input) { return h('label', { class: 'f' }, h('span', { text: label }), input); }
const tinp = (v, attrs) => h('input', Object.assign({ type: 'text', value: v == null ? '' : String(v), autocomplete: 'off' }, attrs || {}));
const ninp = (v) => h('input', { type: 'text', inputmode: 'decimal', value: toStr(v), autocomplete: 'off' });
function selezione(valori, corrente) {
  const s = h('select', {}, valori.map((x) => h('option', { value: x, text: x })));
  s.value = corrente || valori[0];
  return s;
}

/* ------------------------------------------------------------------ pagine */
const main = () => $('main');
let tok = 0;

function badgeStato(st) { return h('span', { class: 'badge ' + (st === 'Completato' ? 'b-ok' : st === 'In lavorazione' ? 'b-lav' : 'b-Aperto'), text: st }); }
function badgePag(p) { return h('span', { class: 'badge ' + (p === 'Incassato' ? 'b-ok' : p === 'Parziale' ? 'b-par' : 'b-Da'), text: p }); }
const kpi = (l, v, cls) => h('div', { class: 'kpi ' + (cls || '') }, h('div', { class: 'l', text: l }), h('div', { class: 'v' + (Number(v) < 0 ? ' neg' : ''), text: fmtEur(v) }));

/* ---- 1. RIEPILOGO (home): schede aperte, lavori da fare, tasto Contabilita' */
async function pagRiepilogo() {
  const r = await api.home();
  let lavori = r.lavori;
  const lista = h('div', {});
  // Tendina di una voce: testo + note, Salva
  const apriLavoro = (l) => {
    const s = openSheet('Lavoro');
    const tx = tinp(l.testo, { maxlength: '300', 'aria-label': 'Lavoro' });
    const nt = h('textarea', { 'aria-label': 'Note', maxlength: '2000' }); nt.value = l.note || '';
    let invio = false;
    const go = async () => {
      const t = tx.value.trim();
      if (!t) { toast('Testo mancante', true); return; }
      if (invio) return;
      invio = true;
      const okk = await run(async () => { await api.lavoroModifica(l.id, t, nt.value.trim()); return true; });
      invio = false;
      if (okk) { l.testo = t; l.note = nt.value.trim(); s.close(); disegnaLavori(); }
    };
    s.set(campo('Lavoro', tx), campo('Note', nt), btn('Salva', 'check', 'full', go));
  };
  const elimina = async (l) => {
    if (!(await confirmDlg('Eliminare questo lavoro?', 'Elimina'))) return;
    const okk = await run(async () => { await api.lavoroElimina(l.id); return true; });
    if (okk) { lavori = lavori.filter((x) => x.id !== l.id); disegnaLavori(); }
  };
  const disegnaLavori = () => {
    lavori = lavori.slice().sort((a, b) => (a.fatto - b.fatto) || (b.id - a.id));
    if (!lavori.length) { lista.replaceChildren(h('div', { class: 'empty', text: '—' })); return; }
    lista.replaceChildren(...lavori.map((l) => h('div', { class: 'todo' + (l.fatto ? ' done' : '') },
      h('button', { type: 'button', class: 'ck', 'aria-label': 'Fatto', 'aria-pressed': String(!!l.fatto),
        onclick: () => run(async () => { await api.lavoroFatto(l.id, !l.fatto); l.fatto = !l.fatto; disegnaLavori(); }) }, l.fatto ? ic('check') : null),
      h('button', { type: 'button', class: 'tx txb', 'aria-label': 'Apri', onclick: () => apriLavoro(l) },
        h('span', { text: l.testo }), l.note ? h('span', { class: 'nota-ic', title: 'Note' }, ic('note')) : null),
      ibtn('trash', 'Elimina', 'dng sm', () => elimina(l)))));
  };
  const aggiungi = () => {
    const s = openSheet('Nuovo lavoro');
    const inp = tinp('', { placeholder: 'Lavoro', 'aria-label': 'Lavoro', maxlength: '300' });
    const go = async () => {
      const t = inp.value.trim();
      if (!t) return;
      const okk = await run(async () => { await api.aggiungiLavoro(t); return true; });
      if (okk) { s.close(); route(true); }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    s.set(campo('Lavoro', inp), btn('Aggiungi', 'plus', 'full', go));
    setTimeout(() => inp.focus(), 250);
  };
  disegnaLavori();
  return h('div', { class: 'page' },
    h('div', { class: 'sec-t' }, h('h2', { text: 'Schede aperte' })),
    r.schedeAperte.length ? r.schedeAperte.map(cardScheda) : h('div', { class: 'empty', text: '—' }),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Lavori da fare' }), ibtn('plus', 'Aggiungi', '', aggiungi)),
    lista,
    h('div', { class: 'gap' }),
    btn('Contabilità', 'cash', 'full big-btn', () => { location.hash = '#contabilita'; }));
}

/* ---- CONTABILITA' (tutto il blocco soldi) */
async function pagContabilita() {
  const r = await api.riepilogo();
  return h('div', { class: 'page' },
    h('button', { type: 'button', class: 'back', onclick: () => { location.hash = '#riepilogo'; } }, ic('back'), h('span', { text: 'Riepilogo' })),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Panoramica' })),
    h('div', { class: 'grid2' }, kpi('Cassa', r.cassa), kpi('Da incassare', r.daIncassare), kpi('Da pagare', r.daPagare),
      kpi('Magazzino', r.magazzino),
      h('button', { type: 'button', class: 'kpi kpib', onclick: () => { location.hash = '#movimenti/prelievi'; } },
        h('div', { class: 'l', text: 'Prelievi' }), h('div', { class: 'v', text: fmtEur(r.prelievi) })),
      kpi('Guadagno del mese', r.guadagnoMese, 'big')),
    h('div', { class: 'grid2 acts' },
      btn('Movimenti', 'list', 'sec', () => { location.hash = '#movimenti'; }),
      btn('Prelievo', 'cash', '', () => tendinaPrelievo())),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Entrate previste' })),
    h('div', { class: 'kpi' }, h('div', { class: 'l', text: r.entrateN + (r.entrateN === 1 ? ' scheda' : ' schede') }), h('div', { class: 'v', text: fmtEur(r.entratePreviste) })),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Uscite previste' })),
    h('div', { class: 'kpi' }, h('div', { class: 'l', text: 'Fornitori' }), h('div', { class: 'v', text: fmtEur(r.daPagare) })));
}
// Tendina Prelievo: importo > 0, nota facoltativa, data (default oggi)
function tendinaPrelievo() {
  const sh = openSheet('Prelievo');
  const imp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', 'aria-label': 'Importo' });
  const nota = tinp('', { maxlength: '200' });
  const data = h('input', { type: 'date', value: isoLocale(new Date()), 'aria-label': 'Data' });
  let invio = false;
  const go = async () => {
    if (invio) return;
    const v = parseNum(imp.value);
    if (!(v > 0)) { toast('Importo non valido', true); return; }
    if (!data.value) { toast('Data mancante', true); return; }
    invio = true;
    const okk = await run(async () => { await api.prelievo(round2(v), nota.value.trim(), data.value); return true; });
    invio = false;
    if (okk) { sh.close(); toast('Prelievo registrato'); route(true); }
  };
  imp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  sh.set(campo('Importo €', imp), campo('Nota', nota), campo('Data', data), btn('Conferma', 'check', 'full', go));
  setTimeout(() => imp.focus(), 250);
}

/* ---- MOVIMENTI (sola lettura) */
async function pagMovimenti(tipoIniz) {
  const st = { tipo: ['entrate', 'uscite', 'prelievi'].indexOf(tipoIniz) >= 0 ? tipoIniz : 'tutti', mese: '' };
  const NB = 200;
  let items = [], fine = false, tk = 0;
  const tot = h('div', { class: 'grid3' });
  const lista = h('div', {});
  const altri = h('div', {});
  const mesi = [['', 'Tutti i mesi']];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    mesi.push([d.getFullYear() + '-' + pad(d.getMonth() + 1), d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })]);
  }
  const selTipo = h('select', { 'aria-label': 'Tipo' }, [['tutti', 'Tutti'], ['entrate', 'Entrate'], ['uscite', 'Uscite'], ['prelievi', 'Prelievi']]
    .map((o) => h('option', { value: o[0], text: o[1] })));
  selTipo.value = st.tipo;
  const selMese = h('select', { 'aria-label': 'Mese' }, mesi.map((o) => h('option', { value: o[0], text: o[1] })));

  const riga = (m) => {
    const prel = isPrelievo(m), ent = m.tipo === 'Entrata';
    const sub = [fmtData(m.data), m.controparte].filter(Boolean).join(' · ');
    const badges = [];
    if (prel) badges.push(h('span', { class: 'badge b-par', text: 'Prelievo' }));
    if (m.stato_pagamento === 'Da pagare') badges.push(h('span', { class: 'badge b-Da', text: 'Da pagare' }));
    if (m.annullato) badges.push(h('span', { class: 'badge b-mut', text: 'Annullato' }));
    if (String(m.fondo || '').indexOf('Conto personale') === 0) badges.push(h('span', { class: 'badge b-lav', text: 'Personale' }));
    return h('div', { class: 'item static' + (m.annullato ? ' ann' : '') },
      h('div', { class: 'grow' }, h('div', { class: 't', text: m.descrizione || m.categoria || '—' }),
        h('div', { class: 's', text: sub }), badges.length ? h('div', { class: 'badges' }, badges) : null),
      h('div', { class: 'r ' + (ent ? 'pos' : 'out'), text: (ent ? '+' : '−') + fmtEur(Math.abs(Number(m.totale)))}));
  };
  const disegna = () => {
    lista.replaceChildren(...(items.length ? items.map(riga) : [h('div', { class: 'empty', text: 'Nessun movimento' })]));
    altri.replaceChildren(...(fine ? [] : [btn('Altri', 'plus', 'sec full', () => run(() => carica(false)))]));
  };
  async function carica(reset) {
    const my = ++tk;
    const f = { tipo: st.tipo, mese: st.mese };
    if (reset) {
      const [t, b] = await Promise.all([api.movimentiTotali(f), api.movimenti(f, 0, NB)]);
      if (my !== tk) return;
      items = b; fine = b.length < NB;
      const k = (l, v, c) => h('div', { class: 'kpi sm' }, h('div', { class: 'l', text: l }), h('div', { class: 'v ' + (c || ''), text: fmtEur(v) }));
      tot.replaceChildren(k('Entrate', t.entrate, 'pos'), k('Uscite', t.uscite, 'out'), k('Prelievi', t.prelievi, 'out'));
    } else {
      const b = await api.movimenti(f, items.length, NB);
      if (my !== tk) return;
      items = items.concat(b); fine = b.length < NB;
    }
    disegna();
  }
  selTipo.addEventListener('change', () => { st.tipo = selTipo.value; run(() => carica(true)); });
  selMese.addEventListener('change', () => { st.mese = selMese.value; run(() => carica(true)); });
  await carica(true);
  return h('div', { class: 'page' },
    h('button', { type: 'button', class: 'back', onclick: () => { location.hash = '#contabilita'; } }, ic('back'), h('span', { text: 'Contabilità' })),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Movimenti' })),
    h('div', { class: 'bar' }, selTipo, selMese),
    tot, h('div', { class: 'gap' }), lista, altri);
}

function cardScheda(s) {
  return h('button', { type: 'button', class: 'item', onclick: () => { location.hash = '#schede/' + s.id; } },
    h('div', { class: 'grow' }, h('div', { class: 't', text: s.codice + ' · ' + (s.cliente_testo || '—') }),
      h('div', { class: 's', text: s.moto_testo || '' }),
      (s.stato || s.pagamento) ? h('div', { class: 'badges' }, s.stato ? badgeStato(s.stato) : null, s.pagamento ? badgePag(s.pagamento) : null) : null),
    h('div', { class: 'r', text: fmtEur(s.prezzo_finale) }));
}

/* ---- 2. SCHEDE */
async function pagSchede() {
  const l = await api.schede();
  return h('div', { class: 'page' },
    l.length ? l.map((s) => cardScheda(Object.assign({}, s))) : h('div', { class: 'empty', text: '—' }));
}

async function pagScheda(id) {
  const d = await api.scheda(id);
  const s = d.scheda, righe = d.righe;
  const calcolato = round2((Number(s.ore) || 0) * (Number(s.tariffa) || 0) + righe.reduce((t, r) => t + Number(r.quantita) * Number(r.prezzo_unit), 0));
  const descr = h('textarea', { 'aria-label': 'Descrizione' }); descr.value = s.descrizione || '';
  const moto = tinp(s.moto_testo);
  const ore = ninp(s.ore), tar = ninp(s.tariffa);
  const note = h('textarea', { 'aria-label': 'Note' }); note.value = s.note || '';
  const prezzo = ninp(s.prezzo_finale);

  const salva = async () => {
    const o = parseNum(ore.value), t = parseNum(tar.value);
    if (!(o >= 0) || !(t >= 0)) { toast('Ore o tariffa non validi', true); return; }
    const okk = await run(async () => {
      await api.updateScheda(s.id, { descrizione: descr.value.trim(), moto_testo: moto.value.trim(), ore: o, tariffa: t, note: note.value.trim() }, s.codice);
      if (!s.prezzo_manuale) await api.ricalcola(s.id);
      return true;
    });
    if (okk) { toast('Salvato'); route(true); }
  };
  const salvaPrezzo = async () => {
    const p = parseNum(prezzo.value);
    if (!(p >= 0)) { toast('Prezzo non valido', true); return; }
    if (!(await confirmDlg('Prezzo manuale ' + fmtEur(p) + '?', 'Conferma'))) return;
    const okk = await run(async () => { await api.updateScheda(s.id, { prezzo_finale: p, prezzo_manuale: true }, s.codice); return true; });
    if (okk) { toast('Salvato'); route(true); }
  };
  const ripristina = async () => {
    if (!(await confirmDlg('Ripristinare il calcolo (' + fmtEur(calcolato) + ')?', 'Ripristina'))) return;
    const okk = await run(async () => { await api.updateScheda(s.id, { prezzo_manuale: false }, s.codice); await api.ricalcola(s.id); return true; });
    if (okk) { toast('Ripristinato'); route(true); }
  };
  const rimuovi = async (r) => {
    if (!(await confirmDlg('Rimuovere ' + r.nome + '?', 'Rimuovi'))) return;
    const okk = await run(async () => { await api.rimuoviRiga(r.id, 'Rimossa dall\'app'); return true; });
    if (okk) { toast('Rimosso'); route(true); }
  };

  const extraV = tinp(''); extraV.setAttribute('aria-label', 'Voce');
  const extraP = ninp(''); extraP.setAttribute('aria-label', 'Prezzo €');
  const aggiungiExtra = async () => {
    const v = extraV.value.trim(), p = parseNum(extraP.value);
    if (!v) { toast('Voce mancante', true); return; }
    if (isNaN(p)) { toast('Prezzo non valido', true); return; }
    const okk = await run(async () => { await api.aggiungiExtra(s.id, v, p); return true; });
    if (okk) { toast('Aggiunto'); route(true); }
  };
  const rimuoviExtra = async (r) => {
    if (!(await confirmDlg('Rimuovere ' + r.nome + '?', 'Rimuovi'))) return;
    const okk = await run(async () => { await api.rimuoviExtra(r.id); return true; });
    if (okk) { toast('Rimosso'); route(true); }
  };
  const extraRighe = righe.filter((r) => r.extra), ricambi = righe.filter((r) => !r.extra);

  return h('div', { class: 'page' },
    h('button', { type: 'button', class: 'back', onclick: () => { location.hash = '#schede'; } }, ic('back'), h('span', { text: 'Schede' })),
    h('div', { class: 'head-s' }, h('h2', { text: s.codice }),
      h('div', { class: 'sp', text: s.cliente_testo || '—' }),
      h('div', { class: 'badges' }, badgeStato(s.stato), badgePag(s.pagamento), s.data_apertura ? h('span', { class: 'muted small', text: fmtData(s.data_apertura) }) : null)),
    h('div', { class: 'card' },
      campo('Descrizione', descr), campo('Moto', moto),
      h('div', { class: 'two' }, campo('Ore', ore), campo('Tariffa €/h', tar)),
      campo('Note', note),
      btn('Salva', 'check', 'full', salva)),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Prezzo' }), s.prezzo_manuale ? h('span', { class: 'badge b-par', text: 'Manuale' }) : null),
    h('div', { class: 'card' },
      h('div', { class: 'extra-add' }, campo('Extra', extraV), campo('Prezzo €', extraP), ibtn('plus', 'Aggiungi extra', '', aggiungiExtra)),
      extraRighe.map((r) => h('div', { class: 'riga' },
        h('div', { class: 'grow' }, h('div', { class: 'sp', text: r.nome })),
        h('div', { class: 'r', text: fmtEur(Number(r.quantita) * Number(r.prezzo_unit)) }),
        ibtn('trash', 'Rimuovi', 'dng sm', () => rimuoviExtra(r)))),
      campo('Prezzo finale €', prezzo),
      h('div', { class: 'row small muted' }, h('span', { text: 'Calcolato' }), h('span', { text: fmtEur(calcolato) })),
      h('div', { class: 'two' },
        btn('Salva prezzo', 'check', '', salvaPrezzo),
        s.prezzo_manuale ? btn('Ripristina calcolo', 'undo', 'sec', ripristina) : h('span', {}))),
    h('div', { class: 'sec-t' }, h('h2', { text: 'Ricambi' }), ibtn('plus', 'Aggiungi ricambio', '', () => tendinaRicambio(s))),
    h('div', { class: 'card' },
      ricambi.length ? ricambi.map((r) => h('div', { class: 'riga' },
        h('div', { class: 'grow' }, h('div', { class: 'sp', text: r.nome }),
          h('div', { class: 'small muted', text: fmtNum(r.quantita) + ' × ' + fmtEur(r.prezzo_unit) + (r.origine === 'esterno' ? ' · esterno' : '') })),
        h('div', { class: 'r', text: fmtEur(Number(r.quantita) * Number(r.prezzo_unit)) }),
        ibtn('trash', 'Rimuovi', 'dng sm', () => rimuovi(r)))) : h('div', { class: 'empty', text: '—' })),
    h('div', { class: 'row small muted' },
      h('span', { text: 'Materiali ' + fmtEur(s.costo_materiali) }),
      h('span', { text: 'Guadagno ' + fmtEur(Number(s.prezzo_finale) - Number(s.costo_materiali)) })));
}

// Tendina di consultazione del magazzino per aggiungere un ricambio alla scheda
async function tendinaRicambio(scheda) {
  const sh = openSheet('Ricambio');
  sh.set(h('div', { class: 'empty', text: '…' }));
  const lista = await run(() => api.articoli());
  if (!lista) { sh.close(); return; }
  const scegli = (a) => {
    sh.setTitle(a.nome);
    const q = ninp(1), p = ninp(a.prezzo_vendita);
    const go = async () => {
      const qn = parseNum(q.value), pn = parseNum(p.value);
      if (!(qn > 0)) { toast('Quantita\' non valida', true); return; }
      if (!(pn >= 0)) { toast('Prezzo non valido', true); return; }
      const okk = await run(async () => { await api.aggiungiRiga(scheda.id, a.id, qn, pn, ''); return true; });
      if (okk) { sh.close(); toast('Aggiunto'); route(true); }
    };
    sh.set(
      h('div', { class: 'row' }, h('span', { class: 'muted', text: [a.marchio, a.sezione].filter(Boolean).join(' · ') }),
        h('span', { class: 'pz', text: fmtNum(a.giacenza) + ' ' + a.unita })),
      h('div', { class: 'two' }, campo('Quantità', q), campo('Prezzo €', p)),
      btn('Aggiungi', 'plus', 'full', go),
      h('button', { type: 'button', class: 'back', onclick: () => { sh.setTitle('Ricambio'); sh.set(sfoglia(lista, { onPick: scegli })); } }, ic('back'), h('span', { text: 'Magazzino' })));
    setTimeout(() => q.select(), 250);
  };
  sh.set(sfoglia(lista, { onPick: scegli }));
}

/* ---- 3. MAGAZZINO */
async function pagMagazzino() {
  const lista = await api.articoli();
  return h('div', { class: 'page' },
    h('div', { class: 'sec-t' }, h('h2', { text: 'Articoli' }), ibtn('plus', 'Aggiungi pezzo', '', () => nuovoArticolo(lista))),
    sfoglia(lista, { esauriti: true, onPick: (a) => dettaglioArticolo(a, lista) }));
}

function dettaglioArticolo(a, lista) {
  const sh = openSheet(a.nome);
  const nome = tinp(a.nome), marchio = tinp(a.marchio || '');
  const sez = selezione(sezioniDa(lista), a.sezione);
  const prezzo = ninp(a.prezzo_vendita);
  const go = async () => {
    const pv = prezzo.value.trim() === '' ? null : parseNum(prezzo.value);
    if (pv !== null && !(pv >= 0)) { toast('Prezzo non valido', true); return; }
    if (!nome.value.trim()) { toast('Nome mancante', true); return; }
    const okk = await run(async () => {
      await api.updateArticolo(a.id, { nome: nome.value.trim(), marchio: marchio.value.trim(), sezione: sez.value, prezzo_vendita: pv }, a.codice);
      return true;
    });
    if (okk) { sh.close(); toast('Salvato'); route(true); }
  };
  sh.set(
    h('div', { class: 'row' }, h('span', { class: 'muted', text: a.codice }), h('span', { class: 'pz', text: fmtNum(a.giacenza) + ' ' + a.unita })),
    campo('Nome', nome), campo('Marchio', marchio), campo('Categoria', sez),
    h('div', { class: 'two' }, campo('Prezzo vendita €', prezzo),
      h('div', { class: 'f' }, h('span', { class: 'small muted', text: 'Costo' }), h('div', { class: 'pz', text: fmtEur(a.costo_unit) }))),
    btn('Salva', 'check', 'full', go));
}

function nuovoArticolo(lista) {
  const sh = openSheet('Nuovo pezzo');
  const codice = tinp(''), nome = tinp(''), marchio = tinp('');
  const sez = selezione(sezioniDa(lista), SEZIONI[3]);
  const unita = tinp('pz'), costo = ninp(''), prezzo = ninp(''), giac = ninp('');
  const go = async () => {
    const c = costo.value.trim() === '' ? 0 : parseNum(costo.value);
    const pv = prezzo.value.trim() === '' ? null : parseNum(prezzo.value);
    const g = giac.value.trim() === '' ? 0 : parseNum(giac.value);
    if (!codice.value.trim() || !nome.value.trim()) { toast('Codice e nome obbligatori', true); return; }
    if (!(c >= 0) || !(g >= 0) || (pv !== null && !(pv >= 0))) { toast('Numeri non validi', true); return; }
    const esito = await run(async () => {
      const id = await api.creaArticolo({ codice: codice.value.trim(), nome: nome.value.trim(), sezione: sez.value, marchio: marchio.value.trim(),
        unita: unita.value.trim() || 'pz', costo_unit: c, prezzo_vendita: pv });
      if (g > 0) {
        try { await api.carico(id, g, c, 'Giacenza iniziale'); }
        catch (e) { return { id, errCarico: e }; }
      }
      return { id };
    });
    if (!esito) return;
    sh.close();
    if (esito.errCarico) toast('Pezzo creato, carico non riuscito: ' + (esito.errCarico.message || ''), true);
    else toast('Aggiunto');
    route(true);
  };
  sh.set(
    h('div', { class: 'two' }, campo('Codice', codice), campo('Unità', unita)),
    campo('Nome', nome), campo('Categoria', sez), campo('Marchio', marchio),
    h('div', { class: 'two' }, campo('Costo €', costo), campo('Prezzo vendita €', prezzo)),
    campo('Giacenza iniziale', giac),
    btn('Aggiungi', 'plus', 'full', go));
}

/* ------------------------------------------------------------------ percorsi e avvio */
const VOCI = [['riepilogo', 'Riepilogo', 'home'], ['schede', 'Schede', 'schede'], ['magazzino', 'Magazzino', 'box']];

async function route(mantieni) {
  const my = ++tok;
  const parti = (location.hash || '#riepilogo').slice(1).split('/');
  const pag = VOCI.some((v) => v[0] === parti[0]) || parti[0] === 'movimenti' || parti[0] === 'contabilita' ? parti[0] : 'riepilogo';
  const navOn = pag === 'movimenti' || pag === 'contabilita' ? 'riepilogo' : pag;
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.p === navOn));
  const m = main();
  const y = m.scrollTop;
  if (!mantieni) { closeSheets(); m.replaceChildren(h('div', { class: 'skel', text: '…' })); }
  busy(1);
  try {
    let nodo;
    if (pag === 'riepilogo') nodo = await pagRiepilogo();
    else if (pag === 'schede') nodo = parti[1] && /^\d+$/.test(parti[1]) ? await pagScheda(Number(parti[1])) : await pagSchede();
    else if (pag === 'contabilita') nodo = await pagContabilita();
    else if (pag === 'movimenti') nodo = await pagMovimenti(parti[1]);
    else nodo = await pagMagazzino();
    if (my !== tok) return;
    m.replaceChildren(nodo);
    m.scrollTop = mantieni ? y : 0;
  } catch (e) {
    if (my !== tok) return;
    fail(e);
    m.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty', text: 'Errore di caricamento' }), btn('Riprova', 'undo', 'full', () => route())));
  } finally { busy(-1); }
}

let avviata = false;
function startApp() {
  $('auth').hidden = true; $('auth').replaceChildren();
  $('app').hidden = false;
  if (!avviata) {
    avviata = true;
    $('nav').replaceChildren(...VOCI.map((v) => h('a', { href: '#' + v[0], 'data-p': v[0] }, ic(v[2]), h('span', { text: v[1] }))));
    if (DEMO) $('demo-tag').hidden = false;
    else $('top').append(h('button', { type: 'button', class: 'btn sec ibtn sm', 'aria-label': 'Esci', onclick: () => sb.auth.signOut() }, ic('out')));
    window.addEventListener('hashchange', () => route());
  }
  route();
}

function boot() {
  if (DEMO) { api = demoApi(); startApp(); return; }
  if (!window.supabase || !CFG.url || !CFG.key) { showLogin('Libreria non caricata'); return; }
  sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  api = realApi();
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { showLogin(); } });
  sb.auth.getSession().then((r) => { if (r.data && r.data.session) return dopoLogin(); showLogin(); }).catch(() => showLogin('Collegamento non riuscito'));
}
boot();
})();
