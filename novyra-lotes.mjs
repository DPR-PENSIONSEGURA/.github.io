export const MAX_CONSULTAS = 50;
export function separarIdentificadores(texto) {
 const values=String(texto||'').toUpperCase().split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);
 const result=[...new Set(values)];
 if(result.length>MAX_CONSULTAS)throw new Error('Puedes preparar hasta 50 consultas por lote.');
 return result;
}
export function campoPrincipal(t){
 return t.curp?'curp_p':t.pideNumServicio?'num_servicio_p':t.nss?'nss_p':t.rfc?'rfc_p':t.idcif?'idcif_p':t.pideCuestionarioPension?'q_curp':null;
}
export function crearEditorLote({content,fields,t,precio,mejorar,preparar,enviar,validarTotal,actualizar,finalizar}){
 const doc=content.ownerDocument,root=content.querySelector('#datosConsultaActual'),pay=content.querySelector('#btnPagarTramite');
 // A CURP-only service needs one familiar field, not a second batch editor.
 const controls=[...root.querySelectorAll('input,textarea,select')];
 if(t.curp&&controls.length===1&&controls[0].id==='curp_p')return crearEditorCurpsSimple({content,fields,t,precio,mejorar,preparar,enviar,validarTotal,actualizar,finalizar});
 const primary=campoPrincipal(t),items=[{node:root,state:'draft'}];let current=0,busy=false,feedback='';
 const bar=doc.createElement('section');bar.className='nv-batch';bar.setAttribute('aria-label','Consultas individuales');
 const heading=doc.createElement('h3');heading.textContent='Consultas individuales';bar.append(heading);
 const help=doc.createElement('p');help.textContent='Cada ficha crea una solicitud individual, con sus propios datos, archivos y cobro. Máximo 50. Los datos adicionales no se comparten entre fichas.';bar.append(help);
 let input;
 if(primary){
  const label=doc.createElement('label');label.textContent=primary==='num_servicio_p'?'Pega los números de servicio':'Pega los identificadores ('+(primary==='curp_p'||primary==='q_curp'?'CURP':primary==='nss_p'?'NSS':primary==='rfc_p'?'RFC':'IDCIF')+')';
  input=doc.createElement('textarea');input.rows=3;input.placeholder='Uno por renglón o separados por comas';label.append(input);bar.append(label);
  const load=button('Preparar consultas',()=>{try{loadIdentifiers(separarIdentificadores(input.value))}catch(e){alert(e.message)}});bar.append(load);
 }
 const nav=doc.createElement('div');nav.className='nv-batch-nav';
 const select=doc.createElement('select');select.setAttribute('aria-label','Consulta actual');select.onchange=()=>mount(Number(select.value));
 nav.append(select,button('Añadir consulta',()=>add()),button('Quitar esta consulta',()=>remove()));bar.append(nav);
 const status=doc.createElement('p');status.className='nv-batch-status';status.setAttribute('role','status');bar.append(status);root.before(bar);
 function button(text,fn){const b=doc.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(!busy)fn()};return b}
 function label(item,i){const value=primary?item.node.querySelector('#'+primary)?.value.trim():'';return (i+1)+'. '+(value||'Completar datos')+(item.state==='sent'?' · Enviada':item.state==='uncertain'?' · Revisar historial':'')}
 function render(){
  select.replaceChildren();items.forEach((item,i)=>{const o=doc.createElement('option');o.value=String(i);o.textContent=label(item,i);select.append(o)});select.value=String(current);
  const pending=items.filter(x=>x.state==='draft').length;
  status.textContent=feedback||`${items.length} consultas · ${items.filter(x=>x.state==='sent').length} enviadas · ${pending} por enviar`;
  if(!busy){pay.disabled=!pending;pay.textContent=pending>1?`Revisar y enviar ${pending} consultas`:'Revisar y enviar consulta'}
 }
 function mount(index){
  const item=items[index];if(!item)return;
  const old=content.querySelector('#datosConsultaActual');if(old!==item.node)old.replaceWith(item.node);current=index;
  if(!item.ready){mejorar(t);item.ready=true}
  item.node.querySelectorAll('input,textarea,select,button').forEach(el=>{el.disabled=busy||item.state!=='draft'});
  if(item.state==='draft'){window.actualizarPrecioAfore?.();window.actualizarFechaCitaAfore?.()}
  render();
 }
 function make(value=''){
  const node=doc.createElement('div');node.id='datosConsultaActual';node.innerHTML=fields;
  if(primary&&node.querySelector('#'+primary))node.querySelector('#'+primary).value=value;
  return {node,state:'draft'};
 }
 function add(){if(items.length>=MAX_CONSULTAS)return alert('Máximo 50 consultas por lote.');items.push(make());mount(items.length-1)}
 function remove(){if(items[current].state!=='draft')return alert('Una consulta enviada o por confirmar debe conservarse para su seguimiento.');if(items.length===1){items[0]=make();mount(0);return}const old=items[current].node;items.splice(current,1);current=Math.min(current,items.length-1);old.replaceWith(items[current].node);mount(current)}
 function loadIdentifiers(values){
  if(!values.length)throw new Error('Escribe al menos un identificador.');
  const existing=new Set(items.map(x=>x.node.querySelector('#'+primary)?.value.trim().toUpperCase()).filter(Boolean));
  const missing=values.filter(x=>!existing.has(x));const emptyFirst=items.length===1&&items[0].state==='draft'&&!items[0].node.querySelector('#'+primary)?.value.trim();
  if(items.length+missing.length-(emptyFirst&&missing.length?1:0)>MAX_CONSULTAS)throw new Error('El lote supera las 50 consultas.');
  if(emptyFirst&&missing.length)items[0].node.querySelector('#'+primary).value=missing.shift();
  for(const value of missing)items.push(make(value));input.value='';mount(0);
 }
 function lock(value){busy=value;bar.querySelectorAll('button,select,textarea').forEach(el=>{el.disabled=value});for(const item of items)item.node.querySelectorAll('input,textarea,select,button').forEach(el=>{el.disabled=value||item.state!=='draft'});pay.disabled=value}
 async function submit(){
  if(busy)return;const pending=items.filter(x=>x.state==='draft');if(!pending.length)return;
  feedback='';lock(true);let sent=0;
  try{
   // Validate every independent form before any upload, charge or request.
   let total=0;
   for(const item of pending){mount(items.indexOf(item));const checked=await preparar(t,precio,true);if(!checked)return;total+=Number(checked.precio||0)}
   if(validarTotal&&!validarTotal(total,pending.length))return;
   if(!confirm(`Enviar ${pending.length} consultas individuales.\nImporte estimado total: $${total.toFixed(2)} MXN.\nSe aplican los paquetes y beneficios vigentes de cada solicitud. ¿Continuar?`))return;
   for(let i=0;i<pending.length;i++){
    const item=pending[i];mount(items.indexOf(item));pay.textContent=`ENVIANDO ${i+1} DE ${pending.length}…`;pay.disabled=true;
    const prepared=await preparar(t,precio,false);if(!prepared)return;
    const body={...prepared.body,detalles_extra:{...prepared.body.detalles_extra,lote_total:pending.length,lote_posicion:i+1}};
    try{
     const result=await enviar(body);
     if(result?.success!==true||typeof result.solicitud_id!=='string'||!result.solicitud_id){const e=new Error('El servidor no confirmó el folio de esta consulta');e.deliveryUncertain=true;throw e}
     item.state='sent';item.requestId=result.solicitud_id;sent++;
    }
    catch(e){item.state=e.deliveryUncertain?'uncertain':'draft';feedback=`${sent} enviadas. ${e.message}. `+(item.state==='uncertain'?'Revisa el historial antes de volver a solicitar esta consulta. No se reintentó automáticamente.':'Las consultas que faltan conservan sus datos.');status.textContent=feedback;alert(feedback);return}
   }
   alert(`${sent} solicitud${sent===1?'':'es'} enviada${sent===1?'':'s'}. Cada consulta quedó registrada individualmente.`);
   if(items.every(x=>x.state==='sent'))finalizar();
  }finally{lock(false);mount(current);await actualizar()}
 }
 pay.onclick=submit;content.oninput=()=>{if(!busy)render()};mount(0);
 return {submit,get busy(){return busy},items,mount,loadIdentifiers};
}

