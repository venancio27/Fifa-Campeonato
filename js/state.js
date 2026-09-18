// Estado da aplicação: modelo de dados, persistência (localStorage) e orquestração
// de fases do campeonato, usando as funções puras de engine.js.
import * as E from './engine.js';

const STORAGE_KEY = 'fifa-campeonato-nextgen-v1';

function genId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function freshMatch(pair, extra = {}) {
  return {
    id: genId(),
    bye: false,
    player1Id: pair.player1Id,
    player2Id: pair.player2Id,
    score1: null,
    score2: null,
    hasPens: false,
    pen1: null,
    pen2: null,
    status: 'pending', // pending | playing | done
    ...extra,
  };
}

function byeEntry(byePlayerId, byePoints) {
  return { bye: true, byePlayerId, byePointsOverride: byePoints, status: 'done' };
}

export function createInitialState() {
  return {
    version: 1,
    players: [],
    config: {
      cutoffSize: 8,
      directKnockout: false,
      groupRounds: 2, // 2 = Rodada 1 + Rodada 2 | 1 = rodada única por sorteio
      classification: 'sum', // 'sum' | 'r2only'
      oddHandling: 'fixed', // 'fixed' | 'duel'
      fixedByePoints: 1,
      thirdPlaceMatch: false,
    },
    phase: 'registration',
    // registration | config | round1 | round2 | cutoff | knockout | finished
    round1: null, // { matches: [], byePlayerId }
    round2: null, // { matches: [], byePlayerId, byeDuelMatch: match|null, byeDuelSkipped: bool }
    cutoffResult: null, // { ranked: [...], topIds: [...] }
    knockout: null, // { size, rounds: [{ name, size, matches: [] }], thirdPlace: match|null, championId: string|null }
    viewMode: 'operator', // 'operator' | 'telao'
    // Ordem sorteada AO VIVO para empates totais, { playerId: sequencia }.
    // Enquanto vazio, o desempate final cai no seedSalt de cada jogador.
    tiebreakDraw: {},
    // Só a Rodada 1 tem sorteio de verdade (pareamento aleatório) — Rodada 2 e
    // o mata-mata são definidos pela classificação/chaveamento, sempre à
    // mostra, sem etapa de "revelar".
    reveal: { round1: false },
  };
}

// Estado salvo antes de um campo novo existir volta sem ele — e aí a tela não
// consegue marcar opção nenhuma (foi o que aconteceu com groupRounds: nenhum
// dos dois botões de formato batia com `undefined`). Preenche o que faltar com
// o padrão, sem tocar no que o organizador já escolheu.
function migrateState(parsed) {
  const base = createInitialState();
  parsed.config = { ...base.config, ...(parsed.config || {}) };
  if (!parsed.tiebreakDraw) parsed.tiebreakDraw = {};
  if (!parsed.reveal) parsed.reveal = { round1: false };
  if (parsed.round1 && parsed.round1.repechageMatch === undefined) parsed.round1.repechageMatch = null;
  return parsed;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return createInitialState();
    return migrateState(parsed);
  } catch (e) {
    console.warn('Falha ao carregar estado salvo, iniciando novo.', e);
    return createInitialState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Falha ao salvar estado.', e);
  }
}

export function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  return createInitialState();
}

// ---------- Backup em arquivo (.json) ----------
export function exportStateAsJson(state) {
  return JSON.stringify(state, null, 2);
}

export function importStateFromJson(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.players)) {
    throw new Error('Arquivo de backup inválido ou de uma versão incompatível.');
  }
  // Backup salvo por uma versão anterior passa pelo mesmo preenchimento.
  return migrateState(parsed);
}

// ---------- Jogadores ----------
function normalizeHexColor(value, fallback) {
  let v = (value || '').trim();
  if (!v) return fallback;
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
}

