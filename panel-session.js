(() => {
  const base = 'https://api-326bly7kmq-uc.a.run.app';
  sessionStorage.removeItem('dpr_admin_token');
  async function call(path, body) {
    const response=await fetch(base+'/api/v1/admin/panel/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(sessionStorage.getItem('dpr_staff_token')||'')},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'No se pudo verificar el acceso.');return data;
  }
  async function privatePassword() {
    return new Promise(resolve => {
      const overlay=document.createElement('div');overlay.id='nvPrivatePassword';
      overlay.innerHTML='<form class="nv-private-form"><div class="nv-private-brand">N</div><h1>Protege tu cuenta propietaria</h1><p>Tu acceso completo se activará después de crear una contraseña nueva. Escríbela aquí de forma privada.</p><label>Contraseña nueva<input name="password" type="password" minlength="14" maxlength="200" autocomplete="new-password" required></label><label>Confirma tu contraseña<input name="confirm" type="password" minlength="14" maxlength="200" autocomplete="new-password" required></label><small>Usa al menos 14 caracteres y una contraseña que no utilices en otra cuenta.</small><p role="alert" class="nv-private-error"></p><button type="submit">Guardar y entrar</button></form>';
      document.body.append(overlay);document.body.classList.add('nv-password-setup');document.body.style.display='block';
      const form=overlay.querySelector('form');form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button'),error=form.querySelector('[role="alert"]');const password=form.elements.password.value;error.textContent='';if(password!==form.elements.confirm.value){error.textContent='Las contraseñas no coinciden.';return;}button.disabled=true;try{const result=await call('owner-password',{password});sessionStorage.setItem('dpr_staff_token',result.token);form.reset();overlay.remove();document.body.classList.remove('nv-password-setup');resolve(result.staff);}catch(e){error.textContent=e.message;button.disabled=false;}});
    });
  }
  window.nvPanelReady=(async()=>{
    try{
      if(!sessionStorage.getItem('dpr_staff_token'))throw new Error('Inicia sesión de nuevo.');
      let {staff}=await call('session');if(staff.must_change_password)staff=await privatePassword();
      localStorage.setItem('staffSession',JSON.stringify(staff));window.nvPanelVerified=Object.freeze(staff);
      document.body.classList.toggle('nv-owner',staff.is_owner===true);document.body.classList.toggle('nv-collaborator',staff.is_owner!==true);
      return staff;
    }catch(e){sessionStorage.removeItem('dpr_staff_token');localStorage.removeItem('staffSession');location.replace(new URL('staff-login.html',document.querySelector('script[src*="panel-session.js"]').src).href);throw e;}
  })();
})();
