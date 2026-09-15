import * as S from './state.js';
import * as E from './engine.js';

export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

// Duas "fitinhas" verticais com as cores do time — um detalhe discreto, não um
// escudo. Usado na lista de jogadores, no sorteio e no ticker.
export function colorRibbon(p, className = 'color-ribbon') {
  const c1 = esc((p && p.color1) || '#ff7a1a');
  const c2 = esc((p && p.color2) || '#1a1a22');
  return `<span class="${className}"><span style="background:${c1}"></span><span style="background:${c2}"></span></span>`;
}

function scoreText(m) {
  if (m.score1 == null || m.score2 == null) return '–  x  –';
  let t = `${m.score1} x ${m.score2}`;
  if (m.score1 === m.score2 && m.hasPens && m.pen1 != null) {
    t += ` <span class="pens">(pên. ${m.pen1} x ${m.pen2})</span>`;
  }
  return t;
}

function statusBadge(m) {
  if (m.status === 'done') return '<span class="badge badge-done">Concluído</span>';
  if (m.status === 'playing') return '<span class="badge badge-live">🔴 Jogando</span>';
  return '<span class="badge badge-pending">Pendente</span>';
}

// Uma linha por jogador (nome de uma linha só, corta com "…" se for longo) —
// usado tanto no card de partida normal quanto no card compacto do
// chaveamento, pra nunca depender de 2-3 linhas de nome quebrando o layout.
function playerRowHtml(state, m, playerId, side, winnerSide) {
  const showScore = m.status === 'done' || m.status === 'playing';
  const score = side === 1 ? m.score1 : m.score2;
  return `
    <div class="mc-row ${winnerSide === side ? 'winner' : ''}">
      ${colorRibbon(S.getPlayer(state, playerId) || {})}
      <span class="mc-name">${esc(S.playerLabel(state, playerId))}</span>
      <span class="mc-score">${showScore ? esc(score ?? '–') : ''}</span>
    </div>`;
}

function pensLineHtml(m) {
  return m.status === 'done' && m.hasPens && m.pen1 != null ? `<div class="mc-pens">pên. ${m.pen1} x ${m.pen2}</div>` : '';
}

