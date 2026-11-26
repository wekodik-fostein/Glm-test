// ============ chess_engine.js — порт на JS ============
// Совместимость: браузер (глобальные классы) и Node (module.exports)

const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const WHITE = 1, BLACK = -1;
const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DPP = 8;
const INF = 1000000, MATE = 100000;
const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 20000];

// ---------- Доска 10x12 ----------
const ON = new Uint8Array(120);
for (let s = 21; s <= 98; s++) if (s % 10 !== 0 && s % 10 !== 9) ON[s] = 1;

const SQ64W = new Int8Array(120), SQ64B = new Int8Array(120);
for (let s = 0; s < 120; s++) if (ON[s]) {
  const r = Math.floor(s / 10) - 2, c = s % 10 - 1;
  SQ64W[s] = r * 8 + c;
  SQ64B[s] = (7 - r) * 8 + c;
}

const KN = [-21, -19, -12, -8, 8, 12, 19, 21];
const BI = [-11, -9, 9, 11];
const RO = [-10, -1, 1, 10];
const QU = [-11, -10, -9, -1, 1, 9, 10, 11];
const KI = QU;

// ---------- PST (a8 = 0 ... h1 = 63) ----------
const PST_P = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0];
const PST_N = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50];
const PST_B = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20];
const PST_R = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0];
const PST_Q = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20];
const PST_KMG = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20];
const PST_KEG = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50];
const PST = [null, PST_P, PST_N, PST_B, PST_R, PST_Q];

// ---------- Zobrist (две половины по 32 бита, без BigInt) ----------
const rnd = (() => {
  let s = 0xC0FFEE;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s | 0; };
})();
const ZH = new Int32Array(7 * 120 * 2), ZL = new Int32Array(7 * 120 * 2);
for (let i = 0; i < ZH.length; i++) { ZH[i] = rnd(); ZL[i] = rnd(); }
const ZCH = new Int32Array(16), ZCL = new Int32Array(16);
for (let i = 0; i < 16; i++) { ZCH[i] = rnd(); ZCL[i] = rnd(); }
const ZEH = new Int32Array(120), ZEL = new Int32Array(120);
for (let i = 0; i < 120; i++) { ZEH[i] = rnd(); ZEL[i] = rnd(); }
const ZTH = rnd(), ZTL = rnd();

const zi = (pt, sq, side) => ((pt * 120 + sq) << 1) | (side > 0 ? 1 : 0);
function tog(pos, pt, sq, side) {
  const i = zi(pt, sq, side);
  pos.zh ^= ZH[i]; pos.zl ^= ZL[i];
}
function zc(pos, c) { pos.zh ^= ZCH[c]; pos.zl ^= ZCL[c]; }
function zep(pos, s) { pos.zh ^= ZEH[s]; pos.zl ^= ZEL[s]; }
function zt(pos) { pos.zh ^= ZTH; pos.zl ^= ZTL; }
const keyOf = pos => (pos.zh & 0x1FFFFF) * 4294967296 + (pos.zl >>> 0);

// ---------- Move encoding ----------
const pack = (f, t, p, fl) => f | (t << 7) | (p << 14) | (fl << 18);
const mfrom = m => m & 0x7F;
const mto = m => (m >> 7) & 0x7F;
const mpromo = m => (m >> 14) & 0xF;
const mflags = m => (m >> 18) & 0xF;

// ---------- Position ----------
class Position {
  constructor() {
    this.board = new Array(120).fill(null);
    this.turn = WHITE;
    this.castling = 15;
    this.ep = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kingSq = [0, 0, 0];   // индекс = side + 1
    this.hist = [];
    this.zh = 0; this.zl = 0;
  }

  static start() {
    const p = new Position();
    const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
    for (let i = 0; i < 8; i++) { p.board[91 + i] = back[i]; p.board[21 + i] = -back[i]; }
    for (let i = 0; i < 8; i++) { p.board[81 + i] = PAWN; p.board[31 + i] = -PAWN; }
    p.rehash();
    return p;
  }

