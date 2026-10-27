import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExamPdf } from '../js/parser.js';
import { expand } from '../js/importer.js';
import { fold, normalizeText, highlight } from '../js/text.js';

// Node-da DOMMatrix yoxdur; yalnız mətn oxuyuruq, ona görə boş sinif kifayətdir.
for (const n of ['DOMMatrix', 'ImageData', 'Path2D']) globalThis[n] ??= class {};
const pdfjs = await import('../vendor/pdf.min.js');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url);
const TTM = '"İndustrial Support and Training Services Əlavə Təhsil Mərkəzi" MMC';
const D = '23.10.2026';
const row = (r) => [r.no, r.fullName, r.position, r.ttm, r.scoreText, r.result, r.removedText, `${r.startedDate} ${r.startedTime}`, `${r.endedDate} ${r.endedTime}`];

test('Liderlik və birgə iş fəaliyyəti: 9 iştirakçı, səhifə keçidi ilə', async () => {
  const out = await parseExamPdf(pdfjs, readFileSync(fx('liderlik.pdf')), 'liderlik.pdf');
  assert.equal(out.subject, 'Liderlik və birgə iş fəaliyyəti');
  assert.equal(out.agency, 'Dövlət Dəniz və Liman Agentliyi');
  assert.equal(out.rowsFound, 9);
  assert.deepEqual(out.warnings, []);
  assert.deepEqual(out.records.map(row), [
    [1, 'Ələkbər Bağırlı Bəylər', 'Növbə motorçusu', TTM, '19.0', 'Məqbul', 'Xeyr', `${D} 14:13:33`, `${D} 14:16:17`],
    [2, 'Orxan Mustafayev Sucayət', 'Növbə motorçusu', TTM, '18.0', 'Məqbul', 'Xeyr', `${D} 14:14:56`, `${D} 14:18:37`],
    [3, 'Samir Tahirov Hikmət', 'Kapitanın baş köməkçisi', TTM, '19.0', 'Məqbul', 'Xeyr', `${D} 14:28:12`, `${D} 14:32:21`],
    [4, 'İslam Həsənov Nurulla', 'Baş mexanik', TTM, '17.0', 'Məqbul', 'Xeyr', `${D} 14:28:23`, `${D} 14:33:02`],
    [5, 'Nizami Atayev Binyad', 'Kapitan', TTM, '20.0', 'Məqbul', 'Xeyr', `${D} 14:26:46`, `${D} 14:33:21`],
    [6, 'Nadir Şahbazlı Namiq', 'Növbə motorçusu', TTM, '19.0', 'Məqbul', 'Xeyr', `${D} 14:35:22`, `${D} 14:40:35`],
    [7, 'Sərxan Əhmədli Razi', 'Növbə matrosu', TTM, '19.0', 'Məqbul', 'Xeyr', `${D} 14:35:15`, `${D} 14:40:53`],
    [8, 'Devran Əmiraslanov İsaxan', 'Gəmi elektriki', TTM, '20.0', 'Məqbul', 'Xeyr', `${D} 14:34:26`, `${D} 14:41:37`],
    [9, 'Fərid Məmmədov Dəyanət', 'Gəmi elektriki', TTM, '14.0', 'Məqbul', 'Xeyr', `${D} 14:36:42`, `${D} 14:42:21`],
  ]);
  assert.ok(out.records.every((r) => r.status === 'passed' && !r.removed && r.examPosition === ''));
});

test('Gəminin mühafizəsi: kiril "ә" düzəlişi və 2 iştirakçı', async () => {
  const out = await parseExamPdf(pdfjs, readFileSync(fx('gemi-muhafize.pdf')), 'gemi-muhafize.pdf');
  assert.equal(out.subject, 'Gəminin mühafizəsi üzrə ümumi hazırlıq və təlimat');
  assert.deepEqual(out.warnings, []);
  assert.deepEqual(out.records.map(row), [
    [1, 'Vüqar Məmmədov Nizami', 'Növbə matrosu', TTM, '19.0', 'Məqbul', 'Xeyr', `${D} 14:14:43`, `${D} 14:20:15`],
    [2, 'Rüfət Abdulov Kamran', 'Növbə motorçusu', TTM, '20.0', 'Məqbul', 'Xeyr', `${D} 14:29:16`, `${D} 14:32:49`],
  ]);
});

test('ZIP arxivindən hər iki PDF çıxarılır', async () => {
  const code = readFileSync(new URL('../vendor/jszip.min.js', import.meta.url), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', code)(m, m.exports);
  globalThis.JSZip = m.exports;
  const zip = new File([readFileSync(fx('imtahan.zip'))], 'imtahan.zip');
  const pdfs = await expand(zip);
  assert.equal(pdfs.length, 2);
  let total = 0;
  for (const p of pdfs) total += (await parseExamPdf(pdfjs, p.data, p.name)).records.length;
  assert.equal(total, 11);
});

test('Axtarış üçün sadələşdirmə və vurğulama', () => {
  assert.equal(fold('Ələkbər İslam Şahbazlı Dəyanət ığ'), 'elekber islam sahbazli deyanet ig');
  assert.equal(normalizeText('Gәminin  vә'), 'Gəminin və');
  assert.equal(highlight('Ələkbər', [fold('elek')]), '<mark>Ələk</mark>bər');
});
