import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const campaign = Object.freeze({
  id: 'peso-ganador-50000-20261105',
  alwaysVisibleUserId: '2JTQdNW5o3e5sPKYWnYeGtNbcYQ2',
  destination: 'https://www.pesoganador.com/',
  image: 'images/publicidad/peso-ganador-banner-20261105.png',
  startsAt: '2026-11-05T06:56:32Z',
  endsAt: '2026-11-07T06:56:32Z',
  probability: 0.35,
  durationMs: 10000,
  cooldownMs: 24 * 60 * 60 * 1000
});

let disposeBanner = () => {};

function campaignIsActive() {
  const now = Date.now();
  return now >= Date.parse(campaign.startsAt) && now < Date.parse(campaign.endsAt);
}

function scheduleBanner(userId) {
  if (!campaignIsActive()) return () => {};
  const alwaysVisible = userId === campaign.alwaysVisibleUserId;
  const sidebar = document.querySelector('.sidebar-premium nav');
  const main = document.querySelector('main');
  if (!sidebar || !main || !('IntersectionObserver' in window)) return () => {};

  const storageKey = `nv-promotion:${campaign.id}:${userId}`;
  const sessionKey = `${storageKey}:attempted`;
  function shownRecently() {
    try {
      const stamp = Number(localStorage.getItem(storageKey));
      return Number.isFinite(stamp) && stamp > 0 && Date.now() - stamp < campaign.cooldownMs;
    } catch {
      return true;
    }
  }

  if (!alwaysVisible) {
    try {
      if (sessionStorage.getItem(sessionKey) || shownRecently()) return () => {};
      sessionStorage.setItem(sessionKey, '1');
    } catch {
      return () => {};
    }
    if (Math.random() >= campaign.probability) return () => {};
  }

  const card = document.createElement('aside');
  card.className = 'nv-promotion';
  card.setAttribute('aria-label', 'Publicidad de El Peso Ganador');
  card.hidden = true;

  const header = document.createElement('div');
  header.className = 'nv-promotion-header';
  const label = document.createElement('p');
  label.className = 'nv-promotion-label';
  label.textContent = 'Publicidad';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nv-promotion-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Cerrar publicidad');
  header.append(label, close);

  const link = document.createElement('a');
  link.className = 'nv-promotion-link';
  link.href = campaign.destination;
  link.target = '_blank';
  link.rel = 'noopener noreferrer sponsored';
  link.setAttribute('aria-label', 'Ver El Peso Ganador en pesoganador.com, se abre en otra pestaña');
  const image = document.createElement('img');
  image.className = 'nv-promotion-image';
  image.width = 600;
  image.height = 600;
  image.decoding = 'async';
  image.alt = 'El Peso Ganador. Premio mayor de $50,000 y 4 bonos de $2,500 cada uno.';
  const cta = document.createElement('p');
  cta.className = 'nv-promotion-cta';
  const caption = document.createElement('span');
  caption.textContent = 'Ver en pesoganador.com';
  const arrow = document.createElement('span');
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  cta.append(caption, arrow);
  link.append(image, cta);
  card.append(header, link);

  const desktop = matchMedia('(min-width: 901px)');
  let timer = null;
  let expiryTimer = null;
  let remaining = campaign.durationMs;
  let runningSince = null;
  let inView = false;
  let imageReady = false;
  let claimed = false;
  let finished = false;
  let hovered = false;

  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (runningSince !== null) remaining -= Date.now() - runningSince;
    runningSince = null;
  }

  function dismiss() {
    if (finished) return;
    finished = true;
    stopTimer();
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = null;
    observer.disconnect();
    desktop.removeEventListener('change', place);
    document.removeEventListener('visibilitychange', updateTimer);
    window.removeEventListener('storage', otherTabShown);
    card.remove();
  }

  function updateTimer() {
    stopTimer();
    if (!campaignIsActive()) { dismiss(); return; }
    if (finished || !imageReady || !inView || document.hidden) return;
    if (alwaysVisible) return;
    if (!claimed) {
      if (shownRecently()) { dismiss(); return; }
      try { localStorage.setItem(storageKey, String(Date.now())); }
      catch { dismiss(); return; }
      claimed = true;
    }
    if (hovered || card.contains(document.activeElement)) return;
    if (remaining <= 0) { dismiss(); return; }
    runningSince = Date.now();
    timer = setTimeout(dismiss, remaining);
  }

  function place() {
    if (!campaignIsActive()) { dismiss(); return; }
    if (desktop.matches) sidebar.after(card);
    else main.after(card);
  }

  function otherTabShown(event) {
    if (!alwaysVisible && event.key === storageKey && event.newValue) dismiss();
  }

  const observer = new IntersectionObserver(entries => {
    inView = entries[0]?.isIntersecting === true && entries[0].intersectionRatio >= 0.5;
    updateTimer();
  }, { threshold: [0, 0.5] });

  close.addEventListener('click', dismiss);
  card.addEventListener('mouseenter', () => { hovered = true; updateTimer(); });
  card.addEventListener('mouseleave', () => { hovered = false; updateTimer(); });
  card.addEventListener('focusin', updateTimer);
  card.addEventListener('focusout', () => queueMicrotask(updateTimer));
  document.addEventListener('visibilitychange', updateTimer);
  window.addEventListener('storage', otherTabShown);
  desktop.addEventListener('change', place);
  image.addEventListener('error', dismiss, { once: true });
  image.addEventListener('load', () => {
    if (!campaignIsActive()) { dismiss(); return; }
    imageReady = true;
    card.hidden = false;
    observer.observe(card);
  }, { once: true });
  expiryTimer = setTimeout(dismiss, Math.max(0, Date.parse(campaign.endsAt) - Date.now()));
  place();
  image.src = campaign.image;
  return dismiss;
}

function start() {
  if (document.body?.dataset.nvDemo !== 'false') return;
  onAuthStateChanged(getAuth(), user => {
    disposeBanner();
    disposeBanner = user?.uid ? scheduleBanner(user.uid) : () => {};
  });
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
