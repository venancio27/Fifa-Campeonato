// Motor de regras do campeonato — funções puras (sem tocar em DOM/localStorage).
// Espelha regras-campeonato-fifa.md.

export const POINTS = {
  winNormal: 3,
  winPens: 2,
  losePens: 1,
  loseNormal: 0,
};

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isPowerOfTwo(n) {
  return n >= 2 && (n & (n - 1)) === 0;
}

// ---------- Pontuação de uma partida ----------
// match: { score1, score2, hasPens, pen1, pen2 }
// Retorna { winnerSide: 1|2|null, pts1, pts2 }
export function matchPoints(match) {
  const { score1, score2, hasPens, pen1, pen2 } = match;
  if (score1 !== score2) {
    return score1 > score2
      ? { winnerSide: 1, pts1: POINTS.winNormal, pts2: POINTS.loseNormal }
      : { winnerSide: 2, pts1: POINTS.loseNormal, pts2: POINTS.winNormal };
  }
  // empate no tempo normal -> precisa de pênaltis
  if (!hasPens || pen1 == null || pen2 == null || pen1 === pen2) {
    return { winnerSide: null, pts1: 0, pts2: 0 }; // partida incompleta
  }
  return pen1 > pen2
    ? { winnerSide: 1, pts1: POINTS.winPens, pts2: POINTS.losePens }
    : { winnerSide: 2, pts1: POINTS.losePens, pts2: POINTS.winPens };
}

export function isMatchComplete(match) {
  if (match.bye) return true;
  if (match.score1 == null || match.score2 == null) return false;
  if (match.score1 === match.score2) {
    return match.hasPens && match.pen1 != null && match.pen2 != null && match.pen1 !== match.pen2;
  }
  return true;
}

// ---------- Estatísticas / Classificação ----------
// matches: lista de partidas já jogadas (bye incluído) relevantes para o cálculo.
// byePoints: pontos de ponto-fixo para folga (quando aplicável).
export function computeStandings(playerIds, matches, { byePoints = 0 } = {}) {
  const stats = {};
  for (const id of playerIds) {
    stats[id] = {
      playerId: id,
      points: 0,
      played: 0,
      goalsForNormal: 0,
      goalsAgainstNormal: 0,
      goalsForPens: 0,
      goalsAgainstPens: 0,
      pensPlayed: 0,
      wins: 0,
      byes: 0,
      headToHead: {}, // opponentId -> { pointsFor, pointsAgainst }
    };
  }

  for (const m of matches) {
    if (m.bye) {
      const s = stats[m.byePlayerId];
      if (s) {
        s.byes += 1;
        s.points += m.byePointsOverride != null ? m.byePointsOverride : byePoints;
      }
      continue;
    }
    if (!isMatchComplete(m)) continue;
    const { pts1, pts2 } = matchPoints(m);
    const s1 = stats[m.player1Id];
    const s2 = stats[m.player2Id];
    if (!s1 || !s2) continue;

    s1.played += 1;
    s2.played += 1;
    s1.points += pts1;
    s2.points += pts2;
    s1.goalsForNormal += m.score1;
    s1.goalsAgainstNormal += m.score2;
    s2.goalsForNormal += m.score2;
    s2.goalsAgainstNormal += m.score1;

    if (m.score1 === m.score2 && m.hasPens) {
      s1.pensPlayed += 1;
      s2.pensPlayed += 1;
      s1.goalsForPens += m.pen1;
      s1.goalsAgainstPens += m.pen2;
      s2.goalsForPens += m.pen2;
      s2.goalsAgainstPens += m.pen1;
    }

    if (pts1 > pts2) s1.wins += 1;
    else if (pts2 > pts1) s2.wins += 1;

    if (!s1.headToHead[m.player2Id]) s1.headToHead[m.player2Id] = { pointsFor: 0, pointsAgainst: 0 };
    if (!s2.headToHead[m.player1Id]) s2.headToHead[m.player1Id] = { pointsFor: 0, pointsAgainst: 0 };
    s1.headToHead[m.player2Id].pointsFor += pts1;
    s1.headToHead[m.player2Id].pointsAgainst += pts2;
    s2.headToHead[m.player1Id].pointsFor += pts2;
    s2.headToHead[m.player1Id].pointsAgainst += pts1;
  }

  for (const s of Object.values(stats)) {
    s.gdNormal = s.goalsForNormal - s.goalsAgainstNormal;
    s.gdPens = s.goalsForPens - s.goalsAgainstPens;
  }

  return stats;
}

// Comparador de desempate, seção 3 das regras (ordem fixa de critérios).
function compareStanding(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gdNormal !== a.gdNormal) return b.gdNormal - a.gdNormal;
  if (b.goalsForNormal !== a.goalsForNormal) return b.goalsForNormal - a.goalsForNormal;

  const h2h = a.headToHead[b.playerId];
  if (h2h) {
    if (h2h.pointsFor !== h2h.pointsAgainst) return h2h.pointsAgainst - h2h.pointsFor;
  }

  if (b.gdPens !== a.gdPens) return b.gdPens - a.gdPens;
  if (b.goalsForPens !== a.goalsForPens) return b.goalsForPens - a.goalsForPens;

  // último critério: sorteio — decidido de forma estável (mas aleatória) por um "sal"
  // fixo por par, calculado uma vez e cacheado no próprio objeto pelo chamador se quiser
  // reprodutibilidade. Aqui, cai para ordem de id para estabilidade de render.
  return a._tiebreakSalt - b._tiebreakSalt;
}

