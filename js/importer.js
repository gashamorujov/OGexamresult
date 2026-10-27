import { parseExamPdf, ParseError } from './parser.js';
import * as store from './store.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 500;
const GENERIC_ERROR = 'Fayl oxunarkən gözlənilməz xəta baş verdi.';

/** PDF və ya ZIP faylını [{ name, data }] siyahısına çevirir (ZIP daxilindəki PDF-lər çıxarılır). */
export async function expand(file, label = file.name, depth = 0) {
  const lower = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new ParseError('Fayl çox böyükdür (maksimum 50 MB).');
  if (lower.endsWith('.pdf')) return [{ name: label, data: await file.arrayBuffer() }];
  if (!lower.endsWith('.zip')) throw new ParseError('Dəstəklənməyən format. Yalnız PDF və ZIP faylları qəbul edilir.');
  if (depth > 2) throw new ParseError('ZIP arxivi həddindən artıq dərin yuvalanıb.');

  let zip;
  try {
    zip = await globalThis.JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ParseError('ZIP arxivi açıla bilmədi. Fayl zədəlidir və ya parolla qorunur.');
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !/(^|\/)(__MACOSX\/|\._|\.DS_Store$)/.test(e.name));
  if (entries.length > MAX_ZIP_ENTRIES) throw new ParseError(`Arxivdə ${MAX_ZIP_ENTRIES}-dən çox fayl var.`);

  const out = [];
  for (const e of entries) {
    const base = e.name.split('/').pop();
    const l = base.toLowerCase();
    if (!l.endsWith('.pdf') && !l.endsWith('.zip')) continue;
    const buf = await e.async('arraybuffer');
    out.push(...(await expand(new File([buf], base), `${label} / ${base}`, depth + 1)));
  }
  return out;
}

export async function importFiles(files, { pdfjs, uploadDate, onProgress = () => {}, onSourceUploaded = () => {} }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(uploadDate || '')) throw new ParseError('Yükləmə tarixi seçilməlidir.');
  const results = [];
  const known = new Set(await store.keys());

  for (const file of files) {
    let pdfs;
    try {
      pdfs = await expand(file);
    } catch (e) {
      results.push({ name: file.name, ok: false, error: e instanceof ParseError ? e.message : GENERIC_ERROR });
      continue;
    }
    if (!pdfs.length) {
      results.push({ name: file.name, ok: false, error: 'Arxivdə PDF faylı tapılmadı.' });
      continue;
    }
    for (const pdf of pdfs) {
      onProgress(pdf.name);
      try {
        const parsed = await parseExamPdf(pdfjs, pdf.data, pdf.name);
        if (!parsed.records.length) {
          results.push({ name: pdf.name, ok: false, error: 'Heç bir sətir yazılmadı.', warnings: parsed.warnings });
          continue;
        }
        const importedAt = new Date().toISOString();
        let sourceUrl = '', sourceFailed = false;
        try {
          const safeName = pdf.name.replace(/[^\w.\-əƏıİöÖüÜçÇşŞğĞ ]+/g, '_');
          sourceUrl = await store.uploadSource(pdf.data, `${uploadDate}/${Date.now()}-${safeName}`);
          onSourceUploaded(sourceUrl);
        } catch (error) {
          console.warn('PDF Storage-ə yüklənmədi:', error);
          sourceFailed = true;
        }
        parsed.records.forEach((r) => { r.importedAt = importedAt; r.uploadDate = uploadDate; r.sourceUrl = sourceUrl; });
        await store.putMany(parsed.records);
        const updated = parsed.records.filter((r) => known.has(r.id)).length;
        parsed.records.forEach((r) => known.add(r.id));
        results.push({
          name: pdf.name,
          ok: true,
          subject: parsed.subject,
          found: parsed.rowsFound,
          saved: parsed.records.length,
          added: parsed.records.length - updated,
          updated,
          sourceFailed,
          warnings: parsed.warnings,
        });
      } catch (e) {
        if (!(e instanceof ParseError)) console.error(e);
        results.push({ name: pdf.name, ok: false, error: e instanceof ParseError ? e.message : GENERIC_ERROR });
      }
    }
  }
  return results;
}
