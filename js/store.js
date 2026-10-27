const firebaseConfig = {
  apiKey: 'AIzaSyCjhP79Vq25uYwMPzBOs-MUv92-MF5D-ms',
  authDomain: 'examresult-21cf3.firebaseapp.com',
  databaseURL: 'https://examresult-21cf3-default-rtdb.firebaseio.com',
  projectId: 'examresult-21cf3',
  storageBucket: 'examresult-21cf3.firebasestorage.app',
  messagingSenderId: '889924282994',
  appId: '1:889924282994:web:6e1b62afb26d26bfce70eb',
};
const DB_URL = `${firebaseConfig.databaseURL}/examRecords`;
export const state = { persistent: true, online: typeof navigator === 'undefined' ? true : navigator.onLine };
const localFallback = new Map();
/* Firebase açarlarında . $ # [ ] / işarələri qadağandır. */
export const safeKey = (id) => String(id).replace(/[.$#\[\]\/]/g, '_');
let storageApi;
async function getStorageApi(){
  if(!storageApi) storageApi=(async()=>{const [{initializeApp},storage]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js')]);const app=initializeApp(firebaseConfig);return {...storage,storage:storage.getStorage(app)}})();
  return storageApi;
}
function normalizeRecord(r){return {...r,uploadDate:r.uploadDate||(r.importedAt||'').slice(0,10)||'tarixsiz'}}
async function readRemote(){const response=await fetch(`${DB_URL}.json`,{cache:'no-store'});if(!response.ok)throw new Error(`Firebase HTTP ${response.status}`);return Object.values(await response.json()||{}).map(normalizeRecord)}
export async function getAll(){try{const rows=await readRemote();rows.forEach((r)=>localFallback.set(r.id,r));state.persistent=true;return rows}catch(error){console.error('Firebase məlumatları oxunmadı:',error);state.persistent=false;return [...localFallback.values()]}}
export async function keys(){return(await getAll()).map((r)=>r.id)}
export async function putMany(records){try{const body={};records.forEach((raw)=>{const r=normalizeRecord(raw);localFallback.set(r.id,r);body[safeKey(r.id)]=r});const response=await fetch(`${DB_URL}.json`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error(`Firebase HTTP ${response.status}`);state.persistent=true}catch(error){console.error('Firebase məlumatı yazılmadı:',error);state.persistent=false;throw new Error('Məlumat Firebase-ə yazılmadı. Firebase Database qaydalarını yoxlayın.')}}
export async function remove(id){try{const response=await fetch(`${DB_URL}/${encodeURIComponent(safeKey(id))}.json`,{method:'DELETE'});if(!response.ok)throw new Error(`Firebase HTTP ${response.status}`);localFallback.delete(id)}catch(error){console.error('Firebase qeydi silinmədi:',error);throw new Error('Qeyd Firebase-dən silinmədi.')}}
export function subscribe(callback){
  let stopped=false,pending=null,source=null;
  const refresh=()=>{if(stopped)return;clearTimeout(pending);pending=setTimeout(async()=>{callback(await getAll())},150)};
  const open=()=>{
    if(typeof EventSource==='undefined')return;
    try{
      source=new EventSource(`${DB_URL}.json`);
      const onChange=()=>refresh();
      source.addEventListener('put',onChange);source.addEventListener('patch',onChange);
      source.addEventListener('auth_revoked',()=>source.close());
      source.onerror=()=>{if(source&&source.readyState===2){source=null;if(!stopped)setTimeout(open,5000)}};
    }catch(error){console.warn('Canlı bağlantı qurulmadı:',error)}
  };
  refresh();open();
  const timer=setInterval(refresh,15000);
  return()=>{stopped=true;clearInterval(timer);clearTimeout(pending);if(source)source.close()};
}
export async function uploadSource(data,path,contentType='application/pdf'){const {storageRef,uploadBytes,getDownloadURL,storage}=await getStorageApi();const target=storageRef(storage,`exam-sources/${path}`);const snapshot=await uploadBytes(target,data,{contentType,cacheControl:'public,max-age=31536000'});return getDownloadURL(snapshot.ref)}

export async function removeMany(ids){
  if(!ids.length)return;
  const body={};ids.forEach((id)=>{body[safeKey(id)]=null});
  const response=await fetch(`${DB_URL}.json`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`Firebase HTTP ${response.status}`);
  ids.forEach((id)=>localFallback.delete(id));
}
export async function deleteSource(url){
  const match=/\/b\/([^/]+)\/o\/([^?]+)/.exec(url||'');
  if(!match)return false;
  const response=await fetch(`https://firebasestorage.googleapis.com/v0/b/${match[1]}/o/${match[2]}`,{method:'DELETE'});
  return response.ok||response.status===404;
}