// Combinações de config que não podem coexistir são resolvidas num lugar só,
// pra nenhuma tela precisar lembrar de checar cada uma.
function coerceConfig(state) {
  const cfg = state.config;
  if (cfg.groupRounds === 1) {
    // Sem Rodada 2: "só R2 conta" não tem o que contar, e o duelo dos
    // folguistas precisa de dois folguistas (um por rodada) — com rodada
    // única existe no máximo um. Quem vem do duelo cai na repescagem, que é
    // o equivalente aqui (o folguista joga, em vez de ganhar ponto de graça).
    cfg.classification = 'sum';
    if (cfg.oddHandling === 'duel') cfg.oddHandling = 'repechage';
  } else if (cfg.oddHandling === 'repechage') {
    // Repescagem é exclusiva da rodada única.
    cfg.oddHandling = 'fixed';
  }
  // "duelo"/"repescagem" só existem com N ímpar — somem junto com a paridade.
  if (state.players.length % 2 === 0 && cfg.oddHandling !== 'fixed') {
    cfg.oddHandling = 'fixed';
  }
  // trava: duelo dos folguistas força soma R1+R2
  if (cfg.oddHandling === 'duel') cfg.classification = 'sum';
}

function normalizeConfig(state) {
  const options = availableCutoffSizes(state);
  if (options.length && !options.includes(state.config.cutoffSize)) {
    state.config.cutoffSize = options[options.length - 1];
  }
  coerceConfig(state);
}

export function addPlayer(state, name, team, color1, color2) {
  const trimmedName = name.trim();
  if (!trimmedName) return state;
  state.players.push({
    id: genId(),
    name: trimmedName,
    team: (team || '').trim(),
    color1: normalizeHexColor(color1, '#ff7a1a'),
    color2: normalizeHexColor(color2, '#1a1a22'),
    seedSalt: Math.random(),
  });
  normalizeConfig(state);
  return state;
}

export function removePlayer(state, playerId) {
  state.players = state.players.filter((p) => p.id !== playerId);
  normalizeConfig(state);
  return state;
}

// Cadastro tardio: só permitido enquanto a Rodada 1 ainda não avançou pra R2.
// Se já havia folguista na R1, o recém-chegado encaixa contra ele (vira confronto
// real); se não havia folguista, o recém-chegado assume a folga da rodada.
export function canAddLatePlayer(state) {
  if (state.phase !== 'round1') return false;
  // Com a repescagem definida a rodada está travada: encaixar alguém aqui
  // desfaria a folga — e é justamente o folguista que está na repescagem.
  if (state.round1 && state.round1.repechageMatch) return false;
  return true;
}

export function addLatePlayer(state, name, team, color1, color2) {
  const trimmedName = name.trim();
  if (!trimmedName) return state;
  addPlayer(state, name, team, color1, color2);
  const newPlayer = state.players[state.players.length - 1];
  const r1 = state.round1;
  if (r1.byePlayerId) {
    r1.matches.push(freshMatch({ player1Id: newPlayer.id, player2Id: r1.byePlayerId }));
    r1.byePlayerId = null;
  } else {
    r1.byePlayerId = newPlayer.id;
  }
  return state;
}

export function updatePlayer(state, playerId, fields) {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return state;
  const next = { ...fields };
  if (next.name != null) next.name = next.name.trim() || p.name;
  if (next.team != null) next.team = next.team.trim();
  if ('color1' in next) next.color1 = normalizeHexColor(next.color1, p.color1);
  if ('color2' in next) next.color2 = normalizeHexColor(next.color2, p.color2);
  Object.assign(p, next);
  return state;
}

export function getPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId) || null;
}

export function playerLabel(state, playerId) {
  const p = getPlayer(state, playerId);
  if (!p) return '???';
  return p.team ? `${p.name} (${p.team})` : p.name;
}

// ---------- Configuração ----------
export function setConfig(state, fields) {
  Object.assign(state.config, fields);
  coerceConfig(state);
  return state;
}

// O último critério de desempate (regra 5). Se a faixa já foi sorteada ao vivo,
// vale a ordem sorteada; senão cai no número que cada jogador recebeu no
// cadastro. Só jogadores empatados em TUDO chegam a ser comparados por aqui,
// e nesse caso ou todos têm ordem sorteada, ou nenhum tem — então as duas
// escalas nunca se misturam numa mesma comparação.
export function saltMap(state) {
  const map = {};
  const drawn = state.tiebreakDraw || {};
  for (const p of state.players) {
    map[p.id] = drawn[p.id] != null ? drawn[p.id] : p.seedSalt;
  }
  return map;
}

