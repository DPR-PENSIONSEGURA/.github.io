// Administrative data is served by the backend; no browser Firestore credential access.
const base='https://api-326bly7kmq-uc.a.run.app/api/v1/admin/panel/';
export async function panelRequest(path, options={}) {
  await window.nvPanelReady;
  const response=await fetch(base+path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(sessionStorage.getItem('dpr_staff_token')||''),...(options.headers||{})}});
  const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Acceso no autorizado.');return data;
}
const revive=v=>{if(Array.isArray(v))return v.map(revive);if(v&&typeof v==='object'){const seconds=v._seconds??v.seconds;if(Number.isFinite(seconds))return {...v,toDate:()=>new Date(seconds*1000+(v._nanoseconds??v.nanoseconds??0)/1e6)};return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,revive(value)]));}return v;};
const snapshot=d=>({id:d?.id,exists:()=>Boolean(d),data:()=>revive(d?.data||{})});
export const getFirestore=()=>({});
export const collection=(_db,name)=>({collection:name,filters:[]});
export const doc=(_db,name,id)=>({collection:name,id,filters:[]});
export const where=(field,op,value)=>({kind:'where',field,op,value});
export const orderBy=(field,direction='asc')=>({kind:'orderBy',field,direction});
export const limit=value=>({kind:'limit',value});
export const query=(ref,...filters)=>({...ref,filters:[...(ref.filters||[]),...filters]});
export const serverTimestamp=()=>({__nv_op:'serverTimestamp'});
export const increment=amount=>({__nv_op:'increment',amount});
export async function getDocs(ref){
  let docs;
  if(ref.collection==='accesos_crm'){const r=await panelRequest('staff');docs=r.rows.filter(row=>(ref.filters||[]).filter(f=>f.kind==='where').every(f=>row[f.field]===f.value)).map(row=>({id:row.uid,data:{...row,nombre:row.name}}));}
  else {const max=ref.filters?.find(f=>f.kind==='limit')?.value||1000;const r=await panelRequest('store/'+encodeURIComponent(ref.collection)+'?'+new URLSearchParams({filters:JSON.stringify(ref.filters||[]),limit:max}));docs=r.docs;}
  const list=docs.map(snapshot);return {docs:list,size:list.length,empty:!list.length,forEach:fn=>list.forEach(fn)};
}
export async function getDoc(ref){if(ref.collection==='accesos_crm'){const all=await getDocs(collection(null,'accesos_crm'));return all.docs.find(d=>d.id===ref.id)||snapshot(null);}const r=await panelRequest('store/'+encodeURIComponent(ref.collection)+'/'+encodeURIComponent(ref.id));return snapshot(r.doc);}
export function onSnapshot(ref,callback,onError){let stopped=false,timer;const poll=async()=>{try{await window.nvPanelReady;if(stopped||!window.nvPanelVerified?.is_owner)return;const snap=ref.id?await getDoc(ref):await getDocs(ref);if(!stopped)callback(snap);}catch(e){if(onError)onError(e);else console.error('No se pudo cargar el módulo privado.');}finally{if(!stopped)timer=setTimeout(poll,60000);}};poll();return()=>{stopped=true;clearTimeout(timer);};}
export async function addDoc(ref,data){if(ref.collection==='accesos_crm')return panelRequest('staff',{method:'POST',body:JSON.stringify(data)});return panelRequest('store/'+encodeURIComponent(ref.collection),{method:'POST',body:JSON.stringify({data})});}
export async function setDoc(ref,data,options={}){return panelRequest('store/'+encodeURIComponent(ref.collection)+'/'+encodeURIComponent(ref.id),{method:'PUT',body:JSON.stringify({data,merge:options.merge===true})});}
export async function updateDoc(ref,data){if(ref.collection==='accesos_crm')return panelRequest('staff/'+encodeURIComponent(ref.id),{method:'PATCH',body:JSON.stringify(data)});return panelRequest('store/'+encodeURIComponent(ref.collection)+'/'+encodeURIComponent(ref.id),{method:'PUT',body:JSON.stringify({data,update:true})});}
export async function deleteDoc(ref){if(ref.collection==='accesos_crm')return panelRequest('staff/'+encodeURIComponent(ref.id),{method:'PATCH',body:JSON.stringify({activo:false})});return panelRequest('store/'+encodeURIComponent(ref.collection)+'/'+encodeURIComponent(ref.id),{method:'DELETE'});}
export async function runTransaction(){throw new Error('Esta operación debe realizarse mediante el backend.');}
