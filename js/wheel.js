// Animação de sorteio: "slot machine" com reels que giram e desaceleram até
// travar no jogador real. Os dois lados de um confronto saem um de cada vez —
// precisa clicar pra sortear cada jogador. Puramente DOM + CSS transitions.
import { esc, colorRibbon } from './ui.js';

const ITEM_H = 92; // deve casar com a altura do .reel-cell no CSS
const STRIP_LENGTH = 60;

function playerMainSub(p) {
  const main = p.team || p.name;
  const sub = p.team ? p.name : '';
  return { main, sub };
}

function reelCellHtml(p) {
  const { main, sub } = playerMainSub(p);
  return `
    <div class="reel-cell">
      ${colorRibbon(p, 'reel-ribbon')}
      <div class="reel-cell-text">
        <div class="reel-cell-main">${esc(main)}</div>
        ${sub ? `<div class="reel-cell-sub">${esc(sub)}</div>` : ''}
      </div>
    </div>`;
}

function resultCardHtml(p) {
  const { main, sub } = playerMainSub(p);
  return `
    <div class="draw-result">
      ${colorRibbon(p, 'draw-ribbon')}
      <div class="draw-result-text">
        <div class="draw-result-main">${esc(main)}</div>
        ${sub ? `<div class="draw-result-sub">${esc(sub)}</div>` : ''}
      </div>
    </div>`;
}

function buildReelStrip(pool, target) {
  const items = [];
  for (let i = 0; i < STRIP_LENGTH - 1; i++) {
    items.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  items.push(target);
  return items;
}

// Cria um reel que gira e desacelera bem forte perto do fim (~5s), como uma
// caça-níquel: rápido no começo, vai ficando lento, e "cai" no jogador certo.
function makeReel(pool, target) {
  const items = buildReelStrip(pool, target);
  const track = document.createElement('div');
  track.className = 'reel-track';
  track.innerHTML = items.map(reelCellHtml).join('');

  const finalIndex = items.length - 1;
  return {
    track,
    spin() {
      return new Promise((resolve) => {
        const duration = 4.6 + Math.random() * 0.8;
        requestAnimationFrame(() => {
          track.style.transition = `transform ${duration}s cubic-bezier(0.13, 0.85, 0.13, 1)`;
          track.style.transform = `translateY(-${finalIndex * ITEM_H}px)`;
        });
        track.addEventListener('transitionend', () => resolve(), { once: true });
      });
    },
  };
}

function burstParticles(container) {
  const colors = ['#ff7a1a', '#ff3d1c', '#ffcb05', '#3b6fe0', '#8b3ff0', '#ffb347'];
  const rect = container.getBoundingClientRect();
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('span');
    p.className = 'spark';
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 140;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = `${rect.width / 2}px`;
    p.style.top = `${rect.height / 2}px`;
    container.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }
}

function lockedSlotHtml() {
  return `<div class="slot-locked"><span>?</span></div>`;
}

function summaryRowHtml(item) {
  // Qualquer kind de slot único (folga, sorteio de desempate) — só 'match'
  // tem dois jogadores. Testar por 'bye' aqui fazia o "Pular animação"
  // estourar no sorteio de desempate e travar o overlay sem saída.
  if (item.kind !== 'match') {
    return `
      <div class="draw-summary-row">
        <div class="ds-title">${esc(item.title)}</div>
        ${resultCardHtml(item.player)}
      </div>`;
  }
  return `
    <div class="draw-summary-row">
      <div class="ds-title">${esc(item.title)}</div>
      <div class="draw-summary-pair">
        ${resultCardHtml(item.player1)}
        <span class="draw-vs">VS</span>
        ${resultCardHtml(item.player2)}
      </div>
    </div>`;
}

