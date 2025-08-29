
import '../styles/main.css';

'use strict';

    /* ======= Feature flaggar ======= */
    const DEV_ENABLE_DEMO = true; // Sätt true för att aktivera "Skapa exempeldata" i Inställningar

    /* ======= Namnrymder ======= */
    const App = (() => {
      const Storage = (() => {
        const KEYS = {
          version: 'storage.version',
          pain: 'painLogs',
          pee: 'peeLogs',
          fluid: 'fluidLogs',
          settings: 'settings',
          firstRunShown: 'firstRunShown'
        };

        // Enkel nyckel-värde-store ovanpå IndexedDB
        const dbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open('magen', 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        function idbGetRaw(key) {
          return dbPromise.then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readonly');
            const store = tx.objectStore('kv');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          }));
        }

        function idbSetRaw(key, value) {
          return dbPromise.then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            const req = store.put(value, key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
          }));
        }

        function idbRemove(key) {
          return dbPromise.then(db => new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite');
            const store = tx.objectStore('kv');
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          }));
        }

        async function get(key) {
          try {
            const raw = await idbGetRaw(key);
            return raw ? JSON.parse(raw) : null;
          } catch (e) {
            console.error('Läsfel IndexedDB', e);
            return null;
          }
        }
        async function set(key, value) {
          try {
            await idbSetRaw(key, JSON.stringify(value));
            return true;
          } catch (e) {
            console.error('Skrivfel IndexedDB', e);
            UI.announce('Kunde inte spara lokalt. Kontrollera lagringsinställningar.');
            return false;
          }
        }

        function defaultSettings() {
          const scale = {
            1: '',
            2: 'Konstant lågmäld smärta/knip.',
            3: '',
            4: 'Gör ont men klarar att fortsätta med sakerna jag gör, lite yrsel.',
            5: 'Behöver pausa det jag gör, klarar fortfarande att stå med stöd, dålig balans, yrsel.',
            6: 'Behöver lägga mig ned, kan ta relativt djupa andetag.',
            7: 'Behöver ligga ned, kan inte andas ordentligt. Möjligen illamående, mycket yrsel.',
            8: 'Kan knappt röra mig, dålig andning, hade viljat "hmmm" igenom men kroppen orkar inte. Mycket yrsel, möjligen illamående.',
            9: '',
            10: 'Hemsk smärta, kan inte röra mig, knappt andas, hade viljat skrika och gråta men gör för ont för att kroppen ska kunna reagera. (Verkar som att detta behöver Alvedon & Ipren för att lugna sig)'
          };
          // tema initialt från prefers-color-scheme
          const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
          return { tema: prefersDark ? 'dark' : 'light', ['smärtskala']: scale, vatska_mal_ml: 2000 };
        }

        async function migrateIfNeeded() {
          const v = await idbGetRaw(KEYS.version);
          if (!v || v < '1') {
            await idbSetRaw(KEYS.version, '1');
            await set(KEYS.pain, []);
            await set(KEYS.pee, []);
            await set(KEYS.fluid, []);
            await set(KEYS.settings, defaultSettings());
          } else {
            const settings = await get(KEYS.settings) || defaultSettings();
            if (!settings['smärtskala']) settings['smärtskala'] = defaultSettings()['smärtskala'];
            if (typeof settings.vatska_mal_ml !== 'number') settings.vatska_mal_ml = 2000;
            if (!settings.tema) settings.tema = defaultSettings().tema;
            await set(KEYS.settings, settings);
            if (!Array.isArray(await get(KEYS.pain))) await set(KEYS.pain, []);
            if (!Array.isArray(await get(KEYS.pee))) await set(KEYS.pee, []);
            if (!Array.isArray(await get(KEYS.fluid))) await set(KEYS.fluid, []);
          }
        }

        async function loadAll() {
          await migrateIfNeeded();
          if (navigator.storage && navigator.storage.persist) {
            try { navigator.storage.persist(); } catch { /* ignore */ }
          }
          return {
            version: (await idbGetRaw(KEYS.version)) || '1',
            pain: await get(KEYS.pain) || [],
            pee: await get(KEYS.pee) || [],
            fluid: await get(KEYS.fluid) || [],
            settings: await get(KEYS.settings) || defaultSettings(),
            firstRunShown: await get(KEYS.firstRunShown) === true
          };
        }

        async function saveAll(state) {
          await set(KEYS.pain, state.pain);
          await set(KEYS.pee, state.pee);
          await set(KEYS.fluid, state.fluid);
          await set(KEYS.settings, state.settings);
        }

        function markBannerShown() { set(KEYS.firstRunShown, true); }

        async function clearAll() {
          try {
            await idbRemove(KEYS.pain);
            await idbRemove(KEYS.pee);
            await idbRemove(KEYS.fluid);
            await idbRemove(KEYS.settings);
            await migrateIfNeeded();
          } catch (e) { console.error(e); }
        }

        return { KEYS, loadAll, saveAll, clearAll, defaultSettings, migrateIfNeeded, markBannerShown };
      })();

      const Utils = (() => {
        function pad(n) { return String(n).padStart(2, '0'); }
        function toLocalISO(d) {
          // ISO 8601 utan tidszon (lokal tid)
          const year = d.getFullYear();
          const month = pad(d.getMonth()+1);
          const day = pad(d.getDate());
          const h = pad(d.getHours());
          const m = pad(d.getMinutes());
          const s = pad(d.getSeconds());
          return `${year}-${month}-${day}T${h}:${m}:${s}`;
        }
        function fromDateTimeStrings(dateStr, timeStr) {
          const [y,m,d] = dateStr.split('-').map(x=>parseInt(x,10));
          const [hh,mm] = timeStr.split(':').map(x=>parseInt(x,10));
          return new Date(y, (m-1), d, hh, mm, 0, 0);
        }
        function splitISO(iso) {
          // Returnera {datum, tid} från lokal ISO (utan Z)
          const [datePart, timePart] = iso.split('T');
          return { datum: datePart, tid: timePart.slice(0,5) };
        }
        function newUUID() {
          // RFC4122 v4-ish
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
          });
        }
        function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
        function sum(arr) { return arr.reduce((a,b)=>a+b,0); }
        function mean(arr) { return arr.length ? sum(arr)/arr.length : 0; }
        function median(arr) {
          if (!arr.length) return 0;
          const s = [...arr].sort((a,b)=>a-b);
          const mid = Math.floor(s.length/2);
          return s.length%2? s[mid] : (s[mid-1]+s[mid])/2;
        }
        function groupBy(arr, keyFn) {
          const m = new Map();
          for (const it of arr) {
            const k = keyFn(it);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(it);
          }
          return m;
        }
        function formatDate(dateStr) {
          try {
            const [y,m,d] = dateStr.split('-').map(x=>parseInt(x,10));
            const dt = new Date(y, m-1, d);
            return new Intl.DateTimeFormat('sv-SE', { weekday:'short', day:'2-digit', month:'short'}).format(dt);
          } catch { return dateStr; }
        }
        function formatTime(timeStr) {
          const [h,m] = timeStr.split(':');
          return `${h}:${m}`;
        }
        function hsvToRgb(h, s, v) {
          let r, g, b;
          let i = Math.floor(h * 6);
          let f = h * 6 - i;
          let p = v * (1 - s);
          let q = v * (1 - f * s);
          let t = v * (1 - (1 - f) * s);
          switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
          }
          return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
        }
        function levelColor(level) {
          // 1..10 -> färgskala från lila till rosa/röd
          const t = (level-1)/9; // 0..1
          const [r,g,b] = hsvToRgb(0.9 - t*0.55, 0.65 + 0.2*t, 0.95); // violet -> pink/red-ish
          return `rgb(${r},${g},${b})`;
        }
        function escCsv(s) {
          if (s == null) return '';
          const str = String(s);
          if (str.includes('"') || str.includes(',') || str.includes(';') || str.includes('\n')) {
            return '"' + str.replace(/"/g,'""') + '"';
          }
          return str;
        }
        function parseNumber(n) {
          if (n == null || n === '') return null;
          const x = Number(n);
          return Number.isFinite(x) ? x : null;
        }
        return { toLocalISO, fromDateTimeStrings, splitISO, newUUID, clamp, sum, mean, median, groupBy, formatDate, formatTime, levelColor, escCsv, parseNumber };
      })();

      let State;

      const CSV = (() => {
        const HEADERS = {
          // pain V2 inkluderar starttid och sluttid sist för bakåtkompatibel ordning
          pain: ['id','datetimeISO','datum','tid','typ','niva','meds','med_effekt','med_effekt_minuter','anteckning','starttid','sluttid'],
          pain_legacy: ['id','datetimeISO','datum','tid','typ','niva','meds','med_effekt','med_effekt_minuter','anteckning'],
          pee: ['id','datetimeISO'],
          fluid: ['id','datetimeISO','volym_ml','dryck']
        };

        function download(filename, text) {
          const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          URL.revokeObjectURL(url);
        }

        function exportPain(arr) {
          const lines = [HEADERS.pain.join(',')];
          for (const it of arr) {
            const medsStr = (it.meds||[]).join('|');
            const row = [
              it.id,
              it.timestamp,
              it.datum,
              it.tid,
              it.typ,
              it.niva,
              medsStr,
              it.med_effekt == null ? '' : it.med_effekt,
              it.med_effekt_minuter == null ? '' : it.med_effekt_minuter,
              Utils.escCsv(it.anteckning||''),
              it.starttid || (it.tid || ''),
              it.sluttid == null ? '' : it.sluttid
            ];
            lines.push(row.join(','));
          }
          return lines.join('\n') + '\n';
        }
        function exportPee(arr) {
          const lines = [HEADERS.pee.join(',')];
          for (const it of arr) lines.push([it.id, it.timestamp].join(','));
          return lines.join('\n') + '\n';
        }
        function exportFluid(arr) {
          const lines = [HEADERS.fluid.join(',')];
          for (const it of arr) lines.push([it.id, it.timestamp, it.volym_ml, Utils.escCsv(it.dryck||'')].join(','));
          return lines.join('\n') + '\n';
        }

        function detectDelimiter(headerLine) {
          const comma = (headerLine.match(/,/g)||[]).length;
          const semi = (headerLine.match(/;/g)||[]).length;
          return semi > comma ? ';' : ',';
        }

        function parseCSVText(text) {
          // Minimal CSV parser som hanterar citat, dubbla citat och \n.
          const rows = [];
          let i = 0, field = '', row = [], inQuotes = false; 
          while (i < text.length) {
            const c = text[i];
            if (inQuotes) {
              if (c === '"') {
                if (text[i+1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
              } else { field += c; }
            } else {
              if (c === '"') inQuotes = true;
              else if (c === ',' || c === ';') { row.push(field.trim()); field=''; }
              else if (c === '\n' || c === '\r') {
                if (field !== '' || row.length>0) { row.push(field.trim()); rows.push(row); row=[]; field=''; }
                // hoppa över ev. \r\n
                if (c==='\r' && text[i+1]==='\n') i++;
              } else { field += c; }
            }
            i++;
          }
          if (field.length || row.length) { row.push(field.trim()); rows.push(row); }
          return rows;
        }

        function validateHeaders(firstRow, type, delimiter) {
          const expected = HEADERS[type];
          // firstRow är redan uppdelad. Dock kan våra parseCSVText använt fel delimiter.
          // Vi tillåter både , och ;, men vår parser delar på båda. För att vara strikt
          // fogar vi ihop igen enligt förväntat antal kolumner.
          if (firstRow.length > expected.length) {
            const joined = firstRow.join(',');
            const parts = joined.split(delimiter);
            // Om motsvarar legacy och exakt legacy-längd, tillåt
            if (arraysEqual(parts, HEADERS.pain_legacy)) return true;
            return arraysEqual(parts, expected);
          }
          // Tillåt även legacy exakt match
          if (arraysEqual(firstRow, HEADERS.pain_legacy)) return true;
          return arraysEqual(firstRow, expected);
        }
        function arraysEqual(a,b){ if (a.length!==b.length) return false; for (let i=0;i<a.length;i++){ if (a[i]!==b[i]) return false;} return true; }

        function importPain(text) {
          const rows = parseCSVText(text).filter(r=>r.length && r.some(c=>c!==''));
          if (!rows.length) throw new Error('Tom fil.');
          const delimiter = detectDelimiter(rows[0].join(','));
          const header = rows[0];
          if (!validateHeaders(header, 'pain', delimiter)) throw new Error('Fel rubriker i smärta-CSV.');
          const res = [];
          const useLegacy = arraysEqual(header, HEADERS.pain_legacy);
          for (let i=1;i<rows.length;i++) {
            let r = rows[i];
            // Återskapa med valt delimiter om parsern splittrat annorlunda
            if (r.length > (useLegacy ? HEADERS.pain_legacy.length : HEADERS.pain.length)) {
              const joined = r.join(','); r = joined.split(delimiter).map(x=>x.trim());
            }
            const expectedLen = useLegacy ? HEADERS.pain_legacy.length : HEADERS.pain.length;
            if (r.length !== expectedLen) throw new Error(`Rad ${i+1}: fel antal kolumner.`);
            // Destructuring med legacy-stöd
            let id, datetimeISO, datum, tid, typ, niva, meds, med_effekt, med_effekt_minuter, anteckning, starttid, sluttid;
            if (useLegacy) {
              [id, datetimeISO, datum, tid, typ, niva, meds, med_effekt, med_effekt_minuter, anteckning] = r;
              starttid = tid; sluttid = '';
            } else {
              [id, datetimeISO, datum, tid, typ, niva, meds, med_effekt, med_effekt_minuter, anteckning, starttid, sluttid] = r;
            }
            if (!(typ==='magont' || typ==='livmoder-ont')) throw new Error(`Rad ${i+1}: ogiltig typ.`);
            const n = Number.parseInt(niva,10); if (!(n>=1 && n<=10)) throw new Error(`Rad ${i+1}: nivå måste vara 1–10.`);
            const medsArr = (meds||'').trim() ? meds.split(/[|+]/).map(x=>x.trim()).filter(Boolean) : [];
            const eff = (med_effekt||'').trim();
            const effMin = (med_effekt_minuter||'').trim()===''? null : Number.parseInt(med_effekt_minuter,10);
            if (effMin!=null && !(effMin>=0 && effMin<=240)) throw new Error(`Rad ${i+1}: minuter 0–240.`);
            const idFinal = (State.pain.some(p=>p.id===id)) ? Utils.newUUID() : id;
            const noteFinal = anteckning ? anteckning + (idFinal!==id ? ' (Importerad)' : '') : (idFinal!==id ? 'Importerad' : '');
            const iso = datetimeISO || `${datum}T${tid}:00`;
            const { datum: d2, tid: t2 } = Utils.splitISO(iso);
            const st = (starttid||'').trim() || t2;
            const sl = (sluttid||'').trim() || null;
            res.push({ id: idFinal, timestamp: iso, datum: d2, tid: t2, typ, niva: n, meds: medsArr, med_effekt: eff||null, med_effekt_minuter: effMin, anteckning: noteFinal, starttid: st, sluttid: sl });
          }
          return res;
        }

        function importPee(text) {
          const rows = parseCSVText(text).filter(r=>r.length && r.some(c=>c!==''));
          if (!rows.length) throw new Error('Tom fil.');
          const delimiter = detectDelimiter(rows[0].join(','));
          const header = rows[0];
          if (!validateHeaders(header, 'pee', delimiter)) throw new Error('Fel rubriker i kiss-CSV.');
          const res = [];
          for (let i=1;i<rows.length;i++) {
            let r = rows[i];
            if (r.length > HEADERS.pee.length) { const joined = r.join(','); r = joined.split(delimiter).map(x=>x.trim()); }
            if (r.length !== HEADERS.pee.length) throw new Error(`Rad ${i+1}: fel antal kolumner.`);
            const [id, iso] = r;
            const idFinal = (State.pee.some(p=>p.id===id)) ? Utils.newUUID() : id;
            res.push({ id: idFinal, timestamp: iso });
          }
          return res;
        }

        function importFluid(text) {
          const rows = parseCSVText(text).filter(r=>r.length && r.some(c=>c!==''));
          if (!rows.length) throw new Error('Tom fil.');
          const delimiter = detectDelimiter(rows[0].join(','));
          const header = rows[0];
          if (!validateHeaders(header, 'fluid', delimiter)) throw new Error('Fel rubriker i vätske-CSV.');
          const res = [];
          for (let i=1;i<rows.length;i++) {
            let r = rows[i];
            if (r.length > HEADERS.fluid.length) { const joined = r.join(','); r = joined.split(delimiter).map(x=>x.trim()); }
            if (r.length !== HEADERS.fluid.length) throw new Error(`Rad ${i+1}: fel antal kolumner.`);
            const [id, iso, volym_ml, dryck] = r;
            const vol = Number.parseInt(volym_ml,10); if (!(vol>0 && vol<=5000)) throw new Error(`Rad ${i+1}: volym 1–5000 ml.`);
            const idFinal = (State.fluid.some(f=>f.id===id)) ? Utils.newUUID() : id;
            const dryckFinal = (dryck||'').trim();
            res.push({ id: idFinal, timestamp: iso, volym_ml: vol, dryck: dryckFinal });
          }
          return res;
        }

        return { download, exportPain, exportPee, exportFluid, importPain, importPee, importFluid, HEADERS };

      })();

      const Charts = (() => {
        const tooltipEl = document.getElementById('chartTooltip');
        function showTip(html, x, y) {
          tooltipEl.innerHTML = html;
          tooltipEl.style.display = 'block';
          tooltipEl.style.left = (x+8)+'px';
          tooltipEl.style.top = (y+8)+'px';
        }
        function hideTip() { tooltipEl.style.display = 'none'; }

        function setupCanvas(canvas) {
          const dpr = window.devicePixelRatio || 1;
          let rect = canvas.getBoundingClientRect();
          let w = rect.width;
          let h = rect.height;
          if (!w || !h) {
            // Kan hända när canvas ligger i en hidden flik – fall tillbaka till förälderns bredd / CSS-höjd
            const parent = canvas.parentElement;
            const cssH = parseInt((getComputedStyle(canvas).height || '220').toString(), 10) || 220;
            w = (parent && parent.clientWidth) ? parent.clientWidth : 600;
            h = cssH;
          }
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
          const ctx = canvas.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          // rensa
          ctx.clearRect(0,0,w,h);
          return { ctx, w, h };
        }
        function axis(ctx, x, y, w, h) {
          ctx.strokeStyle = 'rgba(100,116,139,0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y+h); ctx.lineTo(x+w, y+h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y+h); ctx.stroke();
        }
        function niceMax(n) {
          if (n<=5) return 5; if (n<=10) return 10; if (n<=20) return 20; if (n<=50) return 50; return Math.ceil(n/50)*50;
        }
        function yTicksInteger(ctx, x, y, w, h, maxVal) {
          const max = niceMax(maxVal);
          const steps = Math.min(6, max);
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
          ctx.font = '12px system-ui';
          for (let i=0;i<=steps;i++) {
            const ty = y+h - (i/steps)*h;
            const val = Math.round((i/steps)*max);
            ctx.strokeStyle = 'rgba(100,116,139,0.15)'; ctx.beginPath(); ctx.moveTo(x,ty); ctx.lineTo(x+w,ty); ctx.stroke();
            ctx.fillText(String(val), x-24, ty+4);
          }
          return max;
        }
        function yTicksLevel(ctx, x, y, w, h) {
          const steps = 9; // 1..10
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
          ctx.font = '12px system-ui';
          for (let i=0;i<=steps;i++) {
            const val = 1 + i;
            const ty = y+h - (i/steps)*h;
            ctx.strokeStyle = 'rgba(100,116,139,0.15)'; ctx.beginPath(); ctx.moveTo(x,ty); ctx.lineTo(x+w,ty); ctx.stroke();
            ctx.fillText(String(val), x-24, ty+4);
          }
          return 10;
        }

        function drawLinePain(canvas, painData) {
          if (!canvas) return;
          const { ctx, w, h } = setupCanvas(canvas);
          const padding = { l: 40, r: 10, t: 10, b: 24 };
          axis(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          yTicksLevel(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);

          const pointsMag = [], pointsLiv = [];
          const arr = [...painData].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
          if (!arr.length) return;
          const t0 = new Date(arr[0].timestamp.replace('Z',''));
          const t1 = new Date(arr[arr.length-1].timestamp.replace('Z',''));
          const minT = t0.getTime(); const maxT = Math.max(minT+1, t1.getTime());
          const plotW = w-padding.l-padding.r, plotH = h-padding.t-padding.b;
          function xPos(ts) { const t = new Date(ts.replace('Z','')).getTime(); return padding.l + (t-minT)/(maxT-minT) * plotW; }
          function yPos(level) { return padding.t + (1 - (level-1)/9) * plotH; }

          for (const p of arr) {
            const pt = { x:xPos(p.timestamp), y:yPos(p.niva), data:p };
            if (p.typ==='magont') pointsMag.push(pt); else pointsLiv.push(pt);
          }

          function drawSeries(points, color) {
            if (!points.length) return;
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
            for (let i=0;i<points.length;i++) { const pt=points[i]; if (i===0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }
            ctx.stroke();
            for (const pt of points) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI*2); ctx.fill(); }
          }
          const styles = getComputedStyle(document.documentElement);
          drawSeries(pointsMag, styles.getPropertyValue('--primary-600').trim() || '#db2777');
          drawSeries(pointsLiv, styles.getPropertyValue('--accent-600').trim() || '#7c3aed');

          // Tooltip interaktivitet
          const hitboxes = [...pointsMag, ...pointsLiv].map(pt=>({ x:pt.x, y:pt.y, r:6, data:pt.data }));
          canvas.onmousemove = (ev) => {
            const rect = canvas.getBoundingClientRect();
            const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
            for (const hb of hitboxes) {
              if (Math.hypot(mx-hb.x, my-hb.y) <= hb.r) {
                const p = hb.data;
                const tLabel = p.starttid ? (p.sluttid ? `${p.starttid}–${p.sluttid}` : p.starttid) : p.tid;
                showTip(`<b>${p.datum} ${tLabel}</b><br/>${p.typ} – nivå ${p.niva}`, ev.clientX, ev.clientY);
                return;
              }
            }
            hideTip();
          };
          canvas.onmouseleave = hideTip;
        }

        function drawBarsCounts(canvas, countsMap) {
          if (!canvas) return;
          const { ctx, w, h } = setupCanvas(canvas);
          const padding = { l: 40, r: 10, t: 10, b: 40 };
          const entries = Array.from(countsMap.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
          const labels = entries.map(e=>e[0]);
          const values = entries.map(e=>e[1]);
          const maxVal = values.length? Math.max(...values): 0;
          axis(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          const maxY = yTicksInteger(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b, maxVal);
          const plotW = w-padding.l-padding.r, plotH = h-padding.t-padding.b;
          const barW = Math.max(10, plotW / (labels.length*1.2 || 1));
          const styles = getComputedStyle(document.documentElement);
          const color = styles.getPropertyValue('--primary').trim();
          ctx.fillStyle = color;
          const hitboxes = [];
          for (let i=0;i<labels.length;i++) {
            const x = padding.l + i * (barW*1.2);
            const hVal = (values[i]/maxY) * plotH;
            const y = padding.t + plotH - hVal;
            ctx.fillRect(x, y, barW, hVal);
            hitboxes.push({ x, y, w: barW, h: hVal, label: labels[i], val: values[i] });
            // x-etikett
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
            ctx.font = '12px system-ui';
            ctx.save();
            ctx.translate(x + barW/2, h-4);
            ctx.rotate(-Math.PI/6);
            ctx.textAlign = 'right';
            ctx.fillText(labels[i], 0, 0);
            ctx.restore();
            ctx.fillStyle = color;
          }
          canvas.onmousemove = (ev) => {
            const rect = canvas.getBoundingClientRect(); const mx = ev.clientX-rect.left, my=ev.clientY-rect.top;
            for (const hb of hitboxes) {
              if (mx>=hb.x && mx<=hb.x+hb.w && my>=hb.y && my<=hb.y+hb.h) {
                showTip(`<b>${hb.label}</b><br/>${hb.val} st`, ev.clientX, ev.clientY); return;
              }
            }
            hideTip();
          };
          canvas.onmouseleave = hideTip;
        }
        function drawBarsDuration(canvas, minutesMap) {
          if (!canvas) return;
          const { ctx, w, h } = setupCanvas(canvas);
          const padding = { l: 40, r: 10, t: 10, b: 40 };
          const entries = Array.from(minutesMap.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
          const labels = entries.map(e=>e[0]);
          const values = entries.map(e=>e[1]);
          const maxVal = values.length? Math.max(...values): 0;
          axis(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          const maxY = yTicksInteger(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b, maxVal);
          const plotW = w-padding.l-padding.r, plotH = h-padding.t-padding.b;
          const barW = Math.max(10, plotW / (labels.length*1.2 || 1));
          const styles = getComputedStyle(document.documentElement);
          const color = styles.getPropertyValue('--primary').trim();
          ctx.fillStyle = color;
          const hitboxes = [];
          for (let i=0;i<labels.length;i++) {
            const x = padding.l + i * (barW*1.2);
            const hVal = maxY>0 ? (values[i]/maxY) * plotH : 0;
            const y = padding.t + plotH - hVal;
            ctx.fillRect(x, y, barW, hVal);
            hitboxes.push({ x, y, w: barW, h: hVal, label: labels[i], val: values[i] });
            // x-etikett
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
            ctx.font = '12px system-ui';
            ctx.save();
            ctx.translate(x + barW/2, h-4);
            ctx.rotate(-Math.PI/6);
            ctx.textAlign = 'right';
            ctx.fillText(labels[i], 0, 0);
            ctx.restore();
            ctx.fillStyle = color;
          }
          canvas.onmousemove = (ev) => {
            const rect = canvas.getBoundingClientRect(); const mx = ev.clientX-rect.left, my=ev.clientY-rect.top;
            for (const hb of hitboxes) {
              if (mx>=hb.x && mx<=hb.x+hb.w && my>=hb.y && my<=hb.y+hb.h) {
                showTip(`<b>${hb.label}</b><br/>${hb.val} min`, ev.clientX, ev.clientY); return;
              }
            }
            hideTip();
          };
          canvas.onmouseleave = hideTip;
        }
        function painMinutesPerDay(arr) {
          const m = new Map();
          for (const p of arr) {
            const mins = (p.starttid && p.sluttid) ? (function(){const [sh,sm]=(p.starttid||'').split(':').map(x=>parseInt(x,10)); const [eh,em]=(p.sluttid||'').split(':').map(x=>parseInt(x,10)); if(!Number.isFinite(sh)||!Number.isFinite(sm)||!Number.isFinite(eh)||!Number.isFinite(em)) return 0; const s=sh*60+sm,e=eh*60+em; return Math.max(0,e-s);}()) : 0;
            const d = p.datum; m.set(d, (m.get(d)||0) + mins);
          }
          return m;
        }
        function drawBarsMeds(canvas, medsCounts) {
          if (!canvas) return;
          const { ctx, w, h } = setupCanvas(canvas);
          const padding = { l: 40, r: 10, t: 10, b: 24 };
          axis(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          const labels = ['ibuprofen','paracetamol','naproxen'];
          const values = labels.map(k=>medsCounts[k]||0);
          const maxVal = Math.max(1, ...values);
          const maxY = yTicksInteger(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b, maxVal);
          const plotW = w-padding.l-padding.r, plotH = h-padding.t-padding.b;
          const barW = Math.max(18, plotW / (labels.length*1.6));
          const styles = getComputedStyle(document.documentElement);
          const color = styles.getPropertyValue('--accent').trim();
          ctx.fillStyle = color;
          const hit = [];
          for (let i=0;i<labels.length;i++) {
            const x = padding.l + i * (barW*1.6);
            const hVal = (values[i]/maxY)*plotH; const y = padding.t + plotH - hVal;
            ctx.fillRect(x, y, barW, hVal);
            hit.push({ x, y, w:barW, h:hVal, label: labels[i], val: values[i] });
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
            ctx.font = '12px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(labels[i], x+barW/2, h-6);
            ctx.fillStyle = color;
          }
          canvas.onmousemove = (ev) => {
            const rect = canvas.getBoundingClientRect(); const mx = ev.clientX-rect.left, my=ev.clientY-rect.top;
            for (const hb of hit) { if (mx>=hb.x && mx<=hb.x+hb.w && my>=hb.y && my<=hb.y+hb.h) { showTip(`${hb.label}: ${hb.val} ggr`, ev.clientX, ev.clientY); return; } }
            hideTip();
          };
          canvas.onmouseleave = hideTip;
        }

        function drawFluidBars(canvas, perDay, goal) {
          if (!canvas) return;
          const { ctx, w, h } = setupCanvas(canvas);
          const padding = { l: 40, r: 10, t: 10, b: 40 };
          const entries = Array.from(perDay.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
          const labels = entries.map(e=>e[0]); const values = entries.map(e=>e[1]);
          const maxVal = Math.max(goal, values.length? Math.max(...values): 0);
          axis(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          const maxY = yTicksInteger(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b, maxVal);
          const plotW = w-padding.l-padding.r, plotH = h-padding.t-padding.b;
          const barW = Math.max(12, plotW / (labels.length*1.2 || 1));
          const styles = getComputedStyle(document.documentElement);
          const color = styles.getPropertyValue('--primary').trim();
          ctx.fillStyle = color;
          const hit = [];
          for (let i=0;i<labels.length;i++) {
            const x = padding.l + i*(barW*1.2);
            const hVal = (values[i]/maxY)*plotH; const y = padding.t + plotH - hVal;
            ctx.fillRect(x, y, barW, hVal); hit.push({ x,y,w:barW,h:hVal,label:labels[i],val:values[i] });
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
            ctx.font = '12px system-ui'; ctx.save(); ctx.translate(x + barW/2, h-4); ctx.rotate(-Math.PI/6); ctx.textAlign='right'; ctx.fillText(labels[i],0,0); ctx.restore(); ctx.fillStyle=color;
          }
          // Mål-linje
          const yGoal = padding.t + plotH - (goal/maxY)*plotH;
          ctx.strokeStyle = styles.getPropertyValue('--ok').trim(); ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(padding.l, yGoal); ctx.lineTo(padding.l+plotW, yGoal); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = styles.getPropertyValue('--ok').trim(); ctx.fillText(`${goal} ml mål`, padding.l + 6, yGoal - 6);



          canvas.onmousemove = (ev) => {
            const rect = canvas.getBoundingClientRect(); const mx = ev.clientX-rect.left, my=ev.clientY-rect.top;
            for (const hb of hit) { if (mx>=hb.x && mx<=hb.x+hb.w && my>=hb.y && my<=hb.y+hb.h) { showTip(`<b>${hb.label}</b><br/>${hb.val} ml`, ev.clientX, ev.clientY); return; } }
            hideTip();
          };
          canvas.onmouseleave = hideTip;
        }


        function painMinutesPerDay(arr) {
          const m = new Map();
          for (const p of arr) {
            const mins = (p.starttid && p.sluttid) ? (function(){const [sh,sm]=(p.starttid||'').split(':').map(x=>parseInt(x,10)); const [eh,em]=(p.sluttid||'').split(':').map(x=>parseInt(x,10)); if(!Number.isFinite(sh)||!Number.isFinite(sm)||!Number.isFinite(eh)||!Number.isFinite(em)) return 0; const s=sh*60+sm,e=eh*60+em; return Math.max(0,e-s);}()) : 0;
            const d = p.datum; m.set(d, (m.get(d)||0) + mins);
          }
          return m;
        }


        function drawPeeBars(canvas, perDay) {
          if (!canvas) return;
          drawBarsCounts(canvas, perDay);
        }

        function drawPainBox(canvas, perDayPerTyp) {
          if (!canvas) return;
          // perDayPerTyp: Map<datum, { magont: [nivåer], liv: [nivåer] }>
          const { ctx, w, h } = setupCanvas(canvas);
          const padding = { l: 40, r: 10, t: 10, b: 40 };
          axis(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          yTicksLevel(ctx, padding.l, padding.t, w-padding.l-padding.r, h-padding.t-padding.b);
          const entries = Array.from(perDayPerTyp.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
          const labels = entries.map(e=>e[0]);
          const plotW = w-padding.l-padding.r, plotH = h-padding.t-padding.b;
          const colW = Math.max(18, plotW/(labels.length*1.3 || 1));
          const styles = getComputedStyle(document.documentElement);
          const colGap = 4;
          function yPos(level){ return padding.t + (1 - (level-1)/9) * plotH; }
          ctx.font = '12px system-ui';
          for (let i=0;i<labels.length;i++) {
            const xBase = padding.l + i*(colW*1.3);
            // två "boxar": magont (vänster), liv (höger)
            const obj = entries[i][1];
            const drawOne = (arr, x, color) => {
              if (!arr || !arr.length) return;
              const min = Math.min(...arr), max = Math.max(...arr), med = Utils.median(arr), avg = Utils.mean(arr);
              ctx.strokeStyle = color; ctx.lineWidth = 2;
              // range
              ctx.beginPath(); ctx.moveTo(x, yPos(min)); ctx.lineTo(x, yPos(max)); ctx.stroke();
              // median (tjock kort linje)
              ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x-6, yPos(med)); ctx.lineTo(x+6, yPos(med)); ctx.stroke();
              // mean (punkt)

              ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, yPos(avg), 3, 0, Math.PI*2); ctx.fill();
            };
            drawOne(obj.magont, xBase + colW/2 - colGap, styles.getPropertyValue('--primary-600').trim());
            drawOne(obj['livmoder-ont'], xBase + colW/2 + colGap, styles.getPropertyValue('--accent-600').trim());
            // label
            ctx.save(); ctx.translate(xBase + colW/2, h-6); ctx.rotate(-Math.PI/6); ctx.textAlign = 'right'; ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); ctx.fillText(labels[i],0,0); ctx.restore();
          }
        }

        function rebuildAll() {
          // Smärta (huvud)
          const painFiltered = UI.filteredPain();
          drawLinePain(document.getElementById('painLine'), painFiltered);
          const countsPain = UI.countsByDay(painFiltered);
          drawBarsCounts(document.getElementById('painBars'), countsPain);
          const medsCounts = UI.medsCounts(painFiltered);
          drawBarsMeds(document.getElementById('painMeds'), medsCounts);
          const perDayTyp = UI.painLevelsByDayAndType(painFiltered);
          drawPainBox(document.getElementById('painBox'), perDayTyp);
          const painDur = painMinutesPerDay(painFiltered);
          drawBarsDuration(document.getElementById('painDuration'), painDur);

          // Kiss
          const peeCounts = UI.countsByDay(State.pee);
          drawPeeBars(document.getElementById('peeBars'), peeCounts);

          // Vätska
          const fluidPerDay = UI.fluidMlPerDay(State.fluid);
          drawFluidBars(document.getElementById('fluidBars'), fluidPerDay, State.settings.vatska_mal_ml);

          // Statistik (sammanställning)
          let statsPain = painFiltered;
          if (State.statPain === 'magont') statsPain = painFiltered.filter(p=>p.typ==='magont');
          else if (State.statPain === 'livmoder-ont') statsPain = painFiltered.filter(p=>p.typ==='livmoder-ont');
          drawLinePain(document.getElementById('painLine2'), statsPain);
          const statsCounts = UI.countsByDay(statsPain);
          drawBarsCounts(document.getElementById('painBars2'), statsCounts);
          const statsMeds = UI.medsCounts(statsPain);
          drawBarsMeds(document.getElementById('painMeds2'), statsMeds);
          const statsPerDayTyp = UI.painLevelsByDayAndType(statsPain);
          drawPainBox(document.getElementById('painBox2'), statsPerDayTyp);
          const statsDur = painMinutesPerDay(statsPain);
          drawBarsDuration(document.getElementById('painDuration2'), statsDur);
          drawPeeBars(document.getElementById('peeBars2'), peeCounts);
          drawFluidBars(document.getElementById('fluidBars2'), fluidPerDay, State.settings.vatska_mal_ml);
        }

        function onResize() { rebuildAll(); }

        return { rebuildAll, onResize };
      })();

      const UI = (() => {
        const els = {};

        function cache() {
          els.appRoot = document.documentElement;
          // top bar
          els.btnExport = document.getElementById('btnExport');
          els.btnImport = document.getElementById('btnImport');
          els.btnSettings = document.getElementById('btnSettings');
          els.btnClear = document.getElementById('btnClear');
          els.privacyBanner = document.getElementById('privacyBanner');
          els.live = document.getElementById('liveRegion');
          // tabs
          els.tabBtns = {
            smarta: document.getElementById('tabbtn-smarta'),
            kiss: document.getElementById('tabbtn-kiss'),
            vatska: document.getElementById('tabbtn-vatska'),
            stat: document.getElementById('tabbtn-stat')
          };
          els.tabs = {
            smarta: document.getElementById('tab-smarta'),
            kiss: document.getElementById('tab-kiss'),
            vatska: document.getElementById('tab-vatska'),
            stat: document.getElementById('tab-stat')
          };
          // pain form
          els.painDate = document.getElementById('painDate');
          els.painStart = document.getElementById('painStart');
          els.painEnd = document.getElementById('painEnd');
          els.painLevel = document.getElementById('painLevel');
          els.painScaleText = document.getElementById('painScaleText');
          els.painForm = document.getElementById('painForm');
          els.painMedsSection = document.getElementById('painMedsSection');
          els.medsChecks = Array.from(document.querySelectorAll('.medsChk'));
          els.medEffRadios = Array.from(document.querySelectorAll('input[name="medEffekt"]'));
          els.effektMin = document.getElementById('effektMin');
          els.painNote = document.getElementById('painNote');

          // pain list & filters
          els.painList = document.getElementById('painList');
          els.painEmpty = document.getElementById('painEmpty');
          els.painFilters = {
            from: document.getElementById('fFrom'),
            to: document.getElementById('fTo'),
            magont: document.getElementById('fMagont'),
            livmoder: document.getElementById('fLivmoder'),
            min: document.getElementById('fMin'),
            max: document.getElementById('fMax'),
            meds: document.getElementById('fMeds'),
            effekt: document.getElementById('fEffekt'),
            sok: document.getElementById('fSok'),
            btnClr: document.getElementById('btnClrFilter'),
            btnApply: document.getElementById('btnApplyFilter')
          };

          // pee
          els.btnPeeNow = document.getElementById('btnPeeNow');
          els.btnPeeAdd = document.getElementById('btnPeeAdd');
          els.peeDate = document.getElementById('peeDate');
          els.peeTime = document.getElementById('peeTime');
          els.peeList = document.getElementById('peeList');
          els.peeEmpty = document.getElementById('peeEmpty');

          // fluid
          els.fluidForm = document.getElementById('fluidForm');
          els.fluidDate = document.getElementById('fluidDate');
          els.fluidTime = document.getElementById('fluidTime');
          els.fluidVol = document.getElementById('fluidVol');
          els.fluidType = document.getElementById('fluidType');
          els.goalMl = document.getElementById('goalMl');
          els.fluidList = document.getElementById('fluidList');
          els.fluidEmpty = document.getElementById('fluidEmpty');

          // stats
          els.statPainBtns = Array.from(document.querySelectorAll('.stat-pain-btn'));

          // modal & snackbar
          els.modalBackdrop = document.getElementById('modalBackdrop');
          els.modalContent = document.getElementById('modalContent');
          els.modalClose = document.getElementById('modalClose');
          els.snackbar = document.getElementById('snackbar');
          els.snackText = document.getElementById('snackText');
          els.snackUndo = document.getElementById('snackUndo');
        }

        function bind() {
          // tabs
          for (const [k, btn] of Object.entries(els.tabBtns)) btn.addEventListener('click', ()=>activateTab(k));
          // top actions
          els.btnExport.addEventListener('click', openExportModal);
          els.btnImport.addEventListener('click', openImportModal);
          els.btnSettings.addEventListener('click', openSettingsModal);
          els.btnClear.addEventListener('click', clearAllConfirm);
          // pain form dynamic
          els.painForm.addEventListener('change', onPainFormChange);
          els.painForm.addEventListener('input', onPainFormChange);
          els.painForm.addEventListener('submit', onPainSubmit);
          // filters
          els.painFilters.btnApply.addEventListener('click', applyFilters);
          els.painFilters.btnClr.addEventListener('click', resetFilters);
          // stat pain type buttons
          for (const btn of els.statPainBtns) {
            btn.addEventListener('click', () => {
              State.statPain = btn.dataset.type;
              for (const b of els.statPainBtns) b.classList.toggle('tab-active', b===btn);
              Charts.rebuildAll();
            });
          }
          // pee
          els.btnPeeNow.addEventListener('click', addPeeNow);
          els.btnPeeAdd.addEventListener('click', addPeeCustom);
          // fluid
          els.fluidForm.addEventListener('submit', onFluidSubmit);
          // modal close
          els.modalClose.addEventListener('click', closeModal);
          els.modalBackdrop.addEventListener('click', (e)=>{ if (e.target===els.modalBackdrop) closeModal(); });
          // snackbar undo
          els.snackUndo.addEventListener('click', undoDelete);
          // resize charts
          window.addEventListener('resize', Charts.onResize);
        }

        function initTheme() {
          applyTheme(State.settings.tema);
        }
        function applyTheme(theme) {
          document.documentElement.setAttribute('data-theme', theme);
          State.settings.tema = theme;
          Storage.saveAll(State);
        }

        function initDefaults() {
          // sätt dagens datum/tid
          const now = new Date(); now.setSeconds(0,0);
          const d = Utils.toLocalISO(now);
          const { datum, tid } = Utils.splitISO(d);
          els.painDate.value = datum; els.painStart.value = tid; els.painEnd.value = '';
          els.fluidDate.value = datum; els.fluidTime.value = tid; els.goalMl.textContent = String(State.settings.vatska_mal_ml);
          els.peeDate.value = datum; els.peeTime.value = tid;
          updateScaleText();
          updateMedsUI();

          if (!State.firstRunShown) {
            els.privacyBanner.hidden = false; // visas
            Storage.markBannerShown();
          }
        }

        function updateScaleText() {
          const lvl = parseInt(els.painLevel.value,10);
          const txt = State.settings['smärtskala'][lvl] || '(Ange beskrivning i Inställningar)';
          els.painScaleText.textContent = `${lvl}/10: ${txt || ''}`.trim();
          const badge = document.getElementById('painLevelBadge');
          if (badge) { badge.textContent = String(lvl); badge.style.background = Utils.levelColor(lvl); }
        }

        function onPainFormChange() {
          updateScaleText();
          updateMedsUI();
        }

        function getSelectedPainType() {
          const val = (document.querySelector('input[name="painType"]:checked')||{}).value;
          return val || 'magont';
        }

        function updateMedsUI() {
          // Smärtlindring tillåten för båda typer (magont och livmoder-ont)
          const meds = els.medsChecks.filter(c=>c.checked).map(c=>c.value);
          els.painMedsSection.hidden = false;
          const enabled = meds.length>0;
          for (const r of els.medEffRadios) { r.disabled = !enabled; if (!enabled) r.checked = false; }
          els.effektMin.disabled = !enabled || !['ja','delvis'].includes((document.querySelector('input[name="medEffekt"]:checked')||{}).value);
        }

        function colorForLevel(level) { return Utils.levelColor(level); }

        function painMinutesPerDay(arr) {
          return Charts.painMinutesPerDay(arr);
        }

        function onPainSubmit(e) {
          e.preventDefault();
          const dateStr = els.painDate.value; const startStr = els.painStart.value; const endStr = els.painEnd.value;
          const typ = getSelectedPainType();
          const niva = Utils.clamp(parseInt(els.painLevel.value,10)||1,1,10);
          const meds = els.medsChecks.filter(c=>c.checked).map(c=>c.value);
          let med_effekt = null; let med_effekt_minuter = null;
          if (meds.length) {
            const r = document.querySelector('input[name="medEffekt"]:checked');
            med_effekt = r ? r.value : null;
            if (["ja","delvis"].includes(med_effekt)) {
              const raw = (els.effektMin.value || '').trim();
              if (raw === '') {
                // Minuter okänt – tillåt tomt värde
                med_effekt_minuter = null;
              } else {
                const v = Utils.parseNumber(raw);
                if (v == null || v < 0 || v > 240) { announce('Ange minuter 0–240 (lämna tomt om okänt).'); els.effektMin.focus(); return; }
                med_effekt_minuter = v;
              }
            }
          }
          const note = els.painNote.value.trim();
          if (!dateStr || !startStr) { announce('Datum och starttid krävs.'); return; }
          if (endStr && endStr < startStr) { announce('Sluttid kan inte vara före starttid.'); return; }
          const dt = Utils.fromDateTimeStrings(dateStr, startStr);
          const iso = Utils.toLocalISO(dt);
          const { datum, tid } = Utils.splitISO(iso);
          const entry = { id: Utils.newUUID(), timestamp: iso, datum, tid, typ, niva, meds, med_effekt, med_effekt_minuter, anteckning: note, starttid: startStr, sluttid: endStr || null };
          State.pain.push(entry);
          State.pain.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          Storage.saveAll(State);
          announce('Smärta sparad.');
          // reset vissa fält
          els.painNote.value='';
          if (els.painEnd) els.painEnd.value='';
          for (const c of els.medsChecks) c.checked=false; for (const r of els.medEffRadios) { r.checked=false; r.disabled=true; }
          els.effektMin.value=''; els.effektMin.disabled=true;
          renderPainList(); Charts.rebuildAll();
        }

        function filteredPain() {
          const f = State.filters;
          return State.pain.filter(p => {
            if (f.from && p.datum < f.from) return false;
            if (f.to && p.datum > f.to) return false;
            if (!f.magont && p.typ==='magont') return false;
            if (!f.livmoder && p.typ==='livmoder-ont') return false;
            if (p.niva < f.min || p.niva > f.max) return false;
            if (f.meds==='har' && (!p.meds || p.meds.length===0)) return false;
            if (f.meds==='harinte' && p.meds && p.meds.length>0) return false;
            if (f.effekt!=='alla') {
              if ((p.med_effekt||'').toLowerCase() !== f.effekt) return false;
            }
            if (f.sok && !(p.anteckning||'').toLowerCase().includes(f.sok.toLowerCase())) return false;
            return true;
          });
        }

        function countsByDay(arr) {
          const m = new Map();
          for (const it of arr) { const k = it.datum || Utils.splitISO(it.timestamp).datum; m.set(k, (m.get(k)||0)+1); }
          return m;
        }
        function medsCounts(arr) {
          const c = { ibuprofen:0, paracetamol:0, naproxen:0 };
          for (const p of arr) { for (const m of (p.meds||[])) if (c.hasOwnProperty(m)) c[m]++; }
          return c;
        }
        function painLevelsByDayAndType(arr) {
          const map = new Map(); // datum -> {magont:[], 'livmoder-ont':[]}
          for (const p of arr) {
            const d = p.datum; if (!map.has(d)) map.set(d, { magont: [], 'livmoder-ont': [] });
            map.get(d)[p.typ].push(p.niva);
          }
          return map;
        }
        function fluidMlPerDay(arr) {
          const m = new Map();
          for (const it of arr) { const d = Utils.splitISO(it.timestamp).datum; m.set(d, (m.get(d)||0) + (it.volym_ml||0)); }
          return m;
        }

        function renderPainList() {
          const list = els.painList; list.innerHTML = '';
          const arr = filteredPain().slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          if (!arr.length) { els.painEmpty.hidden = false; return; } else { els.painEmpty.hidden = true; }
          // gruppera per datum
          const byDay = Utils.groupBy(arr, p=>p.datum);
          const days = Array.from(byDay.keys()).sort((a,b)=>b.localeCompare(a));
          for (const d of days) {
            const wrap = document.createElement('div'); wrap.className='list-day';
            const head = document.createElement('div'); head.className='day-head'; head.textContent = `${Utils.formatDate(d)} (${d})`;
            wrap.appendChild(head);
            const items = byDay.get(d).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
            for (const p of items) wrap.appendChild(renderPainItem(p));
            list.appendChild(wrap);
          }
        }

        function renderPainItem(p) {
          const div = document.createElement('div'); div.className='item'; div.setAttribute('data-id', p.id);
          const left = document.createElement('div');
          const right = document.createElement('div'); right.className='actions';
          // left content
          const icon = p.typ==='magont' ? '💢' : '♀️';
          const medsStr = (p.meds&&p.meds.length) ? ` • 💊 ${p.meds.join('+')}` : '';
          const effStr = (p.meds&&p.meds.length && p.med_effekt) ? `, effekt: ${p.med_effekt}${(p.med_effekt_minuter!=null)?` (${p.med_effekt_minuter} min)`:''}` : '';
          const noteStr = (p.anteckning) ? ` — ${p.anteckning}` : '';
          const levelBadge = `<span class="level-badge" style="background:${colorForLevel(p.niva)}">${p.niva}</span>`;
          const timeLabel = p.starttid ? (p.sluttid ? `${p.starttid}–${p.sluttid}` : p.starttid) : p.tid;
          left.innerHTML = `<div><b>${icon} ${timeLabel}</b> • ${p.typ} ${levelBadge}${medsStr}${effStr}${noteStr}</div>
                            <div class="meta">${p.datum}</div>`;
          // right actions
          const btnEdit = buttonSmall('Redigera', 'ghost', ()=>openEditPain(p.id));
          const btnDup = buttonSmall('Duplicera', 'secondary', ()=>duplicatePain(p.id));
          const btnDel = buttonSmall('Ta bort', 'danger', ()=>deletePain(p.id));
          right.append(btnEdit, btnDup, btnDel);
          div.append(left, right);
          return div;
        }

        function buttonSmall(text, variant, onClick) {
          const b = document.createElement('button'); b.className='btn ' + (variant||'ghost'); b.textContent=text; b.title=text; b.addEventListener('click', onClick); return b;
        }

        function applyFilters() {
          State.filters.from = els.painFilters.from.value || '';
          State.filters.to = els.painFilters.to.value || '';
          State.filters.magont = !!els.painFilters.magont.checked;
          State.filters.livmoder = !!els.painFilters.livmoder.checked;
          State.filters.min = Utils.clamp(parseInt(els.painFilters.min.value,10)||1,1,10);
          State.filters.max = Utils.clamp(parseInt(els.painFilters.max.value,10)||10,1,10);
          if (State.filters.min > State.filters.max) { const t=State.filters.min; State.filters.min=State.filters.max; State.filters.max=t; }
          State.filters.meds = els.painFilters.meds.value;
          State.filters.effekt = els.painFilters.effekt.value;
          State.filters.sok = els.painFilters.sok.value.trim();
          renderPainList(); Charts.rebuildAll();
        }
        function resetFilters() {
          els.painFilters.from.value=''; els.painFilters.to.value='';
          els.painFilters.magont.checked=true; els.painFilters.livmoder.checked=true;
          els.painFilters.min.value='1'; els.painFilters.max.value='10';
          els.painFilters.meds.value='alla'; els.painFilters.effekt.value='alla'; els.painFilters.sok.value='';
          applyFilters();
        }

        // Editera smärta
        function openEditPain(id) {
          const p = State.pain.find(x=>x.id===id); if (!p) return;
          const meds = (p.meds||[]);
          const eff = p.med_effekt || '';
          const min = p.med_effekt_minuter==null? '' : p.med_effekt_minuter;
          const html = `
            <h3>Redigera smärta</h3>
            <form id="editPainForm" data-id="${p.id}">
              <div class="row">
                <div><label>Datum</label><input id="epDate" type="date" value="${p.datum}" required></div>
                <div><label>Starttid</label><input id="epStart" type="time" step="60" value="${p.starttid || p.tid}" required></div>
                <div><label>Sluttid (valfritt)</label><input id="epEnd" type="time" step="60" value="${p.sluttid || ''}"></div>
              </div>
              <div class="row" style="margin-top:6px;">
                <label><input type="radio" name="epTyp" value="magont" ${p.typ==='magont'?'checked':''}> Magont</label>
                <label><input type="radio" name="epTyp" value="livmoder-ont" ${p.typ==='livmoder-ont'?'checked':''}> Livmoder‑ont</label>
              </div>
              <div style="margin-top:6px;">
                <label>Nivå (1–10)</label>
                <input id="epNiva" type="range" min="1" max="10" value="${p.niva}">
                <div class="scale-note">${p.niva}/10: ${State.settings['smärtskala'][p.niva]||''}</div>
              </div>
              <div class="section-title">Smärtlindring</div>
              <div class="row">
                <label><input type="checkbox" value="ibuprofen" class="epMed" ${meds.includes('ibuprofen')?'checked':''}> ibuprofen</label>
                <label><input type="checkbox" value="paracetamol" class="epMed" ${meds.includes('paracetamol')?'checked':''}> paracetamol</label>
                <label><input type="checkbox" value="naproxen" class="epMed" ${meds.includes('naproxen')?'checked':''}> naproxen</label>
              </div>
              <div class="row" style="margin-top:6px;">
                <label><input type="radio" name="epEff" value="ja" ${eff==='ja'?'checked':''}> Ja</label>
                <label><input type="radio" name="epEff" value="delvis" ${eff==='delvis'?'checked':''}> Delvis</label>
                <label><input type="radio" name="epEff" value="nej" ${eff==='nej'?'checked':''}> Nej</label>
                <label><input type="radio" name="epEff" value="vet ej" ${eff==='vet ej'?'checked':''}> Vet ej</label>
              </div>
              <div class="row" style="margin-top:6px;">
                <div><label>Efter hur länge? (min)</label><input id="epMin" type="number" min="0" max="240" step="1" value="${min}"></div>
              </div>
              <div style="margin-top:6px;"><label>Anteckning</label><textarea id="epNote">${(p.anteckning||'').replace(/</g,'&lt;')}</textarea></div>
              <div class="row" style="margin-top:12px; justify-content:flex-end;">
                <button class="btn ok" type="submit">Spara</button>
              </div>
            </form>
          `;
          openModal(html);
          document.getElementById('editPainForm').addEventListener('submit', (e)=>{
            e.preventDefault();
            const id = e.target.getAttribute('data-id');
            const idx = State.pain.findIndex(x=>x.id===id); if (idx<0) return;
            const d = e.target.querySelector('#epDate').value; const tStart = e.target.querySelector('#epStart').value; const tEnd = e.target.querySelector('#epEnd').value;
            const typ = (e.target.querySelector('input[name="epTyp"]:checked')||{}).value || p.typ;
            const niva = Utils.clamp(parseInt(e.target.querySelector('#epNiva').value,10)||p.niva,1,10);
            const meds = Array.from(e.target.querySelectorAll('.epMed')).filter(c=>c.checked).map(c=>c.value);
            let eff = (e.target.querySelector('input[name="epEff"]:checked')||{}).value || null;
            const min = Utils.parseNumber(e.target.querySelector('#epMin').value);
            let effMin = (eff==='ja' || eff==='delvis') ? (min==null? null : min) : null;
            if ((eff==='ja' || eff==='delvis') && (effMin==null || effMin<0 || effMin>240)) { announce('Ange minuter 0–240.'); return; }
            if (meds.length===0) { eff = null; effMin = null; }
            if (tEnd && tEnd < tStart) { announce('Sluttid kan inte vara före starttid.'); return; }
            const iso = Utils.toLocalISO(Utils.fromDateTimeStrings(d,tStart));
            const { datum, tid } = Utils.splitISO(iso);
            State.pain[idx] = { ...State.pain[idx], datum, tid, timestamp: iso, typ, niva, meds, med_effekt: eff, med_effekt_minuter: effMin, anteckning: e.target.querySelector('#epNote').value.trim(), starttid: tStart, sluttid: tEnd || null };
            Storage.saveAll(State); closeModal(); renderPainList(); Charts.rebuildAll(); announce('Ändringar sparade.');
          });
        }

        function duplicatePain(id) {
          const p = State.pain.find(x=>x.id===id); if (!p) return;
          const copy = { ...p, id: Utils.newUUID() };
          State.pain.unshift(copy);
          Storage.saveAll(State); renderPainList(); Charts.rebuildAll(); announce('Post duplicerad.');
        }

        function deletePain(id) {
          const idx = State.pain.findIndex(x=>x.id===id); if (idx<0) return;
          const removed = State.pain.splice(idx,1)[0];
          State.lastDeleted = { type: 'pain', item: removed };
          Storage.saveAll(State);
          renderPainList(); Charts.rebuildAll();
          showSnack('Raderad smärta.');
        }

        function showSnack(text) {
          els.snackText.textContent = text + ' Ångra?';
          els.snackbar.style.display = 'flex';
          clearTimeout(showSnack._t);
          showSnack._t = setTimeout(()=>{ els.snackbar.style.display = 'none'; State.lastDeleted=null; }, 5000);
        }

        function undoDelete() {
          els.snackbar.style.display = 'none';
          if (!State.lastDeleted) return;
          const { type, item } = State.lastDeleted;
          if (type==='pain') State.pain.push(item);
          else if (type==='pee') State.pee.push(item);
          else if (type==='fluid') State.fluid.push(item);
          State.lastDeleted = null;
          Storage.saveAll(State); renderAll(); Charts.rebuildAll(); announce('Återställd.');
        }

        // Pee
        function addPeeNow() {
          const now = new Date(); now.setSeconds(0,0);
          const iso = Utils.toLocalISO(now);
          State.pee.unshift({ id: Utils.newUUID(), timestamp: iso });
          Storage.saveAll(State); renderPeeList(); Charts.rebuildAll(); announce('Kiss sparad.');
        }
        function addPeeCustom() {
          const d = els.peeDate.value; const t = els.peeTime.value; if (!d || !t) { announce('Välj datum och tid.'); return; }
          const iso = Utils.toLocalISO(Utils.fromDateTimeStrings(d,t));
          State.pee.unshift({ id: Utils.newUUID(), timestamp: iso });
          Storage.saveAll(State); renderPeeList(); Charts.rebuildAll(); announce('Kiss sparad.');
        }
        function renderPeeList() {
          const list = els.peeList; list.innerHTML = '';
          const arr = State.pee.slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          if (!arr.length) { els.peeEmpty.hidden=false; return; } else els.peeEmpty.hidden=true;
          const byDay = Utils.groupBy(arr, it=>Utils.splitISO(it.timestamp).datum);
          const days = Array.from(byDay.keys()).sort((a,b)=>b.localeCompare(a));
          for (const d of days) {
            const wrap = document.createElement('div'); wrap.className='list-day';
            const head = document.createElement('div'); head.className='day-head'; head.textContent = `${Utils.formatDate(d)} (${d})`;
            wrap.appendChild(head);
            const items = byDay.get(d);
            for (const p of items) {
              const div = document.createElement('div'); div.className='item'; div.setAttribute('data-id', p.id);
              const { tid } = Utils.splitISO(p.timestamp);
              const left = document.createElement('div'); left.innerHTML = `<div><b>🚻 ${tid}</b></div><div class="meta">${d}</div>`;
              const right = document.createElement('div'); right.className='actions';
              const btnDel = buttonSmall('Ta bort', 'danger', ()=>{ deletePee(p.id); });
              right.append(btnDel); div.append(left,right); wrap.appendChild(div);
            }
            list.appendChild(wrap);
          }
        }
        function deletePee(id) {
          const idx = State.pee.findIndex(x=>x.id===id); if (idx<0) return; const removed = State.pee.splice(idx,1)[0];
          State.lastDeleted = { type:'pee', item: removed }; Storage.saveAll(State); renderPeeList(); Charts.rebuildAll(); showSnack('Raderad.');
        }

        // Fluid
        function onFluidSubmit(e) {
          e.preventDefault();
          const d = els.fluidDate.value; const t = els.fluidTime.value; const vol = Utils.parseNumber(els.fluidVol.value);
          if (!d || !t) { announce('Datum och tid krävs.'); return; }
          if (vol==null || vol<=0 || vol>5000) { announce('Volym 1–5000 ml.'); els.fluidVol.focus(); return; }
          const iso = Utils.toLocalISO(Utils.fromDateTimeStrings(d,t));
          const dryck = els.fluidType.value.trim();
          State.fluid.unshift({ id: Utils.newUUID(), timestamp: iso, volym_ml: vol, dryck });
          Storage.saveAll(State); renderFluidList(); Charts.rebuildAll(); announce('Vätska tillagd.');
          e.target.reset(); els.fluidDate.value = d; els.fluidTime.value = t; // behåll tid/datum
        }
        function renderFluidList() {
          const list = els.fluidList; list.innerHTML='';
          const arr = State.fluid.slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          if (!arr.length) { els.fluidEmpty.hidden=false; return; } else els.fluidEmpty.hidden=true;
          const byDay = Utils.groupBy(arr, it=>Utils.splitISO(it.timestamp).datum);
          const days = Array.from(byDay.keys()).sort((a,b)=>b.localeCompare(a));
          for (const d of days) {
            const wrap = document.createElement('div'); wrap.className='list-day';
            const items = byDay.get(d);
            const sumMl = Utils.sum(items.map(x=>x.volym_ml||0));
            const head = document.createElement('div'); head.className='day-head'; head.textContent = `${Utils.formatDate(d)} (${d}) – Summa: ${sumMl} ml`;
            wrap.appendChild(head);
            for (const it of items) {
              const { tid } = Utils.splitISO(it.timestamp);
              const left = document.createElement('div'); left.innerHTML = `<div><b>💧 ${tid}</b> • ${it.volym_ml} ml ${it.dryck? '— '+it.dryck:''}</div><div class="meta">${d}</div>`;
              const right = document.createElement('div'); right.className='actions';
              const btnDel = buttonSmall('Ta bort', 'danger', ()=>deleteFluid(it.id));
              const div = document.createElement('div'); div.className='item'; div.setAttribute('data-id', it.id);
              div.append(left, right.appendChild(btnDel), right); // ensure correct structure
              wrap.appendChild(div);
            }
            list.appendChild(wrap);
          }
          els.goalMl.textContent = String(State.settings.vatska_mal_ml);
        }
        function deleteFluid(id) {
          const idx = State.fluid.findIndex(x=>x.id===id); if (idx<0) return; const removed = State.fluid.splice(idx,1)[0];
          State.lastDeleted = { type:'fluid', item: removed }; Storage.saveAll(State); renderFluidList(); Charts.rebuildAll(); showSnack('Raderad.');
        }

        // Export/Import/Settings modaler
        function openExportModal() {
          const html = `
            <h3>Exportera CSV</h3>
            <div class="grid">
              <div class="row">
                <button class="btn" id="exPain">Exportera smärta</button>
                <button class="btn" id="exPee">Exportera kiss</button>
                <button class="btn" id="exFluid">Exportera vätska</button>
              </div>
              <div class="row">
                <button class="btn secondary" id="exAll">Exportera alla (3 filer)</button>
              </div>
              <div class="help">Format: UTF‑8, radslut \n, separator komma. Fält med citattecken escap:as.</div>
            </div>`;
          openModal(html);
          document.getElementById('exPain').addEventListener('click', ()=>{
            CSV.download('smarta.csv', CSV.exportPain(State.pain));
          });
          document.getElementById('exPee').addEventListener('click', ()=>{ CSV.download('kiss.csv', CSV.exportPee(State.pee)); });
          document.getElementById('exFluid').addEventListener('click', ()=>{ CSV.download('vatska.csv', CSV.exportFluid(State.fluid)); });
          document.getElementById('exAll').addEventListener('click', ()=>{
            CSV.download('smarta.csv', CSV.exportPain(State.pain));
            CSV.download('kiss.csv', CSV.exportPee(State.pee));
            CSV.download('vatska.csv', CSV.exportFluid(State.fluid));
          });
        }

        function openImportModal() {
          const html = `
            <h3>Importera CSV</h3>
            <div class="grid">
              <div class="card" style="background:transparent;box-shadow:none;border:1px dashed rgba(100,116,139,0.3)">
                <div class="section-title">Smärta</div>
                <input type="file" id="impPain" accept=".csv,text/csv" />
              </div>
              <div class="card" style="background:transparent;box-shadow:none;border:1px dashed rgba(100,116,139,0.3)">
                <div class="section-title">Kiss</div>
                <input type="file" id="impPee" accept=".csv,text/csv" />
              </div>
              <div class="card" style="background:transparent;box-shadow:none;border:1px dashed rgba(100,116,139,0.3)">
                <div class="section-title">Vätska</div>
                <input type="file" id="impFluid" accept=".csv,text/csv" />
              </div>
              <div class="help">Tillåtna separatorer: komma eller semikolon. För smärta ska rubriker vara: id,datetimeISO,datum,tid,typ,niva,meds,med_effekt,med_effekt_minuter,anteckning,starttid,sluttid</div>
              <div id="importLog" class="muted"></div>
            </div>`;
          openModal(html);
          const logEl = document.getElementById('importLog');
          function readFile(input) {
            return new Promise((resolve,reject)=>{
              const f = input.files && input.files[0]; if (!f) { resolve(null); return; }
              const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(f, 'utf-8');
            });
          }
          function appendLog(msg) { logEl.innerHTML += `<div>${msg}</div>`; }
          document.getElementById('impPain').addEventListener('change', async (e)=>{
            try {
              const text = await readFile(e.target); if (!text) return;
              const rows = CSV.importPain(text);
              // batch-add
              for (const r of rows) State.pain.push(r);
              Storage.saveAll(State); renderPainList(); Charts.rebuildAll(); announce(`Importerade ${rows.length} smärtloggar.`);
              appendLog(`Smärta: ${rows.length} rader importerade.`);
            } catch (err) { appendLog(`<span style='color:var(--danger)'>Smärta: ${err.message}</span>`); }
            e.target.value='';
          });
          document.getElementById('impPee').addEventListener('change', async (e)=>{
            try { const text = await readFile(e.target); if (!text) return; const rows = CSV.importPee(text); for (const r of rows) State.pee.push(r); Storage.saveAll(State); renderPeeList(); Charts.rebuildAll(); announce(`Importerade ${rows.length} kissloggar.`); appendLog(`Kiss: ${rows.length} rader importerade.`); }
            catch(err){ appendLog(`<span style='color:var(--danger)'>Kiss: ${err.message}</span>`);} e.target.value='';
          });
          document.getElementById('impFluid').addEventListener('change', async (e)=>{
            try { const text = await readFile(e.target); if (!text) return; const rows = CSV.importFluid(text); for (const r of rows) State.fluid.push(r); Storage.saveAll(State); renderFluidList(); Charts.rebuildAll(); announce(`Importerade ${rows.length} vätskeposter.`); appendLog(`Vätska: ${rows.length} rader importerade.`); }
            catch(err){ appendLog(`<span style='color:var(--danger)'>Vätska: ${err.message}</span>`);} e.target.value='';
          });
        }

        function openSettingsModal() {
          const theme = State.settings.tema;
          const scale = State.settings['smärtskala'];
          const goal = State.settings.vatska_mal_ml || 2000;
          const demoBtn = DEV_ENABLE_DEMO ? `<button class='btn warn' id='btnDemo'>Skapa exempeldata</button>` : `<button class='btn warn' id='btnDemo' disabled title='Inaktiverat i produktion'>Skapa exempeldata</button>`;
          const html = `
            <h3>Inställningar</h3>
            <div class="grid">
              <div class="card">
                <div class="row">
                  <div>
                    <label for="themeSel">Tema</label>
                    <select id="themeSel">
                      <option value="light" ${theme==='light'?'selected':''}>Ljust</option>
                      <option value="dark" ${theme==='dark'?'selected':''}>Mörkt</option>
                    </select>
                  </div>
                  <div>
                    <label for="goalSel">Dagligt mål (ml)</label>
                    <input id="goalSel" type="number" min="500" max="6000" step="50" value="${goal}">
                  </div>
                </div>
                <div class="row" style="margin-top:10px;">
                  <button class="btn" id="btnSaveSettings">Spara</button>
                  ${demoBtn}
                </div>
              </div>
              <div class="card">
                <div class="section-title">Smärtskala (1–10)</div>
                <div class="grid">
                  ${Array.from({length:10}, (_,i)=>{
                    const lvl = i+1; const val = (scale && scale[lvl]) || '';
                    return `<div><label for='s${lvl}'>${lvl}/10</label><input id='s${lvl}' type='text' value="${(val||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></div>`;
                  }).join('')}
                </div>
                <div class="row" style="margin-top:10px;">
                  <button class="btn secondary" id="btnSaveScale">Spara skala</button>
                </div>
              </div>
            </div>`;
          openModal(html);
          document.getElementById('btnSaveSettings').addEventListener('click', ()=>{
            const sel = document.getElementById('themeSel').value;
            const g = Utils.parseNumber(document.getElementById('goalSel').value) || 2000;
            State.settings.tema = sel; State.settings.vatska_mal_ml = Utils.clamp(g, 500, 6000);
            applyTheme(sel); Storage.saveAll(State); renderAll(); Charts.rebuildAll(); announce('Inställningar sparade.');
          });
          document.getElementById('btnSaveScale').addEventListener('click', ()=>{
            const obj = {};
            for (let i=1;i<=10;i++) obj[i] = document.getElementById('s'+i).value.trim();
            State.settings['smärtskala'] = obj; Storage.saveAll(State); updateScaleText(); announce('Smärtskala sparad.');
          });
          if (DEV_ENABLE_DEMO) {
            document.getElementById('btnDemo').addEventListener('click', ()=>{ createDemoData(); closeModal(); });
          }
        }

        function createDemoData() {
          // enkel generering – nuvarande dag och bakåt 10 dagar
          const today = new Date(); today.setHours(9,0,0,0);
          for (let d=0; d<8; d++) {
            const base = new Date(today.getTime() - d*86400000);
            // smärta
            const cnt = Math.floor(Math.random()*3);
            for (let i=0;i<cnt;i++) {
              const dt = new Date(base.getTime() + Math.floor(Math.random()*10)*3600000);
              const iso = Utils.toLocalISO(dt);
              const { datum, tid } = Utils.splitISO(iso);
              const typ = Math.random()<0.6? 'magont':'livmoder-ont';
              const niva = 2 + Math.floor(Math.random()*8);
              const meds = typ==='magont' ? (Math.random()<0.4? ['ibuprofen'] : (Math.random()<0.2? ['ibuprofen','paracetamol']: [])) : [];
              const eff = meds.length? (['ja','delvis','nej','vet ej'][Math.floor(Math.random()*4)]) : null;
              const effMin = (eff==='ja'||eff==='delvis')? Math.floor(Math.random()*120): null;
              State.pain.push({ id: Utils.newUUID(), timestamp: iso, datum, tid, typ, niva, meds, med_effekt: eff, med_effekt_minuter: effMin, anteckning: '' });
            }
            // kiss
            const kc = 6 + Math.floor(Math.random()*4);
            for (let i=0;i<kc;i++) { const dt = new Date(base.getTime() + i*2*3600000); State.pee.push({ id: Utils.newUUID(), timestamp: Utils.toLocalISO(dt) }); }
            // vätska
            let ml = 0; const types = ['vatten','te','saft'];
            for (let i=0;i<7;i++) { const dt = new Date(base.getTime() + i*2*3600000); const vol = 150 + Math.floor(Math.random()*250); ml+=vol; State.fluid.push({ id: Utils.newUUID(), timestamp: Utils.toLocalISO(dt), volym_ml: vol, dryck: types[Math.floor(Math.random()*types.length)] }); }
          }
          State.pain.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          State.pee.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          State.fluid.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
          Storage.saveAll(State); renderAll(); Charts.rebuildAll(); announce('Exempeldata skapad.');
        }

        function openModal(html) {
          els.modalContent.innerHTML = html;
          els.modalBackdrop.style.display = 'flex';
          els.modalBackdrop.setAttribute('aria-hidden','false');
        }
        function closeModal() {
          els.modalBackdrop.style.display = 'none';
          els.modalBackdrop.setAttribute('aria-hidden','true');
          els.modalContent.innerHTML = '';
        }

        function clearAllConfirm() {
          const html = `
            <h3>Rensa all data</h3>
            <p>Detta tar bort smärta, kiss och vätska från denna enhet. Exportera först om du vill spara.</p>
            <ol>
              <li>Bekräfta att du förstår.</li>
              <li>Skriv <b>RADERA</b> i rutan.</li>
            </ol>
            <div class="row">
              <label><input type="checkbox" id="c1"> Jag förstår.</label>
              <input id="c2" type="text" placeholder="Skriv RADERA">
            </div>
            <div class="row" style="justify-content:flex-end; margin-top:10px;">
              <button class="btn danger" id="btnDoClear" disabled>Rensa data</button>
            </div>`;
          openModal(html);
          const c1 = document.getElementById('c1'); const c2 = document.getElementById('c2'); const btn = document.getElementById('btnDoClear');
          function upd(){ btn.disabled = !(c1.checked && c2.value.trim().toUpperCase()==='RADERA'); }
          c1.addEventListener('change', upd); c2.addEventListener('input', upd); upd();
          btn.addEventListener('click', ()=>{ Storage.clearAll(); State.pain=[]; State.pee=[]; State.fluid=[]; State.settings = Storage.defaultSettings(); applyTheme(State.settings.tema); closeModal(); renderAll(); Charts.rebuildAll(); announce('All data rensad.'); });
        }

        function activateTab(name) {
          for (const [k, btn] of Object.entries(els.tabBtns)) {
            const active = (k===name);
            btn.classList.toggle('tab-active', active);
            btn.setAttribute('aria-selected', active? 'true':'false');
            els.tabs[k].hidden = !active;
          }
          // Vänta till layout uppdaterats innan vi ritar, särskilt när en sektion byter hidden
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(()=> Charts.rebuildAll());
          } else {
            setTimeout(()=> Charts.rebuildAll(), 0);
          }
        }

        function renderAll() {
          renderPainList(); renderPeeList(); renderFluidList();
        }

        function announce(msg) { els.live.textContent = msg; }

        return { cache, bind, initTheme, initDefaults, applyTheme, renderPainList, renderPeeList, renderFluidList, renderAll, filteredPain, countsByDay, medsCounts, painLevelsByDayAndType, fluidMlPerDay, openSettingsModal };
      })();

      async function init() {
        const s = await Storage.loadAll();
        State = {
          pain: s.pain,
          pee: s.pee,
          fluid: s.fluid,
          settings: s.settings,
          firstRunShown: s.firstRunShown,
          filters: { from: '', to: '', magont: true, livmoder: true, min: 1, max: 10, meds: 'alla', effekt: 'alla', sok: '' },
          lastDeleted: null,
          statPain: 'both',
        };
        UI.cache();
        UI.bind();
        UI.initTheme();
        UI.initDefaults();
        UI.renderAll();
        Charts.rebuildAll();
      }

      return { init };
    })();

    // Starta appen och registrera service worker
    document.addEventListener('DOMContentLoaded', () => {
      App.init();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
      }
    });

    // Ny navigering, sheets och quick-actions (utan att röra datalager/ritlogik)
    (function setupNewUI(){
      const qs = (id) => document.getElementById(id);
      const dash = qs('dashboard');
      const tabIds = ['smarta','kiss','vatska','stat'];
      function hideAllTabs(){
        for (const t of tabIds) {
          const sec = qs('tab-' + t); if (sec) sec.hidden = true;
          const b = qs('tabbtn-' + t); if (b) { b.classList.remove('tab-active'); b.setAttribute('aria-selected','false'); }
        }
      }
      function setBarActive(id){
        ['navHome','navLog','navStats','navSettings'].forEach(x=>{ const el=qs(x); if (el) el.classList.toggle('active', x===id); });
      }
      function showDashboard(){ dash.hidden = false; hideAllTabs(); setBarActive('navHome'); }
      function openTab(name){ dash.hidden = true; const btn = qs('tabbtn-'+name); if (btn) btn.click(); setBarActive(name==='stat' ? 'navStats' : null); }

      // Kortnavigering
      const map = { cardPain: 'smarta', cardPee: 'kiss', cardFluid: 'vatska', cardStats: 'stat' };
      for (const [cid, tab] of Object.entries(map)) {
        const el = qs(cid); if (!el) continue;
        el.addEventListener('click', ()=> openTab(tab));
        el.addEventListener('keydown', (e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); openTab(tab); } });
      }

      // Bottom-bar
      qs('navHome')?.addEventListener('click', showDashboard);
      const openQuick = ()=>{ openSheet('quickSheet'); setBarActive('navLog'); };
      qs('navLog')?.addEventListener('click', openQuick);
      qs('navStats')?.addEventListener('click', ()=> openTab('stat'));
      qs('navSettings')?.addEventListener('click', ()=> qs('btnSettings')?.click());
      qs('fabQuick')?.addEventListener('click', openQuick);

      // Quick actions
      qs('quickPain')?.addEventListener('click', ()=>{ closeSheet('quickSheet'); openSheet('painSheet'); });
      qs('quickPee')?.addEventListener('click', ()=>{ closeSheet('quickSheet'); qs('btnPeeNow')?.click(); });
      qs('quickFluid')?.addEventListener('click', ()=>{ closeSheet('quickSheet'); openSheet('fluidSheet'); });

      // Öppnare för respektive blad
      qs('openPainSheet')?.addEventListener('click', ()=> openSheet('painSheet'));
      qs('openPeeSheet')?.addEventListener('click', ()=> openSheet('peeSheet'));
      qs('openFluidSheet')?.addEventListener('click', ()=> openSheet('fluidSheet'));
      qs('peeQuickNow')?.addEventListener('click', ()=> qs('btnPeeNow')?.click());

      // Sheet helpers
      function openSheet(id) {
        const backdrop = qs(id); if (!backdrop) return;
        backdrop.classList.add('open');
        backdrop.setAttribute('aria-hidden','false');
        const panel = backdrop.querySelector('.sheet'); panel?.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
      function closeSheet(id) {
        const backdrop = qs(id); if (!backdrop) return;
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden','true');
        const panel = backdrop.querySelector('.sheet'); panel?.classList.remove('open');
        document.body.style.overflow = '';
      }
      // Stängknappar
      [
        ['painSheet','closePainSheet'],['painSheet','closePainSheet2'],
        ['peeSheet','closePeeSheet'],['peeSheet','closePeeSheet2'],
        ['fluidSheet','closeFluidSheet'],['fluidSheet','closeFluidSheet2'],
        ['quickSheet','closeQuickSheet'],['quickSheet','closeQuickSheet2']
      ].forEach(([sid,cid])=>{ const b=qs(cid); if (b) b.addEventListener('click', ()=> closeSheet(sid)); });
      // Klick på backdrop
      ['painSheet','peeSheet','fluidSheet','quickSheet'].forEach(id=>{ const el=qs(id); if(!el) return; el.addEventListener('click',(e)=>{ if(e.target===el) closeSheet(id); }); });

      // Spegla mål till hjälpkort
      function mirrorGoal(){ const gm=qs('goalMirror'); const src=qs('goalMl'); if (gm && src) gm.textContent = src.textContent || src.value || '2000'; }
      mirrorGoal();
      const goalSrc = qs('goalMl'); if (goalSrc) { const mo = new MutationObserver(mirrorGoal); mo.observe(goalSrc, { characterData: true, childList: true, subtree: true }); }

      // Visa Start som default
      showDashboard();
    })();
  
