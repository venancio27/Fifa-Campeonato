import * as S from './state.js';
import * as UI from './ui.js';
import { openScoreModal, openInfoModal, openPlayerEditModal, openSettingsModal } from './modal.js';
import { runDrawAnimation } from './wheel.js';
import { updateTicker } from './ticker.js';
import { mountHero } from './hero.js';

const appEl = document.getElementById('app');
let state = S.loadState();
UI.wireColorInputs(appEl);

// Estado de navegação só de tela (não persiste) — hoje só controla o "voltar
// pra ver a Rodada 1" a partir da Rodada 2.
const uiExtra = { showRound1Recap: false };

function rerender() {
  UI.render(state, appEl, uiExtra);
  updateTicker(state);
  mountHero(appEl);
}
function persistAndRerender() {
  S.saveState(state);
  rerender();
}
function mutate(fn) {
  fn(state);
  persistAndRerender();
}

function playersPool() {
  return state.players.map((p) => ({ name: p.name, team: p.team, color1: p.color1, color2: p.color2 }));
}

function findMatch(matchId) {
  const pools = [];
  if (state.round1) {
    pools.push(state.round1.matches);
    if (state.round1.repechageMatch) pools.push([state.round1.repechageMatch]);
  }
  if (state.round2) {
    pools.push(state.round2.matches);
    if (state.round2.byeDuelMatch) pools.push([state.round2.byeDuelMatch]);
  }
  if (state.knockout) {
    for (const r of state.knockout.rounds) pools.push(r.matches);
    if (state.knockout.thirdPlace) pools.push([state.knockout.thirdPlace]);
  }
  for (const pool of pools) {
    const found = pool.find((m) => m.id === matchId);
    if (found) return found;
  }
  return null;
}

function playerRef(id) {
  const p = S.getPlayer(state, id);
  return p ? { name: p.name, team: p.team, color1: p.color1, color2: p.color2 } : { name: '?', team: '', color1: '#ff7a1a', color2: '#1a1a22' };
}

async function revealRound1() {
  const r1 = state.round1;
  const items = r1.matches.map((m, i) => ({
    kind: 'match',
    title: `Confronto ${i + 1}`,
    player1: playerRef(m.player1Id),
    player2: playerRef(m.player2Id),
  }));
  if (r1.byePlayerId) {
    items.push({ kind: 'bye', title: 'Folga da rodada', player: playerRef(r1.byePlayerId) });
  }
  await runDrawAnimation({ items, playersPool: playersPool(), caption: 'Sorteio · Rodada 1' });
  mutate((s) => (s.reveal.round1 = true));
}

// Fecha a fase de grupos. Se alguma faixa empatou em TODOS os critérios da
// regra 5, o desempate é sorteado aqui, na frente de todo mundo, uma faixa por
// vez — em vez de sair calado do número que cada jogador recebeu no cadastro.
// Só depois da animação o resultado é gravado e a classificação congela.
async function runTiebreakDraws() {
  const plan = S.planTiebreakDraw(state);
  for (const group of plan) {
    const faixa = group.from === group.to ? `${group.from}º` : `${group.from}º ao ${group.to}º`;
    await runDrawAnimation({
      items: group.order.map((id, i) => ({
        kind: 'draw',
        title: `${group.from + i}º lugar`,
        player: playerRef(id),
      })),
      // O reel gira só entre os empatados da faixa — fica claro que o sorteio
      // é entre eles, e não entre o campeonato inteiro.
      playersPool: group.playerIds.map(playerRef),
      caption: `🎲 Sorteio de desempate · ${faixa}`,
      nextLabel: 'Sortear próxima posição ➜',
    });
  }
  if (plan.length) mutate((s) => S.applyTiebreakDraw(s, plan));
}

async function closeGroupStage() {
  await runTiebreakDraws();
  mutate((s) => S.advanceToCutoff(s));
}

appEl.addEventListener('submit', (e) => {
  const form = e.target.closest('#add-player-form');
  if (!form) return;
  e.preventDefault();
  const nameInput = form.querySelector('input[name="name"]');
  const name = nameInput.value;
  if (!name.trim()) return;
  const team = form.querySelector('input[name="team"]').value;
  const color1 = form.querySelector('input[name="color1"]').value;
  const color2 = form.querySelector('input[name="color2"]').value;
  mutate((s) => S.addPlayer(s, name, team, color1, color2));
  const freshName = appEl.querySelector('#add-player-form input[name="name"]');
  if (freshName) freshName.focus();
});