// ---------- Fluxo do campeonato ----------
export function goToConfig(state) {
  if (canStartTournament(state)) state.phase = 'config';
  return state;
}

export function backToRegistration(state) {
  state.phase = 'registration';
  return state;
}

export function canStartTournament(state) {
  return state.players.length >= 4;
}

export function startTournament(state) {
  const ids = state.players.map((p) => p.id);
  const n = ids.length;

  if (state.config.directKnockout && E.isPowerOfTwo(n)) {
    const shuffled = E.shuffle(ids);
    const pairs = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      pairs.push({ player1Id: shuffled[i], player2Id: shuffled[i + 1] });
    }
    const matches = pairs.map((p) => freshMatch(p));
    state.knockout = {
      size: n,
      rounds: [{ name: E.bracketStageName(n), size: n, matches }],
      thirdPlace: null,
      championId: null,
    };
    state.phase = 'knockout';
    return state;
  }

  const { matches, byePlayerId } = E.generateRound1(ids);
  state.round1 = { matches: matches.map((p) => freshMatch(p)), byePlayerId, repechageMatch: null };
  state.phase = 'round1';
  state.reveal.round1 = false;
  return state;
}

export function round1StandingsRanked(state) {
  const ids = state.players.map((p) => p.id);
  const byePts = state.config.oddHandling === 'fixed' ? state.config.fixedByePoints : 0;
  const matches = state.round1.matches.slice();
  if (state.round1.byePlayerId) {
    matches.push(byeEntry(state.round1.byePlayerId, byePts));
  }
  const stats = E.computeStandings(ids, matches, { byePoints: 0 });
  return E.rankStandings(stats, saltMap(state));
}

export function advanceToRound2(state) {
  const ranked = round1StandingsRanked(state);
  const { matches, byePlayerId } = E.generateRound2(ranked);
  state.round2 = {
    matches: matches.map((p) => freshMatch(p)),
    byePlayerId,
    byeDuelMatch: null,
    byeDuelSkipped: false,
  };

  if (state.config.oddHandling === 'duel') {
    const duelPair = E.generateByeDuel(state.round1.byePlayerId, byePlayerId);
    if (duelPair) {
      state.round2.byeDuelMatch = freshMatch(duelPair, { isDuel: true });
    } else if (byePlayerId) {
      // Sem par pro duelo (ex.: cadastro tardio converteu a folga da R1 num confronto
      // normal, ou o mesmo jogador folgou nas duas rodadas) — segue sem partida extra.
      state.round2.byeDuelSkipped = true;
    }
  }

  state.phase = 'round2';
  return state;
}

// Lista de partidas "reais" (que valem pra classificação) usada no cálculo final do grupo.
function groupMatchesForClassification(state) {
  const cfg = state.config;
  const r1 = state.round1;
  const r2 = state.round2;

  // Rodada única: o corte sai direto da R1. Sem R2 não há "soma" nem "só R2" a
  // decidir, e a folga (se o número for ímpar) vale o ponto fixo configurado.
  if (!r2) {
    const only = r1.matches.slice();
    if (r1.byePlayerId) only.push(byeEntry(r1.byePlayerId, cfg.fixedByePoints));
    return only;
  }

  const useSum = cfg.classification === 'sum' || cfg.oddHandling === 'duel';

  let matches = [];
  if (useSum) {
    matches = matches.concat(r1.matches);
    if (cfg.oddHandling === 'fixed' && r1.byePlayerId) {
      matches.push(byeEntry(r1.byePlayerId, cfg.fixedByePoints));
    }
  }
  matches = matches.concat(r2.matches);
  if (cfg.oddHandling === 'fixed' && r2.byePlayerId) {
    matches.push(byeEntry(r2.byePlayerId, cfg.fixedByePoints));
  }
  if (cfg.oddHandling === 'duel' && r2.byeDuelMatch) {
    matches.push(r2.byeDuelMatch);
  }
  return matches;
}

