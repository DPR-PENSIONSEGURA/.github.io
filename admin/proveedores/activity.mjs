import {api} from '/proveedores/api.mjs?v=20261116-results1';
export function createActivity(root,call=api){
 const get=id=>root.querySelector('#'+id),el=(tag,text,cls)=>{const n=root.ownerDocument.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let selected=null,cursor=null,version=0,loading=false;
 get('activity-date').value=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 async function refresh(more=false){
  if(!selected||more&&loading)return;const current=++version,uid=selected.id;loading=true;get('activity-refresh').disabled=true;get('activity-more').disabled=true;get('activity-status').textContent='Consultando cambios…';
  try{const q=new URLSearchParams({date:get('activity-date').value,period:get('activity-period').value});if(more&&cursor)q.set('cursor',cursor);const r=await call('/providers/'+encodeURIComponent(uid)+'/activity?'+q);if(current!==version||selected?.id!==uid)return;
   const list=get('activity-list');if(!more)list.replaceChildren();
   for(const event of r.activity){const card=el('article',undefined,'activity-row'),phase={applied:'Cambio confirmado',pending:'Pendiente de confirmar',uncertain:'Por verificar',not_applied:'Cambio no aplicado'}[event.phase]||'Por verificar',action={claimed:'Tomó la solicitud',released:'Liberó la solicitud',delivered:'Entregó documento',rejected:'Registró error'}[event.action]||event.action;
    card.append(el('strong',action+' · '+event.service),el('p',event.actor_name+' ('+event.actor_username+') · '+new Date(event.at).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'})),el('p','Solicitud: '+event.request_id,'ref'),el('p',event.from_status+' → '+event.to_status));if(event.error_message)card.append(el('p',event.error_message,'outcome rejected'));if(event.refund_confirmed)card.append(el('p','Devolución al cliente confirmada','badge active'));card.append(el('span',phase,'badge '+(event.phase==='applied'?'active':'inactive')));list.append(card);
   }
   if(!list.children.length)list.append(el('p','Este proveedor no tiene cambios registrados en el periodo seleccionado.','muted'));
   cursor=r.next_cursor;get('activity-more').hidden=!r.has_more;get('activity-status').textContent='Horario de Ciudad de México. Los intentos pendientes o por verificar conservan su registro para revisión.';
  }catch(e){if(current===version)get('activity-status').textContent=e.message+' El historial anterior puede estar desactualizado.';}finally{if(current===version){loading=false;get('activity-refresh').disabled=false;get('activity-more').disabled=false;}}
 }
 function select(value){selected=value?.id?{id:value.id,name:value.name}:null;cursor=null;version++;loading=false;root.hidden=!selected;get('activity-list').replaceChildren();if(selected){get('activity-title').textContent='Cambios de '+selected.name;refresh();}}
 get('activity-refresh').addEventListener('click',()=>refresh());get('activity-more').addEventListener('click',()=>refresh(true));get('activity-date').addEventListener('change',()=>refresh());get('activity-period').addEventListener('change',()=>refresh());
 root.ownerDocument.defaultView.addEventListener('novyra-provider-selected',event=>select(event.detail));
 setInterval(()=>{if(selected&&!root.ownerDocument.hidden&&!loading)refresh();},60000);
 return {select,refresh};
}
if(typeof document!=='undefined'&&!globalThis.__NV_PROVIDER_TEST__){const root=document.getElementById('provider-activity');if(root)createActivity(root);}
