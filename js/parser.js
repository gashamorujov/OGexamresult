import { normalizeText, fold, parseDateTime, classifyResult, parseRemoved } from './text.js';

export class ParseError extends Error {}

const DEFAULT_ORDER = ['no', 'fullName', 'position', 'examPosition', 'ttm', 'score', 'result', 'startedAt', 'endedAt', 'removed'];
const REQUIRED = ['no', 'fullName', 'position', 'ttm', 'score', 'result', 'startedAt', 'endedAt'];

/** Sütun başlığının mətninə görə sahəni təyin edir. */
function headerKey(text) {
  const f = fold(text);
  if (f.includes('bitirme')) return 'endedAt';
  if (f.includes('olundu')) return 'examPosition';
  if (f.includes('tarix')) return 'startedAt';
  if (f.includes('uzaqlas')) return 'removed';
  if (f.includes('topladi')) return 'score';
  if (f.includes('netice')) return 'result';
  if (f.includes('ttm')) return 'ttm';
  if (/s\.?a\.?a/.test(f)) return 'fullName';
  if (f.includes('vezife')) return 'position';
  if (f === 'no' || f === '\u2116') return 'no';
  return null;
}

function mapColumns(headerCells) {
  const map = {};
  headerCells.forEach((t, i) => {
    const k = headerKey(t);
    if (k && !(k in map)) map[k] = i;
  });
  if (REQUIRED.every((k) => k in map)) return map;
  if (headerCells.length === DEFAULT_ORDER.length) return Object.fromEntries(DEFAULT_ORDER.map((k, i) => [k, i]));
  return null;
}

function cluster(values, tol = 0.6) {
  const groups = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const g = groups[groups.length - 1];
    if (g && v - g.max <= tol) { g.max = v; g.sum += v; g.n += 1; } else groups.push({ max: v, sum: v, n: 1 });
  }
  return groups.map((g) => g.sum / g.n);
}

/** Səhifədə çəkilmiş düz xətləri (cədvəl sərhədləri) oxuyur. */
function extractLines(pdfjs, opList) {
  const H = [];
  const V = [];
  opList.fnArray.forEach((fn, i) => {
    if (fn !== pdfjs.OPS.constructPath) return;
    const data = opList.argsArray[i]?.[1]?.[0];
    if (!data) return;
    const a = data.length !== undefined ? Array.from(data) : Object.values(data);
    let k = 0;
    let cur = null;
    let start = null;
    const seg = (p, q) => {
      if (Math.abs(p[1] - q[1]) < 0.01) H.push({ x1: Math.min(p[0], q[0]), x2: Math.max(p[0], q[0]), y: p[1] });
      else if (Math.abs(p[0] - q[0]) < 0.01) V.push({ x: p[0], y1: Math.min(p[1], q[1]), y2: Math.max(p[1], q[1]) });
    };
    while (k < a.length) {
      const c = a[k++];
      if (c === 0) { cur = [a[k], a[k + 1]]; start = cur; k += 2; }
      else if (c === 1) { const n = [a[k], a[k + 1]]; k += 2; if (cur) seg(cur, n); cur = n; }
      else if (c === 2) { k += 6; cur = null; }
      else if (c === 3) { k += 4; cur = null; }
      else if (c === 4) { if (cur && start) seg(cur, start); cur = start; }
      else break;
    }
  });
  return { H, V };
}

async function readPage(pdfjs, page) {
  const [content, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  const items = [];
  for (const it of content.items) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const size = Math.hypot(it.transform[0], it.transform[1]);
    const x = it.transform[4];
    const y = it.transform[5];
    items.push({ s: it.str, x, y, cx: x + it.width / 2, size, ref: y + size * 0.3 });
  }
  const { H, V } = extractLines(pdfjs, ops);
  let ys = [];
  let xs = [];
  if (H.length) {
    const maxLen = Math.max(...H.map((h) => h.x2 - h.x1));
    ys = cluster(H.filter((h) => h.x2 - h.x1 >= maxLen * 0.6).map((h) => h.y)).sort((a, b) => b - a);
    xs = cluster(V.filter((v) => v.y2 - v.y1 > 5).map((v) => v.x));
  }
  return { items, ys, xs };
}

/** Verilmiş üfüqi zolaqdakı mətnləri sütunlar üzrə (mətnin mərkəzinə görə) toplayır. */
function bandCells(items, xs, top, bottom) {
  const cols = Array.from({ length: xs.length - 1 }, () => []);
  for (const it of items) {
    if (it.ref > top || it.ref <= bottom) continue;
    let c = xs.findIndex((x, i) => i < xs.length - 1 && it.cx >= x && it.cx < xs[i + 1]);
    if (c < 0) c = it.cx < xs[0] ? 0 : cols.length - 1;
    cols[c].push(it);
  }
  return cols.map((list) =>
    normalizeText(
      list
        .sort((p, q) => (Math.abs(q.y - p.y) > 1.5 ? q.y - p.y : p.x - q.x))
        .map((i) => i.s)
        .join(' ')
    )
  );
}