export function groupFinalStandingsRanked(state) {
  const ids = state.players.map((p) => p.id);
  const matches = groupMatchesForClassification(state);
  const stats = E.computeStandings(ids, matches, { byePoints: 0 });
  return E.rankStandings(stats, saltMap(state));
}

export function isGroupStageComplete(state) {
  const r1 = state.round1;
  const r2 = state.round2;
  if (!r1.matches.every((m) => E.isMatchComplete(m))) return false;
  if (!r2) return true; // rodada única: a R1 já é a fase de grupos inteira
  if (!r2.matches.every((m) => E.isMatchComplete(m))) return false;
  if (r2.byeDuelMatch && !E.isMatchComplete(r2.byeDuelMatch)) return false;
  return true;
}

export function availableCutoffSizes(state) {
  const n = state.players.length;
  return [4, 8, 16].filter((v) => v <= n);
}

// ---------- Repescagem (rodada única + número ímpar) ----------
// O folguista não tem campanha, então não entra na classificação por pontos:
// ele desafia quem está na última vaga do corte. Quem vencer fica com a vaga.
// Isso substitui o "ponto fixo", que dava passagem a quem não jogou.
function ranksWithoutBye(state) {
  const byeId = state.round1.byePlayerId;
  const ids = state.players.map((p) => p.id).filter((id) => id !== byeId);
  const stats = E.computeStandings(ids, state.round1.matches, { byePoints: 0 });
  return E.rankStandings(stats, saltMap(state));
}

export function usesRepechage(state) {
  const cfg = state.config;
  return cfg.groupRounds === 1 && cfg.oddHandling === 'repechage' && !!state.round1 && !!state.round1.byePlayerId;
}

// Só faz sentido se existe alguém ocupando a última vaga: com o corte maior
// que o número de jogadores com campanha, não há vaga em disputa.
export function canCreateRepechage(state) {
  if (!usesRepechage(state)) return false;
  if (state.round1.repechageMatch) return false;
  return ranksWithoutBye(state).length >= state.config.cutoffSize;
}

export function createRepechage(state) {
  if (!canCreateRepechage(state)) return state;
  const holder = ranksWithoutBye(state)[state.config.cutoffSize - 1];
  state.round1.repechageMatch = freshMatch(
    { player1Id: state.round1.byePlayerId, player2Id: holder.playerId },
    { isRepechage: true }
  );
  state.round1.repechageReset = false;
  return state;
}

// Reabre a rodada pra corrigir um placar. O sorteio de desempate já feito NÃO
// é refeito: a sala viu aquele resultado, re-sortear seria pior que mantê-lo.
export function cancelRepechage(state) {
  if (!state.round1) return state;
  state.round1.repechageMatch = null;
  state.round1.repechageReset = false;
  return state;
}

export function repechagePending(state) {
  const m = state.round1 && state.round1.repechageMatch;
  return !!m && !E.isMatchComplete(m);
}

// Classificação final quando houve repescagem: as vagas 1..K-1 já estão
// garantidas pela campanha; a vaga K vai pro vencedor da repescagem e o
// perdedor cai pra K+1.
function cutoffWithRepechage(state) {
  const size = state.config.cutoffSize;
  const m = state.round1.repechageMatch;
  const byeId = state.round1.byePlayerId;
  const ranked = ranksWithoutBye(state);

  const ids = state.players.map((p) => p.id);
  const allStats = E.computeStandings(ids, state.round1.matches, { byePoints: 0 });
  const byeRow = { ...allStats[byeId], _tiebreakSalt: 0, drawGroup: null, viaRepechage: true };

  const { winnerSide } = E.matchPoints(m);
  const byeWon = winnerSide === 1;

  // O desafiado é lido DA PARTIDA, não recalculado: entre criar a repescagem e
  // fechar a fase pode ter rodado o sorteio de desempate, que reordena a faixa
  // empatada. Recalculando, o app tratava como perdedor alguém que nunca jogou.
  const holderId = m.player2Id;
  const holder = ranked.find((s) => s.playerId === holderId);
  const others = ranked.filter((s) => s.playerId !== holderId);
  const safe = others.slice(0, size - 1);
  const rest = others.slice(size - 1);

  const winnerRow = byeWon ? byeRow : { ...holder, viaRepechage: true };
  const loserRow = byeWon ? { ...holder, viaRepechage: true } : byeRow;

  const ordered = safe.concat([winnerRow, loserRow], rest);
  // As faixas de sorteio precisam ser recalculadas DEPOIS da repescagem
  // reordenar a tabela: as que vieram de ranksWithoutBye apontam para posições
  // antigas, e a tela mostraria "5º ao 8º" com a marca em 5, 6, 7 e 9.
  const display = E.markDrawGroups(ordered.map((s, i) => ({ ...s, rank: i + 1 })));
  const topIds = display.slice(0, size).map((s) => s.playerId);
  return { ranked: display, topIds, size };
}

