// Modal de lançamento de placar — auto-contido, igual ao wheel.js.

// Modal genérico só de leitura (ex.: classificação final congelada da fase
// de grupos) — mostra o HTML passado e fecha com um botão único.
export function openInfoModal(bodyHtml) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card modal-card-wide">
      ${bodyHtml}
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" data-action="close">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }
  overlay.querySelector('[data-action="close"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

export function openScoreModal(match, label1, label2, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Placar da partida</h3>
      <div class="score-form">
        <div class="score-field">
          <label>${label1}</label>
          <input type="number" min="0" inputmode="numeric" id="m-score1" value="${match.score1 ?? ''}" />
        </div>
        <div class="score-x">x</div>
        <div class="score-field">
          <label>${label2}</label>
          <input type="number" min="0" inputmode="numeric" id="m-score2" value="${match.score2 ?? ''}" />
        </div>
      </div>
      <div class="pens-section" id="pens-section" hidden>
        <p class="hint">Empate no tempo normal — registre os pênaltis:</p>
        <div class="score-form">
          <div class="score-field">
            <label>Pên. ${label1}</label>
            <input type="number" min="0" inputmode="numeric" id="m-pen1" value="${match.pen1 ?? ''}" />
          </div>
          <div class="score-x">x</div>
          <div class="score-field">
            <label>Pên. ${label2}</label>
            <input type="number" min="0" inputmode="numeric" id="m-pen2" value="${match.pen2 ?? ''}" />
          </div>
        </div>
      </div>
      <p class="hint error" id="modal-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" data-action="save">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const s1 = overlay.querySelector('#m-score1');
  const s2 = overlay.querySelector('#m-score2');
  const pensSection = overlay.querySelector('#pens-section');
  const p1 = overlay.querySelector('#m-pen1');
  const p2 = overlay.querySelector('#m-pen2');
  const errorEl = overlay.querySelector('#modal-error');

  function isTied() {
    return s1.value !== '' && s2.value !== '' && Number(s1.value) === Number(s2.value);
  }
  function syncPensVisibility() {
    pensSection.hidden = !isTied();
  }
  [s1, s2].forEach((el) => el.addEventListener('input', syncPensVisibility));
  syncPensVisibility();

  function close() {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }

  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
    errorEl.hidden = true;
    if (s1.value === '' || s2.value === '') {
      errorEl.textContent = 'Preencha os dois placares.';
      errorEl.hidden = false;
      return;
    }
    const score1 = Number(s1.value);
    const score2 = Number(s2.value);
    if (score1 < 0 || score2 < 0) {
      errorEl.textContent = 'Placar não pode ser negativo.';
      errorEl.hidden = false;
      return;
    }
    let hasPens = false;
    let pen1 = null;
    let pen2 = null;
    if (score1 === score2) {
      if (p1.value === '' || p2.value === '') {
        errorEl.textContent = 'Empate exige o placar dos pênaltis.';
        errorEl.hidden = false;
        return;
      }
      pen1 = Number(p1.value);
      pen2 = Number(p2.value);
      if (pen1 === pen2) {
        errorEl.textContent = 'Os pênaltis não podem terminar empatados — precisa de um vencedor.';
        errorEl.hidden = false;
        return;
      }
      hasPens = true;
    }
    onSave({ score1, score2, hasPens, pen1, pen2 });
    close();
  });
}
