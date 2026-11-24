export function addApiNavigation(document,staff){
 if(!staff||(!staff.is_owner&&staff.can_view_api_results!==true)||document.querySelector('[data-api-monitor-link]'))return null;
 const group=document.querySelector('.nv-menu-group .admin-menu-grid');if(!group)return null;
 const link=document.createElement('a');link.href='/admin/api/';link.className='admin-menu-btn';link.dataset.apiMonitorLink='true';link.title='Resultados de API';link.setAttribute('aria-label','Resultados de API');
 const item=document.createElement('span');item.className='nv-menu-item';item.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m8 9-3 3 3 3m8-6 3 3-3 3m-3-7-2 8"/></svg>';
 const text=document.createElement('span');text.className='nv-menu-label';text.textContent='Resultados de API';item.append(text);link.append(item);group.append(link);return link;
}
if(typeof document!=='undefined')void(async()=>{try{addApiNavigation(document,await window.nvPanelReady);}catch{}})();