appEl.addEventListener('change', (e) => {
  const directKnockoutEl = e.target.closest('[data-action="set-direct-knockout"]');
  if (directKnockoutEl) {
    mutate((s) => S.setConfig(s, { directKnockout: directKnockoutEl.checked }));
    return;
  }

  const thirdPlaceEl = e.target.closest('[data-action="set-third-place"]');
  if (thirdPlaceEl) {
    mutate((s) => S.setConfig(s, { thirdPlaceMatch: thirdPlaceEl.checked }));
    return;
  }

  if (e.target.id === 'backup-file-input') {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Isso vai substituir todo o progresso atual (jogadores, placares, fase) pelo conteúdo desse arquivo de backup. Não dá pra desfazer. Continuar?')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = S.importStateFromJson(reader.result);
        state = restored;
        uiExtra.showRound1Recap = false;
        persistAndRerender();
      } catch (err) {
        alert('Não consegui carregar esse backup: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }
});

// O telão é inerte de propósito: fora trocar de modo e consultar as regras, só
// passam as ações de backup (cujos botões, como o "Reiniciar tudo", nem chegam
// a ser renderizados nesse modo).
const TELAO_ALLOWED_ACTIONS = new Set(['toggle-view', 'download-backup', 'trigger-upload-backup', 'show-rules']);

appEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (state.viewMode === 'telao' && !TELAO_ALLOWED_ACTIONS.has(action)) return;

  switch (action) {
    case 'remove-player':
      mutate((s) => S.removePlayer(s, btn.dataset.id));
      break;

    case 'edit-player': {
      const p = S.getPlayer(state, btn.dataset.id);
      if (!p) break;
      openPlayerEditModal(p, (fields) => {
        mutate((s) => S.updatePlayer(s, p.id, fields));
      });
      break;
    }

    case 'open-settings-modal':
      openSettingsModal(
        () => state,
        {
          onConfig: (fields) => mutate((s) => S.setConfig(s, fields)),
          onAddLatePlayer: ({ name, team, color1, color2 }) =>
            mutate((s) => S.addLatePlayer(s, name, team, color1, color2)),
        }
      );
      break;

    case 'focus-name': {
      const input = appEl.querySelector('#add-player-form input[name="name"]');
      if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus({ preventScroll: true });
      }
      break;
    }

    case 'goto-config':
      mutate((s) => S.goToConfig(s));
      break;

    case 'back-to-registration':
      mutate((s) => S.backToRegistration(s));
      break;

    case 'set-cutoff':
      mutate((s) => S.setConfig(s, { cutoffSize: Number(btn.dataset.value) }));
      break;

    case 'set-group-rounds': {
      const rounds = Number(btn.dataset.value);
      // Ao entrar na rodada única, a repescagem vira o padrão pro número ímpar
      // (é a razão de ela existir: o folguista joga em vez de ganhar de graça).
      const extra = rounds === 1 ? { oddHandling: 'repechage' } : {};
      mutate((s) => S.setConfig(s, { groupRounds: rounds, ...extra }));
      break;
    }

    case 'cancel-repechage':
      if (confirm('Isso reabre a rodada para corrigir placares e descarta a repescagem já definida (inclusive o placar dela, se houver). O sorteio de desempate não é refeito. Continuar?')) {
        mutate((s) => S.cancelRepechage(s));
      }
      break;

    case 'create-repechage':
      // O sorteio de desempate roda ANTES de escolher o desafiado: quem ocupa
      // a última vaga só está definido depois que a faixa empatada é sorteada.
      runTiebreakDraws().then(() => mutate((s) => S.createRepechage(s)));
      break;

    case 'set-classification':
      mutate((s) => S.setConfig(s, { classification: btn.dataset.value }));
      break;

    case 'set-odd-handling':
      mutate((s) => S.setConfig(s, { oddHandling: btn.dataset.value }));
      break;

    case 'set-fixed-bye-points':
      mutate((s) => S.setConfig(s, { fixedByePoints: Number(btn.dataset.value) }));
      break;

    case 'start-tournament':
      mutate((s) => S.startTournament(s));
      break;

    case 'reveal-round1':
      revealRound1();
      break;

    case 'show-rules':
      openInfoModal(UI.rulesModalHtml());
      break;

    case 'show-final-standings':
      openInfoModal(UI.finalStandingsModalHtml(state));
      break;

    case 'mark-playing': {
      const matchId = btn.dataset.matchId;
      const list = S.getActiveMatchList(state);
      mutate((s) => S.setMatchPlaying(s, matchId, list));
      break;
    }

    case 'open-score': {
      const matchId = btn.dataset.matchId;
      const m = findMatch(matchId);
      if (!m) break;
      openScoreModal(m, S.playerLabel(state, m.player1Id), S.playerLabel(state, m.player2Id), (result) => {
        mutate((s) => S.setMatchResult(s, matchId, result));
      });
      break;
    }

    case 'advance-round2':
      mutate((s) => S.advanceToRound2(s));
      break;

    case 'view-round1-recap':
      uiExtra.showRound1Recap = true;
      rerender();
      break;

    case 'back-to-round2':
      uiExtra.showRound1Recap = false;
      rerender();
      break;

    case 'advance-cutoff':
      uiExtra.showRound1Recap = false;
      closeGroupStage();
      break;

    case 'generate-bracket':
      mutate((s) => S.generateBracketFromCutoff(s));
      break;

    case 'advance-knockout':
      mutate((s) => S.advanceKnockout(s));
      break;

    case 'toggle-view':
      mutate((s) => (s.viewMode = s.viewMode === 'operator' ? 'telao' : 'operator'));
      break;

    case 'download-backup': {
      const json = S.exportStateAsJson(state);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `campeonato-fifa-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      break;
    }

    case 'trigger-upload-backup':
      document.getElementById('backup-file-input').click();
      break;

    case 'reset-all':
      if (confirm('Isso vai apagar todos os jogadores, placares e configurações. Tem certeza?')) {
        state = S.resetAll();
        uiExtra.showRound1Recap = false;
        rerender();
      }
      break;
  }
});

rerender();