function matchCard(state, m, opts = {}) {
  const winnerSide = m.status === 'done' ? E.matchPoints(m).winnerSide : null;
  const tag = opts.tag ? `<div class="match-tag">${esc(opts.tag)}</div>` : '';
  const controls = opts.readonly
    ? ''
    : `<div class="match-actions">
        ${m.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-action="mark-playing" data-match-id="${m.id}">Colocar em jogo</button>` : ''}
        <button class="btn btn-primary btn-sm" data-action="open-score" data-match-id="${m.id}">${m.status === 'done' ? 'Editar placar' : 'Lançar placar'}</button>
      </div>`;
  return `
    <div class="match-card ${m.status}">
      ${tag}
      ${playerRowHtml(state, m, m.player1Id, 1, winnerSide)}
      ${playerRowHtml(state, m, m.player2Id, 2, winnerSide)}
      ${pensLineHtml(m)}
      <div class="match-foot">${statusBadge(m)} ${controls}</div>
    </div>`;
}

function byeCard(state, playerId, cfg) {
  if (!playerId) return '';
  const label = S.playerLabel(state, playerId);
  const pts = cfg.oddHandling === 'fixed' ? cfg.fixedByePoints : 0;
  const note = cfg.oddHandling === 'fixed' ? `ganha ${pts} ponto${pts > 1 ? 's' : ''} de folga` : 'sem pontos agora — vai jogar o duelo dos folguistas';
  return `<div class="bye-card">🌙 <strong>${esc(label)}</strong> tira folga nesta rodada (${note})</div>`;
}

// ---------- Painel de fila ----------
// Só mostra a fila depois que o sorteio da Rodada 1 foi revelado — senão o
// confronto aparece na lateral antes mesmo do organizador clicar "Revelar
// sorteio", entregando o resultado de graça. Rodada 2 e mata-mata não têm
// essa suspense (pareamento por colocação / chaveamento, sempre à mostra),
// então liberam direto.
function queueVisible(state) {
  if (state.phase === 'round1') return state.reveal.round1;
  return state.phase === 'round2' || state.phase === 'knockout';
}

export function renderQueue(state) {
  const { current, upcoming } = S.getQueueInfo(state);
  const currentHtml = current.length
    ? current.map((m) => `<div class="queue-current">🎮 ${esc(S.playerLabel(state, m.player1Id))} <span>vs</span> ${esc(S.playerLabel(state, m.player2Id))}</div>`).join('')
    : `<div class="queue-current empty">Nenhuma partida em jogo agora</div>`;
  const upcomingHtml = upcoming.length
    ? upcoming.map((m, i) => `<li><span class="q-idx">${i + 1}</span> ${esc(S.playerLabel(state, m.player1Id))} <span>vs</span> ${esc(S.playerLabel(state, m.player2Id))}</li>`).join('')
    : '<li class="empty">Sem partidas pendentes na fila</li>';
  return `
    <div class="queue-panel">
      <div class="queue-title">Painel da fila · console único</div>
      ${currentHtml}
      <div class="queue-next-label">A seguir</div>
      <ul class="queue-next">${upcomingHtml}</ul>
    </div>`;
}

// Lateral combinando classificação ao vivo (enquanto a fase de grupos ainda
// está em jogo) + painel da fila. No mata-mata a classificação já não muda
// mais, então some daqui — fica acessível pelo ícone 📊 no título da seção.
function renderSidebar(state) {
  let classif = '';
  if (state.phase === 'round1' && state.round1) {
    classif = renderClassificationPanel(state, S.round1StandingsRanked(state));
  } else if (state.phase === 'round2' && state.round2) {
    classif = renderClassificationPanel(state, S.groupFinalStandingsRanked(state));
  }
  return `${classif}${renderQueue(state)}`;
}

// ---------- Ticker (resultados + próximos jogos, rolando na horizontal) ----------
function tickerPlayerHtml(state, playerId) {
  const p = S.getPlayer(state, playerId);
  return `${colorRibbon(p || {}, 'ticker-ribbon')} ${esc(S.playerLabel(state, playerId))}`;
}

function tickerMatchItem(state, m, tag) {
  const l1 = tickerPlayerHtml(state, m.player1Id);
  const l2 = tickerPlayerHtml(state, m.player2Id);
  if (m.status === 'done') {
    return `<span class="ticker-item ticker-done">${tag ? `<span class="ticker-tag">${esc(tag)}</span> ` : ''}${l1} ${scoreText(m)} ${l2}</span>`;
  }
  if (m.status === 'playing') {
    return `<span class="ticker-item ticker-live">🔴 AO VIVO ${tag ? `· ${esc(tag)} ` : ''}· ${l1} vs ${l2}</span>`;
  }
  return `<span class="ticker-item ticker-next">⏭ A SEGUIR ${tag ? `· ${esc(tag)} ` : ''}· ${l1} vs ${l2}</span>`;
}

function tickerByeItem(state, playerId, tag) {
  return `<span class="ticker-item ticker-bye">🌙 FOLGA${tag ? ` · ${esc(tag)}` : ''} · ${tickerPlayerHtml(state, playerId)}</span>`;
}

export function buildTickerItems(state) {
  const items = [];
  if (state.reveal.round1 && state.round1) {
    state.round1.matches.forEach((m) => items.push(tickerMatchItem(state, m, 'R1')));
    if (state.round1.byePlayerId) items.push(tickerByeItem(state, state.round1.byePlayerId, 'R1'));
  }
  if (state.round2) {
    state.round2.matches.forEach((m) => items.push(tickerMatchItem(state, m, 'R2')));
    if (state.round2.byePlayerId) items.push(tickerByeItem(state, state.round2.byePlayerId, 'R2'));
    if (state.round2.byeDuelMatch) items.push(tickerMatchItem(state, state.round2.byeDuelMatch, 'Duelo'));
  }
  if (state.knockout) {
    const lastIdx = state.knockout.rounds.length - 1;
    state.knockout.rounds.forEach((r, i) => {
      r.matches.forEach((m) => items.push(tickerMatchItem(state, m, r.name)));
      if (i === lastIdx && state.knockout.thirdPlace) {
        items.push(tickerMatchItem(state, state.knockout.thirdPlace, '3º lugar'));
      }
    });
  }
  return items;
}

// ---------- Registro + Configuração ----------
function teamFieldHtml() {
  return `
    <input type="text" name="team" placeholder="Time do FIFA" autocomplete="off" />
    <label class="color-field" title="Cor 1 do time">
      <input type="color" name="color1" value="#ff7a1a" />
    </label>
    <label class="color-field" title="Cor 2 do time">
      <input type="color" name="color2" value="#1a1a22" />
    </label>`;
}

function renderRegistration(state) {
  const players = state.players
    .map(
      (p, i) => `
      <li class="player-row">
        <span class="p-idx">${i + 1}</span>
        <span class="p-name">${esc(p.name)}</span>
        ${colorRibbon(p)}
        <span class="p-team">${esc(p.team || '—')}</span>
        <button class="btn btn-icon" data-action="remove-player" data-id="${p.id}" title="Remover" aria-label="Remover">✕</button>
      </li>`
    )
    .join('');

  const n = state.players.length;
  const canStart = S.canStartTournament(state);

  return `
    <section class="panel">
      <h2>Cadastro de jogadores</h2>
      <form id="add-player-form" class="add-player-form">
        <input type="text" name="name" placeholder="Nome do jogador" autocomplete="off" required />
        ${teamFieldHtml()}
        <button type="submit" class="btn btn-primary">Adicionar</button>
      </form>
      <ul class="player-list">${players || '<li class="empty">Nenhum jogador cadastrado ainda.</li>'}</ul>
      <div class="player-count">${n} jogador${n === 1 ? '' : 'es'} cadastrado${n === 1 ? '' : 's'}${n > 0 && n < 4 ? ' · mínimo de 4 para iniciar' : ''}</div>
      <button class="btn btn-primary btn-lg" data-action="goto-config" ${canStart ? '' : 'disabled'}>
        Continuar para configuração ➜
      </button>
      ${!canStart ? '<p class="hint">Cadastre pelo menos 4 jogadores para continuar.</p>' : ''}
    </section>`;
}

// Reaproveitado tanto na configuração inicial quanto na Rodada 1 (pra quando
// um cadastro tardio deixa o total ímpar depois que o campeonato já começou
// e essa escolha nunca apareceu antes).
function oddHandlingFieldHtml(cfg, n) {
  return `
    <div class="field">
      <label>Tratamento do número ímpar (${n} jogadores)</label>
      <div class="segmented">
        <button type="button" class="seg-btn ${cfg.oddHandling === 'fixed' ? 'active' : ''}" data-action="set-odd-handling" data-value="fixed">Ponto fixo</button>
        <button type="button" class="seg-btn ${cfg.oddHandling === 'duel' ? 'active' : ''}" data-action="set-odd-handling" data-value="duel">Duelo dos folguistas</button>
      </div>
      ${
        cfg.oddHandling === 'fixed'
          ? `<div class="subfield">
              <label>Pontos de folga</label>
              <div class="segmented small">
                <button type="button" class="seg-btn ${cfg.fixedByePoints === 1 ? 'active' : ''}" data-action="set-fixed-bye-points" data-value="1">1 ponto</button>
                <button type="button" class="seg-btn ${cfg.fixedByePoints === 2 ? 'active' : ''}" data-action="set-fixed-bye-points" data-value="2">2 pontos</button>
              </div>
            </div>`
          : `<p class="hint locked">🔒 Com "duelo dos folguistas", a classificação fica travada em <strong>Soma R1+R2</strong>. Motivo: sob "só R2", o resultado do duelo avulso se tornaria o único fator decidindo o destino de quem folgou na R2 — um jogo estruturalmente diferente dos demais confrontos pareados por posição.</p>`
      }
    </div>`;
}

function renderConfigScreen(state) {
  const n = state.players.length;
  const canDirectKnockout = E.isPowerOfTwo(n);
  const cutoffOptions = S.availableCutoffSizes(state);
  const cfg = state.config;
  const effectiveDirectKnockout = cfg.directKnockout && canDirectKnockout;
  const isOdd = n % 2 === 1;

  return `
    <section class="panel">
      <h2>Configuração do campeonato</h2>
      <p class="hint">${n} jogador${n === 1 ? '' : 'es'} cadastrado${n === 1 ? '' : 's'}. <button type="button" class="link-btn" data-action="back-to-registration">‹ Voltar pro cadastro</button></p>

      ${
        canDirectKnockout
          ? `<div class="field">
              <label class="checkbox">
                <input type="checkbox" data-action="set-direct-knockout" ${cfg.directKnockout ? 'checked' : ''} />
                Pular fase de grupos e ir direto pro mata-mata (${n} é potência de 2)
              </label>
            </div>`
          : ''
      }

      ${
        !effectiveDirectKnockout
          ? `
        <div class="field">
          <label>Corte pro mata-mata</label>
          <div class="segmented">
            ${cutoffOptions
              .map(
                (v) => `<button type="button" class="seg-btn ${cfg.cutoffSize === v ? 'active' : ''}" data-action="set-cutoff" data-value="${v}">Top ${v}</button>`
              )
              .join('')}
          </div>
        </div>

        ${isOdd ? oddHandlingFieldHtml(cfg, n) : ''}

        ${
          !(isOdd && cfg.oddHandling === 'duel')
            ? `<div class="field">
              <label>Classificação usada para o corte</label>
              <div class="segmented">
                <button type="button" class="seg-btn ${cfg.classification === 'sum' ? 'active' : ''}" data-action="set-classification" data-value="sum">Soma R1+R2</button>
                <button type="button" class="seg-btn ${cfg.classification === 'r2only' ? 'active' : ''}" data-action="set-classification" data-value="r2only">Só R2 conta</button>
              </div>
              <p class="hint">
                <strong>Soma R1+R2:</strong> usa mais informação (12 jogos observados), mais estável, mas quem toma um "pau" na R1 carrega o buraco até o fim.<br/>
                <strong>Só R2 conta:</strong> sensação de reset mais literal e fácil de explicar, mas a R1 vira só um "sorteio de nível" disfarçado — ninguém tem motivo forte pra se esforçar nela.
              </p>
            </div>`
            : ''
        }
      `
          : `<p class="hint">Mata-mata direto: chaveamento por sorteio aleatório simples, sem fase de grupos.</p>`
      }

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" data-action="set-third-place" ${cfg.thirdPlaceMatch ? 'checked' : ''} />
          Disputar 3º lugar (semifinalistas perdedores se enfrentam)
        </label>
      </div>

      <button class="btn btn-primary btn-lg" data-action="start-tournament">
        🏁 Iniciar campeonato
      </button>
    </section>`;
}

// ---------- Rodadas (grupo) ----------
function renderRoundReveal(caption, actionName) {
  return `
    <section class="panel reveal-panel">
      <div class="reveal-icon">🎬</div>
      <h2>${esc(caption)}</h2>
      <p class="hint">Clique para revelar os confrontos com uma animaçãozinha de sorteio.</p>
      <button class="btn btn-primary btn-lg" data-action="${actionName}">Revelar sorteio</button>
    </section>`;
}

function lateArrivalWidget() {
  return `
    <div class="late-arrival">
      <div class="late-arrival-title">🏃 Jogador chegou atrasado?</div>
      <form id="late-player-form" class="add-player-form">
        <input type="text" name="name" placeholder="Nome do jogador" autocomplete="off" required />
        ${teamFieldHtml()}
        <button type="submit" class="btn btn-ghost">Encaixar na Rodada 1</button>
      </form>
      <p class="hint">Se já havia folguista, ele encara o recém-chegado num confronto real. Se não havia, o recém-chegado vira o folguista da rodada.</p>
    </div>`;
}

function renderRound1(state) {
  const late = S.canAddLatePlayer(state) ? lateArrivalWidget() : '';
  if (!state.reveal.round1) return renderRoundReveal('Sorteio da Rodada 1', 'reveal-round1') + `<section class="panel">${late}</section>`;
  const r1 = state.round1;
  const cards = r1.matches.map((m) => matchCard(state, m)).join('');
  const bye = byeCard(state, r1.byePlayerId, state.config);
  // Se um cadastro tardio deixou o total ímpar no meio da Rodada 1, essa
  // escolha nunca apareceu na configuração — dá pra decidir aqui, enquanto
  // ainda não avançou pra Rodada 2.
  const oddChoice = r1.byePlayerId ? oddHandlingFieldHtml(state.config, state.players.length) : '';
  const complete = r1.matches.every((m) => E.isMatchComplete(m));
  return `
    <section class="panel">
      <h2>Rodada 1 <span class="muted">· sorteio aleatório</span></h2>
      ${bye}
      ${oddChoice}
      <div class="match-grid">${cards}</div>
      ${late}
      <button class="btn btn-primary btn-lg" data-action="advance-round2" ${complete ? '' : 'disabled'}>
        Avançar para Rodada 2 ➜
      </button>
      ${!complete ? '<p class="hint">Registre o placar de todas as partidas (e a folga, se houver) para avançar.</p>' : ''}
    </section>`;
}

// Versão só-leitura da Rodada 1, acessível a partir da Rodada 2 (botão "‹ Ver
// Rodada 1"), com a classificação junto — explica visualmente por que um
// jogador específico ficou com a folga/pareamento que teve.
function renderRound1Recap(state) {
  const r1 = state.round1;
  const cards = r1.matches.map((m) => matchCard(state, m, { readonly: true })).join('');
  const bye = byeCard(state, r1.byePlayerId, state.config);
  const ranked = S.round1StandingsRanked(state);
  return `
    <section class="panel">
      <h2>Rodada 1 <span class="muted">· resultado</span></h2>
      ${bye}
      <div class="match-grid">${cards}</div>
      ${standingsTable(state, ranked, null)}
      <button class="btn btn-primary btn-lg" data-action="back-to-round2">‹ Voltar para Rodada 2</button>
    </section>`;
}

function renderRound2(state, uiExtra = {}) {
  if (uiExtra.showRound1Recap) return renderRound1Recap(state);
  const r2 = state.round2;
  const cards = r2.matches.map((m) => matchCard(state, m)).join('');
  const bye = byeCard(state, r2.byePlayerId, state.config);
  const duelCard = r2.byeDuelMatch
    ? matchCard(state, r2.byeDuelMatch, { tag: '⚔️ Duelo dos folguistas' })
    : r2.byeDuelSkipped
    ? '<div class="bye-card">ℹ️ O folguista da R1 coincidiu com o último colocado da R2 — duelo cancelado automaticamente (caso raro), sem partida extra.</div>'
    : '';
  const complete = r2.matches.every((m) => E.isMatchComplete(m)) && (!r2.byeDuelMatch || E.isMatchComplete(r2.byeDuelMatch));
  return `
    <section class="panel">
      <h2>Rodada 2 <span class="muted">· pareamento por colocação</span></h2>
      <p class="hint"><button type="button" class="link-btn" data-action="view-round1-recap">‹ Ver resultado da Rodada 1</button></p>
      ${bye}
      <div class="match-grid">${cards}</div>
      ${duelCard}
      <button class="btn btn-primary btn-lg" data-action="advance-cutoff" ${complete ? '' : 'disabled'}>
        Ver classificação final e corte ➜
      </button>
      ${!complete ? '<p class="hint">Registre o placar de todas as partidas para avançar.</p>' : ''}
    </section>`;
}

// ---------- Classificação / Tabela ----------
// Pts/SG/GP/GC nunca contam gol de pênalti (goalsForNormal/goalsAgainstNormal
// já vêm assim calculados do engine.js). opts.compact esconde a coluna "Time"
// e encolhe a fonte pra caber na lateral estreita.
function standingsTable(state, ranked, cutoffSize, opts = {}) {
  const compact = !!opts.compact;
  const rows = ranked
    .map((s) => {
      const cutClass = cutoffSize ? (s.rank <= cutoffSize ? 'cut-in' : 'cut-out') : '';
      const p = S.getPlayer(state, s.playerId);
      return `
        <tr class="${cutClass}">
          <td>${s.rank}º</td>
          <td>${colorRibbon(p || {})} ${esc(p ? p.name : '?')}</td>
          ${compact ? '' : `<td class="muted">${esc(p ? p.team : '')}</td>`}
          <td>${s.points}</td>
          <td>${s.gdNormal > 0 ? '+' : ''}${s.gdNormal}</td>
          <td>${s.goalsForNormal}</td>
          <td>${s.goalsAgainstNormal}</td>
        </tr>`;
    })
    .join('');
  return `
    <table class="standings ${compact ? 'compact' : ''}">
      <thead><tr><th>Pos</th><th>Jogador</th>${compact ? '' : '<th>Time</th>'}<th>Pts</th><th>SG</th><th>GP</th><th>GC</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${cutoffSize ? `<div class="cut-legend ${compact ? 'small' : ''}"><span class="dot cut-in"></span> classificado &nbsp; <span class="dot cut-out"></span> eliminado</div>` : ''}`;
}

// Ficha compacta pra lateral (sidebar) — mostra a classificação "se o corte
// fosse agora", ao vivo, enquanto a fase de grupos ainda está rolando.
function renderClassificationPanel(state, ranked) {
  return `
    <div class="classif-panel">
      <div class="classif-title">Classificação <span class="muted">· ao vivo</span></div>
      ${standingsTable(state, ranked, state.config.cutoffSize, { compact: true })}
    </div>`;
}

// Botão discreto (só aparece se houve fase de grupos) pra reabrir, já no
// mata-mata, a foto da classificação final — ela para de atualizar no
// instante em que o chaveamento é gerado.
function finalStandingsButton(state) {
  if (!state.cutoffResult) return '';
  return `<button type="button" class="btn-icon-standings" data-action="show-final-standings" title="Ver os resultados e a classificação de como a fase de grupos terminou">📊</button>`;
}

// Mostrado a partir do mata-mata (ícone 📊) — como não dá mais pra "voltar"
// de verdade pro chaveamento (ele é sempre à mostra, sem fases escondidas),
// isso serve de substituto: os resultados da Rodada 1 e 2 inteiros, mais a
// classificação final, tudo numa tela só, congelado no que já aconteceu.
export function finalStandingsModalHtml(state) {
  const { ranked, size } = state.cutoffResult;
  const r1 = state.round1;
  const r2 = state.round2;
  const r1Cards = r1.matches.map((m) => matchCard(state, m, { readonly: true })).join('');
  const r2Cards = r2.matches.map((m) => matchCard(state, m, { readonly: true })).join('');
  const r2Duel = r2.byeDuelMatch ? matchCard(state, r2.byeDuelMatch, { tag: '⚔️ Duelo dos folguistas', readonly: true }) : '';
  return `
    <h3>Fase de grupos · como terminou</h3>
    <div class="recap-block">
      <div class="recap-block-title">Rodada 1</div>
      ${byeCard(state, r1.byePlayerId, state.config)}
      <div class="match-grid">${r1Cards}</div>
    </div>
    <div class="recap-block">
      <div class="recap-block-title">Rodada 2</div>
      ${byeCard(state, r2.byePlayerId, state.config)}
      <div class="match-grid">${r2Cards}</div>
      ${r2Duel}
    </div>
    <div class="recap-block">
      <div class="recap-block-title">Classificação final</div>
      ${standingsTable(state, ranked, size)}
    </div>`;
}

function renderCutoffScreen(state) {
  const { ranked, size } = state.cutoffResult;
  const cfg = state.config;
  const modeLabel = cfg.classification === 'sum' ? 'Soma R1 + R2' : 'Só R2 conta';
  return `
    <section class="panel">
      <h2>Classificação final da fase de grupos</h2>
      <p class="hint">Critério usado: <strong>${modeLabel}</strong>${cfg.oddHandling === 'duel' ? ' (travado pelo duelo dos folguistas)' : ''}. Corte: <strong>Top ${size}</strong>.</p>
      ${standingsTable(state, ranked, size)}
      <button class="btn btn-primary btn-lg" data-action="generate-bracket">Gerar chaveamento do mata-mata ➜</button>
    </section>`;
}

// ---------- Mata-mata ----------
// Diferente da fase de grupos, o chaveamento do mata-mata não é sorteado na
// hora — é definido pela classificação (protegido por seed, tipo Copa do
// Mundo), então fica sempre à mostra: nada de animação de sorteio, e as fases
// futuras aparecem como "a definir" até os vencedores serem conhecidos.
const BRACKET_UNIT = 110; // px — precisa casar com a altura real de um .bracket-card

function bracketRoundSizes(topSize) {
  const sizes = [];
  let s = topSize;
  while (s >= 2) {
    sizes.push(s);
    s = s / 2;
  }
  return sizes;
}

// Card compacto do chaveamento — mesma linha-por-jogador do match-card normal,
// só com fonte/botões menores pra caber na coluna estreita.
function bracketCardHtml(state, m, readonly) {
  const winnerSide = m.status === 'done' ? E.matchPoints(m).winnerSide : null;
  const controls = readonly
    ? ''
    : `<div class="bracket-card-foot">
        ${m.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-action="mark-playing" data-match-id="${m.id}">Em jogo</button>` : ''}
        <button class="btn btn-primary btn-sm" data-action="open-score" data-match-id="${m.id}">${m.status === 'done' ? 'Editar' : 'Placar'}</button>
      </div>`;
  return `
    <div class="bracket-card ${m.status}">
      ${playerRowHtml(state, m, m.player1Id, 1, winnerSide)}
      ${playerRowHtml(state, m, m.player2Id, 2, winnerSide)}
      ${pensLineHtml(m)}
      ${controls}
    </div>`;
}

