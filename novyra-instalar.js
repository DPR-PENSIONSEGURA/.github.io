(() => {
  'use strict';
  // Installation only: no service worker, private cache, sessions, requests,
  // uploads or financial operations are changed by this module.
  let pendingPrompt = null;
  let installing = false;
  const standalone = matchMedia('(display-mode: standalone)');
  let installed = standalone.matches || navigator.standalone === true;
  const buttons = [];
  let dialog, note, confirmButton;
  function refresh() {
    buttons.forEach(button => { button.hidden = installed; button.disabled = installing; });
    if (confirmButton) { confirmButton.hidden = !pendingPrompt; confirmButton.disabled = installing; }
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); pendingPrompt = event; refresh();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; pendingPrompt = null; refresh(); if(dialog?.open) dialog.close();
  });
  standalone.addEventListener?.('change', event => {
    installed = event.matches || navigator.standalone === true; refresh();
  });
  async function install() {
    if(!pendingPrompt || installing) return;
    const prompt = pendingPrompt; pendingPrompt = null; installing = true; refresh();
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      // Acceptance alone does not prove installation; appinstalled does.
      note.textContent = result.outcome === 'accepted'
        ? 'Confirma la instalación en el navegador. Puedes abrir Novyra desde su icono cuando termine.'
        : 'No se instaló la aplicación. Puedes seguir usando Novyra desde esta página.';
    } catch {
      note.textContent = 'No se pudo abrir la instalación. En Chrome para Android abre el menú ⋮ y busca «Instalar aplicación» o «Agregar a la pantalla principal».';
    } finally { installing = false; refresh(); }
  }
  function init() {
    const nav = document.querySelector('.sidebar-premium nav');
    if(!nav) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'side-link nv-install-trigger'; button.textContent = 'Instalar Novyra';
    button.addEventListener('click', () => {
      document.body.classList.remove('nv-menu-open');
      const backdrop = document.querySelector('.nv-menu-backdrop'); if(backdrop) backdrop.hidden = true;
      document.querySelector('[aria-controls="nvSideMenu"]')?.setAttribute('aria-expanded', 'false');
      if(pendingPrompt) { dialog.showModal(); install(); } else dialog.showModal();
    });
    nav.insertBefore(button, nav.children[2] || null); buttons.push(button);
    dialog = document.createElement('dialog'); dialog.className = 'nv-install-dialog'; dialog.setAttribute('aria-labelledby', 'nvInstallTitle');
    const close = document.createElement('button'); close.type = 'button'; close.className = 'nv-install-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar instalación'); close.addEventListener('click', () => {dialog.close(); button.focus();});
    const icon = document.createElement('img'); icon.src = '/icons/novyra-192.png'; icon.alt = ''; icon.width = 64; icon.height = 64; icon.className = 'nv-install-logo';
    const title = document.createElement('h2'); title.id = 'nvInstallTitle'; title.textContent = 'Novyra en tu celular';
    const text = document.createElement('p'); text.textContent = 'Abre Novyra desde su icono, con tu misma cuenta y tus mismos servicios. Necesitas conexión a internet para usar el panel.';
    note = document.createElement('p'); note.className = 'nv-install-note'; note.setAttribute('role','status'); note.setAttribute('aria-live','polite');
    note.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent)
      ? 'En tu navegador abre Compartir → Agregar a la pantalla de inicio.'
      : 'En Chrome para Android abre el menú ⋮ → Instalar aplicación o Agregar a la pantalla principal. Si estás dentro de WhatsApp o Facebook, abre primero esta página en Chrome.';
    confirmButton = document.createElement('button'); confirmButton.type = 'button'; confirmButton.className = 'nv-install-confirm'; confirmButton.textContent = 'Instalar aplicación'; confirmButton.addEventListener('click', install);
    dialog.append(close,icon,title,text,note,confirmButton); document.body.append(dialog); refresh();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