// Retorna lista ordenada [{ ...stats, rank }] a partir do mapa de stats.
export function rankStandings(statsMap, saltMap = {}) {
  const list = Object.values(statsMap).map((s) => ({
    ...s,
    _tiebreakSalt: saltMap[s.playerId] != null ? saltMap[s.playerId] : Math.random(),
  }));
  list.sort(compareStanding);
  return list.map((s, i) => ({ ...s, rank: i + 1 }));
}

// ---------- Rodada 1: sorteio aleatório ----------
// playerIds: todos os jogadores ativos.
// Retorna { matches, byePlayerId }
export function generateRound1(playerIds) {
  const shuffled = shuffle(playerIds);
  const matches = [];
  let byePlayerId = null;

  let i = 0;
  if (shuffled.length % 2 === 1) {
    byePlayerId = shuffled[shuffled.length - 1];
    shuffled.pop();
  }
  for (; i < shuffled.length; i += 2) {
    matches.push({ player1Id: shuffled[i], player2Id: shuffled[i + 1] });
  }
  return { matches, byePlayerId };
}

// ---------- Rodada 2: pareamento por colocação ----------
// standingsR1: lista ordenada (rankStandings) da R1.
// Regra do ímpar: folga é sempre o último colocado (não sorteio).
export function generateRound2(standingsR1) {
  let ranked = standingsR1.map((s) => s.playerId);
  let byePlayerId = null;

  if (ranked.length % 2 === 1) {
    byePlayerId = ranked[ranked.length - 1];
    ranked = ranked.slice(0, -1);
  }

  const matches = [];
  const n = ranked.length;
  for (let i = 0; i < n / 2; i++) {
    matches.push({ player1Id: ranked[i], player2Id: ranked[n - 1 - i] });
  }
  return { matches, byePlayerId };
}

// ---------- Duelo dos folguistas ----------
// Retorna a partida avulsa, ou null se os dois folguistas forem a mesma pessoa
// (caso raro documentado nas regras — cancelado automaticamente).
export function generateByeDuel(byePlayerR1, byePlayerR2) {
  if (!byePlayerR1 || !byePlayerR2) return null;
  if (byePlayerR1 === byePlayerR2) return null;
  return { player1Id: byePlayerR1, player2Id: byePlayerR2 };
}

// ---------- Corte para o mata-mata ----------
export function applyCutoff(rankedStandings, cutoffSize) {
  return rankedStandings.slice(0, cutoffSize).map((s) => s.playerId);
}

// ---------- Chaveamento cruzado (seed-protected bracket) ----------
// Ordens de seed clássicas para proteger cabeças de chave até a final.
const BRACKET_SEED_ORDER = {
  4: [1, 4, 2, 3],
  8: [1, 8, 4, 5, 2, 7, 3, 6],
  16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
};

// topPlayerIds: array já ordenado por classificação (index 0 = 1º colocado).
// Retorna a lista de jogos da primeira fase do mata-mata, na ordem do chaveamento.
export function generateBracketFirstRound(topPlayerIds) {
  const size = topPlayerIds.length;
  const order = BRACKET_SEED_ORDER[size];
  if (!order) throw new Error(`Tamanho de chaveamento não suportado: ${size}`);

  const bySeed = (seed) => topPlayerIds[seed - 1];
  const matches = [];
  for (let i = 0; i < order.length; i += 2) {
    matches.push({ player1Id: bySeed(order[i]), player2Id: bySeed(order[i + 1]) });
  }
  return matches;
}

// Dado os vencedores da fase anterior do mata-mata (na ordem dos jogos), monta a
// próxima fase (semis a partir de quartas, final a partir de semis).
export function generateNextBracketRound(previousWinnersInOrder) {
  const matches = [];
  for (let i = 0; i < previousWinnersInOrder.length; i += 2) {
    matches.push({
      player1Id: previousWinnersInOrder[i],
      player2Id: previousWinnersInOrder[i + 1],
    });
  }
  return matches;
}

// Disputa de 3º lugar: os dois perdedores da semifinal.
export function generateThirdPlaceMatch(semiLosersInOrder) {
  if (semiLosersInOrder.length !== 2) return null;
  return { player1Id: semiLosersInOrder[0], player2Id: semiLosersInOrder[1] };
}

export function bracketStageName(size) {
  if (size === 16) return 'Oitavas de final';
  if (size === 8) return 'Quartas de final';
  if (size === 4) return 'Semifinal';
  if (size === 2) return 'Final';
  return `Fase (${size})`;
}