function bracketSlotHtml(state, m, readonly) {
  if (!m) return `<div class="bracket-tbd">A definir</div>`;
  return bracketCardHtml(state, m, readonly);
}

function renderBracketTree(state) {
  const k = state.knockout;
  const lastRound = k.rounds[k.rounds.length - 1];
  const sizes = bracketRoundSizes(k.size);
  const lastIdx = sizes.length - 1;

  const cols = sizes
    .map((size, i) => {
      const real = k.rounds.find((r) => r.size === size);
      const name = real ? real.name : E.bracketStageName(size);
      const matches = real ? real.matches : new Array(size / 2).fill(null);
      const slotH = BRACKET_UNIT * Math.pow(2, i);
      const isFirst = i === 0;
      const isLast = i === lastIdx;

      const readonly = state.phase === 'finished' || real !== lastRound;
      const slots = matches
        .map((m) => `<div class="bracket-slot" style="height:${slotH}px">${bracketSlotHtml(state, m, readonly)}</div>`)
        .join('');

      let vlines = '';
      if (!isLast) {
        for (let p = 0; p < matches.length / 2; p++) {
          const top = (2 * p + 0.5) * slotH;
          vlines += `<div class="bracket-vline" style="top:${top}px; height:${slotH}px"></div>`;
        }
      }

      return `
        <div class="bracket-round ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''}">
          <div class="bracket-round-title">${esc(name)}</div>
          <div class="bracket-round-body">${slots}${vlines}</div>
        </div>`;
    })
    .join('');

  const thirdPlace = k.thirdPlace
    ? `<div class="bracket-third">
        <div class="bracket-round-title">Disputa de 3º lugar</div>
        ${matchCard(state, k.thirdPlace, { readonly: state.phase === 'finished' })}
      </div>`
    : '';

  return `<div class="bracket-tree-wrap"><div class="bracket-tree">${cols}</div></div>${thirdPlace}`;
}

