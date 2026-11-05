'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../novyra-publicidad.mjs'), 'utf8')
  .replace(/^import[^\n]+;\r?\n/, '');

function fixture({ random = 0, desktop = true, local = new Map(), session = new Map(), storageFails = false,
  now: initialNow = Date.parse('2026-11-05T18:00:00Z') } = {}) {
  let now = initialNow;
  let authChanged;
  let intersection;
  const timers = new Map();
  let timerId = 0;
  const events = target => Object.assign(target, {
    listeners: new Map(),
    addEventListener(name, fn) {
      const listeners = this.listeners.get(name) || [];
      listeners.push(fn);
      this.listeners.set(name, listeners);
    },
    removeEventListener(name, fn) {
      this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== fn));
    },
    emit(name, arg = {}) {
      for (const fn of this.listeners.get(name) || []) fn(arg);
    }
  });
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = {};
      this.parentNode = null;
      events(this);
    }
    append(...elements) {
      for (const element of elements) {
        element.remove();
        element.parentNode = this;
        this.children.push(element);
      }
    }
    after(element) {
      element.remove();
      element.parentNode = this.parentNode;
      const index = this.parentNode.children.indexOf(this);
      this.parentNode.children.splice(index + 1, 0, element);
    }
    remove() {
      if (this.parentNode) {
        const siblings = this.parentNode.children;
        siblings.splice(siblings.indexOf(this), 1);
      }
      this.parentNode = null;
    }
    contains(element) {
      return this === element || this.children.some(child => child.contains(element));
    }
    setAttribute(key, value) { this.attributes[key] = value; }
  }
  const sidebar = new Element('aside');
  const nav = new Element('nav');
  sidebar.append(nav);
  const page = new Element('div');
  const main = new Element('main');
  page.append(main);
  const created = [];
  const document = events({
    readyState: 'complete', hidden: false, activeElement: null,
    body: { dataset: { nvDemo: 'false' } },
    querySelector: selector => selector === 'main' ? main : nav,
    createElement(tag) {
      const element = new Element(tag);
      created.push(element);
      return element;
    }
  });
  const media = events({ matches: desktop });
  const window = events({});
  class Observer {
    constructor(callback) { intersection = callback; this.disconnected = false; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  window.IntersectionObserver = Observer;
  const storage = map => ({
    getItem(key) {
      if (storageFails) throw Error('Storage unavailable');
      return map.get(key) || null;
    },
    setItem(key, value) {
      if (storageFails) throw Error('Storage unavailable');
      map.set(key, value);
    }
  });
  const context = {
    window, document, IntersectionObserver: Observer,
    localStorage: storage(local), sessionStorage: storage(session),
    matchMedia: () => media, Math: { random: () => random, max: Math.max },
    Date: { now: () => now, parse: Date.parse }, queueMicrotask: fn => fn(),
    getAuth: () => ({}), onAuthStateChanged: (_, callback) => { authChanged = callback; },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(source, context);
  const find = className => created.find(element => element.className === className);
  return {
    document, media, sidebar, page, main, local,
    login: uid => authChanged(uid ? { uid } : null),
    find,
    setNow(value) { now = value; },
    load() { find('nv-promotion-image').emit('load'); },
    show(ratio = 1) { intersection([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    }
  };
}

{
  const test = fixture();
  test.login(null);
  assert.equal(test.find('nv-promotion'), undefined);
}
{
  const test = fixture({ random: 0.8 });
  test.login('user-a');
  assert.equal(test.find('nv-promotion'), undefined);
}
{
  const test = fixture();
  test.login('user-a');
  const card = test.find('nv-promotion');
  assert.equal(card.parentNode, test.sidebar);
  assert.equal(card.hidden, true);
  test.load();
  assert.equal(test.local.size, 0);
  test.show(0.2);
  test.advance(20000);
  assert(card.parentNode);
  assert.equal(test.local.size, 0);
  test.show();
  assert.equal(test.local.size, 1);
  test.advance(4000);
  test.document.hidden = true;
  test.document.emit('visibilitychange');
  test.advance(30000);
  assert(card.parentNode);
  test.document.hidden = false;
  test.document.emit('visibilitychange');
  test.advance(5999);
  assert(card.parentNode);
  test.advance(1);
  assert.equal(card.parentNode, null);
  const nextVisit = fixture({ local: test.local });
  nextVisit.login('user-a');
  assert.equal(nextVisit.find('nv-promotion'), undefined);
  nextVisit.login('user-b');
  assert(nextVisit.find('nv-promotion'));
}
{
  const test = fixture({ desktop: false });
  test.login('user-a');
  const card = test.find('nv-promotion');
  assert.equal(test.page.children[1], card);
  test.load();
  test.show();
  test.media.matches = true;
  test.media.emit('change');
  assert.equal(card.parentNode, test.sidebar);
  test.advance(3000);
  card.emit('mouseenter');
  test.advance(15000);
  assert(card.parentNode);
  card.emit('mouseleave');
  test.advance(7000);
  assert.equal(card.parentNode, null);
}
{
  const test = fixture();
  test.login('user-a');
  test.load();
  test.show();
  const link = test.find('nv-promotion-link');
  assert.equal(link.href, 'https://www.pesoganador.com/');
  assert.equal(link.target, '_blank');
  assert(link.rel.includes('noopener') && link.rel.includes('noreferrer'));
  test.document.activeElement = link;
  test.find('nv-promotion').emit('focusin');
  test.advance(30000);
  assert(test.find('nv-promotion').parentNode);
  test.find('nv-promotion-close').emit('click');
  assert.equal(test.find('nv-promotion').parentNode, null);
}
{
  const test = fixture();
  test.login('user-a');
  test.find('nv-promotion-image').emit('error');
  assert.equal(test.find('nv-promotion').parentNode, null);
  assert.equal(test.local.size, 0);
}
{
  const test = fixture({ storageFails: true });
  test.login('user-a');
  assert.equal(test.find('nv-promotion'), undefined);
}
{
  const test = fixture();
  test.login('user-a');
  test.load();
  test.show();
  test.login(null);
  assert.equal(test.find('nv-promotion').parentNode, null);
}

{
  const test = fixture({ now: Date.parse('2026-11-05T06:56:31.999Z') });
  test.login('user-a');
  assert.equal(test.find('nv-promotion'), undefined);
}
{
  const test = fixture({ now: Date.parse('2026-11-05T06:56:32Z') });
  test.login('user-a');
  assert(test.find('nv-promotion'));
}
for (const date of ['2026-11-07T06:56:32Z', '2026-11-08T00:00:00Z']) {
  const test = fixture({ now: Date.parse(date) });
  test.login('user-a');
  assert.equal(test.find('nv-promotion'), undefined);
  assert.equal(test.local.size, 0);
}
{
  const test = fixture({ now: Date.parse('2026-11-07T06:56:31.999Z') });
  test.login('user-a');
  test.load();
  test.show();
  const card = test.find('nv-promotion');
  card.emit('mouseenter');
  test.document.activeElement = test.find('nv-promotion-link');
  card.emit('focusin');
  test.document.hidden = true;
  test.document.emit('visibilitychange');
  test.advance(1);
  assert.equal(card.parentNode, null);
}
{
  const test = fixture({ now: Date.parse('2026-11-07T06:56:30Z') });
  test.login('user-a');
  test.load();
  test.show();
  test.setNow(Date.parse('2026-11-07T07:00:00Z'));
  test.document.emit('visibilitychange');
  assert.equal(test.find('nv-promotion').parentNode, null);
}
{
  const test = fixture({ now: Date.parse('2026-11-07T06:56:30Z') });
  test.login('user-a');
  test.setNow(Date.parse('2026-11-07T07:00:00Z'));
  test.load();
  assert.equal(test.find('nv-promotion').parentNode, null);
}

console.log('Publicidad verificada: vigencia de 48 horas, vencimiento en pestañas abiertas/ocultas, azar, autenticación, 24 horas entre apariciones, 10 segundos visibles, cierre, enlace y ubicación adaptable.');