  // Полный пересчёт хеша и позиций королей
  rehash() {
    this.zh = 0; this.zl = 0;
    for (let s = 21; s <= 98; s++) {
      if (!ON[s]) continue;
      const p = this.board[s];
      if (p === null) continue;
      tog(this, Math.abs(p), s, p > 0 ? 1 : -1);
      if (p === KING) this.kingSq[2] = s;
      if (p === -KING) this.kingSq[0] = s;
    }
    zc(this, this.castling);
    if (this.ep !== null) zep(this, this.ep);
    if (this.turn === BLACK) zt(this);
  }
}

// ---------- Атаки ----------
function isAttacked(pos, sq, by) {
  const b = pos.board;
  if (by === WHITE) {
    for (const off of [9, 11]) { const s = sq + off; if (ON[s] && b[s] === PAWN) return true; }
  } else {
    for (const off of [-9, -11]) { const s = sq + off; if (ON[s] && b[s] === -PAWN) return true; }
  }
  const nk = KNIGHT * by;
  for (const off of KN) { const s = sq + off; if (ON[s] && b[s] === nk) return true; }
  const bk = BISHOP * by, qk = QUEEN * by;
  for (const off of BI) {
    let s = sq + off;
    while (ON[s]) {
      const p = b[s];
      if (p !== null) { if (p === bk || p === qk) return true; break; }
      s += off;
    }
  }
  const rk = ROOK * by;
  for (const off of RO) {
    let s = sq + off;
    while (ON[s]) {
      const p = b[s];
      if (p !== null) { if (p === rk || p === qk) return true; break; }
      s += off;
    }
  }
  const kk = KING * by;
  for (const off of KI) { const s = sq + off; if (ON[s] && b[s] === kk) return true; }
  return false;
}

const isInCheck = (pos, side) => isAttacked(pos, pos.kingSq[side + 1], -side);

// ---------- Генерация ходов ----------
function genPawn(pos, sq, moves, capOnly) {
  const b = pos.board, turn = pos.turn;
  const fwd = turn === WHITE ? -10 : 10;
  const lo = turn === WHITE ? 21 : 91, hi = turn === WHITE ? 28 : 98;
  if (!capOnly) {
    const to = sq + fwd;
    if (ON[to] && b[to] === null) {
      if (to >= lo && to <= hi) {
        for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push(pack(sq, to, pr, 0));
      } else {
        moves.push(pack(sq, to, 0, 0));
        if ((turn === WHITE && sq >= 81 && sq <= 88) || (turn === BLACK && sq >= 31 && sq <= 38)) {
          const to2 = sq + 2 * fwd;
          if (b[to2] === null) moves.push(pack(sq, to2, 0, F_DPP));
        }
      }
    }
  }
  for (const off of (turn === WHITE ? [-11, -9] : [11, 9])) {
    const to = sq + off;
    if (!ON[to]) continue;
    const t = b[to];
    if (t !== null && (t > 0) !== (turn > 0)) {
      if (to >= lo && to <= hi) {
        for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) moves.push(pack(sq, to, pr, F_CAP));
      } else {
        moves.push(pack(sq, to, 0, F_CAP));
      }
    }
    if (pos.ep !== null && to === pos.ep) moves.push(pack(sq, to, 0, F_CAP | F_EP));
  }
}

function genCastles(pos, moves) {
  const b = pos.board, c = pos.castling;
  const att = (s, by) => isAttacked(pos, s, by);
  if (pos.turn === WHITE) {
    if ((c & 1) && b[96] === null && b[97] === null &&
        !att(95, BLACK) && !att(96, BLACK) && !att(97, BLACK))
      moves.push(pack(95, 97, 0, F_CASTLE));
    if ((c & 2) && b[94] === null && b[93] === null && b[92] === null &&
        !att(95, BLACK) && !att(94, BLACK) && !att(93, BLACK))
      moves.push(pack(95, 93, 0, F_CASTLE));
  } else {
    if ((c & 4) && b[26] === null && b[27] === null &&
        !att(25, WHITE) && !att(26, WHITE) && !att(27, WHITE))
      moves.push(pack(25, 27, 0, F_CASTLE));
    if ((c & 8) && b[24] === null && b[23] === null && b[22] === null &&
        !att(25, WHITE) && !att(24, WHITE) && !att(23, WHITE))
      moves.push(pack(25, 23, 0, F_CASTLE));
  }
}