function renderKnockout(state, opts = {}) {
  const k = state.knockout;
  const lastRound = k.rounds[k.rounds.length - 1];
  const complete = lastRound.matches.every((m) => E.isMatchComplete(m));
  const isFinal = lastRound.size === 2;
  const H = opts.headingTag || 'h2';

  return `
    <section class="panel">
      <${H}>Mata-mata <span class="muted">· chaveamento</span> ${finalStandingsButton(state)}</${H}>
      ${renderBracketTree(state)}
      <button class="btn btn-primary btn-lg" data-action="advance-knockout" ${complete ? '' : 'disabled'}>
        ${isFinal ? '🏆 Consagrar campeão' : 'Avançar fase ➜'}
      </button>
      ${!complete ? '<p class="hint">Registre o placar de todas as partidas desta fase para avançar.</p>' : ''}
    </section>`;
}

function confettiSpans(champ) {
  const colors = champ ? [champ.color1 || '#ff7a1a', champ.color2 || '#1a1a22'] : ['#ff7a1a', '#ff3d1c', '#ffcb05', '#3b6fe0', '#8b3ff0', '#ffb347'];
  let html = '';
  for (let i = 0; i < 40; i++) {
    const left = Math.random() * 100;
    const delay = Math.random() * 2.5;
    const duration = 2.2 + Math.random() * 1.8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    html += `<span class="confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${duration}s;"></span>`;
  }
  return html;
}

