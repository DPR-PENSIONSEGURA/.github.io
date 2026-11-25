const BASE='https://api-326bly7kmq-uc.a.run.app/api/v1/admin/panel/api-results';
export const labels={completed:'Entregado',pending:'En proceso',error:'Con error',review:'Requiere revisión',cancelled:'Cancelado'};
const stages={queued:'En cola',submitting:'Enviando a la API',waiting:'Esperando respuesta',delivering:'Guardando documento',dispatching:'Consultando la API',provider_succeeded:'Preparando la entrega',uncertain:'Respuesta incierta',review:'Revisión pendiente',types_ready:'Esperando elección del cliente',products_ready:'Esperando elección del cliente',pdf_failed:'Pendiente de recuperar el PDF',types_queued:'Consultando opciones',types_dispatching:'Consultando opciones',amounts_queued:'Consultando montos',amounts_dispatching:'Consultando montos',pdf_queued:'Preparando documento',pdf_dispatching:'Preparando documento',pdf_ready:'Preparando la entrega'};
const names={standard:'Semanas cotizadas',detailed:'Semanas detalladas',rights_validity:'Vigencia de derechos'};
export const mexicoDay=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function documentUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&((url.hostname==='res.cloudinary.com'&&url.pathname.startsWith('/de5abnhul/'))||(url.origin==='https://api-326bly7kmq-uc.a.run.app'&&/^\/api\/v1\/infonavit-api\/result\/[a-f0-9-]{36}$/i.test(url.pathname)))?url.href:null;}catch{return null;}}
const date=value=>value?new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(value)):'Sin registro';
export async function api(path='',{signal}={}){
 const response=await fetch(BASE+path,{headers:{Authorization:'Bearer '+(sessionStorage.getItem('dpr_staff_token')||'')},cache:'no-store',signal});
 const data=await response.json();if(!response.ok||!data.success)throw Error(response.status===401?'Tu sesión venció. Vuelve a entrar al panel.':data.message||'No fue posible consultar los resultados.');return data;
}
export function createMonitor(root,call=api){
 const $=id=>root.getElementById(id),form=$('filters'),dialog=$('detail');let page=1,pages=1,ready=false,sequence=0,listAbort,detailAbort,selected=null,timer;
 const make=(tag,text,cls)=>{const el=root.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const chip=item=>make('span',labels[item.status]||item.status,'chip '+item.status);
 const status=(text,error=false)=>{$('message').textContent=text;$('message').className='notice'+(error?' failure':'');};
 function query(){const params=new URLSearchParams();for(const name of ['from','to','source','origin','status','q'])params.set(name,form.elements.namedItem(name).value);params.set('page',page);return '?'+params;}
 function renderRows(items){
  const box=$('rows');box.replaceChildren();if(!items.length){const tr=make('tr'),td=make('td','No hay consultas que coincidan con estos filtros.','empty');td.colSpan=5;tr.append(td);box.append(tr);return;}
  for(const item of items){
   const row=make('tr'),identity=make('td'),service=make('td'),state=make('td'),updated=make('td',date(item.updated_at),'date'),action=make('td');
   identity.append(make('span',item.identifier||'Identificador pendiente','identifier'),make('span','Folio: '+item.request_ref,'ref'));
   service.append(make('span',names[item.service]||item.service,'service'),make('span',item.provider,'sub'),make('span',item.origin==='sambot'?'Sam Bot':'Novyra','origin-label'));
   state.append(chip(item));if(item.retry_at)state.append(make('small','Reintento '+item.retry_count+' de 2 · '+date(item.retry_at),'sub'));else if(stages[item.state])state.append(make('small',(item.retry_count?'Reintento '+item.retry_count+' de 2 · ':'')+stages[item.state],'sub'));
   const button=make('button','Ver respuesta','button secondary small');button.type='button';button.setAttribute('aria-label','Ver respuesta de '+(item.identifier||item.request_ref));button.addEventListener('click',()=>open(item));action.append(button);
   row.append(identity,service,state,updated,action);box.append(row);
  }
 }
 async function refresh({quiet=false}={}){
  if(!ready)return;listAbort?.abort();listAbort=new AbortController();const current=++sequence;
  if(!quiet)status('Consultando resultados…');$('refresh').disabled=true;
  try{
   const result=await call(query(),{signal:listAbort.signal});if(current!==sequence)return;
   if(!Array.isArray(result.items)||!result.summary||!result.pagination)throw Error('La respuesta no pudo interpretarse. Actualiza para volver a consultar.');
   renderRows(result.items);for(const name of ['total','completed','pending','error','review'])$('count-'+name).textContent=String(result.summary[name]||0);
   pages=result.pagination.pages;$('page-status').textContent='Página '+page+' de '+pages;$('previous').disabled=page<=1;$('next').disabled=!result.pagination.has_more;
   $('updated').textContent='Actualizado: '+date(result.at)+' · Ciudad de México';$('warnings').textContent=(result.warnings||[]).join(' ');$('warnings').hidden=!result.partial;
   status(result.partial?'Se muestran datos parciales. Revisa el aviso antes de interpretar los totales.':'');
  }catch(e){if(current!==sequence||e.name==='AbortError')return;status(e.message,true);}finally{if(current===sequence)$('refresh').disabled=false;}
 }
 function field(grid,label,value){const box=make('div');box.append(make('dt',label),make('dd',value??'Sin registro'));grid.append(box);}
 function detailContent(data){
  const box=$('detail-content'),item=data.item;box.replaceChildren();$('detail-title').textContent='Respuesta de '+item.provider;
  box.append(chip(item));const grid=make('dl',undefined,'detail-meta');
  field(grid,'Servicio',names[item.service]||item.service);field(grid,'CURP / NSS',item.identifier);field(grid,'Folio de Novyra / Sam Bot',item.request_ref);field(grid,'Origen',item.origin==='sambot'?'Sam Bot':'Novyra');field(grid,'Solicitud creada',date(item.created_at));field(grid,'Último cambio',date(item.updated_at));if(item.provider_uuid)field(grid,'Folio de la API',item.provider_uuid);box.append(grid);
  if(item.retry_count){field(grid,'Reintentos automáticos',item.retry_count+' de 2');if(item.retry_at)field(grid,'Próximo intento',date(item.retry_at));}
  if(item.code)box.append(make('p','Código registrado: '+item.code,'technical'));
  if(stages[item.state])box.append(make('p',stages[item.state]+'.','detail-note'));
  for(const note of data.notes||[])box.append(make('p',note,'detail-note'));
  for(const response of data.responses||[]){
   const details=make('details',undefined,'response-card');details.open=true;details.append(make('summary',response.stage+(response.http_status?' · HTTP '+response.http_status:'')));
   details.append(make('p',(response.kind==='live_existing_folio'?'Consulta del folio existente':'Respuesta guardada')+(response.received_at?' · '+date(response.received_at):'')));
   details.append(make('pre',JSON.stringify(response.body,null,2)));box.append(details);
  }
  box.append(make('p','Las claves y contraseñas se muestran protegidas. El archivo PDF se abre desde Ver documento cuando ya fue entregado.','detail-note'));
  const url=documentUrl(data.document_url);$('document-link').hidden=!url;if(url)$('document-link').href=url;else $('document-link').removeAttribute('href');
 }
 async function loadDetail(){
  if(!selected)return;detailAbort?.abort();detailAbort=new AbortController();const key=selected.source+':'+selected.id;
  $('refresh-detail').disabled=true;$('document-link').hidden=true;$('detail-content').replaceChildren(make('p','Consultando la respuesta del folio existente…','detail-note'));
  try{const data=await call('/'+encodeURIComponent(selected.source)+'/'+encodeURIComponent(selected.id),{signal:detailAbort.signal});if(!selected||key!==selected.source+':'+selected.id)return;detailContent(data);}catch(e){if(e.name!=='AbortError')$('detail-content').replaceChildren(make('p',e.message,'detail-note'));}finally{$('refresh-detail').disabled=false;}
 }
 function open(item){selected=item;$('detail-title').textContent='Respuesta de API';if(!dialog.open)dialog.showModal();void loadDetail();}
 function changed(){page=1;void refresh();}
 form.addEventListener('submit',event=>{event.preventDefault();changed();});
 for(const name of ['source','origin','status'])form.elements.namedItem(name).addEventListener('change',changed);
 $('today').addEventListener('click',()=>{form.elements.namedItem('from').value=mexicoDay();form.elements.namedItem('to').value=mexicoDay();changed();});
 $('refresh').addEventListener('click',()=>void refresh());$('previous').addEventListener('click',()=>{if(page>1){page--;void refresh();}});$('next').addEventListener('click',()=>{if(page<pages){page++;void refresh();}});
 $('close-detail').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{detailAbort?.abort();selected=null;});$('refresh-detail').addEventListener('click',()=>void loadDetail());
 function schedule(){clearTimeout(timer);timer=setTimeout(async()=>{if($('auto-refresh').checked&&root.visibilityState!=='hidden')await refresh({quiet:true});schedule();},30000);}
 return {async start(){form.elements.namedItem('from').value=mexicoDay();form.elements.namedItem('to').value=mexicoDay();ready=true;await refresh();schedule();},refresh,open,destroy(){ready=false;clearTimeout(timer);listAbort?.abort();detailAbort?.abort();},renderRows,detailContent};
}
async function start(){
 const auth=document.getElementById('auth-status');
 try{const staff=await window.nvPanelReady;if(!staff||(!staff.is_owner&&staff.can_view_api_results!==true))throw Error('Tu cuenta no tiene acceso a Resultados de API.');const monitor=createMonitor(document);document.getElementById('monitor').hidden=false;auth.hidden=true;await monitor.start();window.addEventListener('pagehide',()=>monitor.destroy(),{once:true});}catch(e){auth.textContent=e.message;}
}
if(typeof document!=='undefined'&&!globalThis.__NV_API_MONITOR_TEST__)void start();
