const API='https://api-326bly7kmq-uc.a.run.app',COOLDOWN=30*60*1000,DURATION=15000;
const validId=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function activeAd(ad,now=Date.now()){return validId(ad?.id)&&typeof ad.negocio==='string'&&typeof ad.descripcion==='string'&&/^[1-9][0-9]{9,14}$/.test(ad.whatsapp||'')&&Date.parse(ad.inicio)<=now&&now<Date.parse(ad.fin)&&ad.imagen==='/api/v1/public/ads/'+ad.id+'/image';}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
async function start(){
 const help=document.querySelector('.nv-account-rail .nv-help-button'),main=document.querySelector('main');if(!help||!main||document.querySelector('.nv-ads-slot'))return;
 const section=node('aside',undefined,'nv-ads-slot');section.setAttribute('aria-label','Publicidad y servicios en Novyra');
 const notice=node('div',undefined,'nv-ads-notification');notice.hidden=true;notice.setAttribute('role','status');
 const invite=node('a',undefined,'nv-ads-invite');invite.href='https://novyraservices.org/ads';invite.target='_blank';invite.rel='noopener noreferrer';invite.setAttribute('aria-label','¡Publícate aquí! Conoce la publicidad en Novyra, abre otra pestaña');
 const title=node('span','¡Publícate aquí!');title.append(node('span','↗'));invite.append(title,node('small','Contadores, gestorías de pensión, financieras y más.'),node('small','15 días · $500  /  30 días · $800','nv-ads-prices'));section.append(notice,invite);
 const desktop=matchMedia('(min-width: 1001px)');function place(){if(desktop.matches)help.after(section);else main.after(section);}place();desktop.addEventListener('change',place);
 let current=null,version=0,dispose=()=>{},lastSummary=0,inFlight=false;
 async function summary(){const user=current,stamp=version;if(!user||document.hidden||Date.now()-lastSummary<90000)return;lastSummary=Date.now();try{const r=await fetch(API+'/api/v1/dashboard/ads/summary',{cache:'no-store',headers:{Authorization:'Bearer '+await user.getIdToken()},signal:AbortSignal.timeout(15000)});const data=await r.json();if(stamp!==version||!r.ok||!data.success)return;notice.replaceChildren();const rows=data.aprobados||[];notice.hidden=!rows.length;if(rows.length){notice.append(node('strong',rows.length===1?'Tu anuncio fue aprobado':'Tienes anuncios aprobados'),node('span','Confirma el pago con tu saldo para comenzar la publicación.'));const link=node('a','Revisar y pagar →');link.href='/ads/#mis-anuncios';notice.append(link);}}catch{}}
 async function tryShow(){
  if(inFlight||document.hidden||!('IntersectionObserver'in window))return;const stamp=version,viewer=current?.uid||'visitante',key='nv-paid-ads:'+viewer;
  try{const last=Number(localStorage.getItem(key)),attempt=Number(sessionStorage.getItem(key+':attempt'));if((last&&Date.now()-last<COOLDOWN)||(attempt&&Date.now()-attempt<COOLDOWN))return;sessionStorage.setItem(key+':attempt',String(Date.now()));}catch{return;}
  if(Math.random()>=.65)return;inFlight=true;
  try{const r=await fetch(API+'/api/v1/public/ads',{cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await r.json();if(stamp!==version||!r.ok||!data.success)return;const ads=(data.anuncios||[]).filter(x=>activeAd(x));if(!ads.length)return;const ad=ads[Math.floor(Math.random()*ads.length)];dispose();dispose=show(ad,key,stamp);}catch{}finally{inFlight=false;}
 }
 function show(ad,key,stamp){
  const card=node('article',undefined,'nv-paid-promotion');card.hidden=true;card.setAttribute('aria-label','Anuncio de '+ad.negocio);const header=node('div',undefined,'nv-paid-header'),close=node('button','×');close.type='button';close.setAttribute('aria-label','Cerrar este anuncio');header.append(node('span','PUBLICIDAD'),close);
  const link=node('a');link.href='https://wa.me/'+ad.whatsapp;link.target='_blank';link.rel='noopener noreferrer sponsored';link.setAttribute('aria-label','Contactar a '+ad.negocio+' por WhatsApp, abre otra pestaña');const image=node('img');image.alt='Publicidad de '+ad.negocio;image.decoding='async';link.append(image,node('strong',ad.negocio),node('p',ad.descripcion),node('span','Consultar por WhatsApp ↗','nv-paid-cta'));card.append(header,link);section.insertBefore(card,invite);
  let stopped=false,visible=false,ready=false,hovered=false,remaining=DURATION,startedAt=0,timer,expiry;
  function dismiss(){if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(expiry);observer.disconnect();card.remove();document.removeEventListener('visibilitychange',update);window.removeEventListener('storage',otherTab);}
  function update(){clearTimeout(timer);if(startedAt){remaining-=Math.max(0,Date.now()-startedAt);startedAt=0;}if(stopped)return;if(stamp!==version||!activeAd(ad)||remaining<=0){dismiss();return;}if(ready&&visible&&!document.hidden&&!hovered&&!card.contains(document.activeElement)){try{const previous=Number(localStorage.getItem(key));if(!card.dataset.counted){if(previous&&Date.now()-previous<COOLDOWN){dismiss();return;}localStorage.setItem(key,String(Date.now()));card.dataset.counted='true';}}catch{dismiss();return;}startedAt=Date.now();timer=setTimeout(dismiss,remaining);}}
  function otherTab(e){if(e.key===key&&e.newValue&&!card.dataset.counted)dismiss();}
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.intersectionRatio>=.5;update();},{threshold:[0,.5]});
  close.addEventListener('click',dismiss);card.addEventListener('mouseenter',()=>{hovered=true;update();});card.addEventListener('mouseleave',()=>{hovered=false;update();});card.addEventListener('focusin',update);card.addEventListener('focusout',()=>queueMicrotask(update));document.addEventListener('visibilitychange',update);window.addEventListener('storage',otherTab);
  image.addEventListener('error',dismiss,{once:true});image.addEventListener('load',()=>{if(!activeAd(ad)||stamp!==version){dismiss();return;}ready=true;card.hidden=false;observer.observe(card);},{once:true});expiry=setTimeout(dismiss,Math.max(0,Date.parse(ad.fin)-Date.now()));image.src=API+ad.imagen;return dismiss;
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){summary();tryShow();}});setInterval(()=>{if(!document.hidden){summary();tryShow();}},120000);
 if(document.body.dataset.nvDemo==='false'){
  try{const [{auth},{onAuthStateChanged}]=await Promise.all([import('./ads/firebase.mjs'),import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js')]);onAuthStateChanged(auth,user=>{current=user;version++;lastSummary=0;notice.hidden=true;notice.replaceChildren();dispose();if(user){summary();tryShow();}});}catch{}
 }else tryShow();
}
if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