function renderFinished(state) {
  const champ = S.getPlayer(state, state.knockout.championId);
  const barStyle = champ ? `background: linear-gradient(90deg, ${esc(champ.color1 || '#ff7a1a')} 50%, ${esc(champ.color2 || '#1a1a22')} 50%);` : '';
  return `
    <section class="panel champion-panel">
      <div class="champion-bar champion-bar-top" style="${barStyle}"></div>
      ${confettiSpans(champ)}
      <div class="champion-badge">🏆</div>
      <h1>Campeão da noite!</h1>
      <div class="champion-name-row">
        ${champ ? colorRibbon(champ, 'champion-ribbon') : ''}
        <div class="champion-name">${esc(champ ? champ.name : '?')}</div>
      </div>
      <div class="champion-team">${esc(champ ? champ.team : '')}</div>
      ${finalStandingsButton(state)}
      <div class="champion-bar champion-bar-bottom" style="${barStyle}"></div>
    </section>
    ${renderBracketTree(state)}`;
}

// ---------- Header / shell ----------
function renderHeader(state) {
  const isOperator = state.viewMode === 'operator';
  return `
    <header class="app-header">
      <div class="brand">
        <img src="assets/logo-nextgen.png" alt="NextGen" class="brand-logo" />
        <div class="brand-title">Campeonato FIFA VIVA 2026</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost" data-action="toggle-view">${isOperator ? '📺 Modo Telão' : '🛠 Modo Operador'}</button>
        ${
          isOperator
            ? `<button class="btn btn-ghost" data-action="download-backup" title="Baixar um arquivo com todo o progresso do campeonato">💾 Baixar backup</button>
               <button class="btn btn-ghost" data-action="trigger-upload-backup" title="Carregar um backup salvo anteriormente">📂 Carregar backup</button>
               <input type="file" id="backup-file-input" accept="application/json" hidden />`
            : ''
        }
        <button class="btn btn-ghost btn-danger" data-action="reset-all">Reiniciar tudo</button>
      </div>
    </header>`;
}

