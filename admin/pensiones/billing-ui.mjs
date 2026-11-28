const names={pension:'Pensión IMSS Ley 73',ley97:'Retiro IMSS Ley 97',average:'Salario de 250 semanas',m40:'Aportaciones y continuidad Modalidad 40',unemployment:'Descuento de semanas por desempleo'};
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
const when=v=>new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(v));
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
export function createBilling({request,render,account,meta,showMessage}){
 const config=meta.billing,box=document.getElementById('billing-box'),price=document.getElementById('billing-price'),detail=document.getElementById('billing-detail'),balance=document.getElementById('billing-balance');
 const storageKey='nv_pension_operation_v1:'+account.uid;
 let current='pension';
 function read(){try{return JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{return null;}}
 function save(v){try{sessionStorage.setItem(storageKey,JSON.stringify(v));}catch{}}
 function update(type=current){
  current=type;box.hidden=false;balance.textContent='Saldo Novyra: '+money(config.balance);
  const available=meta.services?.find(s=>s.id===type)?.available!==false,monthly=['pension','ley97'].includes(type),plan=config.shared_access?'imss_73_97':type,access=config.accesses?.find(x=>x.plan===plan&&Date.parse(x.inicio)<=Date.now()&&Date.parse(x.fin)>Date.now());
  price.textContent=(!config.enabled||!available)?'En preparación':config.premium_included?'Incluido en tu Premium':monthly&&access?'Tu acceso está vigente':monthly?'$199 por 30 días':'$89 por uso';
  detail.textContent=(!config.enabled||!available)?'Estamos preparando el acceso. No se realizarán cargos.':config.premium_included?'Puedes calcular sin cargo adicional mientras tu Premium esté activo.':monthly&&access?'Puedes usar '+(config.shared_access?'Ley 73 y Ley 97':'esta calculadora')+' hasta el '+when(access.fin)+'.':monthly?(config.shared_access?'Incluye Ley 73 y Ley 97.':'Acceso para esta calculadora.')+' La vigencia comienza con tu primer cálculo confirmado. Sin renovación automática.':'Se cobra al obtener un resultado. Volver a abrirlo o imprimirlo no tiene costo.';
  for(const b of document.querySelectorAll('.forms [type=submit]'))b.disabled=!config.enabled||meta.services?.find(s=>s.id===b.closest('form').id)?.available===false;
 }
 async function confirm(q){
  if(q.price===0)return true;
  const dialog=document.getElementById('billing-confirm'),monthly=q.price===199;
  document.getElementById('billing-confirm-title').textContent=monthly?'Activar acceso de 30 días':'Confirmar cálculo';
  document.getElementById('billing-confirm-text').textContent=monthly?'Se descontarán '+money(q.price)+' de tu saldo para '+(q.shared_access?'usar Ley 73 y Ley 97':'usar '+names[q.service])+', durante 30 días desde este primer resultado. Sin renovación automática.':'Se descontarán '+money(q.price)+' de tu saldo al obtener este resultado de '+names[q.service]+'.';
  document.getElementById('billing-confirm-balance').textContent='Saldo disponible: '+money(q.balance)+(q.balance<q.price?'. Necesitas recargar para continuar.':'. Saldo después del cobro: '+money(q.balance-q.price)+'.');
  const accept=document.getElementById('billing-accept');accept.disabled=q.balance<q.price;accept.textContent='Confirmar '+money(q.price);
  return new Promise(resolve=>{dialog.returnValue='cancel';dialog.addEventListener('close',()=>resolve(dialog.returnValue==='accept'),{once:true});dialog.showModal();document.getElementById('billing-cancel').focus();});
 }
 async function history(){
  const list=document.getElementById('billing-history-list');
  try{const d=await request(null,'/results');list.replaceChildren();for(const row of d.rows){const wrap=node('div',undefined,'saved-result'),text=node('div');text.append(node('strong',names[row.servicio]||'Cálculo'),node('small',when(row.fecha)+' · Cobro original '+money(row.importe)));const button=node('button','Abrir resultado','button secondary small');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{render(await request(null,'/results/'+row.id));showMessage('Este resultado ya estaba guardado. Abrirlo e imprimirlo no generó un cargo.');}catch(e){showMessage(e.message);}finally{button.disabled=false;}});wrap.append(text,button);list.append(wrap);}if(!d.rows.length)list.append(node('p','Aquí aparecerán tus resultados confirmados.','hint'));}
  catch{list.replaceChildren(node('p','No fue posible cargar tus resultados guardados. Puedes volver a actualizar.','hint'));}
 }
 async function calculate(data){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))),fingerprint=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  let pending=read();
  if(pending?.fingerprint===fingerprint&&pending.usage_id){const restored=await request(null,'/results/'+pending.usage_id);return restored;}
  if(pending?.fingerprint!==fingerprint||!pending?.confirmed){
   const q=await request(data,'/quote');if(!await confirm(q))return null;
   pending={fingerprint,key:crypto.randomUUID(),expected_price:q.price,confirmed:true};save(pending);
  }
  // Conserva la misma clave en errores de red: el servidor recupera el resultado sin un segundo cargo.
  const d=await request({...data,operation:{key:pending.key,expected_price:pending.expected_price}});
  save({...pending,usage_id:d.billing.usage_id});config.balance=d.billing.balance;
  if(d.billing.access_until){config.accesses??=[];config.accesses.unshift({plan:config.shared_access?'imss_73_97':data.type,inicio:new Date().toISOString(),fin:d.billing.access_until});}
  update();void history();return d;
 }
 document.getElementById('billing-history-refresh').addEventListener('click',()=>void history());
 update();void history();return {update,calculate};
}