// ---------- Sorteio de desempate ao vivo ----------
// A classificação que o corte vai usar, do jeito que ela está agora. Serve pra
// descobrir quais faixas empataram em tudo ANTES de congelar o resultado.
function provisionalCutoffRanked(state) {
  if (usesRepechage(state)) {
    // Antes da repescagem existir, a faixa a sortear é a da campanha pura —
    // é dela que sai o ocupante da última vaga, então o sorteio precisa ser
    // resolvido aqui, ANTES de definir quem será desafiado.
    return state.round1.repechageMatch ? cutoffWithRepechage(state).ranked : ranksWithoutBye(state);
  }
  return groupFinalStandingsRanked(state);
}

export function pendingDrawGroups(state) {
  const byGroup = new Map();
  for (const s of provisionalCutoffRanked(state)) {
    if (!s.drawGroup) continue;
    if (!byGroup.has(s.drawGroup.id)) {
      byGroup.set(s.drawGroup.id, { from: s.drawGroup.from, to: s.drawGroup.to, playerIds: [] });
    }
    byGroup.get(s.drawGroup.id).playerIds.push(s.playerId);
  }
  // Faixa já sorteada não volta a sortear (o operador pode clicar de novo).
  const done = state.tiebreakDraw || {};
  return Array.from(byGroup.values()).filter((g) => !g.playerIds.every((id) => done[id] != null));
}

// Sorteia agora a ordem de cada faixa. Quem chama anima o resultado e só então
// aplica — assim a plateia vê o sorteio acontecendo, em vez de a ordem já vir
// decidida de um número invisível gerado no cadastro.
export function planTiebreakDraw(state) {
  return pendingDrawGroups(state).map((g) => ({ ...g, order: E.shuffle(g.playerIds) }));
}

export function applyTiebreakDraw(state, plan) {
  if (!state.tiebreakDraw) state.tiebreakDraw = {};
  let seq = Object.keys(state.tiebreakDraw).length;
  for (const g of plan) {
    for (const id of g.order) state.tiebreakDraw[id] = ++seq;
  }
  return state;
}

export function advanceToCutoff(state) {
  if (usesRepechage(state) && state.round1.repechageMatch) {
    state.cutoffResult = cutoffWithRepechage(state);
    state.phase = 'cutoff';
    return state;
  }
  const ranked = groupFinalStandingsRanked(state);
  const size = state.config.cutoffSize;
  const topIds = E.applyCutoff(ranked, size);
  state.cutoffResult = { ranked, topIds, size };
  state.phase = 'cutoff';
  return state;
}

export function generateBracketFromCutoff(state) {
  const topIds = state.cutoffResult.topIds;
  const size = topIds.length;
  const pairs = E.generateBracketFirstRound(topIds);
  const matches = pairs.map((p) => freshMatch(p));
  state.knockout = {
    size,
    rounds: [{ name: E.bracketStageName(size), size, matches }],
    thirdPlace: null,
    championId: null,
  };
  state.phase = 'knockout';
  return state;
}

export function currentKnockoutRound(state) {
  const rounds = state.knockout.rounds;
  return rounds[rounds.length - 1];
}

export function isKnockoutRoundComplete(round) {
  return round.matches.every((m) => E.isMatchComplete(m));
}

