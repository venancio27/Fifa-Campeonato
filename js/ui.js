import * as S from './state.js';
import * as E from './engine.js';

// innerHTML escapa & < >, mas não aspas — e o resultado daqui também é
// interpolado dentro de atributos (value="...", title="..."). Sem escapar,
// um nome como Zé "Pelé" fecharia o atributo no meio e o jogador voltava
// truncado do modal de edição. As entidades voltam a virar aspas normais na
// renderização, então o texto visível não muda.
export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Bandeirinha horizontal com as cores do time (Cor 1 - Cor 2 - Cor 1, em faixa
// diagonal) — um detalhe discreto, não um escudo. Usado na lista de jogadores,
// no sorteio e no ticker.
export function colorRibbon(p, className = 'color-ribbon') {
  const c1 = esc((p && p.color1) || '#ff7a1a');
  const c2 = esc((p && p.color2) || '#1a1a22');
  const gradient = `linear-gradient(to top right, ${c1} 0%, ${c1} 33%, ${c2} 33%, ${c2} 66%, ${c1} 66%, ${c1} 100%)`;
  return `<span class="${className}" style="background:${gradient}; border-color:${c1};"></span>`;
}

// Campo de cor com o código hex como forma principal de digitar (primeira
// opção, editável) e um seletor visual pequeno ao lado, sincronizado com ele.
export function colorFieldHtml(name, label, value) {
  const v = esc((value || '#ff7a1a').toLowerCase());
  return `
    <label class="color-field" title="${esc(label)} do time">
      <span class="color-field-label">${esc(label)}</span>
      <span class="color-input-group">
        <input type="text" name="${name}" class="color-hex-input" value="${v}" maxlength="7" placeholder="#RRGGBB" autocomplete="off" spellcheck="false" />
        <input type="color" class="color-swatch-input" value="${v}" tabindex="-1" aria-label="Selecionar ${esc(label)} visualmente" />
      </span>
    </label>`;
}

// Sincroniza o campo de texto (hex) com o seletor visual de cor, nos dois
// sentidos, via delegação de evento — funciona tanto no form de cadastro
// (montado em #app) quanto no modal de edição (montado fora dele).
export function wireColorInputs(root) {
  root.addEventListener('input', (e) => {
    const swatch = e.target.closest('.color-swatch-input');
    if (swatch) {
      const group = swatch.closest('.color-input-group');
      const hexInput = group && group.querySelector('.color-hex-input');
      if (hexInput) hexInput.value = swatch.value;
      return;
    }
    const hexInput = e.target.closest('.color-hex-input');
    if (hexInput) {
      const group = hexInput.closest('.color-input-group');
      const swatchInput = group && group.querySelector('.color-swatch-input');
      if (swatchInput && /^#[0-9a-fA-F]{6}$/.test(hexInput.value)) {
        swatchInput.value = hexInput.value;
      }
    }
  });
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
  const pts = cfg.fixedByePoints;
  const note =
    cfg.oddHandling === 'fixed'
      ? `ganha ${pts} ponto${pts > 1 ? 's' : ''} de folga`
      : cfg.oddHandling === 'repechage'
        ? 'sem pontos — disputa a repescagem pela última vaga do corte'
        : 'sem pontos agora — vai jogar o duelo dos folguistas';
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
    ${colorFieldHtml('color1', 'Cor 1', '#ff7a1a')}
    ${colorFieldHtml('color2', 'Cor 2', '#1a1a22')}`;
}

// A capa da tela de cadastro. Segue a linguagem da landing page da igreja:
// pombo de fogo grande flutuando, brilho radial por trás e faíscas subindo
// (essas vêm do canvas, animado em hero.js). Só a Rodada 0 tem isso — depois
// que o campeonato começa, a tela vira ferramenta de operação.
function renderCoverHero(state) {
  const n = state.players.length;
  return `
    <section class="hero-cover">
      <canvas class="hero-embers" aria-hidden="true"></canvas>
      <div class="hero-inner">
        <div class="hero-copy">
          <div class="hero-eyebrow">
            <img src="assets/logo-viva-mark.png" alt="" aria-hidden="true" />
            Campeonato FIFA · NextGen
          </div>
          <h1 class="hero-title">Cadastro de <span class="flame-text">jogadores.</span><br />A noite começa <span class="flame-text">aqui.</span></h1>
          <p class="hero-lead">
            Coloque todo mundo na lista com o time e as cores. Quando a chave fechar,
            o sorteio da Rodada 1 abre a noite.
          </p>
          <div class="hero-ctas">
            <button class="btn btn-primary btn-pill" data-action="focus-name">Cadastrar jogador ➜</button>
            <div class="hero-count"><strong>${n}</strong> ${n === 1 ? 'jogador na lista' : 'jogadores na lista'}</div>
          </div>
        </div>
        <div class="hero-mark">
          <div class="hero-glow" aria-hidden="true"></div>
          <img src="assets/logo-viva-mark.png" alt="Igreja Viva" />
        </div>
      </div>
    </section>`;
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
        <button class="btn btn-icon" data-action="edit-player" data-id="${p.id}" title="Editar" aria-label="Editar">✎</button>
        <button class="btn btn-icon" data-action="remove-player" data-id="${p.id}" title="Remover" aria-label="Remover">✕</button>
      </li>`
    )
    .join('');

  const n = state.players.length;
  const canStart = S.canStartTournament(state);

  return `
    ${renderCoverHero(state)}
    <section class="panel">
      <h2>Lista de jogadores</h2>
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
  // Com rodada única existe no máximo um folguista, então não há com quem
  // duelar — sobra só o ponto fixo, e o seletor some pra não oferecer algo
  // que seria revertido em seguida.
  const single = cfg.groupRounds === 1;
  return `
    <div class="field">
      <label>Tratamento do número ímpar (${n} jogadores)</label>
      ${
        single
          ? `<div class="segmented">
        <button type="button" class="seg-btn ${cfg.oddHandling === 'repechage' ? 'active' : ''}" data-action="set-odd-handling" data-value="repechage">Repescagem</button>
        <button type="button" class="seg-btn ${cfg.oddHandling === 'fixed' ? 'active' : ''}" data-action="set-odd-handling" data-value="fixed">Ponto fixo</button>
      </div>`
          : `<div class="segmented">
        <button type="button" class="seg-btn ${cfg.oddHandling === 'fixed' ? 'active' : ''}" data-action="set-odd-handling" data-value="fixed">Ponto fixo</button>
        <button type="button" class="seg-btn ${cfg.oddHandling === 'duel' ? 'active' : ''}" data-action="set-odd-handling" data-value="duel">Duelo dos folguistas</button>
      </div>`
      }
      ${
        cfg.oddHandling === 'repechage'
          ? '<p class="hint">O folguista não recebe pontos: ele desafia quem terminar na última vaga do corte, e quem vencer fica com ela. Assim ninguém entra no mata-mata sem jogar.</p>'
          : ''
      }
      ${
        cfg.oddHandling === 'fixed'
          ? `<div class="subfield">
              <label>Pontos de folga</label>
              <div class="segmented small">
                <button type="button" class="seg-btn ${cfg.fixedByePoints === 1 ? 'active' : ''}" data-action="set-fixed-bye-points" data-value="1">1 ponto</button>
                <button type="button" class="seg-btn ${cfg.fixedByePoints === 2 ? 'active' : ''}" data-action="set-fixed-bye-points" data-value="2">2 pontos</button>
              </div>
            </div>`
          : cfg.oddHandling === 'duel'
            ? `<p class="hint locked">🔒 Com "duelo dos folguistas", a classificação fica travada em <strong>Soma R1+R2</strong>. Motivo: sob "só R2", o resultado do duelo avulso se tornaria o único fator decidindo o destino de quem folgou na R2 — um jogo estruturalmente diferente dos demais confrontos pareados por posição.</p>`
            : ''
      }
    </div>`;
}

// Nota discreta no canto do painel de configuração: quantos jogos o formato
// escolhido deve gerar. Recalcula a cada clique porque toda opção da tela
// (rodadas, corte, ímpar, 3º lugar) entra na conta.
function matchEstimateCornerHtml(state) {
  const est = S.estimateMatchCount(state);
  if (!est.total) return '';
  const til = est.approx ? '≈ ' : '';
  return `<div class="match-estimate" title="Estimativa de partidas com as opções atuais (grupos: ${est.group} · mata-mata: ${est.knockout})">${til}${est.total} partida${est.total === 1 ? '' : 's'} no total</div>`;
}

function renderConfigScreen(state) {
  const n = state.players.length;
  const canDirectKnockout = E.isPowerOfTwo(n);
  const cutoffOptions = S.availableCutoffSizes(state);
  const cfg = state.config;
  const effectiveDirectKnockout = cfg.directKnockout && canDirectKnockout;
  const isOdd = n % 2 === 1;

  return `
    <section class="panel config-panel">
      ${matchEstimateCornerHtml(state)}
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
          <label>Formato da fase de grupos</label>
          <div class="segmented">
            <button type="button" class="seg-btn ${cfg.groupRounds === 2 ? 'active' : ''}" data-action="set-group-rounds" data-value="2">2 rodadas</button>
            <button type="button" class="seg-btn ${cfg.groupRounds === 1 ? 'active' : ''}" data-action="set-group-rounds" data-value="1">Rodada única</button>
          </div>
          <p class="hint">
            <strong>2 rodadas:</strong> todo mundo joga pelo menos 2 partidas antes do corte. A segunda rodada pareia por colocação (1º x último), então a classificação tem mais informação.<br/>
            <strong>Rodada única:</strong> 1 jogo por pessoa e o corte sai direto dali — noite bem mais curta, mas quem perde o primeiro jogo já está fora da disputa por vaga.
          </p>
        </div>

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
          cfg.groupRounds === 2 && !(isOdd && cfg.oddHandling === 'duel')
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
function renderRoundReveal(caption, actionName, extra = '') {
  return `
    <section class="panel reveal-panel">
      <div class="reveal-icon">🎬</div>
      <h2>${esc(caption)} ${extra}</h2>
      <p class="hint">Clique para revelar os confrontos com uma animaçãozinha de sorteio.</p>
      <button class="btn btn-primary btn-lg" data-action="${actionName}">Revelar sorteio</button>
    </section>`;
}

// Um ícone só (⚙, discreto) concentra todos os ajustes de operador da rodada:
// corte do mata-mata, tratamento do número ímpar e cadastro tardio. A tela
// principal fica só com os confrontos — esses ajustes são exceção, não rotina.
function settingsIconHtml(state) {
  if (!hasRoundSettings(state)) return '';
  return `<button type="button" class="btn-icon-standings" data-action="open-settings-modal" title="Configurações da rodada (corte, número ímpar, jogador atrasado)">⚙</button>`;
}

function hasRoundSettings(state) {
  // Rodada travada pela repescagem: nada de ajustar corte, número ímpar ou
  // encaixar atrasado. Qualquer um dos três muda a classificação em que o
  // desafiado foi escolhido, deixando a repescagem apontando pro lugar errado.
  if (state.round1 && state.round1.repechageMatch) return false;
  if (S.availableCutoffSizes(state).length > 1) return true;
  if (state.phase === 'round1' && state.round1 && state.round1.byePlayerId) return true;
  return S.canAddLatePlayer(state);
}

function renderRound1(state) {
  if (!state.reveal.round1) return renderRoundReveal('Sorteio da Rodada 1', 'reveal-round1', settingsIconHtml(state));
  const r1 = state.round1;
  const bye = byeCard(state, r1.byePlayerId, state.config);
  const roundDone = r1.matches.every((m) => E.isMatchComplete(m));
  // No formato de rodada única a R1 é a fase de grupos inteira, então ela vai
  // direto pro corte em vez de abrir a Rodada 2.
  const single = state.config.groupRounds === 1;

  // Três estados possíveis do botão quando há repescagem: ainda falta jogar a
  // rodada, falta definir/jogar a repescagem, ou está tudo pronto pro corte.
  const rep = r1.repechageMatch;
  const repStep = S.usesRepechage(state) && (rep || S.canCreateRepechage(state));
  let action = single ? 'advance-cutoff' : 'advance-round2';
  let label = single ? 'Fechar fase de grupos ➜' : 'Avançar para Rodada 2 ➜';
  let enabled = roundDone;
  let hint = roundDone ? '' : 'Registre o placar de todas as partidas (e a folga, se houver) para avançar.';

  if (repStep && !rep) {
    action = 'create-repechage';
    label = '⚔️ Definir repescagem ➜';
    if (roundDone) {
      hint = r1.repechageReset
        ? `⚠️ O placar corrigido mudou quem está na ${state.config.cutoffSize}ª posição, então a repescagem anterior foi descartada — ela apontava para outro jogador. Defina de novo.`
        : `O folguista vai desafiar quem terminar na ${state.config.cutoffSize}ª posição — a última vaga do Top ${state.config.cutoffSize}.`;
    }
  } else if (rep) {
    enabled = roundDone && E.isMatchComplete(rep);
    if (roundDone && !E.isMatchComplete(rep)) hint = 'Registre o placar da repescagem para fechar a fase de grupos.';
  }

  // Com a repescagem definida, os placares da rodada travam: o sorteio já foi
  // feito na frente de todo mundo e o desafiado já foi anunciado. Corrigir um
  // erro de digitação continua possível, mas exige reabrir a rodada de forma
  // explícita — nada muda em silêncio depois do que a sala viu.
  const cards = r1.matches.map((m) => matchCard(state, m, { readonly: !!rep })).join('');

  const repCard = rep
    ? `<div class="repechage-block">
        ${matchCard(state, rep, { tag: `⚔️ Repescagem · vale a última vaga do Top ${state.config.cutoffSize}` })}
      </div>
      <div class="round-locked">
        <span>🔒 Rodada travada — o sorteio e a repescagem foram definidos em cima desta classificação.</span>
        <button class="btn btn-ghost btn-sm" data-action="cancel-repechage">Cancelar repescagem e reabrir a rodada</button>
      </div>`
    : '';

  return `
    <section class="panel">
      <h2>${single ? 'Rodada única' : 'Rodada 1'} <span class="muted">· sorteio aleatório</span> ${settingsIconHtml(state)}</h2>
      ${bye}
      <div class="match-grid">${cards}</div>
      ${repCard}
      <button class="btn btn-primary btn-lg" data-action="${action}" ${enabled ? '' : 'disabled'}>
        ${label}
      </button>
      ${hint ? `<p class="hint">${hint}</p>` : ''}
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
      <h2>Rodada 2 <span class="muted">· pareamento por colocação</span> ${settingsIconHtml(state)}</h2>
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
function playerNameOf(state, playerId) {
  const p = S.getPlayer(state, playerId);
  return p ? p.name : '?';
}

function standingsTable(state, ranked, cutoffSize, opts = {}) {
  const compact = !!opts.compact;

  // Toda posição que só o sorteio separou é marcada com 🎲 e listada embaixo.
  // Sem isso o desempate aleatório fica invisível e a tabela parece arbitrária
  // — é exatamente o que gera reclamação na hora do corte.
  const groups = [];
  for (const s of ranked) {
    if (s.drawGroup && !groups.some((g) => g.id === s.drawGroup.id)) groups.push(s.drawGroup);
  }

  const rows = ranked
    .map((s) => {
      const cutClass = cutoffSize ? (s.rank <= cutoffSize ? 'cut-in' : 'cut-out') : '';
      const p = S.getPlayer(state, s.playerId);
      const drawMark = s.drawGroup
        ? `<span class="draw-mark" title="Empate total com ${s.drawGroup.from}º-${s.drawGroup.to}º: posição definida por sorteio (regra 5)">🎲</span>`
        : '';
      const repMark = s.viaRepechage ? '<span class="rep-mark" title="Posição definida na repescagem">⚔️</span>' : '';
      return `
        <tr class="${cutClass} ${s.drawGroup ? 'by-draw' : ''}">
          <td>${s.rank}º</td>
          <td>${colorRibbon(p || {})} ${esc(p ? p.name : '?')}${drawMark}${repMark}</td>
          ${compact ? '' : `<td class="muted">${esc(p ? p.team : '')}</td>`}
          <td>${s.points}</td>
          <td>${s.played}</td>
          <td>${s.gdNormal > 0 ? '+' : ''}${s.gdNormal}</td>
          <td>${s.goalsForNormal}</td>
          <td>${s.goalsAgainstNormal}</td>
        </tr>`;
    })
    .join('');

  // A linha da repescagem contraria a leitura normal da tabela (o vencedor
  // pode ter 0 pontos e ficar acima de quem tem 3), então explica em texto —
  // no telão ninguém vai descobrir isso passando o mouse no ⚔️.
  const repRows = ranked.filter((s) => s.viaRepechage);
  const repNote =
    repRows.length === 2
      ? `<div class="draw-note rep-note">
          <div class="draw-note-title">⚔️ Repescagem pela última vaga</div>
          <p>O folguista não pontuou na rodada (não jogou), então disputou a ${repRows[0].rank}ª vaga em partida única contra quem a ocupava. Por isso essas duas posições não seguem a ordem de pontos:</p>
          <ul>
            <li><strong>${esc(playerNameOf(state, repRows[0].playerId))}</strong> venceu e ficou com a vaga (${repRows[0].rank}º)</li>
            <li><strong>${esc(playerNameOf(state, repRows[1].playerId))}</strong> perdeu e caiu para ${repRows[1].rank}º</li>
          </ul>
        </div>`
      : '';

  // "Realizado ao vivo" só aparece quando o sorteio de fato rodou na tela.
  // Na classificação provisória (durante as rodadas) ele ainda não aconteceu,
  // e prometer um sorteio que não houve seria pior que não dizer nada.
  const drawn = state.tiebreakDraw || {};
  const jaSorteado = ranked.some((s) => s.drawGroup && drawn[s.playerId] != null);
  const drawNote = groups.length
    ? `<div class="draw-note">
        <div class="draw-note-title">🎲 Desempate por sorteio${jaSorteado ? ' (realizado ao vivo)' : ''}</div>
        <p>Nest${groups.length > 1 ? 'as faixas' : 'a faixa'} todos os critérios da regra 5 empataram (pontos, saldo, gols, confronto direto e pênaltis). ${
          jaSorteado
            ? 'A ordem abaixo foi sorteada na tela, no fechamento da fase de grupos:'
            : 'A ordem só será decidida no sorteio, ao fechar a fase de grupos:'
        }</p>
        <ul>${groups.map((g) => `<li><strong>${g.from}º ao ${g.to}º</strong> — ${g.to - g.from + 1} jogadores empatados em tudo</li>`).join('')}</ul>
      </div>`
    : '';

  return `
    <table class="standings ${compact ? 'compact' : ''}">
      <thead><tr><th>Pos</th><th>Jogador</th>${compact ? '' : '<th>Time</th>'}<th>Pts</th><th title="Jogos realizados">J</th><th>SG</th><th>GP</th><th>GC</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${cutoffSize ? `<div class="cut-legend ${compact ? 'small' : ''}"><span class="dot cut-in"></span> classificado &nbsp; <span class="dot cut-out"></span> eliminado</div>` : ''}
    ${compact ? '' : repNote + drawNote}`;
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
  const r2 = state.round2; // null no formato de rodada única
  const r1Cards = r1.matches.map((m) => matchCard(state, m, { readonly: true })).join('');
  const r2Block = r2
    ? `<div class="recap-block">
        <div class="recap-block-title">Rodada 2</div>
        ${byeCard(state, r2.byePlayerId, state.config)}
        <div class="match-grid">${r2.matches.map((m) => matchCard(state, m, { readonly: true })).join('')}</div>
        ${r2.byeDuelMatch ? matchCard(state, r2.byeDuelMatch, { tag: '⚔️ Duelo dos folguistas', readonly: true }) : ''}
      </div>`
    : '';
  // A repescagem decidiu uma vaga — precisa aparecer no recap junto com a
  // rodada, senão a tabela mostra duas posições trocadas sem o jogo que as
  // trocou.
  const repBlock = r1.repechageMatch
    ? `<div class="recap-block">
        <div class="recap-block-title">Repescagem · última vaga do Top ${state.cutoffResult.size}</div>
        <div class="match-grid">${matchCard(state, r1.repechageMatch, { tag: '⚔️ Repescagem', readonly: true })}</div>
      </div>`
    : '';

  return `
    <h3>Fase de grupos · como terminou</h3>
    <div class="recap-block">
      <div class="recap-block-title">${r2 ? 'Rodada 1' : 'Rodada única'}</div>
      ${byeCard(state, r1.byePlayerId, state.config)}
      <div class="match-grid">${r1Cards}</div>
    </div>
    ${r2Block}
    ${repBlock}
    <div class="recap-block">
      <div class="recap-block-title">Classificação final</div>
      ${standingsTable(state, ranked, size)}
    </div>`;
}

function renderCutoffScreen(state) {
  const { ranked, size } = state.cutoffResult;
  const cfg = state.config;
  const modeLabel =
    cfg.groupRounds === 1 ? 'Rodada única' : cfg.classification === 'sum' ? 'Soma R1 + R2' : 'Só R2 conta';
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
// A altura de cada slot é múltipla de --bracket-unit (CSS var). O valor não é
// fixo porque a altura real de um card varia com a fase: botão "Em jogo" só
// aparece em partida pendente, linha de pênaltis só em empate, e o modo
// operador tem botões que o telão não tem. Por isso a unidade é MEDIDA depois
// de renderizar (syncBracketUnit) — com valor fixo, os cards da primeira
// coluna estouravam o slot e encostavam uns nos outros.
function syncBracketUnit(rootEl) {
  const tree = rootEl.querySelector('.bracket-tree');
  if (!tree) return;
  let tallest = 0;
  tree.querySelectorAll('.bracket-card, .bracket-tbd').forEach((el) => {
    tallest = Math.max(tallest, el.offsetHeight);
  });
  if (!tallest) return;
  // + padding vertical do slot (12px) + respiro entre cards vizinhos
  tree.style.setProperty('--bracket-unit', `${tallest + 20}px`);
}

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
      const slotUnits = Math.pow(2, i);
      const isFirst = i === 0;
      const isLast = i === lastIdx;

      const readonly = state.phase === 'finished' || real !== lastRound;
      const slots = matches
        .map((m) => `<div class="bracket-slot" style="height:calc(var(--bracket-unit) * ${slotUnits})">${bracketSlotHtml(state, m, readonly)}</div>`)
        .join('');

      let vlines = '';
      if (!isLast) {
        for (let p = 0; p < matches.length / 2; p++) {
          const top = (2 * p + 0.5) * slotUnits;
          vlines += `<div class="bracket-vline" style="top:calc(var(--bracket-unit) * ${top}); height:calc(var(--bracket-unit) * ${slotUnits})"></div>`;
        }
      }

      return `
        <div class="bracket-round ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''}">
          <div class="bracket-round-title">${esc(name)}</div>
          <div class="bracket-round-body">${slots}${vlines}</div>
        </div>`;
    })
    .join('');

  // O 3º lugar entra como uma coluna extra da árvore, encostada embaixo: é
  // exatamente onde sobra espaço (embaixo da final) e economiza a altura que
  // ele custava quando ficava solto embaixo do chaveamento inteiro.
  const thirdPlace = k.thirdPlace
    ? `<div class="bracket-third">
        <div class="bracket-round-title">Disputa de 3º lugar</div>
        ${matchCard(state, k.thirdPlace, { readonly: state.phase === 'finished' })}
      </div>`
    : '';

  return `<div class="bracket-tree-wrap"><div class="bracket-tree">${cols}${thirdPlace}</div></div>`;
}

function renderKnockout(state, opts = {}) {
  const k = state.knockout;
  const lastRound = k.rounds[k.rounds.length - 1];
  const isFinal = lastRound.size === 2;
  const H = opts.headingTag || 'h2';

  // A disputa de 3º lugar nasce junto com a final e mora fora de rounds[], então
  // precisa entrar na conta explicitamente: consagrar o campeão põe a fase em
  // "finished", que deixa o card do 3º lugar somente-leitura — se ele ainda
  // estivesse pendente, o placar não teria mais como ser lançado.
  const roundDone = lastRound.matches.every((m) => E.isMatchComplete(m));
  const thirdPending = !!k.thirdPlace && !E.isMatchComplete(k.thirdPlace);
  const complete = roundDone && !thirdPending;

  const pendingHint = thirdPending && roundDone
    ? 'Falta lançar o placar da disputa de 3º lugar antes de consagrar o campeão.'
    : 'Registre o placar de todas as partidas desta fase para avançar.';

  return `
    <section class="panel">
      <${H}>Mata-mata <span class="muted">· chaveamento</span> ${finalStandingsButton(state)}</${H}>
      ${renderBracketTree(state)}
      <button class="btn btn-primary btn-lg" data-action="advance-knockout" ${complete ? '' : 'disabled'}>
        ${isFinal ? '🏆 Consagrar campeão' : 'Avançar fase ➜'}
      </button>
      ${!complete ? `<p class="hint">${pendingHint}</p>` : ''}
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

// ---------- Regulamento ----------
// Disponível em qualquer fase pelo botão do cabeçalho. A numeração (1 a 18) é
// a mesma do regulamento combinado com os jogadores, pra dar pra citar "regra
// 9" numa discussão no meio da noite sem ambiguidade.
export function rulesModalHtml() {
  return `
    <h3>📖 Regras do Campeonato de FIFA</h3>
    <div class="rules-body">

      <div class="rules-section">
        <div class="rules-section-title">Cadastro e times</div>
        <ol class="rules-list">
          <li>Cada jogador se inscreve com <strong>nome + time do FIFA</strong> que vai usar.</li>
          <li>O time escolhido vale pro campeonato inteiro — <strong>sem trocar de time</strong> durante o campeonato.</li>
        </ol>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Formato</div>
        <ol class="rules-list" start="3">
          <li>O formato do campeonato será <strong>definido no dia, por votação</strong> entre os inscritos, assim que soubermos o número exato de participantes. Vence a opção mais votada; em caso de empate, o voto do organizador desempata.</li>
        </ol>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Pontuação e desempate <span class="rules-note">(fase de grupos, se houver)</span></div>
        <ol class="rules-list" start="4">
          <li>
            Pontuação por partida:
            <table class="rules-table">
              <tr><td>Vitória no tempo normal</td><td><strong>3</strong></td></tr>
              <tr><td>Vitória nos pênaltis</td><td><strong>2</strong></td></tr>
              <tr><td>Derrota nos pênaltis</td><td><strong>1</strong></td></tr>
              <tr><td>Derrota no tempo normal</td><td><strong>0</strong></td></tr>
            </table>
          </li>
          <li>
            Desempate na classificação, <strong>nesta ordem</strong>:
            <ol class="rules-sublist">
              <li>Pontos totais</li>
              <li>Saldo de gols <strong>no tempo normal</strong></li>
              <li>Gols marcados no tempo normal</li>
              <li>Confronto direto (se os dois jogaram entre si)</li>
              <li>Saldo de gols nos pênaltis</li>
              <li>Gols marcados nos pênaltis</li>
              <li>Sorteio</li>
            </ol>
            <p class="rules-why">Os pênaltis ficam por último de propósito: o resultado do pênalti já virou ponto na regra 4, então contá-lo de novo no saldo pesaria duas vezes.</p>
          </li>
        </ol>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Tempo de jogo</div>
        <ol class="rules-list" start="6">
          <li>Rodadas 1 e 2 (se houver fase de grupos): <strong>4 minutos</strong> por tempo.</li>
          <li>A partir das quartas de final: <strong>5 minutos</strong> por tempo.</li>
          <li>Empatou depois do tempo normal → <strong>pênaltis</strong>.</li>
        </ol>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Paradas durante a partida <span class="rules-note">(a cota é de cada jogador; cada parada de até 30s)</span></div>
        <ol class="rules-list" start="9">
          <li>Fase de grupos e quartas de final: <strong>1 parada por jogador</strong>.</li>
          <li>A partir das semifinais: <strong>2 paradas por jogador</strong>.</li>
          <li>Na final: <strong>3 paradas por jogador</strong>.</li>
          <li>Se um jogador <strong>se machucar</strong>, a parada não entra na cota — é à parte, sem limite.</li>
        </ol>
        <p class="rules-why">Cada um gasta a sua: assim ninguém queima a cota do adversário pausando de propósito.</p>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Montagem do time</div>
        <ol class="rules-list" start="13">
          <li>Rodada 1: até <strong>2 minutos</strong> para montagem do time antes da partida.</li>
          <li>A partir da segunda rodada: até <strong>1 minuto</strong>.</li>
        </ol>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Ausência (W.O.)</div>
        <ol class="rules-list" start="15">
          <li>Se o jogador for chamado e não aparecer em até <strong>3 minutos</strong>, perde a partida por W.O.</li>
          <li>Exceção: em caso extremo, com justificativa (ex.: saiu pra comprar algo pro evento), o W.O. pode ser cancelado se pelo menos <strong>metade + 1</strong> das pessoas presentes concordarem com a justificativa <em>e</em> concordarem em alterar a ordem das partidas.</li>
        </ol>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">Outras</div>
        <ol class="rules-list" start="17">
          <li>Problema técnico do console/controle <strong>não conta</strong> na cota de paradas — igual à regra de lesão.</li>
          <li>Regras excepcionais podem ser adicionadas e acordadas no decorrer da competição, apenas em caso de trazer maior dinamicidade ao campeonato. Para ser aprovada, precisa de pelo menos <strong>2/3 dos votantes</strong>.</li>
        </ol>
      </div>

    </div>`;
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
        <button class="btn btn-ghost" data-action="show-rules" title="Ver o regulamento do campeonato">📖 Regras</button>
        <button class="btn btn-ghost" data-action="toggle-view">${isOperator ? '📺 Modo Telão' : '🛠 Modo Operador'}</button>
        ${
          isOperator
            ? `<button class="btn btn-ghost" data-action="download-backup" title="Baixar um arquivo com todo o progresso do campeonato">💾 Baixar backup</button>
               <button class="btn btn-ghost" data-action="trigger-upload-backup" title="Carregar um backup salvo anteriormente">📂 Carregar backup</button>
               <input type="file" id="backup-file-input" accept="application/json" hidden />
               <button class="btn btn-ghost btn-danger" data-action="reset-all">Reiniciar tudo</button>`
            : ''
        }
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
  // content pode ter mais de um elemento de topo (ex.: champion-panel + árvore
  // do chaveamento, na tela final) — precisa ficar dentro de um único wrapper,
  // senão o grid de 2 colunas do telao-layout trata cada elemento como um item
  // de grid separado e joga o segundo pra coluna da lateral (sobrepondo tudo).
  const side = queueVisible(state) ? renderSidebar(state) : '';
  // Sem lateral o grid vira 1 coluna — senão a coluna da lateral continuaria
  // reservada, comendo 400px de largura à toa (some na tela do campeão).
  return `<div class="telao-layout ${side ? 'with-side' : ''}"><div class="telao-main">${content}</div>${side}</div>`;
}

// Fica fixa no canto inferior direito da tela, separada da marca do
// cabeçalho — sobe um pouco quando o ticker está na tela pra não sobrepor.
const cornerLogoHtml = `<img src="assets/logo-igreja-viva.png" alt="Igreja Viva" class="brand-logo-corner" />`;

export function render(state, rootEl, uiExtra = {}) {
  const header = renderHeader(state);
  if (state.viewMode === 'telao') {
    rootEl.innerHTML = `${header}<main class="telao">${renderTelao(state)}</main>${cornerLogoHtml}`;
  } else {
    const showQueue = queueVisible(state);
    rootEl.innerHTML = `
      ${header}
      <main class="operator ${showQueue ? 'with-queue' : ''}">
        <div class="main-content">${renderOperatorMain(state, uiExtra)}</div>
        ${showQueue ? `<aside class="sidebar">${renderSidebar(state)}</aside>` : ''}
      </main>
      ${cornerLogoHtml}`;
  }
  syncBracketUnit(rootEl);
  // As fontes do Google chegam depois do primeiro paint e mudam a altura real
  // dos cards — remede quando terminarem de carregar.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => syncBracketUnit(rootEl));
  }
}