function genPseudo(pos, capOnly = false) {
  const moves = [], b = pos.board, turn = pos.turn;
  for (let sq = 21; sq <= 98; sq++) {
    if (!ON[sq]) continue;
    const p = b[sq];
    if (p === null || (p > 0) !== (turn > 0)) continue;
    const pt = Math.abs(p);
    if (pt === PAWN) { genPawn(pos, sq, moves, capOnly); continue; }
    if (pt === KNIGHT || pt === KING) {
      for (const off of (pt === KNIGHT ? KN : KI)) {
        const to = sq + off;
        if (!ON[to]) continue;
        const t = b[to];
        if (t === null) { if (!capOnly) moves.push(pack(sq, to, 0, 0)); }
        else if ((t > 0) !== (turn > 0)) moves.push(pack(sq, to, 0, F_CAP));
      }
      if (pt === KING && !capOnly) genCastles(pos, moves);
      continue;
    }
    const offs = pt === BISHOP ? BI : pt === ROOK ? RO : QU;
    for (const off of offs) {
      let to = sq + off;
      while (ON[to]) {
        const t = b[to];
        if (t === null) { if (!capOnly) moves.push(pack(sq, to, 0, 0)); }
        else { if ((t > 0) !== (turn > 0)) moves.push(pack(sq, to, 0, F_CAP)); break; }
        to += off;
      }
    }
  }
  return moves;
}

function genLegal(pos) {
  const legal = [];
  for (const m of genPseudo(pos)) {
    makeMove(pos, m);
    if (!isInCheck(pos, -pos.turn)) legal.push(m);
    unmakeMove(pos, m);
  }
  return legal;
}

// ---------- Make / Unmake ----------
function makeMove(pos, m) {
  const f = mfrom(m), t = mto(m), pr = mpromo(m), fl = mflags(m), b = pos.board;
  const piece = b[f], captured = b[t], side = pos.turn;
  pos.hist.push([pos.castling, pos.ep, pos.halfmove, captured, pos.zh, pos.zl]);

  zc(pos, pos.castling);
  if (pos.ep !== null) zep(pos, pos.ep);

  if (fl & F_EP) {
    const cs = side === WHITE ? t + 10 : t - 10;
    b[cs] = null;
    tog(pos, PAWN, cs, -side);
  }
  if (captured !== null) tog(pos, Math.abs(captured), t, captured > 0 ? 1 : -1);

  tog(pos, Math.abs(piece), f, side);
  b[f] = null;
  b[t] = pr ? pr * side : piece;
  tog(pos, Math.abs(b[t]), t, side);

  if (Math.abs(piece) === KING) pos.kingSq[side + 1] = t;

  if (fl & F_CASTLE) {
    let rf, rt;
    if (t === 97) { rf = 98; rt = 96; }
    else if (t === 93) { rf = 91; rt = 94; }
    else if (t === 27) { rf = 28; rt = 26; }
    else { rf = 21; rt = 24; }
    b[rt] = b[rf]; b[rf] = null;
    tog(pos, ROOK, rf, side);
    tog(pos, ROOK, rt, side);
  }

  // права на рокировку
  if (piece === KING) pos.castling &= ~3;
  else if (piece === -KING) pos.castling &= ~12;
  if (f === 98) pos.castling &= ~1;
  else if (f === 91) pos.castling &= ~2;
  else if (f === 28) pos.castling &= ~4;
  else if (f === 21) pos.castling &= ~8;
  if (t === 98) pos.castling &= ~1;
  else if (t === 91) pos.castling &= ~2;
  else if (t === 28) pos.castling &= ~4;
  else if (t === 21) pos.castling &= ~8;

  pos.ep = (fl & F_DPP) ? (side === WHITE ? t + 10 : t - 10) : null;

  pos.halfmove = (Math.abs(piece) === PAWN || captured !== null || (fl & F_EP)) ? 0 : pos.halfmove + 1;
  if (side === BLACK) pos.fullmove++;
  pos.turn = -side;

  zc(pos, pos.castling);
  if (pos.ep !== null) zep(pos, pos.ep);
  zt(pos);
}