function winnerOf(match) {
  const { winnerSide } = E.matchPoints(match);
  if (winnerSide === 1) return match.player1Id;
  if (winnerSide === 2) return match.player2Id;
  return null;
}
function loserOf(match) {
  const { winnerSide } = E.matchPoints(match);
  if (winnerSide === 1) return match.player2Id;
  if (winnerSide === 2) return match.player1Id;
  return null;
}

export function advanceKnockout(state) {
  const round = currentKnockoutRound(state);
  const winners = round.matches.map(winnerOf);

  if (round.size === 2) {
    // era a final
    state.knockout.championId = winners[0];
    state.phase = 'finished';
    return state;
  }

  if (round.size === 4 && !state.knockout.thirdPlace && state.config.thirdPlaceMatch) {
    const losers = round.matches.map(loserOf);
    const thirdPair = E.generateThirdPlaceMatch(losers);
    if (thirdPair) state.knockout.thirdPlace = freshMatch(thirdPair, { isThirdPlace: true });
  }

  const nextPairs = E.generateNextBracketRound(winners);
  const nextSize = winners.length;
  const nextMatches = nextPairs.map((p) => freshMatch(p));
  state.knockout.rounds.push({ name: E.bracketStageName(nextSize), size: nextSize, matches: nextMatches });
  return state;
}

// ---------- Registro de placar / fila ----------
function findMatchAnywhere(state, matchId) {
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

// Corrigir um placar da rodada muda a classificação — e pode mudar quem ocupa
// a última vaga. Se a repescagem já estava definida contra outra pessoa, ela
// passou a apontar pro alvo errado: é descartada, e o organizador define de
// novo. Sem isso dava pra eliminar alguém que nem foi desafiado.
function syncRepechageTarget(state, editedMatch) {
  const r1 = state.round1;
  if (!r1 || !r1.repechageMatch) return;
  if (editedMatch === r1.repechageMatch) return; // o placar da própria repescagem
  if (!r1.matches.includes(editedMatch)) return; // partida de outra fase
  if (!usesRepechage(state)) return;

  const alvo = ranksWithoutBye(state)[state.config.cutoffSize - 1];
  if (alvo && alvo.playerId === r1.repechageMatch.player2Id) return; // continua válido

  r1.repechageMatch = null;
  r1.repechageReset = true;
}

export function setMatchResult(state, matchId, { score1, score2, hasPens, pen1, pen2 }) {
  const m = findMatchAnywhere(state, matchId);
  if (!m) return state;
  m.score1 = score1;
  m.score2 = score2;
  m.hasPens = !!hasPens;
  m.pen1 = hasPens ? pen1 : null;
  m.pen2 = hasPens ? pen2 : null;
  m.status = E.isMatchComplete(m) ? 'done' : 'playing';
  syncRepechageTarget(state, m);
  return state;
}

export function setMatchPlaying(state, matchId, matchListRef) {
  const m = findMatchAnywhere(state, matchId);
  if (!m) return state;
  if (matchListRef) {
    for (const other of matchListRef) {
      if (other.status === 'playing') other.status = 'pending';
    }
  }
  m.status = 'playing';
  return state;
}

// ---------- Painel de fila ----------
export function getActiveMatchList(state) {
  if (state.phase === 'round1') {
    const list = state.round1.matches.slice();
    if (state.round1.repechageMatch) list.push(state.round1.repechageMatch);
    return list;
  }
  if (state.phase === 'round2') {
    const list = state.round2.matches.slice();
    if (state.round2.byeDuelMatch) list.push(state.round2.byeDuelMatch);
    return list;
  }
  if (state.phase === 'knockout') {
    const round = currentKnockoutRound(state);
    const list = round.matches.slice();
    if (round.size === 2 && state.knockout.thirdPlace) list.push(state.knockout.thirdPlace);
    return list;
  }
  return [];
}

export function getQueueInfo(state) {
  const list = getActiveMatchList(state).filter((m) => !m.bye);
  const current = list.filter((m) => m.status === 'playing');
  const upcoming = list.filter((m) => m.status === 'pending').slice(0, 3);
  return { current, upcoming };
}