/** Cədvəldən yuxarıdakı mətn: böyük şrift qurum, qalanı fənn adıdır. */
function readTitle(items, topY) {
  const above = items.filter((i) => i.ref > topY).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of above) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2) { last.parts.push(it); last.size = Math.max(last.size, it.size); }
    else lines.push({ y: it.y, size: it.size, parts: [it] });
  }
  const text = (ls) => normalizeText(ls.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ')).join(' '));
  if (!lines.length) return { agency: '', subject: '' };
  const sizes = new Set(lines.map((l) => Math.round(l.size * 10)));
  if (sizes.size > 1) {
    const big = Math.max(...sizes);
    return {
      agency: text(lines.filter((l) => Math.round(l.size * 10) === big)),
      subject: text(lines.filter((l) => Math.round(l.size * 10) !== big)),
    };
  }
  if (lines.length > 1) return { agency: text(lines.slice(0, 1)), subject: text(lines.slice(1)) };
  return { agency: '', subject: text(lines) };
}

export async function parseExamPdf(pdfjs, data, fileName = '') {
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(data).slice(),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch (e) {
    console.error('PDF açıla bilmədi:', e);
    throw new ParseError('PDF faylı açıla bilmədi. Fayl zədəlidir və ya parolla qorunur.');
  }
  try {
    const rawRows = [];
    let mapping = null;
    let title = null;
    let textSeen = false;
    let tablePages = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      const { items, ys, xs } = await readPage(pdfjs, await doc.getPage(p));
      if (items.length) textSeen = true;
      if (ys.length < 3 || xs.length < 3) continue;
      tablePages++;
      mapping = mapColumns(bandCells(items, xs, ys[0], ys[1])) || mapping;
      if (!mapping) continue;
      title ??= readTitle(items, ys[0]);
      for (let i = 1; i < ys.length - 1; i++) {
        const cells = bandCells(items, xs, ys[i], ys[i + 1]);
        if (cells.every((c) => !c)) continue;
        const row = {};
        for (const [k, idx] of Object.entries(mapping)) row[k] = cells[idx] ?? '';
        if (/^\d+$/.test(row.no)) rawRows.push(row);
        else if (rawRows.length) {
          // Sətir əvvəlki səhifədən davam edir: mətni əvvəlki sətrin eyni sütununa əlavə edirik.
          const prev = rawRows[rawRows.length - 1];
          for (const k of Object.keys(mapping)) if (k !== 'no' && row[k]) prev[k] = normalizeText(`${prev[k]} ${row[k]}`);
        }
      }
    }

    if (!textSeen) throw new ParseError('PDF-də oxunaqlı mətn tapılmadı. Fayl skan edilmiş şəkil ola bilər.');
    if (!tablePages) throw new ParseError('PDF-də cədvəl tapılmadı. Fayl gözlənilən imtahan nəticəsi formatında deyil.');
    if (!mapping) {
      throw new ParseError('Cədvəl başlıqları tanınmadı. Gözlənilən sütunlar: No, S.A.A, Vəzifə, TTM, Topladığı say, Nəticə, İmtahan Tarixi, İmtahanı Bitirmə Tarixi, Uzaqlaşdırılıb.');
    }
    if (!rawRows.length) throw new ParseError('Cədvəldə iştirakçı sətri tapılmadı.');

    const warnings = [];
    let subject = title?.subject || '';
    if (!subject) {
      subject = fileName.replace(/\.pdf$/i, '') || 'Fənn adı göstərilməyib';
      warnings.push('PDF-də fənn adı tapılmadı, fayl adı fənn kimi yazıldı.');
    }
    const agency = title?.agency || '';
    const badOrder = rawRows.findIndex((r, i) => Number(r.no) !== i + 1);
    if (badOrder >= 0) warnings.push(`Sətir nömrələrinin ardıcıllığı pozulub (${badOrder + 1}-ci yerdə ${rawRows[badOrder].no} tapıldı).`);

    const records = [];
    const seen = new Set();
    for (const r of rawRows) {
      const start = parseDateTime(r.startedAt);
      const end = parseDateTime(r.endedAt);
      const score = /^\d+(?:[.,]\d+)?$/.exec(r.score);
      const missing = [];
      if (!r.fullName) missing.push('S.A.A');
      if (!score) missing.push('Topladığı say');
      if (!r.result) missing.push('Nəticə');
      if (!start) missing.push('İmtahan tarixi');
      if (!end) missing.push('İmtahanı bitirmə tarixi');
      if (missing.length) {
        warnings.push(`Sətir ${r.no}: ${missing.join(', ')} oxunmadı, sətir yazılmadı.`);
        continue;
      }
      if (end.iso < start.iso) warnings.push(`Sətir ${r.no}: bitirmə vaxtı başlama vaxtından əvvəldir.`);
      const id = `${fold(subject)}|${fold(r.fullName)}|${start.iso}|${end.iso}`;
      if (seen.has(id)) {
        warnings.push(`Sətir ${r.no}: eyni iştirakçı və vaxt təkrarlanır, ikinci sətir yazılmadı.`);
        continue;
      }
      seen.add(id);
      records.push({
        id,
        subject,
        agency,
        no: Number(r.no),
        fullName: r.fullName,
        position: r.position,
        examPosition: r.examPosition ?? '',
        ttm: r.ttm,
        score: Number(score[0].replace(',', '.')),
        scoreText: score[0],
        result: r.result,
        status: classifyResult(r.result),
        removed: parseRemoved(r.removed),
        removedText: r.removed ?? '',
        startedAt: start.iso,
        startedDate: start.date,
        startedTime: start.time,
        endedAt: end.iso,
        endedDate: end.date,
        endedTime: end.time,
        source: fileName,
      });
    }
    return { subject, agency, records, warnings, rowsFound: rawRows.length };
  } finally {
    await doc.destroy();
  }
}