function crearEditorCurpsSimple({content,fields,t,precio,mejorar,preparar,enviar,validarTotal,actualizar,finalizar}){
 const doc=content.ownerDocument,visible=content.querySelector('#datosConsultaActual'),pay=content.querySelector('#btnPagarTramite');
 const original=visible.querySelector('#curp_p'),input=doc.createElement('textarea');
 input.id=original.id;input.className=original.className;input.rows=2;input.autocomplete='off';
 input.placeholder='CURP1, CURP2, CURP3';input.dataset.multiCurp='true';original.replaceWith(input);mejorar(t);
 const status=doc.createElement('p');status.className='ux-field-help';status.setAttribute('role','status');visible.append(status);
 let busy=false,frozen=false,items=[{node:visible,state:'draft'}];
 const label=()=>{if(!busy)pay.textContent='Enviar solicitud'+(items.filter(x=>x.state==='draft').length>1?'es':'')};
 function mount(index){const item=items[index];if(!item)return;const current=content.querySelector('#datosConsultaActual');if(current!==item.node)current.replaceWith(item.node);if(!item.ready){mejorar(t);item.ready=true}}
 function restore(){const current=content.querySelector('#datosConsultaActual');if(current!==visible)current.replaceWith(visible);input.disabled=busy;input.readOnly=frozen;pay.disabled=busy||(!items.some(x=>x.state==='draft')&&frozen);label()}
 function loadIdentifiers(values){if(frozen||busy)return;input.value=values.join(', ')}
 input.oninput=()=>{input.value=input.value.toUpperCase();status.textContent=''};
 async function submit(){
  if(busy)return;
  if(!frozen){
   let values;try{values=separarIdentificadores(input.value)}catch(e){status.textContent=e.message;input.focus();return}
   if(!values.length){status.textContent='Escribe al menos una CURP.';input.focus();return}
   items=values.map(value=>{const node=doc.createElement('div');node.id='datosConsultaActual';node.hidden=true;node.innerHTML=fields;node.querySelector('#curp_p').value=value;return {node,state:'draft'}});
  }
  const pending=items.filter(x=>x.state==='draft');if(!pending.length)return;
  busy=true;input.disabled=true;pay.disabled=true;status.textContent='';let sent=0;
  try{
   let total=0;
   for(const item of pending){mount(items.indexOf(item));const checked=await preparar(t,precio,true);if(!checked){status.textContent='Revisa la CURP: '+item.node.querySelector('#curp_p').value;return}total+=Number(checked.precio||0)}
   if(validarTotal&&!validarTotal(total,pending.length))return;
   restore();
   if(!confirm(`Enviar ${pending.length} solicitud${pending.length===1?'':'es'} individual${pending.length===1?'':'es'}.\nImporte estimado total: $${total.toFixed(2)} MXN.\n¿Continuar?`))return;
   frozen=true;
   for(let i=0;i<pending.length;i++){
    const item=pending[i];mount(items.indexOf(item));pay.textContent=`Enviando ${i+1} de ${pending.length}…`;pay.disabled=true;
    const prepared=await preparar(t,precio,false);if(!prepared)return;
    const body={...prepared.body,detalles_extra:{...prepared.body.detalles_extra,lote_total:pending.length,lote_posicion:i+1}};
    try{
     const result=await enviar(body);
     if(result?.success!==true||typeof result.solicitud_id!=='string'||!result.solicitud_id){const e=new Error('El servidor no confirmó el folio');e.deliveryUncertain=true;throw e}
     item.state='sent';item.requestId=result.solicitud_id;sent++;
    }catch(e){item.state=e.deliveryUncertain?'uncertain':'draft';status.textContent=`${items.filter(x=>x.state==='sent').length} enviadas. `+(item.state==='uncertain'?'Revisa el historial para confirmar la CURP '+item.node.querySelector('#curp_p').value+'. No se volverá a enviar automáticamente.':'Puedes continuar para enviar únicamente las solicitudes pendientes.');alert(status.textContent);return}
   }
   if(items.some(x=>x.state==='uncertain')){status.textContent='Las solicitudes pendientes se enviaron. Revisa el historial para confirmar las anteriores.';return}
   alert(`${sent} solicitud${sent===1?'':'es'} enviada${sent===1?'':'s'}. Cada CURP quedó registrada individualmente.`);finalizar();
  }finally{busy=false;restore();await actualizar()}
 }
 pay.onclick=submit;label();
 return {submit,get busy(){return busy},get items(){return items},mount,loadIdentifiers};
}