function unmakeMove(pos, m) {
  const f = mfrom(m), t = mto(m), pr = mpromo(m), fl = mflags(m);
  const [castle, ep, hm, captured, zh, zl] = pos.hist.pop();
  pos.castling = castle; pos.ep = ep; pos.halfmove = hm;
  pos.zh = zh; pos.zl = zl;
  pos.turn = -pos.turn;
  const side = pos.turn, b = pos.board;

  if (pr) { b[f] = side * PAWN; b[t] = captured; }
  else    { b[f] = b[t]; b[t] = captured; }

  if (fl & F_EP) {
    const cs = side === WHITE ? t + 10 : t - 10;
    b[cs] = -side * PAWN;
  }
  if (fl & F_CASTLE) {
    let rf, rt;
    if (t === 97) { rf = 98; rt = 96; }
    else if (t === 93) { rf = 91; rt = 94; }
    else if (t === 27) { rf = 28; rt = 26; }
    else { rf = 21; rt = 24; }
    b[rf] = b[rt]; b[rt] = null;
  }
  if (Math.abs(b[f]) === KING) pos.kingSq[side + 1] = f;
  if (side === BLACK) pos.fullmove--;
}

// ---------- Оценка ----------
function evaluate(pos) {
  const b = pos.board;
  let phase = 0;
  for (let s = 21; s <= 98; s++) {
    if (!ON[s]) continue;
    const p = b[s];
    if (p === null) continue;
    const pt = Math.abs(p);
    if (pt === KNIGHT || pt === BISHOP) phase += 1;
    else if (pt === ROOK) phase += 2;
    else if (pt === QUEEN) phase += 4;
  }
  const mg = phase > 12;
  let score = 0;
  for (let s = 21; s <= 98; s++) {
    if (!ON[s]) continue;
    const p = b[s];
    if (p === null) continue;
    const pt = Math.abs(p);
    if (p > 0) {
      score += PIECE_VALUE[pt];
      score += pt === KING ? (mg ? PST_KMG : PST_KEG)[SQ64W[s]] : PST[pt][SQ64W[s]];
    } else {
      score -= PIECE_VALUE[pt];
      score -= pt === KING ? (mg ? PST_KMG : PST_KEG)[SQ64B[s]] : PST[pt][SQ64B[s]];
    }
  }
  return pos.turn === WHITE ? score : -score;
}

// ---------- Поиск ----------
const TIMEOUT = { timeout: true };
const now = () => performance.now();

class Search {
  constructor() {
    this.tt = new Map();
    this.killers = Array.from({ length: 64 }, () => [0, 0]);
    this.hist = new Float64Array(120 * 120);
    this.nodes = 0;
    this.start = 0;
    this.limit = 3000;
    this.stop = false;
  }

