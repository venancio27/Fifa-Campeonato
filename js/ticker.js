// Faixa de resultados/próximos jogos rolando na horizontal (estilo "bolsa de
// valores"), fixada embaixo da tela. Fica fora do ciclo normal de render() e
// só atualiza seu conteúdo quando os itens realmente mudam — assim a rolagem
// nunca reinicia sozinha a cada placar lançado.
import { buildTickerItems } from './ui.js';

let barEl = null;
let trackEl = null;
let lastKey = null;

function ensureBar() {
  if (barEl) return;
  barEl = document.createElement('div');
  barEl.className = 'ticker-bar';
  trackEl = document.createElement('div');
  trackEl.className = 'ticker-track';
  barEl.appendChild(trackEl);
  document.body.appendChild(barEl);
}

export function updateTicker(state) {
  const items = buildTickerItems(state);
  if (!items.length) {
    if (barEl) {
      barEl.remove();
      barEl = null;
      trackEl = null;
      lastKey = null;
    }
    document.body.classList.remove('has-ticker');
    return;
  }

  ensureBar();
  document.body.classList.add('has-ticker');

  const key = items.join('|');
  if (key === lastKey) return;
  lastKey = key;

  const duration = Math.max(18, items.length * 3.5);
  trackEl.style.animationDuration = `${duration}s`;
  trackEl.innerHTML = items.concat(items).join('<span class="ticker-sep">◆</span>');
}
