const API='https://api-326bly7kmq-uc.a.run.app/api/v1/public/recharge-bonuses';
const EXPECTED=[[1000,10,100,1100],[2000,10,200,2200],[5000,15,750,5750]];
const money=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(v);
export function validateBonusInfo(info){return !!info&&info.success===true&&info.enabled===true&&info.currency==='MXN'&&info.exact_amounts===true&&info.bonus_on_approval===true&&info.ends_at===null&&Array.isArray(info.rules)&&info.rules.length===3&&EXPECTED.every((values,i)=>values.every((v,n)=>info.rules[i]?.[['amount','percent','bonus','total'][n]]===v));}
export function quoteBonus(info,amount){if(!validateBonusInfo(info)||!Number.isFinite(Number(amount)))return null;return info.rules.find(r=>r.amount===Number(amount))||null;}
export function attachRechargeBonuses(doc,info){
 if(!validateBonusInfo(info))return false;
 const modal=doc.getElementById('modalSaldo'),first=modal?.querySelector('[data-recarga-paso="1"]'),input=doc.getElementById('depMonto');if(!modal||!first||!input)return false;
 let section=doc.getElementById('nv-recarga-bonos');
 if(!section){
  section=doc.createElement('section');section.id='nv-recarga-bonos';section.className='nv-recharge-bonuses';section.setAttribute('aria-label','Bonificaciones en recargas');
  const heading=doc.createElement('h4');heading.textContent='Bonificaciones por recarga';section.append(heading);
  const list=doc.createElement('ul');for(const rule of info.rules){const li=doc.createElement('li'),title=doc.createElement('strong'),detail=doc.createElement('span');title.textContent=money(rule.amount)+' + '+rule.percent+'% de regalo';detail.textContent=money(rule.bonus)+' de bono · Recibes '+money(rule.total);li.append(title,detail);list.append(li);}section.append(list);
  const terms=doc.createElement('p');terms.textContent='Solo aplica a estos tres montos exactos. El bono se agrega una sola vez al aprobar tu recarga.';section.append(terms);
  const accounts=first.querySelector('fieldset');if(accounts)accounts.before(section);else first.append(section);
 }
 let preview=doc.getElementById('nv-recarga-bono-previsto');if(!preview){preview=doc.createElement('p');preview.id='nv-recarga-bono-previsto';preview.className='nv-recharge-bonus-preview';preview.setAttribute('role','status');preview.setAttribute('aria-live','polite');input.after(preview);}
 const update=()=>{const rule=quoteBonus(info,input.value);preview.hidden=!rule;preview.textContent=rule?('Bonificación: '+money(rule.bonus)+' ('+rule.percent+'%). Se acreditarán '+money(rule.total)+' al aprobar tu recarga.'):'';};
 if(!input.dataset.nvBonusListener){input.addEventListener('input',update);input.addEventListener('change',update);input.dataset.nvBonusListener='1';}update();return true;
}
export async function initRechargeBonuses(doc=document,fetchImpl=fetch){
 if(!doc.getElementById('modalSaldo'))return false;
 try{const response=await fetchImpl(API,{headers:{Accept:'application/json'},credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)return false;return attachRechargeBonuses(doc,await response.json());}catch{return false;}
}
if(typeof document!=='undefined'){
 const start=()=>{void initRechargeBonuses();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
