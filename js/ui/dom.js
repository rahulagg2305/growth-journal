// Minimal DOM helpers (no innerHTML with user data).
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

export function toast(msg, ms = 2200) {
  const t = el('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#A8D5BA', '#F6D186', '#F4A6A0', '#A7C7E7', '#C9B6E4', '#FFD6BA', '#BFE8DC'];
  const box = el('div', { class: 'confetti' });
  for (let i = 0; i < 70; i++) {
    box.append(el('i', { style: { left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${1.2 + Math.random() * 1}s` } }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}

export function sheet(content, { onClose } = {}) {
  const ov = el('div', { class: 'overlay' });
  const sh = el('div', { class: 'sheet', role: 'dialog' });
  const close = () => { ov.remove(); onClose?.(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  sh.append(content(close));
  ov.append(sh); document.body.append(ov);
  return close;
}

export function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const CAT_COLORS = { technical: '#A7C7E7', projects: '#C9B6E4', health: '#A8D5BA', personal: '#FFD6BA', life: '#F6D186' };
export const STATUS_LABEL = { on: 'On track', slight: 'Slightly behind', behind: 'Behind', baseline: 'Building baseline', done: 'Complete' };
export const STATUS_EMOJI = { on: '🌿', slight: '🍯', behind: '🌸', baseline: '☁️', done: '🎉' };
