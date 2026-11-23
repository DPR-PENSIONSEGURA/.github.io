// Presentation only. Keep the original observations and individual admin controls.
export const categoryGroups=[
  {id:'IMSS',name:'IMSS',sources:['IMSS']},
  {id:'INF',name:'Infonavit',sources:['INF']},
  {id:'SAT',name:'SAT',sources:['SAT']},
  {id:'ACTAS',name:'Actas',sources:['ACTAS','ACTAS_FOLIO']},
  {id:'AFORE',name:'AFORE',sources:['AFORE','CITAS_AFORE']},
  {id:'DOC',name:'Documentos',sources:['DOC']},
  {id:'PENSIONES',name:'Pensiones',sources:['PENSIONES']}
];
export const categoryLabels=Object.fromEntries(categoryGroups.map(g=>[g.id,g.name]));
export function categoryState(items){
  if(!items.length)return 'unknown';
  const active=items.filter(s=>s.state!=='paused');
  if(!active.length)return 'paused';
  if(active.every(s=>s.state==='down'))return 'down';
  if(active.some(s=>s.state==='slow'||s.state==='down'))return 'slow';
  if(active.some(s=>s.state==='ok'))return 'ok';
  return 'unknown';
}
function coverage(items){return {has_unknown:items.some(s=>s.state==='unknown'),has_paused:items.some(s=>s.state==='paused')};}
export function groupStatus(snapshot){
  const groups=[...categoryGroups],known=new Set(groups.flatMap(g=>g.sources));
  for(const key of new Set(snapshot.services.map(s=>s.category)))if(!known.has(key))groups.push({id:key,name:key,sources:[key]});
  const history=new Map(snapshot.history.map(h=>[h.day+'|'+h.service_id,h])),services=[],days=[];
  for(const group of groups){
    const members=snapshot.services.filter(s=>group.sources.includes(s.category));if(!members.length)continue;
    const id='category-'+group.id,state=categoryState(members),counts=coverage(members),notices=[];
    for(const s of members)if(s.notice&&!notices.some(n=>n.message===s.notice.message&&n.expires_at===s.notice.expires_at))notices.push({message:s.notice.message,expires_at:s.notice.expires_at});
    services.push({id,name:group.name,category:group.id,state,reason:'category_'+state,...counts,notices});
    for(const day of snapshot.days){
      const rows=members.map(s=>history.get(day+'|'+s.id)).filter(Boolean);if(!rows.length)continue;
      const states=members.map(s=>({state:history.get(day+'|'+s.id)?.worst_state||'unknown'}));
      const cov=coverage(states);
      days.push({day,service_id:id,worst_state:categoryState(states),issue_mask:rows.reduce((mask,r)=>mask|r.issue_mask,0),samples:Math.max(...rows.map(r=>r.samples)),known_samples:Math.max(...rows.map(r=>r.known_samples)),first_at:Math.min(...rows.map(r=>r.first_at)),last_at:Math.max(...rows.map(r=>r.last_at)),partial:cov.has_unknown||rows.length<members.length});
    }
  }
  return {...snapshot,services,history:days};
}
