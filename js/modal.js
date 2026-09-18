// Modal de lançamento de placar — auto-contido, igual ao wheel.js.
import { esc, colorFieldHtml, wireColorInputs } from './ui.js';
import * as S from './state.js';

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
    document.removeEventListener('keydown', onKey);
  }
  // Esc fecha: o regulamento é consultado no meio da noite, com o organizador
  // de mão ocupada — tirar a mão do teclado pra achar o botão atrapalha.
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

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

// Editar um jogador já cadastrado (nome, time, cores) sem precisar excluir e
// recadastrar — útil quando só a cor do time mudou.
export function openPlayerEditModal(player, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Editar jogador</h3>
      <div class="field">
        <label>Nome</label>
        <input type="text" id="ep-name" value="${esc(player.name)}" autocomplete="off" />
      </div>
      <div class="field">
        <label>Time do FIFA</label>
        <input type="text" id="ep-team" value="${esc(player.team || '')}" autocomplete="off" />
      </div>
      <div class="field edit-player-colors">
        ${colorFieldHtml('color1', 'Cor 1', player.color1)}
        ${colorFieldHtml('color2', 'Cor 2', player.color2)}
      </div>
      <p class="hint error" id="ep-error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" data-action="save">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  wireColorInputs(overlay);

  function close() {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }

  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('[data-action="save"]').addEventListener('click', () => {
    const errorEl = overlay.querySelector('#ep-error');
    errorEl.hidden = true;
    const name = overlay.querySelector('#ep-name').value;
    if (!name.trim()) {
      errorEl.textContent = 'Informe o nome do jogador.';
      errorEl.hidden = false;
      return;
    }
    const team = overlay.querySelector('#ep-team').value;
    const color1 = overlay.querySelector('input[name="color1"]').value;
    const color2 = overlay.querySelector('input[name="color2"]').value;
    onSave({ name, team, color1, color2 });
    close();
  });
}

function segBtnHtml(key, value, label, active) {
  return `<button type="button" class="seg-btn ${active ? 'active' : ''}" data-setting="${key}" data-value="${esc(String(value))}">${esc(label)}</button>`;
}

// Só as seções que fazem sentido na fase atual. Essa parte é re-renderizada a
// cada escolha (mudar "ponto fixo/duelo" troca o subcampo que aparece embaixo).
function configSectionsHtml(state) {
  const cfg = state.config;
  const cutoffOptions = S.availableCutoffSizes(state);
  const showOdd = state.phase === 'round1' && state.round1 && !!state.round1.byePlayerId;
  const parts = [];

  if (cutoffOptions.length > 1) {
    parts.push(`
      <div class="field">
        <label>Corte pro mata-mata</label>
        <div class="segmented small">
          ${cutoffOptions.map((v) => segBtnHtml('cutoffSize', v, `Top ${v}`, cfg.cutoffSize === v)).join('')}
        </div>
        <p class="hint">Quantos jogadores avançam da fase de grupos. Dá pra mudar até o chaveamento ser gerado.</p>
      </div>`);
  }

  if (showOdd) {
    parts.push(`
      <div class="field">
        <label>Tratamento do número ímpar (${state.players.length} jogadores)</label>
        <div class="segmented small">
          ${segBtnHtml('oddHandling', 'fixed', 'Ponto fixo', cfg.oddHandling === 'fixed')}
          ${segBtnHtml('oddHandling', 'duel', 'Duelo dos folguistas', cfg.oddHandling === 'duel')}
        </div>
        ${
          cfg.oddHandling === 'fixed'
            ? `<div class="subfield">
                <label>Pontos de folga</label>
                <div class="segmented small">
                  ${segBtnHtml('fixedByePoints', 1, '1 ponto', cfg.fixedByePoints === 1)}
                  ${segBtnHtml('fixedByePoints', 2, '2 pontos', cfg.fixedByePoints === 2)}
                </div>
              </div>`
            : `<p class="hint locked">🔒 Com "duelo dos folguistas", a classificação fica travada em <strong>Soma R1+R2</strong>.</p>`
        }
      </div>`);
  }

  return parts.join('') || '<p class="hint">Nada pra ajustar nesta fase.</p>';
}

function lateSectionHtml(state) {
  if (!S.canAddLatePlayer(state)) return '';
  return `
    <div class="field">
      <label>🏃 Jogador chegou atrasado?</label>
      <form id="settings-late-form" class="add-player-form">
        <input type="text" name="name" placeholder="Nome do jogador" autocomplete="off" required />
        <input type="text" name="team" placeholder="Time do FIFA" autocomplete="off" />
        ${colorFieldHtml('color1', 'Cor 1', '#ff7a1a')}
        ${colorFieldHtml('color2', 'Cor 2', '#1a1a22')}
        <button type="submit" class="btn btn-primary">Encaixar na Rodada 1</button>
      </form>
      <p class="hint">Se já havia folguista, ele encara o recém-chegado num confronto real. Se não havia, o recém-chegado vira o folguista da rodada.</p>
    </div>`;
}

// Popup único de ajustes do operador (ícone ⚙ no título da rodada): corte do
// mata-mata, número ímpar e cadastro tardio. getState é uma função porque o app
// re-renderiza a cada mudança — o modal precisa sempre ler o estado atual.
export function openSettingsModal(getState, handlers) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card modal-card-settings">
      <h3>Configurações da rodada</h3>
      <div id="settings-sections">${configSectionsHtml(getState())}</div>
      ${lateSectionHtml(getState())}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  wireColorInputs(overlay);

  function close() {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }

  overlay.querySelector('[data-action="close"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const sections = overlay.querySelector('#settings-sections');
  sections.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-setting]');
    if (!btn) return;
    const key = btn.dataset.setting;
    const raw = btn.dataset.value;
    handlers.onConfig({ [key]: key === 'oddHandling' ? raw : Number(raw) });
    sections.innerHTML = configSectionsHtml(getState());
  });

  const lateForm = overlay.querySelector('#settings-late-form');
  if (lateForm) {
    lateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = lateForm.querySelector('input[name="name"]').value;
      if (!name.trim()) return;
      handlers.onAddLatePlayer({
        name,
        team: lateForm.querySelector('input[name="team"]').value,
        color1: lateForm.querySelector('input[name="color1"]').value,
        color2: lateForm.querySelector('input[name="color2"]').value,
      });
      close();
    });
  }
}