function renderOperatorMain(state, uiExtra) {
  switch (state.phase) {
    case 'registration':
      return renderRegistration(state);
    case 'config':
      return renderConfigScreen(state);
    case 'round1':
      return renderRound1(state);
    case 'round2':
      return renderRound2(state, uiExtra);
    case 'cutoff':
      return renderCutoffScreen(state);
    case 'knockout':
      return renderKnockout(state);
    case 'finished':
      return renderFinished(state);
    default:
      return '';
  }
}

function renderTelao(state) {
  let content = '';
  if (state.phase === 'registration' || state.phase === 'config') {
    content = `<section class="panel telao-wait"><h1>Aguardando início do campeonato…</h1><p>${state.players.length} jogadores cadastrados</p></section>`;
  } else if (state.phase === 'round1' || state.phase === 'round2') {
    const round = state.phase === 'round1' ? state.round1 : state.round2;
    const title = state.phase === 'round1' ? 'Rodada 1' : 'Rodada 2';
    if (state.phase === 'round1' && !state.reveal.round1) {
      content = `<section class="panel telao-wait"><h1>${title}</h1><p>Sorteio em andamento no telão do organizador…</p></section>`;
    } else {
      const cards = round.matches.map((m) => matchCard(state, m, { readonly: true })).join('');
      content = `<section class="panel"><h1>${title}</h1><div class="match-grid telao-grid">${cards}</div></section>`;
    }
  } else if (state.phase === 'cutoff') {
    content = `<section class="panel"><h1>Classificação final</h1>${standingsTable(state, state.cutoffResult.ranked, state.cutoffResult.size)}</section>`;
  } else if (state.phase === 'knockout') {
    content = renderKnockout(state, { headingTag: 'h1' });
  } else if (state.phase === 'finished') {
    content = renderFinished(state);
  }
  return `<div class="telao-layout">${content}${queueVisible(state) ? renderSidebar(state) : ''}</div>`;
}

// Fica fixa no canto inferior direito da tela, separada da marca do
// cabeçalho — sobe um pouco quando o ticker está na tela pra não sobrepor.
const cornerLogoHtml = `<img src="assets/logo-igreja-viva.png" alt="Igreja Viva" class="brand-logo-corner" />`;

export function render(state, rootEl, uiExtra = {}) {
  const header = renderHeader(state);
  if (state.viewMode === 'telao') {
    rootEl.innerHTML = `${header}<main class="telao">${renderTelao(state)}</main>${cornerLogoHtml}`;
    return;
  }
  const showQueue = queueVisible(state);
  rootEl.innerHTML = `
    ${header}
    <main class="operator ${showQueue ? 'with-queue' : ''}">
      <div class="main-content">${renderOperatorMain(state, uiExtra)}</div>
      ${showQueue ? `<aside class="sidebar">${renderSidebar(state)}</aside>` : ''}
    </main>
    ${cornerLogoHtml}`;
}
