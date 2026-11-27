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
  // в квиесценсе берём и тихое превращение в ферзя
  if (capOnly) {
    const to = sq + fwd;
    if (ON[to] && b[to] === null && to >= lo && to <= hi) moves.push(pack(sq, to, QUEEN, 0));
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
function evaluatePST(pos) {
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

// ---------- Служебное: повторения, ничья по материалу, null-move ----------
// hist[j] хранит состояние ДО хода j. Повтор: та же позиция с той же стороной
// (шаг 2) внутри окна с последнего необратимого хода.
function isRepeat(pos) {
  const n = pos.hist.length;
  const lim = Math.max(0, n - pos.halfmove);
  for (let j = n - 2; j >= lim; j -= 2) {
    const h = pos.hist[j];
    if (h[4] === pos.zh && h[5] === pos.zl) return true;
  }
  return false;
}

// Мата не будет: голые короли или один лёгкий минор против голого короля
function insufficient(pos) {
  let minors = 0;
  const b = pos.board;
  for (let s = 21; s <= 98; s++) {
    if (!ON[s]) continue;
    const p = b[s];
    if (p === null) continue;
    const pt = Math.abs(p);
    if (pt === PAWN || pt === ROOK || pt === QUEEN) return false;
    if (pt === KNIGHT || pt === BISHOP) minors++;
  }
  return minors <= 1;
}

// Есть ли у стороны, которой ходить, фигуры кроме пешек и короля (защита от цугцванга)
function hasNonPawn(pos) {
  const side = pos.turn;
  for (let s = 21; s <= 98; s++) {
    if (!ON[s]) continue;
    const p = pos.board[s];
    if (p === null || (p > 0) !== (side > 0)) continue;
    const pt = Math.abs(p);
    if (pt !== PAWN && pt !== KING) return true;
  }
  return false;
}

function makeNull(pos) {
  pos.hist.push([pos.castling, pos.ep, pos.halfmove, null, pos.zh, pos.zl]);
  if (pos.ep !== null) zep(pos, pos.ep);
  pos.ep = null;
  pos.halfmove++;
  pos.turn = -pos.turn;
  zt(pos);
}

function unmakeNull(pos) {
  const [castle, ep, hm, , zh, zl] = pos.hist.pop();
  pos.castling = castle; pos.ep = ep; pos.halfmove = hm;
  pos.zh = zh; pos.zl = zl;
  pos.turn = -pos.turn;
}

// ---------- Оценка: PST + пешки + пара слонов + ладьи на линиях + щит короля + темп ----------
// Мобильность сознательно не считаем: генерация ходов в листьях слишком дорогая.
const PASS_BONUS = [0, 6, 12, 22, 38, 65, 110];   // по продвижению пешки от стартовой
const TEMPO = 10;

// Штраф за дырявый щит короля (возвращает <= 0 для владельца щита)
function shieldScore(b, ks, myPawn, dir) {
  const rk = Math.floor(ks / 10) - 2, ck = ks % 10 - 1;
  if (dir < 0 ? rk < 6 : rk > 1) return 0;   // король не на домашней горизонтали
  const rr = rk + dir;
  let need = 0, have = 0;
  for (let dc = -1; dc <= 1; dc++) {
    const cc = ck + dc;
    if (cc < 0 || cc > 7) continue;
    need++;
    if (b[(rr + 2) * 10 + cc + 1] === myPawn) have++;
  }
  return -12 * (need - have);
}

function evaluate(pos) {
  const b = pos.board;
  const wCnt = new Uint8Array(8), bCnt = new Uint8Array(8);
  const wMax = new Int8Array(8).fill(-1);   // самая «задняя» белая пешка на вертикали
  const bMin = new Int8Array(8).fill(8);    // самая «задняя» чёрная пешка на вертикали
  const wPawns = [], bPawns = [], rooks = [];
  let bishopsW = 0, bishopsB = 0;
  for (let s = 21; s <= 98; s++) {
    if (!ON[s]) continue;
    const p = b[s];
    if (p === null) continue;
    const pt = Math.abs(p);
    const r = Math.floor(s / 10) - 2, c = s % 10 - 1;
    if (pt === PAWN) {
      if (p > 0) { wCnt[c]++; if (r > wMax[c]) wMax[c] = r; wPawns.push(s); }
      else { bCnt[c]++; if (r < bMin[c]) bMin[c] = r; bPawns.push(s); }
    } else if (pt === ROOK) rooks.push(s);
    else if (pt === BISHOP) { if (p > 0) bishopsW++; else bishopsB++; }
  }

  let extra = 0;   // оценка с точки зрения белых
  if (bishopsW >= 2) extra += 30;
  if (bishopsB >= 2) extra -= 30;

  for (const s of wPawns) {
    const r = Math.floor(s / 10) - 2, c = s % 10 - 1;
    if (wCnt[c] > 1) extra -= 10;                                            // сдвоенная
    if ((c === 0 || wCnt[c - 1] === 0) && (c === 7 || wCnt[c + 1] === 0)) extra -= 12; // изолированная
    let passed = true;
    for (let f = Math.max(0, c - 1); f <= Math.min(7, c + 1); f++) if (bMin[f] < r) passed = false;
    if (passed) extra += PASS_BONUS[Math.max(0, Math.min(6, 6 - r))];
  }
  for (const s of bPawns) {
    const r = Math.floor(s / 10) - 2, c = s % 10 - 1;
    if (bCnt[c] > 1) extra += 10;
    if ((c === 0 || bCnt[c - 1] === 0) && (c === 7 || bCnt[c + 1] === 0)) extra += 12;
    let passed = true;
    for (let f = Math.max(0, c - 1); f <= Math.min(7, c + 1); f++) if (wMax[f] > r) passed = false;
    if (passed) extra -= PASS_BONUS[Math.max(0, Math.min(6, r - 1))];
  }

  for (const s of rooks) {
    const c = s % 10 - 1;
    if (b[s] > 0) { if (wCnt[c] === 0) extra += bCnt[c] === 0 ? 20 : 10; }
    else if (bCnt[c] === 0) extra -= wCnt[c] === 0 ? 20 : 10;
  }

  extra += shieldScore(b, pos.kingSq[2], PAWN, -1) - shieldScore(b, pos.kingSq[0], -PAWN, 1);

  const base = evaluatePST(pos);   // уже с точки зрения стороны, которой ходить
  return base + (pos.turn === WHITE ? extra : -extra) + TEMPO;
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
    if (pos.halfmove >= 100 || isRepeat(pos) || insufficient(pos)) return 0;

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

    // Null-move pruning: если даже пропуск хода даёт >= beta, отсекаем
    if (!inCheck && depth >= 3 && beta < MATE - 100 && evaluate(pos) >= beta && hasNonPawn(pos)) {
      const R = depth >= 6 ? 3 : 2;
      makeNull(pos);
      const ns = -this.negamax(pos, depth - 1 - R, -beta, -beta + 1, ply + 1);
      unmakeNull(pos);
      if (ns >= beta) return beta;
    }

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
    if (this.tt.size > 4000000) this.tt.clear();
    this.tt.set(key, [depth, store, flag, bestMove]);
    return best;
  }

  quiesce(pos, alpha, beta, ply) {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && now() - this.start > this.limit) { this.stop = true; throw TIMEOUT; }
    if (ply >= 16) return evaluate(pos);

    // В шахе стоять нельзя: перебираем все легальные уходы (и видим мат)
    if (isInCheck(pos, pos.turn)) {
      const evasions = genLegal(pos);
      if (!evasions.length) return -MATE + ply;
      for (const m of this.order(pos, evasions, 0, ply)) {
        makeMove(pos, m);
        const score = -this.quiesce(pos, -beta, -alpha, ply + 1);
        unmakeMove(pos, m);
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

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
      // дельта-отсечение: даже забрав фигуру, не дотянем до alpha
      const cap = pos.board[mto(m)];
      const gain = (mflags(m) & F_EP) ? PIECE_VALUE[PAWN]
        : (cap !== null ? PIECE_VALUE[Math.abs(cap)] : 0) + (mpromo(m) ? PIECE_VALUE[QUEEN] - PIECE_VALUE[PAWN] : 0);
      if (stand + gain + 200 < alpha) continue;

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

// ---------- MultiPV search: итеративное углубление, альфа-бета на корне ----------
// Ходы каждой итерации сортируются по предыдущей (лучше отсечения).
// Окно хода: beta_child = -(балл N-го лучшего), поэтому для MultiPV=1 это обычный
// корневой альфа-бета. Ходы хуже N-го лучшего получают лишь верхнюю оценку.
Search.prototype.searchMultiPV = function(pos, opts) {
  var o = opts || {};
  var hardMs = o.timeMs || 3000;
  var softMs = o.softMs || hardMs * 0.5;
  var maxDepth = o.maxDepth || 64;
  var mpv = Math.max(1, o.multiPV || 1);
  var onInfo = o.onInfo;

  this.start = now();
  this.limit = hardMs;
  this.nodes = 0;
  this.stop = false;
  this.killers = Array.from({ length: 64 }, function() { return [0, 0]; });

  var rootMoves = genLegal(pos);
  if (!rootMoves.length) return [{ move: 0, score: isInCheck(pos, pos.turn) ? -MATE : 0 }];

  var lastResults = [];
  for (var d = 1; d <= maxDepth; d++) {
    var results = [];
    try {
      var ordered;
      if (lastResults.length) {
        ordered = lastResults.map(function(r) { return r.move; });
      } else {
        var e0 = this.tt.get(keyOf(pos));
        ordered = this.order(pos, rootMoves, e0 ? e0[3] : 0, 0);
      }

      var threshold = -INF;   // балл N-го лучшего хода пока что
      for (var i = 0; i < ordered.length; i++) {
        var m = ordered[i];
        makeMove(pos, m);
        var score = -this.negamax(pos, d - 1, -INF, -threshold, 1);
        unmakeMove(pos, m);
        if (this.stop) throw TIMEOUT;
        results.push({ move: m, score: score });
        if (results.length >= mpv) {
          var sc = results.map(function(r) { return r.score; }).sort(function(a, b) { return b - a; });
          threshold = sc[mpv - 1];
        }
      }

      results.sort(function(a, b) { return b.score - a.score; });
      lastResults = results;

      var el = now() - this.start;
      if (onInfo) onInfo({ depth: d, results: results.slice(0, mpv), nodes: this.nodes, time: el / 1000 });

      if (Math.abs(results[0].score) > MATE - 100) break;
      if (el > softMs) break;
    } catch (err) {
      if (err === TIMEOUT) break;
      throw err;
    }
  }

  return lastResults.slice(0, mpv);
};

// ---------- UCI Protocol Adapter ----------
(function() {
  var posArgs = null;      // аргументы последней команды position (историю партии сохраняем целиком)
  var multiPV = 1;
  var searchInst = null;   // один Search на партию: таблица переиспользуется между ходами

  function send(line) {
    if (typeof postMessage === 'function') postMessage(line);
  }

  function formatScore(score) {
    if (Math.abs(score) > MATE - 100) {
      var plies = MATE - Math.abs(score);
      var moves = Math.ceil(plies / 2);
      return 'mate ' + (score > 0 ? moves : -moves);
    }
    return 'cp ' + score;
  }

  function buildPos(args) {
    if (!args) return null;
    var p = null;
    if (args[0] === 'startpos') {
      p = ChessEngine.Position.start();
      var mi = args.indexOf('moves');
      if (mi >= 0) ChessEngine.applyUciMoves(p, args.slice(mi + 1));
    } else if (args[0] === 'fen') {
      var fenParts = [];
      var i = 1;
      while (i < args.length && args[i] !== 'moves') { fenParts.push(args[i]); i++; }
      p = ChessEngine.fromFen(fenParts.join(' '));
      if (i < args.length && args[i] === 'moves') ChessEngine.applyUciMoves(p, args.slice(i + 1));
    }
    return p;
  }

  function getSearch() {
    if (!searchInst) searchInst = new ChessEngine.Search();
    if (searchInst.tt.size > 4000000) searchInst.tt.clear();
    return searchInst;
  }

  function handleCommand(line) {
    line = (typeof line === 'string' ? line : (line && line.data)) || '';
    line = line.trim();
    if (!line) return;

    var parts = line.split(/\s+/);
    switch (parts[0]) {
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
        posArgs = null;
        searchInst = null;   // новая партия: чистая таблица
        break;

      case 'position':
        posArgs = parts.slice(1);
        break;

      case 'go':
        handleGo(parts.slice(1));
        break;

      case 'quit':
        posArgs = null;
        break;
      // 'stop': поиск синхронный, прервать его нельзя; лимит времени задан в go
    }
  }

  function handleGo(args) {
    var work = buildPos(posArgs);
    if (!work) return;

    var t = { movetime: 0, wtime: 0, btime: 0, winc: 0, binc: 0, movestogo: 0, depth: 0 };
    for (var i = 0; i + 1 < args.length; i++) {
      if (Object.prototype.hasOwnProperty.call(t, args[i])) t[args[i]] = parseInt(args[i + 1], 10) || 0;
    }

    var left = work.turn > 0 ? t.wtime : t.btime;
    var inc = work.turn > 0 ? t.winc : t.binc;
    var soft, hard;
    if (t.movetime) {
      soft = hard = t.movetime;
    } else if (left) {
      // Бюджет на ход: доля остатка + большая часть инкремента; жёсткий лимит x3, но не больше 80% остатка
      var mtg = t.movestogo > 0 ? Math.min(t.movestogo, 40) : 30;
      soft = Math.min(left / mtg + inc * 0.8, left * 0.5);
      hard = Math.min(soft * 3, left * 0.8);
    } else {
      soft = hard = t.depth ? 1e9 : 3000;
    }
    soft = Math.max(10, soft);
    hard = Math.max(soft, hard);

    runSearch(work, { soft: soft, hard: hard, maxDepth: t.depth || 64 });
  }

  function runSearch(work, cfg) {
    var s = getSearch();
    var results = s.searchMultiPV(work, {
      timeMs: cfg.hard,
      softMs: cfg.soft,
      maxDepth: cfg.maxDepth,
      multiPV: multiPV,
      onInfo: function(info) {
        var nps = info.time > 0 ? Math.round(info.nodes / info.time) : 0;
        for (var i = 0; i < info.results.length; i++) {
          var r = info.results[i];
          send('info depth ' + info.depth +
               ' score ' + formatScore(r.score) +
               ' multipv ' + (i + 1) +
               ' nodes ' + info.nodes +
               ' nps ' + nps +
               ' time ' + Math.round(info.time * 1000) +
               ' pv ' + (r.move ? ChessEngine.moveToUci(r.move) : '0000'));
        }
      }
    });

    var best = '0000';
    if (results && results.length > 0 && results[0].move) {
      best = ChessEngine.moveToUci(results[0].move);
    }
    send('bestmove ' + best);
  }

  onmessage = function(e) {
    handleCommand(e);
  };
})();