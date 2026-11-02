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
function validarIdentificadores(values,primary){
 const rules={curp_p:/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/,q_curp:/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/,num_servicio_p:/^\d{12}$/,nss_p:/^\d{11}$/,idcif_p:/^\d{11}$/,rfc_p:/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/};
 const invalid=values.find(value=>rules[primary]&&!rules[primary].test(value));
 if(invalid)throw new Error('Revisa el identificador: '+invalid+'. Debe tener el formato completo del campo.');
 return values;
}
export function crearEditorLote({content,fields,t,precio,mejorar,preparar,enviar,validarTotal,actualizar,finalizar}){
 const doc=content.ownerDocument,root=content.querySelector('#datosConsultaActual'),pay=content.querySelector('#btnPagarTramite');
 const primary=campoPrincipal(t),controls=[...root.querySelectorAll('input,textarea,select')];
 if(primary&&controls.length===1&&controls[0].id===primary)return crearEditorCurpsSimple({content,fields,t,precio,mejorar,preparar,enviar,validarTotal,actualizar,finalizar});
 const items=[{node:root,state:'draft'}];let current=0,busy=false,frozen=false,feedback='',input;
 const names={curp_p:'CURP',q_curp:'CURP',num_servicio_p:'Número de servicio',nss_p:'NSS',rfc_p:'RFC',idcif_p:'IDCIF'};
 if(primary){
  const wrap=doc.createElement('div');wrap.className='ux-field-wrap';
  const label=doc.createElement('label');label.className='ux-field-label';label.textContent=names[primary];label.htmlFor=primary+'_lista';
  input=doc.createElement('textarea');input.id=label.htmlFor;input.className='input-light uppercase';input.rows=2;input.autocomplete='off';input.placeholder=names[primary]+'1, '+names[primary]+'2, '+names[primary]+'3';
  const help=doc.createElement('p');help.className='ux-field-help';help.id=input.id+'-ayuda';help.textContent='Separa los identificadores por comas. Completa los datos de cada persona; cada una genera una solicitud individual.';input.setAttribute('aria-describedby',help.id);
  wrap.append(label,input,help);root.before(wrap);input.onchange=()=>{if(!busy&&!frozen)try{sync()}catch(e){status.textContent=e.message}};
 }
 const nav=doc.createElement('div');nav.className='ux-step-nav';nav.hidden=true;
 const previous=doc.createElement('button'),next=doc.createElement('button');previous.type=next.type='button';previous.className=next.className='ux-step-button';previous.textContent='Anterior';next.textContent='Siguiente';previous.onclick=()=>{if(!busy)mount(current-1)};next.onclick=()=>{if(!busy)mount(current+1)};nav.append(previous,next);
 const status=doc.createElement('p');status.className='ux-field-help';status.setAttribute('role','status');root.before(status);root.after(nav);
 function render(){
  const pending=items.filter(x=>x.state==='draft').length;
  status.textContent=feedback||(items.length>1?'Datos de la solicitud '+(current+1)+' de '+items.length+' · '+(primary?items[current].node.querySelector('#'+primary)?.value:''):'');
  nav.hidden=items.length<2;previous.disabled=busy||current===0;next.disabled=busy||current===items.length-1;
  if(!busy){pay.disabled=!pending;pay.textContent=pending>1?'Revisar y enviar '+pending+' solicitudes':'Enviar solicitud'}
 }
 function mount(index){
  const item=items[index];if(!item)return;
  const old=content.querySelector('#datosConsultaActual');if(old!==item.node)old.replaceWith(item.node);current=index;
  if(!item.ready){mejorar(t);item.ready=true;const identity=primary&&item.node.querySelector('#'+primary);if(identity){const wrap=identity.closest('.ux-field-wrap');if(wrap)wrap.hidden=true;else identity.hidden=true;}} 
  item.node.querySelectorAll('input,textarea,select,button').forEach(el=>{el.disabled=busy||item.state!=='draft'});
  if(item.state==='draft'){window.actualizarPrecioAfore?.();window.actualizarFechaCitaAfore?.()}
  render();
 }
 function make(value=''){
  const node=doc.createElement('div');node.id='datosConsultaActual';node.innerHTML=fields;
  if(primary&&node.querySelector('#'+primary))node.querySelector('#'+primary).value=value;
  return {node,state:'draft'};
 }
 function loadIdentifiers(values){
  if(busy||frozen)return;
  if(!primary)return;
  if(!values.length)throw new Error('Escribe al menos un identificador.');
  if(values.length>MAX_CONSULTAS)throw new Error('Máximo 50 solicitudes.');
  const byValue=new Map(items.map(item=>[item.node.querySelector('#'+primary)?.value.trim().toUpperCase(),item]));
  const empty=items.length===1&&!items[0].node.querySelector('#'+primary)?.value.trim()?items[0]:null;
  const active=items[current];const old=content.querySelector('#datosConsultaActual');
  const updated=values.map((value,i)=>{const item=byValue.get(value)||(i===0&&empty)||make(value);item.node.querySelector('#'+primary).value=value;return item});
  items.splice(0,items.length,...updated);current=Math.max(0,items.indexOf(active));old.replaceWith(items[current].node);input.value=values.join(', ');mount(current);
 }
 function sync(){if(primary&&!frozen)loadIdentifiers(validarIdentificadores(separarIdentificadores(input.value),primary))}
 function lock(value){busy=value;nav.querySelectorAll('button').forEach(el=>{el.disabled=value});if(input){input.disabled=value;input.readOnly=frozen;}for(const item of items)item.node.querySelectorAll('input,textarea,select,button').forEach(el=>{el.disabled=value||item.state!=='draft'});pay.disabled=value}
 async function submit(){
  if(busy)return;try{sync()}catch(e){status.textContent=e.message;input?.focus();return}const pending=items.filter(x=>x.state==='draft');if(!pending.length)return;
  feedback='';lock(true);let sent=0;
  try{
   // Validate every independent form before any upload, charge or request.
   let total=0;
   for(const item of pending){mount(items.indexOf(item));const checked=await preparar(t,precio,true);if(!checked){feedback='Revisa los datos de la solicitud '+(items.indexOf(item)+1)+(primary?' · '+item.node.querySelector('#'+primary).value:'')+'.';return}total+=Number(checked.precio||0)}
   if(validarTotal&&!validarTotal(total,pending.length))return;
   if(!confirm(`Enviar ${pending.length} consultas individuales.\nImporte estimado total: $${total.toFixed(2)} MXN.\nSe aplican los paquetes y beneficios vigentes de cada solicitud. ¿Continuar?`))return;
   frozen=true;if(input)input.readOnly=true;
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
 const primary=campoPrincipal(t),isCfe=primary==='num_servicio_p';
 const name={curp_p:'CURP',q_curp:'CURP',nss_p:'NSS',rfc_p:'RFC',idcif_p:'IDCIF',num_servicio_p:'número de servicio'}[primary];
 const original=visible.querySelector('#'+primary),input=doc.createElement('textarea');
 input.id=original.id;input.className=original.className;input.rows=2;input.autocomplete='off';
 input.placeholder=isCfe?'Número de servicio 1, número de servicio 2, número de servicio 3':name+'1, '+name+'2, '+name+'3';input.dataset.multiIdentifier='true';
 if(isCfe){input.inputMode='text';input.setAttribute('aria-label','Números de servicio CFE');}else input.dataset.multiCurp='true';
 original.replaceWith(input);mejorar(t);
 if(isCfe){const help=doc.createElement('p');help.className='ux-field-help';help.id='num_servicio_p-ayuda';help.textContent='Escribe números de servicio de 12 dígitos separados por comas. Cada uno genera una solicitud individual.';input.after(help);input.setAttribute('aria-describedby',help.id);}
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
   let values;try{values=validarIdentificadores(separarIdentificadores(input.value),primary)}catch(e){status.textContent=e.message;input.focus();return}
   if(!values.length){status.textContent='Escribe al menos un identificador ('+name+').' ;input.focus();return}
   items=values.map(value=>{const node=doc.createElement('div');node.id='datosConsultaActual';node.hidden=true;node.innerHTML=fields;node.querySelector('#'+primary).value=value;return {node,state:'draft'}});
  }
  const pending=items.filter(x=>x.state==='draft');if(!pending.length)return;
  busy=true;input.disabled=true;pay.disabled=true;status.textContent='';let sent=0;
  try{
   let total=0;
   for(const item of pending){mount(items.indexOf(item));const checked=await preparar(t,precio,true);if(!checked){status.textContent=('Revisa '+name+': ')+item.node.querySelector('#'+primary).value;return}total+=Number(checked.precio||0)}
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
    }catch(e){item.state=e.deliveryUncertain?'uncertain':'draft';status.textContent=`${items.filter(x=>x.state==='sent').length} enviadas. `+(item.state==='uncertain'?('Revisa el historial para confirmar '+name+' ')+item.node.querySelector('#'+primary).value+'. No se volverá a enviar automáticamente.':'Puedes continuar para enviar únicamente las solicitudes pendientes.');alert(status.textContent);return}
   }
   if(items.some(x=>x.state==='uncertain')){status.textContent='Las solicitudes pendientes se enviaron. Revisa el historial para confirmar las anteriores.';return}
   alert(`${sent} solicitud${sent===1?'':'es'} enviada${sent===1?'':'s'}. Cada identificador quedó registrado individualmente.`);finalizar();
  }finally{busy=false;restore();await actualizar()}
 }
 pay.onclick=submit;label();
 return {submit,get busy(){return busy},get items(){return items},mount,loadIdentifiers};
}


