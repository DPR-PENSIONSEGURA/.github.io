(() => {
  'use strict';
  const root = document.documentElement;
  let theme = 'light';
  try { theme = localStorage.getItem('nv-appearance') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch {}
  function setTheme(value, save = false) {
    theme = value === 'dark' ? 'dark' : 'light';
    root.dataset.nvTheme = theme;
    document.querySelectorAll('[data-nv-theme-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.nvThemeChoice === theme)));
    if (save) try { localStorage.setItem('nv-appearance', theme); } catch {}
  }
  setTheme(theme);
  document.addEventListener('DOMContentLoaded', () => {
    const demo = document.body.dataset.nvDemo === 'true';
    const menu = document.querySelector('.sidebar-premium');
    const main = document.querySelector('main');
    if (!menu || !main) return;
    const nav = menu.querySelector('nav');
    const profileButton = document.createElement('button');
    profileButton.type = 'button'; profileButton.className = 'side-link'; profileButton.textContent = 'Perfil';
    profileButton.addEventListener('click', () => {
      closeMenu();
      if (demo) { location.assign('login.html'); return; }
      document.getElementById('nvProfileDialog').showModal();
    });
    nav.insertBefore(profileButton, nav.children[1]);
    const appearance = document.createElement('div'); appearance.className = 'nv-appearance';
    const appearanceLabel = document.createElement('p'); appearanceLabel.textContent = 'Apariencia'; appearance.append(appearanceLabel);
    for (const [value, label] of [['light', '☀ Claro'], ['dark', '☾ Oscuro']]) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.nvThemeChoice = value;
      button.textContent = label; button.addEventListener('click', () => setTheme(value, true)); appearance.append(button);
    }
    nav.after(appearance);
    menu.id = 'nvSideMenu';
    const menuButton = document.createElement('button'); menuButton.type = 'button'; menuButton.className = 'nv-menu-toggle';
    menuButton.textContent = '☰ Menú'; menuButton.setAttribute('aria-controls', menu.id); menuButton.setAttribute('aria-expanded', 'false');
    const backdrop = document.createElement('button'); backdrop.type = 'button'; backdrop.className = 'nv-menu-backdrop'; backdrop.hidden = true;
    backdrop.setAttribute('aria-label', 'Cerrar menú'); document.body.append(backdrop);
    const menuClose = document.createElement('button'); menuClose.type = 'button'; menuClose.className = 'nv-menu-close'; menuClose.textContent = '×'; menuClose.setAttribute('aria-label', 'Cerrar menú'); menu.prepend(menuClose);
    const header = document.querySelector('header > div'); header.prepend(menuButton);
    function closeMenu() { document.body.classList.remove('nv-menu-open'); backdrop.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
    function closeAndFocus() { closeMenu(); menuButton.focus(); }
    menuButton.addEventListener('click', () => { const open = !document.body.classList.contains('nv-menu-open'); document.body.classList.toggle('nv-menu-open', open); backdrop.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); if(open) menuClose.focus(); });
    backdrop.addEventListener('click', closeAndFocus); menuClose.addEventListener('click', closeAndFocus);
    menu.addEventListener('click', event => { if(event.target.closest('nav button,nav a')) closeMenu(); });
    document.addEventListener('keydown', event => { if(event.key === 'Escape' && document.body.classList.contains('nv-menu-open')) closeAndFocus(); });

    // Retain the existing service/history nodes and their handlers, IDs and payloads.
    const content = document.createElement('div'); content.className = 'nv-main-content';
    while(main.firstChild) content.append(main.firstChild);
    const welcome = document.createElement('section'); welcome.className = 'nv-welcome';
    const avatar = document.createElement('span'); avatar.className = 'nv-profile-avatar'; avatar.textContent = 'N'; avatar.setAttribute('aria-hidden', 'true');
    const welcomeText = document.createElement('div'); const title = document.createElement('h1'); title.id = 'nvGreeting'; title.textContent = demo ? 'Conoce tu próximo panel' : 'Hola, bienvenido';
    const subtitle = document.createElement('p'); subtitle.textContent = demo ? 'Explora nuestros servicios. Inicia sesión para enviar una solicitud.' : 'Tus trámites, documentos y seguimiento en un solo lugar.';
    const editProfile = document.createElement('button'); editProfile.type = 'button'; editProfile.className = 'nv-profile-edit'; editProfile.textContent = demo ? 'Iniciar sesión' : 'Editar mi perfil'; editProfile.addEventListener('click', () => profileButton.click());
    welcomeText.append(title, subtitle, editProfile); welcome.append(avatar, welcomeText);
    const rail = document.createElement('aside'); rail.className = 'nv-account-rail'; rail.setAttribute('aria-label', 'Mi cuenta y paquetes');
    const account = document.createElement('section'); account.className = 'nv-account-card';
    const balance = document.querySelector('.balance-pill'); if(balance) account.append(balance);
    const banks = document.createElement('div'); banks.className = 'nv-bank-links';
    for (const [code,label] of [['banorte','Banorte'],['mercado_pago','Mercado Pago']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => { if(demo) location.assign('login.html'); else window.abrirCuentaNovyra?.(code); }); banks.append(button);
    }
    account.append(banks);
    const recargar = document.createElement('button'); recargar.type = 'button'; recargar.className = 'nv-gradient-action'; recargar.textContent = demo ? 'Entrar a mi cuenta' : 'Recargar saldo'; recargar.addEventListener('click', () => window.abrirModal('modalSaldo')); account.append(recargar);
    const packageCard = document.createElement('section'); packageCard.className = 'nv-package-highlight';
    const packageTitle = document.createElement('h2'); packageTitle.textContent = 'Más trámites. Más posibilidades.';
    const packageText = document.createElement('p'); packageText.textContent = 'Paquetes para trabajar con mayor volumen.';
    const packagePrice = document.createElement('strong'); packagePrice.textContent = '60 actas · $600';
    const expiry = document.createElement('p'); expiry.className = 'nv-package-expiry'; expiry.textContent = '30 días de vigencia';
    const packages = document.createElement('button'); packages.type = 'button'; packages.textContent = 'Conocer paquetes'; packages.addEventListener('click', () => window.abrirModal('modalPremium'));
    packageCard.append(packageTitle, packageText, packagePrice, expiry, packages);
    const help = document.createElement('button'); help.type = 'button'; help.className = 'nv-help-button'; help.textContent = '¿Necesitas ayuda?'; help.addEventListener('click', () => window.toggleChat());
    rail.append(account, packageCard, help); main.append(welcome, content, rail); main.classList.add('nv-dashboard-layout');
    window.nvSetProfileName = value => {
      const name = typeof value === 'string' ? value.trim() : '';
      if(!demo) { title.textContent = name ? 'Hola, ' + name : 'Hola, bienvenido'; avatar.textContent = name ? name.split(/\s+/).slice(0,2).map(n => [...n][0]).join('').toUpperCase() : 'N'; }
      const input = document.getElementById('nvProfileName'); if(input && document.activeElement !== input) input.value = name;
    };
    if(window.nvPendingProfileName) window.nvSetProfileName(window.nvPendingProfileName);
    const form = document.getElementById('nvProfileForm');
    if(form) form.addEventListener('submit', async event => {
      event.preventDefault(); const submit = form.querySelector('[type="submit"]'); const status = document.getElementById('nvProfileStatus'); submit.disabled = true; status.textContent = 'Guardando…';
      try { if(!window.guardarPerfilNovyra) throw Error('Espera a que termine de iniciar tu sesión.'); const name = await window.guardarPerfilNovyra(document.getElementById('nvProfileName').value); window.nvSetProfileName(name); status.textContent = 'Tu nombre se guardó correctamente.'; }
      catch(error) { status.textContent = error.message || 'No se pudo guardar. Intenta de nuevo.'; }
      finally { submit.disabled = false; }
    });
    document.querySelectorAll('[data-nv-profile-close]').forEach(button => button.addEventListener('click', () => document.getElementById('nvProfileDialog').close()));
    setTheme(theme);
  });
})();
