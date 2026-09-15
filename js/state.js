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
      classification: 'sum', // 'sum' | 'r2only'
      oddHandling: 'fixed', // 'fixed' | 'duel'
      fixedByePoints: 1,
      thirdPlaceMatch: true,
    },
    phase: 'registration',
    // registration | config | round1 | round2 | cutoff | knockout | finished
    round1: null, // { matches: [], byePlayerId }
    round2: null, // { matches: [], byePlayerId, byeDuelMatch: match|null, byeDuelSkipped: bool }
    cutoffResult: null, // { ranked: [...], topIds: [...] }
    knockout: null, // { size, rounds: [{ name, size, matches: [] }], thirdPlace: match|null, championId: string|null }
    viewMode: 'operator', // 'operator' | 'telao'
    // Só a Rodada 1 tem sorteio de verdade (pareamento aleatório) — Rodada 2 e
    // o mata-mata são definidos pela classificação/chaveamento, sempre à
    // mostra, sem etapa de "revelar".
    reveal: { round1: false },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return createInitialState();
    return parsed;
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
  return parsed;
}

// ---------- Jogadores ----------
function normalizeConfig(state) {
  const options = availableCutoffSizes(state);
  if (options.length && !options.includes(state.config.cutoffSize)) {
    state.config.cutoffSize = options[options.length - 1];
  }
  // "duelo dos folguistas" só existe com N ímpar — some junto com a paridade.
  if (state.players.length % 2 === 0 && state.config.oddHandling === 'duel') {
    state.config.oddHandling = 'fixed';
  }
}

export function addPlayer(state, name, team, color1, color2) {
  const trimmedName = name.trim();
  if (!trimmedName) return state;
  state.players.push({
    id: genId(),
    name: trimmedName,
    team: (team || '').trim(),
    color1: color1 || '#ff7a1a',
    color2: color2 || '#1a1a22',
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
  return state.phase === 'round1';
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
  if (p) Object.assign(p, fields);
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
  // trava: duelo dos folguistas força soma R1+R2
  if (state.config.oddHandling === 'duel') {
    state.config.classification = 'sum';
  }
  return state;
}

export function saltMap(state) {
  const map = {};
  for (const p of state.players) map[p.id] = p.seedSalt;
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
  state.round1 = { matches: matches.map((p) => freshMatch(p)), byePlayerId };
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
  if (!r2.matches.every((m) => E.isMatchComplete(m))) return false;
  if (r2.byeDuelMatch && !E.isMatchComplete(r2.byeDuelMatch)) return false;
  return true;
}

export function availableCutoffSizes(state) {
  const n = state.players.length;
  return [4, 8, 16].filter((v) => v <= n);
}

export function advanceToCutoff(state) {
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
  if (state.round1) pools.push(state.round1.matches);
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

export function setMatchResult(state, matchId, { score1, score2, hasPens, pen1, pen2 }) {
  const m = findMatchAnywhere(state, matchId);
  if (!m) return state;
  m.score1 = score1;
  m.score2 = score2;
  m.hasPens = !!hasPens;
  m.pen1 = hasPens ? pen1 : null;
  m.pen2 = hasPens ? pen2 : null;
  m.status = E.isMatchComplete(m) ? 'done' : 'playing';
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
  if (state.phase === 'round1') return state.round1.matches;
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
