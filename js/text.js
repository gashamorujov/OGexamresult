const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESC[c]);

/**
 * Boşluqları yığışdırır. PDF-lərdə tez-tez rast gəlinən kiril "ә" (U+04D9) hərfini
 * azərbaycan əlifbasındakı "ə" (U+0259) ilə əvəz edir.
 */
export function normalizeText(s) {
  return String(s ?? '')
    .replace(/\u04D9/g, '\u0259')
    .replace(/\u04D8/g, '\u018F')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bir simvolu axtarış üçün sadələşdirir: ə->e, ı->i, ö->o, ü->u, ç->c, ş->s, ğ->g, böyük/kiçik fərqi yoxdur. */
export function foldChar(c) {
  const r = c
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0131/g, 'i')
    .replace(/\u0259/g, 'e');
  return r.length === c.length ? r : c;
}

/** Uzunluğu dəyişmir, ona görə vurğulama zamanı indekslər üst-üstə düşür. */
export const fold = (s) => Array.from(String(s ?? ''), foldChar).join('');

export function highlight(text, tokens) {
  const raw = String(text ?? '');
  const f = fold(raw);
  if (!tokens.length || f.length !== raw.length) return esc(raw);
  const mark = new Array(raw.length).fill(false);
  for (const t of tokens) {
    if (!t) continue;
    let i = f.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) mark[k] = true;
      i = f.indexOf(t, i + t.length);
    }
  }
  let out = '';
  let open = false;
  for (let i = 0; i < raw.length; i++) {
    if (mark[i] && !open) { out += '<mark>'; open = true; }
    if (!mark[i] && open) { out += '</mark>'; open = false; }
    out += esc(raw[i]);
  }
  return out + (open ? '</mark>' : '');
}

/** "23.10.2026 14:14:43" -> { iso, date, time }. Etibarsız tarixdə null qaytarır. */
export function parseDateTime(raw) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(raw ?? ''));
  if (!m) return null;
  const [d, mo, h, mi] = [m[1], m[2], m[4], m[5]].map(Number);
  const s = Number(m[6] ?? 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const p = (n) => String(n).padStart(2, '0');
  const date = `${p(d)}.${p(mo)}.${m[3]}`;
  const time = `${p(h)}:${p(mi)}:${p(s)}`;
  return { iso: `${m[3]}-${p(mo)}-${p(d)}T${time}`, date, time };
}

export function durationText(startIso, endIso) {
  const sec = Math.round((Date.parse(`${endIso}Z`) - Date.parse(`${startIso}Z`)) / 1000);
  if (!(sec >= 0)) return '';
  const m = Math.floor(sec / 60);
  return m ? `${m} dəq ${sec % 60} san` : `${sec} san`;
}

/** Nəticə mətnini üç qrupdan birinə aid edir: passed, failed, unknown. */
export function classifyResult(raw) {
  const f = fold(raw);
  if (/(qeyri|deyil|ugursuz|kesil|yararsiz|qalmay)/.test(f)) return 'failed';
  if (/(meqbul|kecib|ugurlu)/.test(f)) return 'passed';
  return 'unknown';
}

export const parseRemoved = (raw) => /^(beli|he|yes|true|1)$/.test(fold(raw).trim());