  // options: { timeMs, maxDepth, onInfo }
  search(pos, { timeMs = 3000, maxDepth = 64, onInfo } = {}) {
    this.start = now(); this.limit = timeMs; this.nodes = 0; this.stop = false;
    this.killers = Array.from({ length: 64 }, () => [0, 0]);
    let best = 0, bestScore = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let r;
      try { r = this.root(pos, d); }
      catch (e) { if (e === TIMEOUT) break; throw e; }
      if (this.stop) break;
      if (r.move) { best = r.move; bestScore = r.score; }
      const el = now() - this.start;
      if (onInfo) onInfo({ depth: d, score: r.score, nodes: this.nodes, time: el / 1000, move: r.move ? moveToUci(r.move) : null });
      if (Math.abs(r.score) > MATE - 100) break;
      if (el > timeMs * 0.45) break;
    }
    return { move: best, score: bestScore };
  }

  root(pos, depth) {
    const moves = genLegal(pos);
    if (!moves.length) return { score: isInCheck(pos, pos.turn) ? -MATE : 0, move: 0 };
    const e = this.tt.get(keyOf(pos));
    const ttm = e ? e[3] : 0;
    const ordered = this.order(pos, moves, ttm, 0);
    let alpha = -INF, beta = INF, bestScore = -INF, bestMove = ordered[0];
    for (const m of ordered) {
      makeMove(pos, m);
      const score = -this.negamax(pos, depth - 1, -beta, -alpha, 1);
      unmakeMove(pos, m);
      if (this.stop) throw TIMEOUT;
      if (score > bestScore) { bestScore = score; bestMove = m; }
      if (score > alpha) alpha = score;
    }
    return { score: bestScore, move: bestMove };
  }

  negamax(pos, depth, alpha, beta, ply) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && now() - this.start > this.limit) { this.stop = true; throw TIMEOUT; }
    if (pos.halfmove >= 100) return 0;

    const key = keyOf(pos);
    const entry = this.tt.get(key);
    let ttm = 0;
    if (entry) {
      const [td, ts, tf, tm] = entry;
      ttm = tm;
      if (td >= depth) {
        let sc = ts;
        if (sc > MATE - 100) sc -= ply;
        else if (sc < -MATE + 100) sc += ply;
        if (tf === 0) return sc;
        if (tf === 1 && sc >= beta) return sc;
        if (tf === 2 && sc <= alpha) return sc;
      }
    }

    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply);

    const inCheck = isInCheck(pos, pos.turn);
    if (inCheck) depth = Math.min(depth + 1, 40);

    const moves = genLegal(pos);
    if (!moves.length) return inCheck ? -MATE + ply : 0;

    const ordered = this.order(pos, moves, ttm, ply);
    let best = -INF, bestMove = ordered[0];
    const origAlpha = alpha;

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const fl = mflags(m);
      makeMove(pos, m);
      const givesCheck = isInCheck(pos, pos.turn);
      const red = (i >= 4 && depth >= 3 && !(fl & F_CAP) && !givesCheck && !inCheck) ? 1 : 0;

      let score;
      if (i === 0) {
        score = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      } else {
        score = -this.negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && (red || score < beta))
          score = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1);
      }
      unmakeMove(pos, m);

      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!(fl & F_CAP)) {
          if (ply < 64) {
            const k = this.killers[ply];
            if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
          }
          this.hist[mfrom(m) * 120 + mto(m)] += depth * depth;
        }
        break;
      }
    }

    let flag = 0;
    if (best <= origAlpha) flag = 2;
    else if (best >= beta) flag = 1;
    let store = best;
    if (store > MATE - 100) store += ply;
    else if (store < -MATE + 100) store -= ply;
    this.tt.set(key, [depth, store, flag, bestMove]);
    return best;
  }

  quiesce(pos, alpha, beta, ply) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && now() - this.start > this.limit) { this.stop = true; throw TIMEOUT; }

    const stand = evaluate(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    const scored = genPseudo(pos, true).map(m => {
      const v = pos.board[mto(m)];
      const vv = v !== null ? Math.abs(v) : PAWN;
      const pa = pos.board[mfrom(m)];
      const av = pa !== null ? Math.abs(pa) : 0;
      return [vv * 10 - av, m];
    });
    scored.sort((a, b) => b[0] - a[0]);

    for (const [, m] of scored) {
      makeMove(pos, m);
      if (isInCheck(pos, -pos.turn)) { unmakeMove(pos, m); continue; }
      const score = -this.quiesce(pos, -beta, -alpha, ply + 1);
      unmakeMove(pos, m);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  order(pos, moves, ttm, ply) {
    const k = ply < 64 ? this.killers[ply] : [0, 0];
    const sc = moves.map(m => {
      if (m === ttm) return [1e9, m];
      const fl = mflags(m);
      if (fl & F_CAP) {
        const v = pos.board[mto(m)];
        const vv = v !== null ? Math.abs(v) : PAWN;
        const pa = pos.board[mfrom(m)];
        const av = pa !== null ? Math.abs(pa) : 0;
        return [1e6 + vv * 10 - av, m];
      }
      if (m === k[0]) return [9e5, m];
      if (m === k[1]) return [8e5, m];
      return [this.hist[mfrom(m) * 120 + mto(m)], m];
    });
    sc.sort((a, b) => b[0] - a[0]);
    return sc.map(x => x[1]);
  }
}

// ---------- UCI / FEN / утилиты ----------
const sqToUci = s => "abcdefgh"[s % 10 - 1] + (8 - (Math.floor(s / 10) - 2));
const uciToSq = s => 21 + (8 - Number(s[1])) * 10 + "abcdefgh".indexOf(s[0]);

function moveToUci(m) {
  if (!m) return "0000";
  let s = sqToUci(mfrom(m)) + sqToUci(mto(m));
  const pr = mpromo(m);
  if (pr) s += { [KNIGHT]: "n", [BISHOP]: "b", [ROOK]: "r", [QUEEN]: "q" }[pr];
  return s;
}

function parseUci(pos, uci) {
  uci = uci.trim().toLowerCase();
  if (uci.length < 4) return 0;
  const f = uciToSq(uci), t = uciToSq(uci.slice(2));
  const promo = uci.length >= 5 ? ({ n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN }[uci[4]] || QUEEN) : 0;
  for (const m of genLegal(pos)) {
    if (mfrom(m) === f && mto(m) === t && (mpromo(m) === promo || (mpromo(m) === 0 && promo === 0))) return m;
  }
    return 0;
}

function applyUciMoves(pos, list) {
  for (const s of list) {
    const m = parseUci(pos, s);
    if (m) makeMove(pos, m);
  }
  return pos;
}

function fromFen(fen) {
  const [place, turn = "w", cast = "KQkq", ep = "-", hm = "0", fm = "1"] = fen.trim().split(/\s+/);
  const p = new Position();
  const map = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
  place.split("/").forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") { c += Number(ch); continue; }
      const pt = map[ch.toLowerCase()];
      p.board[21 + r * 10 + c] = ch === ch.toUpperCase() ? pt : -pt;
      c++;
    }
  });
  p.turn = turn === "b" ? BLACK : WHITE;
  p.castling = (cast.includes("K") ? 1 : 0) | (cast.includes("Q") ? 2 : 0) |
               (cast.includes("k") ? 4 : 0) | (cast.includes("q") ? 8 : 0);
  p.ep = ep === "-" ? null : uciToSq(ep);
  p.halfmove = Number(hm);
  p.fullmove = Number(fm);
  p.rehash();
  return p;
}