// items: [{kind:'match', title, player1, player2} | {kind:'bye', title, player}]
// playersPool: lista de todos os jogadores em jogo { name, team, color1, color2 }
// (usada pros reels rolarem por combinações aleatórias antes de travar no real).
// Retorna uma Promise que resolve quando o organizador fecha a animação.
export function runDrawAnimation({ items, playersPool, caption, nextLabel = 'Próximo confronto ➜' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'draw-overlay';
    overlay.innerHTML = `
      <div class="draw-card">
        <div class="draw-caption">${esc(caption)}</div>
        <div class="draw-progress"><span class="draw-progress-current">1</span> / ${items.length}</div>
        <div class="draw-stage"></div>
        <div class="draw-actions">
          <button type="button" class="btn btn-ghost" data-action="skip">Pular animação</button>
          <button type="button" class="btn btn-primary" data-action="next">Sortear</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const stage = overlay.querySelector('.draw-stage');
    const nextBtn = overlay.querySelector('[data-action="next"]');
    const skipBtn = overlay.querySelector('[data-action="skip"]');
    const progressEl = overlay.querySelector('.draw-progress-current');
    const progressWrap = overlay.querySelector('.draw-progress');

    let itemIdx = 0;
    let slotIdx = 0;
    let aborted = false;

    function close() {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 250);
      resolve();
    }

    function totalSlots(item) {
      return item.kind === 'match' ? 2 : 1;
    }

    function slotPlayer(item, i) {
      if (item.kind !== 'match') return item.player;
      return i === 0 ? item.player1 : item.player2;
    }

    function updateNextLabel() {
      const item = items[itemIdx];
      const total = totalSlots(item);
      const isLastItem = itemIdx === items.length - 1;
      if (slotIdx < total) {
        if (total === 1) nextBtn.textContent = 'Sortear';
        else nextBtn.textContent = slotIdx === 0 ? 'Sortear jogador 1' : 'Sortear jogador 2';
      } else {
        nextBtn.textContent = isLastItem ? 'Concluir' : nextLabel;
      }
    }

    function renderItem(i) {
      const item = items[i];
      progressEl.textContent = String(i + 1);
      const title = `<div class="draw-sub">${esc(item.title)}</div>`;
      if (item.kind !== 'match') {
        stage.innerHTML = `${title}<div class="draw-row"><div class="slot-wrap" data-slot="0">${lockedSlotHtml()}</div></div>`;
      } else {
        stage.innerHTML = `
          ${title}
          <div class="draw-pair">
            <div class="slot-wrap" data-slot="0">${lockedSlotHtml()}</div>
            <div class="draw-vs">VS</div>
            <div class="slot-wrap" data-slot="1">${lockedSlotHtml()}</div>
          </div>`;
      }
      slotIdx = 0;
      updateNextLabel();
    }

    async function drawSlot() {
      const item = items[itemIdx];
      const target = slotPlayer(item, slotIdx);
      const wrap = stage.querySelector(`.slot-wrap[data-slot="${slotIdx}"]`);
      const reelWrap = document.createElement('div');
      reelWrap.className = 'reel-wrap';
      const reel = makeReel(playersPool, target);
      reelWrap.appendChild(reel.track);
      wrap.innerHTML = '';
      wrap.appendChild(reelWrap);

      nextBtn.disabled = true;
      await reel.spin();
      if (aborted) return;
      reelWrap.classList.add('landed');
      burstParticles(reelWrap);

      slotIdx += 1;
      nextBtn.disabled = false;
      updateNextLabel();
    }

    function goToNextItem() {
      itemIdx += 1;
      if (itemIdx >= items.length) {
        close();
        return;
      }
      renderItem(itemIdx);
    }

    nextBtn.addEventListener('click', () => {
      const item = items[itemIdx];
      const total = totalSlots(item);
      if (slotIdx < total) {
        drawSlot();
      } else {
        goToNextItem();
      }
    });

    skipBtn.addEventListener('click', () => {
      aborted = true;
      progressWrap.style.display = 'none';
      stage.innerHTML = `<div class="draw-summary-list">${items.map(summaryRowHtml).join('')}</div>`;
      skipBtn.remove();
      nextBtn.textContent = 'Concluir';
      nextBtn.disabled = false;
      const newNextBtn = nextBtn.cloneNode(true);
      nextBtn.replaceWith(newNextBtn);
      newNextBtn.addEventListener('click', close);
    });

    renderItem(itemIdx);
  });
}
