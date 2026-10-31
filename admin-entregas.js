(() => {
  'use strict';
  const labels={auto:{label:'Automático',className:'nv-delivery-auto'},manual:{label:'Manual',className:'nv-delivery-manual'},unknown:{label:'Sin identificar',className:'nv-delivery-unknown'},none:{label:'',className:''}};
  function time(value){if(value?.seconds||value?._seconds)return Number(value.seconds||value._seconds)*1000;const t=new Date(value||'').getTime();return Number.isFinite(t)?t:0;}
  function info(row={}){
    const raw=row.raw_data&&typeof row.raw_data==='object'?row.raw_data:{};
    const value=key=>row[key]??raw[key];
    const file=row.archivoFinal||row.archivo_final||raw.archivoFinal||raw.archivo_final||'';
    if(typeof file!=='string'||!/^https?:\/\//i.test(file))return labels.none;
    const explicit=value('documento_origen')||value('archivo_origen');
    if(['automatico','automático','n8n','auto'].includes(explicit))return labels.auto;
    if(explicit==='manual')return labels.manual;
    const auto=value('n8n_documento_subido')===true||value('n8n_cloudinary_import')===true;
    const manual=Boolean(value('terminado_por_uid'));
    // Request channel (e.g. Dashboard) and status are not upload provenance.
    // A later manual status edit is not proof that a file was uploaded manually.
    if(auto&&manual){const a=time(value('n8n_fecha_documento')),m=time(value('fecha_finalizado')||value('fecha_terminado'));return a&&m&&a>=m?labels.auto:labels.unknown;}
    if(auto)return labels.auto;
    if(manual)return labels.manual;
    return labels.unknown;
  }
  function badge(row){const mode=info(row);return mode.label?'<span class="nv-delivery-badge '+mode.className+'">'+mode.label+'</span>':'';}
  function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value??'';if(cls)el.className=cls;return el;}
  function render(host,rows,options={}){
    host.replaceChildren();
    if(!rows.length){host.append(text('p','Sin solicitudes en esta página.','nv-attention-empty'));return;}
    const table=document.createElement('table');table.className='nv-compact-requests';table.setAttribute('aria-label','Solicitudes en vista compacta');
    const head=document.createElement('thead'),header=document.createElement('tr');for(const label of ['Trámite','Información','Control']){const th=text('th',label);th.scope='col';header.append(th);}head.append(header);
    const body=document.createElement('tbody');
    for(const row of rows){
      const delivery=info(row),tr=document.createElement('tr');tr.className=delivery.className;
      if(options.hasError?.(row))tr.classList.add('nv-request-error');
      const service=document.createElement('td');service.append(text('strong',row.tipo||'Solicitud','nv-compact-title'));
      const date=options.date?.(row.fecha||row.fechaSolicitud||row.fecha_creacion);
      if(date)service.append(text('time',date.toLocaleString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),'nv-compact-date'));
      service.append(text('span',row.origen||'Portal','nv-compact-origin'),text('span',row.estatus||'En proceso','nv-compact-status'));
      if(delivery.label)service.append(text('span',delivery.label,'nv-delivery-badge '+delivery.className));
      const details=document.createElement('td');details.append(text('p',row.email||row.nombre_asesor||'Cliente','nv-compact-customer'));
      const extra=options.extra?.(row)||{};
      for(const [label,value] of [['CURP',row.curp||extra.curp],['NSS',row.nss||extra.nss]])if(value&&value!=='N/A')details.append(text('p',label+': '+value,'nv-compact-id'));
      const actions=document.createElement('td'),group=document.createElement('div');group.className='nv-compact-actions';
      const action=(label,fn,primary=false,disabled=false)=>{const b=text('button',label,primary?'nv-compact-primary':'');b.type='button';b.disabled=disabled;b.addEventListener('click',fn);group.append(b);};
      action('Ver datos',()=>window.verDetalles(row));
      if(!row.finalizado){
        const locked=Boolean(options.locked?.(row)),mine=Boolean(options.mine?.(row));
        if(locked){group.append(text('small',row.tomado_nombre||'Tomada','nv-compact-lock'));if(mine||options.owner)action('Liberar',()=>window.liberarSolicitud(row.id));else group.append(text('small','Bloqueada','nv-compact-lock'));}
        else action('Tomar',()=>window.tomarSolicitud(row.id));
        action('Subir',()=>window.abrirSubida(row.id),true,options.canOperate?!options.canOperate(row):false);
      }
      actions.append(group);tr.append(service,details,actions);body.append(tr);
    }
    table.append(head,body);host.append(table);
  }
  window.nvDelivery={info,badge,render};
})();