function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = genLegal(pos);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) {
    makeMove(pos, m);
    total += perft(pos, depth - 1);
    unmakeMove(pos, m);
  }
  return total;
}

// ---------- Экспорт ----------
const ChessEngine = {
  Position, Search, fromFen, perft, moveToUci, parseUci, applyUciMoves, evaluate,
};
if (typeof module !== "undefined") module.exports = ChessEngine;
if (typeof window !== "undefined") Object.assign(window, ChessEngine);// ===== UCI Adapter + MultiPV Extension =====
// Appended after the original chess engine code.
// Provides UCI protocol interface (postMessage/onmessage) that MainActivity expects,
// plus MultiPV support (returns top-N moves) that cheat.js needs.

// ---------- MultiPV search ----------
// Evaluates ALL root moves (full window, no alpha-beta cutoff at root),
// returns sorted list of {move, score}. Used instead of Search.search() for MultiPV.
Search.prototype.searchMultiPV = function(pos, opts) {
  var o = opts || {};
  var timeMs = o.timeMs || 3000;
  var maxDepth = o.maxDepth || 64;
  var mpv = o.multiPV || 1;
  var onInfo = o.onInfo;

  this.start = now();
  this.limit = timeMs;
  this.nodes = 0;
  this.stop = false;
  this.killers = Array.from({ length: 64 }, function() { return [0, 0]; });

  var lastResults = [];

  for (var d = 1; d <= maxDepth; d++) {
    try {
      var moves = genLegal(pos);
      if (!moves.length) {
        var mateScore = isInCheck(pos, pos.turn) ? -MATE : 0;
        lastResults = [{ move: 0, score: mateScore }];
        if (onInfo) onInfo({
          depth: d,
          results: lastResults,
          nodes: this.nodes,
          time: (now() - this.start) / 1000
        });
        break;
      }

      var e = this.tt.get(keyOf(pos));
      var ttm = e ? e[3] : 0;
      var ordered = this.order(pos, moves, ttm, 0);

      var results = [];
      for (var i = 0; i < ordered.length; i++) {
        var m = ordered[i];
        makeMove(pos, m);
        var score = -this.negamax(pos, d - 1, -INF, INF, 1);
        unmakeMove(pos, m);
        if (this.stop) throw TIMEOUT;
        results.push({ move: m, score: score });
      }

      results.sort(function(a, b) { return b.score - a.score; });
      lastResults = results;

      var el = now() - this.start;
      if (onInfo) onInfo({
        depth: d,
        results: results.slice(0, mpv),
        nodes: this.nodes,
        time: el / 1000
      });

      if (Math.abs(results[0].score) > MATE - 100) break;
      if (el > timeMs * 0.45) break;
    } catch (err) {
      if (err === TIMEOUT) break;
      throw err;
    }
  }

  return lastResults;
};

