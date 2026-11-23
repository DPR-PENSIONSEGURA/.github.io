import {groupStatus,categoryLabels as categories} from './estado-categorias.mjs?v=20261123-2';
const API='https://novyra-semanas.consultoriadpr.workers.dev/v1/services/status';
const labels={ok:'Operativo',slow:'Con demoras',down:'Interrupción',paused:'Pausado',unknown:'Sin medición'};
const reasons={no_recent_activity:'No hay entregas recientes suficientes para confirmar el estado de este servicio.',catalog_paused:'Este servicio está temporalmente pausado en el catálogo.',technical_errors:'Se han registrado fallas técnicas recientes. Algunas solicitudes pueden no completarse o tardar más de lo habitual.',delivery_delay:'Se observan varias solicitudes que superan su tiempo habitual de entrega.',recent_deliveries:'Se registraron entregas recientes y no se detectó una incidencia general en la muestra analizada.',channel_delay:'Se detectó una demora en el canal de envío de solicitudes. Estamos pendientes de su recuperación.',channel_paused:'El canal de envío está temporalmente pausado.',collection_unavailable:'No se pudo confirmar el estado. La falta de mediciones no significa que el servicio esté interrumpido.'};
const categoryReasons={category_ok:'Se registran entregas recientes en esta categoría.',category_slow:'Se observan demoras o fallas en parte de esta categoría. Algunas solicitudes pueden tardar más de lo habitual.',category_down:'Se observan interrupciones en los trámites activos de esta categoría.',category_paused:'Los trámites de esta categoría están temporalmente pausados.',category_unknown:'No hay mediciones o actividad recientes suficientes para confirmar el estado general de esta categoría.'};
const $=id=>document.getElementById(id), el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const formatDate=day=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Mexico_City'}).format(new Date(day+'T12:00:00-06:00'));
const formatTime=time=>new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'}).format(new Date(time));
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
let data=null,selected=null,busy=false,history=new Map();
function badge(state){const b=el('span','badge',labels[state]||labels.unknown);b.dataset.state=state;return b;}
function stateForDay(s,day){return history.get(day+'|'+s.id)?.worst_state||'unknown';}
function renderDetail(){
  if(!selected||!data)return;
  const service=data.services.find(s=>s.id===selected.id);if(!service)return;
  const day=selected.day,row=history.get(day+'|'+service.id),today=day===data.days.at(-1),box=$('detail');
  box.replaceChildren(el('p','eyebrow','DETALLE DEL DÍA'));
  const top=el('div','detail-top'),heading=el('div'),title=el('h2','',service.name);title.id='detail-title';heading.append(title,el('span','muted',formatDate(day)));top.append(heading);
  const label=el('label','date-input','Cambiar fecha'),date=el('input');date.type='date';date.value=day;date.min=data.days[0];date.max=data.days.at(-1);date.addEventListener('change',()=>{if(data.days.includes(date.value))choose(service.id,date.value);});label.append(date);top.append(label);box.append(top);
  const state=stateForDay(service,day);box.append(badge(state));
  if(!row)box.append(el('p','', 'No hay mediciones registradas para esta categoría en este día. El historial comienza con el monitoreo real, sin completar días anteriores con datos estimados.'));
  else {
    const observed={ok:'Se observaron entregas operativas en esta categoría.',slow:'Se observaron demoras o fallas en parte de esta categoría durante el día.',down:'Se registraron interrupciones en los trámites activos de esta categoría durante el día.',paused:'Se observaron pausas en los trámites de esta categoría durante el día.',unknown:'No hubo actividad o mediciones suficientes para confirmar el estado general de la categoría.'};
    box.append(el('p','',observed[state]));
    const issues=[];if(row.issue_mask&1)issues.push('Fallas técnicas');if(row.issue_mask&2)issues.push('Demoras de entrega');if(row.issue_mask&4)issues.push('Demora en el canal de envío');if(row.issue_mask&8)issues.push('Algunos trámites o su canal de envío estuvieron pausados');if(row.issue_mask&16)issues.push('Aviso de Novyra');if(row.issue_mask&32)issues.push('Mediciones no disponibles');
    if(issues.length)box.append(el('p','muted',issues.join(' · ')+'.'));
    box.append(el('p','muted',`El historial reúne las observaciones de los trámites de esta categoría. ${today?'El día sigue en curso.':''} ${row.partial||row.samples<288?'La cobertura de este día es parcial.':''}`));
  }
  if(today){
    box.append(el('h3','', 'Estado actual'),badge(service.state),el('p','',categoryReasons[service.reason]||reasons[service.reason]||categoryReasons.category_unknown));
    if(service.has_unknown&&service.state!=='unknown')box.append(el('p','muted','La medición es parcial: hay trámites sin actividad reciente suficiente para confirmar su estado.'));
    if(service.has_paused&&service.state!=='paused')box.append(el('p','muted','Algunos trámites permanecen en pausa; esto no pausa toda la categoría.'));
    for(const notice of service.notices||[])box.append(el('p','notice',notice.message),el('p','muted','Aviso vigente hasta '+formatTime(notice.expires_at)+'.'));
  }
}
function choose(id,day){selected={id,day};document.querySelectorAll('.day').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.service===id&&b.dataset.day===day)));renderDetail();if(!$('detail-dialog').open)$('detail-dialog').showModal();}
function render(){
  if(!data)return;
  const query=normalize($('search').value.trim()),category=$('category').value;
  const services=data.services.filter(s=>(category==='all'||s.category===category)&&normalize(s.name+' '+(categories[s.category]||s.category)).includes(query));
  const focused=document.activeElement?.dataset?.focusKey,fragment=document.createDocumentFragment();
  for(const s of services){
    const row=el('article','service'),head=el('div','service-head'),title=el('button','service-title',s.name);title.type='button';title.dataset.focusKey=s.id;title.append(el('small','',s.has_unknown&&s.state!=='unknown'?'Medición parcial':s.has_paused&&s.state!=='paused'?'Algunos trámites en pausa':'Estado general'));title.addEventListener('click',()=>choose(s.id,data.days.at(-1)));head.append(title,badge(s.state));row.append(head);
    const bars=el('div','bars');bars.setAttribute('role','group');bars.setAttribute('aria-label','Historial de '+s.name);
    for(const day of data.days){const state=stateForDay(s,day),measure=history.get(day+'|'+s.id),b=el('button','day');b.type='button';b.dataset.state=state;b.dataset.service=s.id;b.dataset.day=day;b.dataset.focusKey=s.id+'|'+day;const label=`${s.name}, ${formatDate(day)}: ${labels[state]}`;b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(selected?.id===s.id&&selected.day===day));if(measure&&(measure.partial||measure.samples<288))b.classList.add('partial');b.addEventListener('click',()=>choose(s.id,day));bars.append(b);}
    row.append(bars);fragment.append(row);
  }
  if(!services.length)fragment.append(el('p','empty','No encontramos categorías con ese filtro.'));
  $('services').replaceChildren(fragment);$('service-count').textContent=services.length+(services.length===1?' categoría':' categorías');
  if(focused){const node=[...document.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===focused);node?.focus({preventScroll:true});}
  renderDetail();
}
async function load(){
  if(busy)return;busy=true;$('refresh').disabled=true;$('services').setAttribute('aria-busy','true');
  try{
    const response=await fetch(API,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('unavailable');const value=await response.json();
    if(!value.success||!Array.isArray(value.services)||!Array.isArray(value.days)||!Array.isArray(value.history))throw Error('unavailable');
    let snapshot=value;
    // An old browser response must not retain a green current status.
    if(Date.now()-value.observed_at>900000)snapshot={...value,stale:true,services:value.services.map(s=>s.notice?s:{...s,state:'unknown',reason:'collection_unavailable'})};
    data=groupStatus(snapshot);
    history=new Map(data.history.map(row=>[row.day+'|'+row.service_id,row]));
    const previous=$('category').value;$('category').replaceChildren(new Option('Todas las categorías','all'));
    for(const key of [...new Set(data.services.map(s=>s.category))])$('category').add(new Option(categories[key]||key,key));
    if([...$('category').options].some(o=>o.value===previous))$('category').value=previous;
    if(!selected||!data.services.some(s=>s.id===selected.id))selected={id:data.services[0]?.id,day:data.days.at(-1)};
    if(!data.days.includes(selected.day))selected.day=data.days.at(-1);
    $('from-day').textContent=formatDate(data.days[0]);$('updated').textContent=(data.stale?'Última medición disponible: ':'Actualizado: ')+formatTime(data.observed_at);
    $('started').textContent='Monitoreo iniciado el '+formatTime(data.started_at)+'. Actualización cada 5 minutos, sin realizar trámites de pago para medir el estado.';
    $('load-error').hidden=!data.stale&&data.source_ok!==false;$('load-error').textContent='No hay una medición reciente completa. Los estados sin confirmar se muestran en gris. Vuelve a actualizar en unos minutos.';
    render();
  }catch{
    $('load-error').hidden=false;$('load-error').textContent='No pudimos consultar el estado en este momento. Esto no confirma una interrupción de los servicios. Intenta actualizar de nuevo.';
    if(data){data={...data,services:data.services.map(s=>({...s,state:'unknown',reason:'collection_unavailable'}))};render();}
    else $('services').replaceChildren(el('p','empty','El historial no está disponible por el momento.'));
  }finally{busy=false;$('refresh').disabled=false;$('services').setAttribute('aria-busy','false');}
}
$('detail-close').addEventListener('click',()=>$('detail-dialog').close());
$('refresh').addEventListener('click',load);$('search').addEventListener('input',render);$('category').addEventListener('change',render);
setInterval(()=>{if(!document.hidden)void load();},300000);void load();
