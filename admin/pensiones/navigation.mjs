const REVIEWERS=new Set(['CU11NDZ8BlEXELQkh7Hc','Oc7IqPJfZkPZBEjeLqJV']);
export function addPensionNavigation(document,staff){
 if(!staff||staff.service||staff.role==='proveedor'||(!staff.is_owner&&!REVIEWERS.has(staff.uid))||document.querySelector('[data-pension-calculator]'))return null;
 const group=document.querySelector('.nv-menu-group .admin-menu-grid');if(!group)return null;
 const link=document.createElement('a');link.href='/admin/pensiones/';link.className='admin-menu-btn';link.dataset.pensionCalculator='true';link.setAttribute('aria-label','Calculadora de pensiones');
 const item=document.createElement('span');item.className='nv-menu-item';item.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1m3 0h1m3 0h1m-9 4h1m3 0h1m3 0h1m-9 3h1m3 0h1m3 0h1"/></svg>';
 const label=document.createElement('span');label.className='nv-menu-label';label.textContent='Calculadora de pensiones';item.append(label);link.append(item);group.append(link);return link;
}
if(typeof document!=='undefined')void(async()=>{try{addPensionNavigation(document,await window.nvPanelReady);}catch{}})();