// ---------- UCI Protocol Adapter ----------
(function() {
  var pos = null;
  var multiPV = 1;
  var searchInst = null;
  var stopFlag = false;

  function send(line) {
    if (typeof postMessage === 'function') postMessage(line);
  }

  function formatScore(score) {
    if (Math.abs(score) > MATE - 100) {
      var dist = Math.ceil((MATE - Math.abs(score)));
      return 'mate ' + (score > 0 ? dist : -dist);
    }
    return 'cp ' + score;
  }

  function handleCommand(line) {
    line = (typeof line === 'string' ? line : (line && line.data)) || '';
    line = line.trim();
    if (!line) return;

    var parts = line.split(/\s+/);
    var cmd = parts[0];

    switch (cmd) {
      case 'uci':
        send('id name ChessAssist Custom Engine');
        send('id author erafox');
        send('option name MultiPV type spin default 1 min 1 max 6');
        send('uciok');
        break;

      case 'isready':
        send('readyok');
        break;

      case 'setoption':
        var ni = parts.indexOf('name');
        var vi = parts.indexOf('value');
        if (ni >= 0 && vi >= 0) {
          var name = parts.slice(ni + 1, vi).join(' ');
          var val = parts[vi + 1];
          if (name.toLowerCase() === 'multipv') {
            multiPV = Math.max(1, Math.min(6, parseInt(val, 10) || 1));
          }
        }
        break;

      case 'ucinewgame':
        pos = null;
        break;

      case 'position':
        handlePosition(parts.slice(1));
        break;

      case 'go':
        handleGo(parts.slice(1));
        break;

      case 'stop':
        stopFlag = true;
        if (searchInst) searchInst.stop = true;
        break;

      case 'quit':
        pos = null;
        stopFlag = true;
        if (searchInst) searchInst.stop = true;
        break;
    }
  }

  function handlePosition(args) {
    if (args[0] === 'startpos') {
      pos = ChessEngine.Position.start();
      var mi = args.indexOf('moves');
      if (mi >= 0) ChessEngine.applyUciMoves(pos, args.slice(mi + 1));
    } else if (args[0] === 'fen') {
      var fenParts = [];
      var i = 1;
      while (i < args.length && args[i] !== 'moves') {
        fenParts.push(args[i]);
        i++;
      }
      pos = ChessEngine.fromFen(fenParts.join(' '));
      if (i < args.length && args[i] === 'moves') {
        ChessEngine.applyUciMoves(pos, args.slice(i + 1));
      }
    }
  }

  function handleGo(args) {
    if (!pos) return;
    var timeMs = 3000;
    for (var i = 0; i < args.length; i++) {
      if (args[i] === 'movetime' && i + 1 < args.length) {
        timeMs = parseInt(args[i + 1], 10) || 3000;
      }
    }
    runSearch(timeMs);
  }

  function runSearch(timeMs) {
    stopFlag = false;
    searchInst = new ChessEngine.Search();

    var results = searchInst.searchMultiPV(pos, {
      timeMs: timeMs,
      maxDepth: 64,
      multiPV: multiPV,
      onInfo: function(info) {
        if (stopFlag) return;
        for (var i = 0; i < info.results.length; i++) {
          var r = info.results[i];
          var moveUci = r.move ? ChessEngine.moveToUci(r.move) : '0000';
          send('info depth ' + info.depth +
               ' score ' + formatScore(r.score) +
               ' multipv ' + (i + 1) +
               ' nodes ' + info.nodes +
               ' time ' + Math.round(info.time * 1000) +
               ' pv ' + moveUci);
        }
      }
    });

    var best = '(none)';
    if (results && results.length > 0 && results[0].move) {
      best = ChessEngine.moveToUci(results[0].move);
    }
    send('bestmove ' + best);
    searchInst = null;
  }

  // Set up the onmessage handler — the host (MainActivity) calls this with {data: "uci"}
  onmessage = function(e) {
    handleCommand(e);
  };
})();
