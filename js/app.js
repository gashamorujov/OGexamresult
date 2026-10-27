import * as store from './store.js';
import { importFiles } from './importer.js';
import { esc, fold, highlight, durationText } from './text.js';

let pdfjsPromise;
/* pdf.js əsas səhifədə işləyir (ayrıca Worker faylı və MIME tələb etmir), beləliklə hər hostinqdə və köhnə brauzerlərdə də oxuyur. */
function loadPdfjs(){
  return pdfjsPromise ||= (async () => {
    await import('./polyfills.js');
    const [lib, worker] = await Promise.all([import('../vendor/pdf.min.js'), import('../vendor/pdf.worker.min.js')]);
    globalThis.pdfjsWorker = worker;
    lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
    return lib;
  })().catch((e) => { pdfjsPromise = null; throw e; });
}
const $ = (id) => document.getElementById(id);
const collator = new Intl.Collator('az', { sensitivity: 'base', numeric: true });
const SORTERS = { end_asc: (a,b) => a.endedAt.localeCompare(b.endedAt) || a.no-b.no, end_desc: (a,b) => b.endedAt.localeCompare(a.endedAt) || b.no-a.no, name: (a,b) => collator.compare(a.fullName,b.fullName), score: (a,b) => b.score-a.score || collator.compare(a.fullName,b.fullName) };
const ui = { q:'', status:'all', subject:'all', sort:'end_asc' };
let records = [], byId = new Map(), openId = null, pendingFiles = [];
const hayCache = new WeakMap();
const gate = (t) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return 4294967296 * (2097151 & h2) + (h1 >>> 0); };
const GATE_HASH = 8361334962794372;
let purging = false;
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function hayOf(r) {
  let h = hayCache.get(r);
  if (h === undefined) {
    const dates = [r.startedDate, r.endedDate].flatMap((d) => [d, d.replaceAll('.', '/'), d.replaceAll('.', '-')]);
    h = fold([r.uploadDate, r.subject,r.agency,r.fullName,r.position,r.examPosition,r.ttm,r.scoreText,r.result,r.status==='passed'?'keçib':r.status==='failed'?'kəsilib':'',r.removed?'uzaqlaşdırılıb':'',r.removedText,r.startedDate,r.startedTime,r.endedDate,r.endedTime,...dates,r.source].join(' '));
    hayCache.set(r,h);
  }
  return h;
}
function compute() {
  const tokens = fold(ui.q).split(/\s+/).filter(Boolean);
  const base = records.filter((r) => tokens.every((t)=>hayOf(r).includes(t)));
  const counts = { all:base.length, passed:base.filter((r)=>r.status==='passed').length, failed:base.filter((r)=>r.status==='failed').length, removed:base.filter((r)=>r.removed).length };
  const pick = { all:()=>true, passed:(r)=>r.status==='passed', failed:(r)=>r.status==='failed', removed:(r)=>r.removed }[ui.status];
  return { tokens, counts, rows:base.filter(pick) };
}
function renderSubjectSelect() {
  return;
}
function badge(r,h){ return `<span class="badge ${r.status}">${h(r.result)}</span>`; }
function rowHtml(r,i,h,showExamPos){ return `<tr><td class="num" data-label="No">${i+1}</td><th scope="row" data-label="S.A.A"><button type="button" class="who" data-id="${esc(r.id)}">${h(r.fullName)}</button></th><td data-label="Vəzifə">${h(r.position)}</td>${showExamPos?`<td data-label="İmtahan olunduğu vəzifə">${h(r.examPosition)||'-'}</td>`:''}<td class="ttm" data-label="TTM">${h(r.ttm)}</td><td class="score" data-label="Topladığı say">${h(r.scoreText)}</td><td data-label="Nəticə">${badge(r,h)}</td><td data-label="İmtahan tarixi">${h(r.startedDate)}<span class="time">${h(r.startedTime)}</span></td><td data-label="İmtahanı bitirmə tarixi">${h(r.endedDate)}<span class="time">${h(r.endedTime)}</span></td><td data-label="Uzaqlaşdırılıb">${r.removed?`<span class="badge removed">${h(r.removedText||'Bəli')}</span>`:h(r.removedText||'Xeyr')}</td></tr>`; }
function sectionHtml(subject,rows,tokens,idx){
  const h=(t)=>highlight(t,tokens), showExamPos=rows.some((r)=>r.examPosition), n=(f)=>rows.filter(f).length, agency=rows.find((r)=>r.agency)?.agency;
  const head=['No','S.A.A','Vəzifə',...(showExamPos?['İmtahan olunduğu vəzifə']:[]),'TTM','Topladığı say','Nəticə','İmtahan tarixi','İmtahanı bitirmə tarixi','Uzaqlaşdırılıb'];
  const pdfs=[...new Map(rows.filter((r)=>r.sourceUrl).map((r)=>[r.sourceUrl,r.source])).entries()];
  const links=pdfs.map(([url,name])=>`<a class="pdf-btn" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(name||'PDF')}">PDF-ə bax</a>`).join('');
  return `<section class="subject" aria-labelledby="s-${idx}"><header class="subject-head"><div class="subject-name"><span class="subject-eyebrow">Fənn</span><h2 id="s-${idx}">${h(subject)}</h2>${agency?`<p class="subject-agency">${esc(agency)}</p>`:''}</div>${links?`<div class="pdf-links">${links}</div>`:''}</header><ul class="stats" aria-label="Statistika"><li><b>${rows.length}</b> iştirakçı</li><li class="s-pass"><b>${n((r)=>r.status==='passed')}</b> keçib</li><li class="s-fail"><b>${n((r)=>r.status==='failed')}</b> kəsilib</li><li class="s-warn"><b>${n((r)=>r.removed)}</b> uzaqlaşdırılıb</li></ul><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(subject)} cədvəli"><table><thead><tr>${head.map((t)=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>rowHtml(r,i,h,showExamPos)).join('')}</tbody></table></div></section>`;
}
function dateLabel(value){ if(value==='tarixsiz') return 'Tarixsiz qeydlər'; const [y,m,d]=(value||'').split('-'); return y&&m&&d?`${d}.${m}.${y}`:value||'Tarixsiz qeydlər'; }
function render(){
  const {tokens,counts,rows}=compute(); Object.keys(counts).forEach((k)=>$(`c-${k}`).textContent=counts[k]); $('export').disabled=records.length===0; $('export-word').disabled=records.length===0;
  const out=$('netice'), count=$('count');
  if(!records.length){ count.textContent=''; out.innerHTML=`<div class="empty"><span class="empty-ic">${icon('inbox')}</span><h2>Hələ nəticə yoxdur</h2><p>Fayl əlavə etmək üçün əvvəlcə tarix seçin.</p></div>`; return; }
  if(!rows.length){ count.textContent=`0 nəticə tapıldı (cəmi ${records.length} qeyd).`; out.innerHTML=`<div class="empty"><span class="empty-ic">${icon('search')}</span><h2>Axtarışa uyğun nəticə tapılmadı</h2><p>Sorğunu və filtrləri dəyişin.</p><button type="button" class="btn" id="reset">Filtrləri sıfırla</button></div>`; return; }
  count.textContent=rows.length!==records.length?`${rows.length} nəticə göstərilir (cəmi ${records.length} qeyd).`:`${rows.length} nəticə göstərilir.`;
  const wasClosed=new Set([...document.querySelectorAll('.date-group:not([open])')].map((d)=>d.dataset.date)); const groups=new Map(); for(const r of [...rows].sort(SORTERS[ui.sort])){ const date=r.uploadDate||'tarixsiz'; if(!groups.has(date)) groups.set(date,new Map()); if(!groups.get(date).has(r.subject)) groups.get(date).set(r.subject,[]); groups.get(date).get(r.subject).push(r); }
  out.innerHTML=[...groups.keys()].sort((a,b)=>b.localeCompare(a)).map((date,di)=>`<details class="date-group" data-date="${esc(date)}"${wasClosed.has(date)?'':' open'}><summary><span>${esc(dateLabel(date))}</span><b>${[...groups.get(date).values()].reduce((n,list)=>n+list.length,0)} qeyd</b><i class="chev" aria-hidden="true"></i></summary><div class="date-content">${[...groups.get(date).keys()].sort(collator.compare).map((s,i)=>sectionHtml(s,groups.get(date).get(s),tokens,`${di}-${i}`)).join('')}</div></details>`).join('');
}
function openDetail(id){
  const r=byId.get(id); if(!r)return; openId=id; $('detail-title').textContent=r.fullName; $('detail-sub').textContent=r.subject;
  const dur=durationText(r.startedAt,r.endedAt), items=[['Yüklənmə tarixi',dateLabel(r.uploadDate||'tarixsiz')],['Fənn',r.subject],['Qurum',r.agency||'Göstərilməyib'],['Vəzifə',r.position],['İmtahan olunduğu vəzifə',r.examPosition||'Göstərilməyib'],['TTM',r.ttm],['Topladığı say',r.scoreText],['Nəticə',r.result],['Uzaqlaşdırılıb',r.removedText||(r.removed?'Bəli':'Xeyr')],['İmtahan tarixi',`${r.startedDate} ${r.startedTime}`],['İmtahanı bitirmə tarixi',`${r.endedDate} ${r.endedTime}`],...(dur?[['İmtahanın müddəti',dur]]:[]),['Mənbə fayl',r.source],...(r.sourceUrl?[['PDF linki',r.sourceUrl]]:[])];
  $('detail-list').innerHTML=items.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${/^https:\/\//.test(v)?`<a href="${esc(v)}" target="_blank" rel="noopener">PDF-ə bax</a>`:esc(v)}</dd>`).join(''); $('detail').showModal();
}
function renderReport(results,busyName){ const box=$('report-box'); box.hidden=false; $('report-close').hidden=!!busyName; $('report-title').textContent=busyName?`Oxunur: ${busyName}`:'Yükləmə nəticəsi'; $('report').innerHTML=results.map((r)=>!r.ok?`<li><span class="name">${esc(r.name)}</span><div class="err-text">Oxunmadı. ${esc(r.error)}</div></li>`:`<li><span class="name">${esc(r.name)}</span><div class="ok-text">Fənn: ${esc(r.subject)}. ${r.found} sətir tapıldı, ${r.saved} sətir yazıldı (${r.added} yeni, ${r.updated} yenilənmiş).</div>${r.found!==r.saved?`<ul class="warn-list"><li>${r.found-r.saved} sətir yazılmadı, səbəbi aşağıda göstərilib.</li></ul>`:''}${r.sourceFailed?`<ul class="warn-list"><li>PDF Firebase Storage-ə yüklənmədi, buna görə “PDF-ə bax” düyməsi görünməyəcək. Storage qaydalarını yoxlayın.</li></ul>`:''}${(r.warnings||[]).length?`<ul class="warn-list">${r.warnings.map((w)=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}</li>`).join(''); }
async function importWithDate(files, uploadDate){
  if(!files.length || !uploadDate)return;
  $('file').disabled=true; $('pick').classList.add('is-disabled'); $('drop-status').textContent=`${files.length} fayl hazırlanır`; $('drop-status').classList.add('busy'); renderReport([],files[0].name);
  try{ const pdfjs=await loadPdfjs(); const results=await importFiles(files,{pdfjs,uploadDate,onProgress:(name)=>renderReport([],name)}); await reload(); renderReport(results,''); const saved=results.filter((r)=>r.ok).reduce((sum,r)=>sum+r.added,0); $('drop-status').textContent=saved?`${saved} yeni qeyd əlavə edildi.`:'Yeni qeyd əlavə edilmədi.'; $('report-box').scrollIntoView({block:'nearest'}); } catch(err){ console.error(err); renderReport([{ok:false,name:files[0].name,error:`Gözlənilməz xəta: ${err&&err.message?err.message:err}. Səhifəni yeniləyin (Ctrl+F5) və yenidən cəhd edin.`}],''); $('drop-status').textContent='Yükləmə alınmadı.'; } finally { $('file').disabled=false; $('pick').classList.remove('is-disabled'); $('file').value=''; $('drop-status').classList.remove('busy'); }
}
function askForDate(fileList){
  const files=[...fileList]; if(!files.length)return;
  pendingFiles=files;
  $('date-count').textContent=files.length===1?'1 fayl':`${files.length} fayl`;
  $('date-files').textContent=files.length===1?files[0].name:`${files[0].name} və daha ${files.length-1} fayl`;
  $('date-error').hidden=true;
  $('upload-date').value=isoDay(0);
  $('date-dialog').showModal();
}
function isoDay(offset){ const d=new Date(); d.setDate(d.getDate()+offset); const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function xmlCell(value,type='String',style=''){ const safe=String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); return `<Cell${style?` ss:StyleID="${style}"`:''}><Data ss:Type="${type}">${safe}</Data></Cell>`; }
function exportExcel(){
  const head=['Yüklənmə tarixi','Fənn','S.A.A','Vəzifə','İmtahan olunduğu vəzifə','TTM','Topladığı say','Nəticə','İmtahan tarixi','İmtahanı bitirmə tarixi','Uzaqlaşdırılıb','Mənbə fayl'];
  const data=[...records].sort((a,b)=>(b.uploadDate||'').localeCompare(a.uploadDate||'')||collator.compare(a.subject,b.subject)||SORTERS[ui.sort](a,b));
  const body=[`<Row>${head.map((x)=>xmlCell(x,'String','Header')).join('')}</Row>`,...data.map((r)=>`<Row>${[dateLabel(r.uploadDate||'tarixsiz'),r.subject,r.fullName,r.position,r.examPosition,r.ttm,r.scoreText,r.result,`${r.startedDate} ${r.startedTime}`,`${r.endedDate} ${r.endedTime}`,r.removedText||(r.removed?'Bəli':'Xeyr'),r.source].map((x)=>xmlCell(x)).join('')}</Row>`)].join('');
  const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#24366F" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="İmtahan nəticələri"><Table>${body}</Table></Worksheet></Workbook>`;
  const d=new Date(), p=(n)=>String(n).padStart(2,'0'), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([`\uFEFF${xml}`],{type:'application/vnd.ms-excel;charset=utf-8'})); a.download=`imtahan-reyestri-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}.xls`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function documentRows(){
  return [...records].sort((a,b)=>(b.uploadDate||'').localeCompare(a.uploadDate||'')||collator.compare(a.subject,b.subject)||SORTERS[ui.sort](a,b));
}
function exportWord(){
  const headers=['Yüklənmə tarixi','Fənn','S.A.A','Vəzifə','İmtahan olunduğu vəzifə','TTM','Topladığı say','Nəticə','İmtahan tarixi','Bitirmə tarixi','Uzaqlaşdırılıb'];
  const cell=(value,head=false)=>`<${head?'th':'td'}>${esc(String(value??''))}</${head?'th':'td'}>`;
  const rows=documentRows();
  const table=`<table><thead><tr>${headers.map((h)=>cell(h,true)).join('')}</tr></thead><tbody>${rows.map((r)=>`<tr>${[dateLabel(r.uploadDate||'tarixsiz'),r.subject,r.fullName,r.position,r.examPosition,r.ttm,r.scoreText,r.result,`${r.startedDate} ${r.startedTime}`,`${r.endedDate} ${r.endedTime}`,r.removedText||(r.removed?'Bəli':'Xeyr')].map((v)=>cell(v)).join('')}</tr>`).join('')}</tbody></table>`;
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#18233d}h1{font-size:20pt;color:#24366f}p{color:#66718a}table{border-collapse:collapse;width:100%;font-size:9pt}th{background:#24366f;color:#fff;text-align:left}th,td{border:1px solid #cbd3df;padding:6px;vertical-align:top}tr:nth-child(even){background:#f4f6fb}</style></head><body><h1>İmtahan nəticələri reyestri</h1><p>Hazırlanma tarixi: ${new Date().toLocaleString('az')}</p>${table}</body></html>`;
  const d=new Date(), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([`\uFEFF${html}`],{type:'application/msword;charset=utf-8'})); a.download=`imtahan-reyestri-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.doc`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function adminGroups(){
  const g=new Map();
  for(const r of records){ const d=r.uploadDate||'tarixsiz'; if(!g.has(d)) g.set(d,{date:d,ids:[],urls:new Set()}); const x=g.get(d); x.ids.push(r.id); if(r.sourceUrl) x.urls.add(r.sourceUrl); }
  return [...g.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
function renderAdmin(){
  const list=$('admin-list'); if(!list)return;
  const groups=adminGroups();
  list.innerHTML=groups.length?groups.map((x)=>`<li class="admin-row"><div><strong>${esc(dateLabel(x.date))}</strong><span>${x.ids.length} qeyd${x.urls.size?`, ${x.urls.size} PDF`:''}</span></div><button type="button" class="btn danger-outline" data-purge="${esc(x.date)}"${purging?' disabled':''}>Tarixi sil</button></li>`).join(''):'<li class="admin-empty">Silinəcək məlumat yoxdur.</li>';
}
function openAdmin(){ const m=$('admin-msg'); m.hidden=true; m.textContent=''; renderAdmin(); if(!$('admin-dialog').open) $('admin-dialog').showModal(); }
let purgeTarget=null;
function askPurge(date){
  const x=adminGroups().find((g)=>g.date===date); if(!x)return; purgeTarget=x;
  $('purge-text').textContent=`${dateLabel(date)} tarixində yüklənmiş ${x.ids.length} qeyd${x.urls.size?` və ${x.urls.size} PDF`:''} Firebase-dən və saytdan həmişəlik silinəcək. Bu əməliyyat geri qaytarılmır.`;
  $('purge-dialog').showModal();
}
async function runPurge(){
  const x=purgeTarget; if(!x||purging)return; purging=true; $('purge-yes').disabled=true; $('purge-yes').textContent='Silinir'; renderAdmin();
  const msg=$('admin-msg'); let failedPdf=0;
  try{
    await store.removeMany(x.ids);
    for(const url of x.urls){ try{ if(!(await store.deleteSource(url))) failedPdf++; }catch{ failedPdf++; } }
    $('purge-dialog').close();
    msg.textContent=failedPdf?`${dateLabel(x.date)} tarixinin qeydləri silindi. ${failedPdf} PDF silinmədi, Storage qaydalarını yoxlayın.`:`${dateLabel(x.date)} tarixindəki bütün məlumatlar silindi.`;
  }catch(err){ console.error(err); $('purge-dialog').close(); msg.textContent='Silmə alınmadı. Firebase bağlantısını və qaydalarını yoxlayın.'; }
  finally{ purging=false; purgeTarget=null; $('purge-yes').disabled=false; $('purge-yes').textContent='Hamısını sil'; msg.hidden=false; await reload(); renderAdmin(); }
}
async function reload(){ records=await store.getAll(); byId=new Map(records.map((r)=>[r.id,r])); render(); if($('admin-dialog').open)renderAdmin(); if(!store.state.persistent)$('storage-note').textContent='Firebase bağlantısı yoxdur; məlumatlar müvəqqəti saxlanılır.'; }
function bind(){
  let timer; $('q').addEventListener('input',(e)=>{if(gate(e.target.value.trim())===GATE_HASH){e.target.value='';clearTimeout(timer);ui.q='';render();openAdmin();return}clearTimeout(timer);timer=setTimeout(()=>{ui.q=e.target.value;render()},100)}); document.querySelectorAll('input[name="status"]').forEach((el)=>el.addEventListener('change',()=>{ui.status=el.value;render()})); $('export').addEventListener('click',exportExcel); $('export-word').addEventListener('click',exportWord);
  $('netice').addEventListener('click',(e)=>{const who=e.target.closest('.who');if(who)return openDetail(who.dataset.id);if(e.target.closest('#reset')){Object.assign(ui,{q:'',status:'all'});$('q').value='';document.querySelector('input[name="status"][value="all"]').checked=true;render()}});
  $('file').addEventListener('change',(e)=>askForDate(e.target.files)); $('report-close').addEventListener('click',()=>$('report-box').hidden=true);
  const dateDialog=$('date-dialog'); const confirmDate=async()=>{const date=$('upload-date').value;if(!date){$('date-error').hidden=false;$('upload-date').focus();return;}const files=pendingFiles;pendingFiles=[];dateDialog.close();await importWithDate(files,date)};
  $('date-confirm').addEventListener('click',confirmDate); $('upload-date').addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();confirmDate()}}); $('upload-date').addEventListener('input',()=>{$('date-error').hidden=true});
  $('date-today').addEventListener('click',()=>{$('upload-date').value=isoDay(0);$('date-error').hidden=true}); $('date-yesterday').addEventListener('click',()=>{$('upload-date').value=isoDay(-1);$('date-error').hidden=true});
  $('date-cancel').addEventListener('click',()=>dateDialog.close()); $('date-cancel-x').addEventListener('click',()=>dateDialog.close()); dateDialog.addEventListener('click',(e)=>{if(e.target===dateDialog)dateDialog.close()}); dateDialog.addEventListener('close',()=>{pendingFiles=[];$('file').value=''});
  const drop=$('drop'); drop.addEventListener('click',(e)=>{if(!e.target.closest('#pick, #file'))$('file').click()}); drop.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click()}}); ['dragenter','dragover'].forEach((t)=>drop.addEventListener(t,(e)=>{e.preventDefault();drop.classList.add('over')})); ['dragleave','drop'].forEach((t)=>drop.addEventListener(t,(e)=>{e.preventDefault();drop.classList.remove('over')})); drop.addEventListener('drop',(e)=>askForDate(e.dataTransfer.files)); ['dragover','drop'].forEach((t)=>window.addEventListener(t,(e)=>e.preventDefault()));
  $('admin-close').addEventListener('click',()=>$('admin-dialog').close()); $('admin-close-x').addEventListener('click',()=>$('admin-dialog').close()); $('admin-dialog').addEventListener('click',(e)=>{if(e.target===$('admin-dialog'))$('admin-dialog').close()}); $('admin-list').addEventListener('click',(e)=>{const b=e.target.closest('[data-purge]');if(b)askPurge(b.dataset.purge)}); $('purge-no').addEventListener('click',()=>{if(!purging)$('purge-dialog').close()}); $('purge-yes').addEventListener('click',runPurge);
  const dlg=$('detail'); $('detail-close').addEventListener('click',()=>dlg.close()); $('detail-close-x').addEventListener('click',()=>dlg.close()); dlg.addEventListener('click',(e)=>{if(e.target===dlg)dlg.close()}); const cd=$('confirm-dialog'); $('detail-delete').addEventListener('click',()=>{const r=byId.get(openId);if(!r)return;$('confirm-text').textContent=`${r.fullName} üçün qeyd həmişəlik silinəcək.`;cd.showModal()}); $('confirm-no').addEventListener('click',()=>cd.close()); cd.addEventListener('click',(e)=>{if(e.target===cd)cd.close()}); $('confirm-yes').addEventListener('click',async()=>{const id=openId;if(!id)return;$('confirm-yes').disabled=true;try{await store.remove(id);cd.close();dlg.close();await reload()}catch(err){cd.close();alert(err.message)}finally{$('confirm-yes').disabled=false}});
}
bind(); reload(); store.subscribe((next)=>{records=next;byId=new Map(records.map((r)=>[r.id,r]));render();if($('admin-dialog').open)renderAdmin()});
