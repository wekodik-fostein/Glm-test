// JavaScript / cheat.js / injected into chess.com inside Android WebView / board read + Stockfish hints.
(function () {
    'use strict';
    // No CFBridge, no __sf* globals. One neutral handle, attached to an engine
    // supplied by the host as a plain callback.
    if (window.__ca) return;

    var FILES = 'abcdefgh';
    var PIECE = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
    var PIECE_RU = { p: 'Пешка', n: 'Конь', b: 'Слон', r: 'Ладья', q: 'Ферзь', k: 'Король' };

    var CF = {
        enabled: true,
        think: 1500,
        board: null,
        castling: 'KQkq',
        ep: '-',
        side: 'w',
        myColor: 'w',
        teamLocked: false,
        manualTeam: false,
        busy: false,
        pendingFen: '',
        analyzeAt: 0,
        hint: null,
        hintPiece: null,
        marker: false,
        status: 'Нет игры',
        engineInit: false,
        engineSend: null,
        candidates: [],
        display: [],
        chosen: null,
        reanalyze: false,
        moveCount: 0,
        lastEval: 0,
        lastMate: false,
        lastThinkMs: 0,
        markerRect: '',
        autoTimer: 0,
        autoFen: '',
        autoBusy: false,
        blunderQuota: 0,
        blundersUsed: 0,
        bestDelayMs: 1800,
        complexity: 0.5,
        moveKind: '',
        autoDue: 0,
        autoSetAt: 0,
        hiddenAt: 0,
        autoMv: '',
        blunderMoves: [],
        oppElo: 0,
        oppEloTurn: -1,
        oppEloMissTurn: -1,
        iprSum: 0,
        iprN: 0,
        iprRating: 0,
        topStreak: 0,
        awayMs: 0,
        awayCount: 0,
        proctor: false,
        config: {
            accuracy: 78,
            accuracyOn: false,
            rating: 1500,
            multi: false,
            auto: false,
            timing: true,
            focusPause: true,
            weakMoves: false,
            proctorGuard: true,
            style: 'arrows',
            fromColor: '#14B8A6',
            toColor: '#14B8A6',
            arrowColor: '#14B8A6'
        }
    };
    window.__ca = CF;

    function status(t) {
        CF.status = t;
    }

    function logLine(t) {
        // No on-screen log: the hint itself is the only visible feedback.
    }

    function reportTeam() {
    }

    CF.setTeam = function (c) {
        c = (c === 'b') ? 'b' : 'w';
        CF.myColor = c;
        CF.teamLocked = true;
        CF.manualTeam = true;
        CF.hint = null;
        clearHint();
        reportTeam();
        maybeAnalyze();
        return CF.myColor;
    };

    function pieceTitle(p) {
        return PIECE_RU[p] || 'Фигура';
    }

    function hintText(mv) {
        var from = mv.slice(0, 2), to = mv.slice(2, 4);
        var pc = CF.board && CF.board[sqIndex(from)];
        return pieceTitle(pc && pc.p) + ' ' + from + ' → ' + to;
    }

    CF.setEnabled = function (v) {
        CF.enabled = !!v;
        if (!CF.enabled) { clearHint(); CF.hint = null; status('ХИНТ ВЫКЛ'); }
        else status('ХИНТ ВКЛ');
    };

    CF.setDepth = function (ms) {
        CF.think = Math.max(300, Math.min(6000, parseInt(ms, 10) || 1500));
        status('ВРЕМЯ ' + (CF.think / 1000).toFixed(1) + 'с');
    };

    function cancelAuto() {
        if (CF.autoTimer) { clearTimeout(CF.autoTimer); CF.autoTimer = 0; }
        CF.autoFen = '';
        CF.autoMv = '';
        CF.autoDue = 0;
        CF.autoSetAt = 0;
        CF.autoBusy = false;
    }

    // A game gets 2 or 3 deliberately weak moves scattered through the middle.
    // They are planned up front instead of fired by a fixed timer, so neither
    // the count nor the spacing becomes a pattern.
    function planBlunders() {
        CF.blundersUsed = 0;
        CF.blunderMoves = [];
        if (!CF.config.weakMoves) { CF.blunderQuota = 0; return; }
        var quota = 2 + (Math.random() < 0.5 ? 0 : 1);
        CF.blunderQuota = quota;
        while (CF.blunderMoves.length < quota) {
            var n = 6 + Math.floor(Math.random() * 36);
            if (CF.blunderMoves.indexOf(n) < 0) CF.blunderMoves.push(n);
        }
    }

    CF.setConfig = function (c) {
        if (!c) return CF.config;
        var accChanged = false, multiChanged = false, ratingChanged = false;
        if (typeof c.accuracyOn === 'boolean' && c.accuracyOn !== CF.config.accuracyOn) {
            CF.config.accuracyOn = c.accuracyOn;
            accChanged = true;
        }
        if (typeof c.accuracy === 'number') {
            var a = Math.max(20, Math.min(100, Math.round(c.accuracy)));
            if (a !== CF.config.accuracy) { CF.config.accuracy = a; accChanged = true; }
        }
        if (typeof c.rating === 'number') {
            var r = Math.max(400, Math.min(2900, Math.round(c.rating)));
            if (r !== CF.config.rating) { CF.config.rating = r; ratingChanged = true; }
        }
        if (typeof c.multi === 'boolean' && c.multi !== CF.config.multi) {
            CF.config.multi = c.multi;
            multiChanged = true;
        }
        if (typeof c.auto === 'boolean' && c.auto !== CF.config.auto) {
            CF.config.auto = c.auto;
            cancelAuto();
        }
        if (typeof c.timing === 'boolean') CF.config.timing = c.timing;
        if (typeof c.focusPause === 'boolean') CF.config.focusPause = c.focusPause;
        if (typeof c.proctorGuard === 'boolean') {
            CF.config.proctorGuard = c.proctorGuard;
            if (!c.proctorGuard) CF.proctor = false;
        }
        if (typeof c.weakMoves === 'boolean' && c.weakMoves !== CF.config.weakMoves) {
            CF.config.weakMoves = c.weakMoves;
            planBlunders();
        }
        if (c.style === 'arrows' || c.style === 'squares') CF.config.style = c.style;
        if (typeof c.fromColor === 'string') CF.config.fromColor = c.fromColor;
        if (typeof c.toColor === 'string') CF.config.toColor = c.toColor;
        if (typeof c.arrowColor === 'string') CF.config.arrowColor = c.arrowColor;

        // Re-pick from the already analysed candidates: changing strength or the
        // number of lines must not restart the search on every slider tick.
        if (CF.board && CF.side === CF.myColor && (accChanged || multiChanged || ratingChanged)) {
            var list = CF.candidates.filter(function (x) { return !!x; });
            list.sort(function (x, y) { return y.cp - x.cp; });
            if (list.length) {
                if (accChanged || ratingChanged || !CF.chosen) {
                    CF.chosen = chooseMove(list, moveFeatures(list[0].mv, list));
                    CF.hint = CF.chosen.mv;
                    var pc = CF.board[sqIndex(CF.chosen.mv.slice(0, 2))];
                    CF.hintPiece = pc ? pc.p : null;
                }
                CF.display = buildDisplay(CF.chosen, list);
                drawHint();
            } else if (engineReady()) {
                CF.pendingFen = '';
                if (CF.busy) CF.reanalyze = true;
                else maybeAnalyze();
            }
        }
        return CF.config;
    };

    CF.refresh = function () {
        CF.board = null;
        CF.hint = null;
        clearHint();
        scan();
    };

    CF.attachEngine = function (fn) {
        CF.engineSend = fn;
        CF.engineInit = false;
        CF.engineRequested = false;
        maybeAnalyze();
    };

    CF.testHint = function (mv) {
        CF.enabled = true;
        CF.hint = mv || 'e2e4';
        CF.display = [{ mv: CF.hint, cp: 0, acc: 92, main: true }];
        var pc = CF.board && CF.board[sqIndex(CF.hint.slice(0, 2))];
        CF.hintPiece = pc ? pc.p : null;
        drawHint();
        return 'hint=' + CF.hint + ' piece=' + (CF.hintPiece || '?') + ' marker=' + !!CF.marker;
    };

    // ---------- engine ----------

    function cmd(s) {
        if (typeof CF.engineSend === 'function') CF.engineSend({ data: s });
    }

    function initEngine() {
        cmd('uci');
        cmd('setoption name MultiPV value 6');
        cmd('isready');
    }

    function parseInfo(line) {
        var sc = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
        if (!sc) return;
        var raw = parseInt(sc[2], 10);
        var cp = sc[1] === 'mate' ? (raw >= 0 ? 10000 : -10000) : raw;
        var mp = line.match(/\bmultipv\s+(\d+)/);
        var pv = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (!pv) return;
        var n = mp ? parseInt(mp[1], 10) : 1;
        if (n < 1 || n > 6) return;
        CF.candidates[n - 1] = { mv: pv[1], cp: cp, mate: sc[1] === 'mate',
                mateN: sc[1] === 'mate' ? Math.abs(raw) : 0 };
        if (n === 1) {
            CF.lastEval = cp;
            CF.lastMate = sc[1] === 'mate';
        }
    }

    function otherSide(c) {
        return c === 'w' ? 'b' : 'w';
    }

    function findKing(b, c) {
        for (var i = 0; i < 64; i++) {
            var p = b[i];
            if (p && p.c === c && p.p === 'k') return i;
        }
        return -1;
    }

    function attacked(b, idx, by) {
        var row = rowOf(idx), col = colOf(idx), i, r, f, dr, df;
        var pr = by === 'w' ? row + 1 : row - 1;
        if (pr >= 0 && pr < 8) {
            if (col > 0) {
                var p1 = b[pr * 8 + col - 1];
                if (p1 && p1.c === by && p1.p === 'p') return true;
            }
            if (col < 7) {
                var p2 = b[pr * 8 + col + 1];
                if (p2 && p2.c === by && p2.p === 'p') return true;
            }
        }
        var kn = [[-2, -1], [-2, 1], [-1, -2], [-1, 2],
                [1, -2], [1, 2], [2, -1], [2, 1]];
        for (i = 0; i < kn.length; i++) {
            r = row + kn[i][0]; f = col + kn[i][1];
            if (r < 0 || r > 7 || f < 0 || f > 7) continue;
            var n = b[r * 8 + f];
            if (n && n.c === by && n.p === 'n') return true;
        }
        for (r = -1; r <= 1; r++) {
            for (f = -1; f <= 1; f++) {
                if (!r && !f) continue;
                var rr = row + r, ff = col + f;
                if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
                var k = b[rr * 8 + ff];
                if (k && k.c === by && k.p === 'k') return true;
            }
        }
        var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1],
                [-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (i = 0; i < dirs.length; i++) {
            dr = dirs[i][0]; df = dirs[i][1];
            r = row + dr; f = col + df;
            while (r >= 0 && r < 8 && f >= 0 && f < 8) {
                var pc = b[r * 8 + f];
                if (pc) {
                    if (pc.c === by) {
                        var straight = dr === 0 || df === 0;
                        if ((straight && (pc.p === 'r' || pc.p === 'q'))
                                || (!straight && (pc.p === 'b' || pc.p === 'q'))) return true;
                    }
                    break;
                }
                r += dr; f += df;
            }
        }
        return false;
    }

    function movedCopy(b, from, to, promo) {
        var n = b.slice();
        var pc = n[from];
        if (!pc) return n;
        if (pc.p === 'p' && CF.ep === sqName(to) && !n[to]) {
            var capRow = rowOf(to) + (pc.c === 'w' ? 1 : -1);
            if (capRow >= 0 && capRow < 8) n[capRow * 8 + colOf(to)] = null;
        }
        n[to] = promo ? { c: pc.c, p: promo } : pc;
        n[from] = null;
        if (pc.p === 'k' && Math.abs(colOf(to) - colOf(from)) === 2) {
            var base = rowOf(to) * 8;
            if (colOf(to) === 6) {
                n[base + 5] = n[base + 7];
                n[base + 7] = null;
            } else {
                n[base + 3] = n[base];
                n[base] = null;
            }
        }
        return n;
    }

    // Real legal moves for the low-accuracy branch. MultiPV only offers good
    // candidates; this is what makes 20% actually weak instead of cosmetic.
    function legalMoves() {
        var b = CF.board, side = CF.side, out = [];
        if (!b) return out;

        function add(from, to, promo) {
            var pc = b[from];
            if (!pc) return;
            var nb = movedCopy(b, from, to, promo);
            var k = findKing(nb, side);
            if (k < 0 || attacked(nb, k, otherSide(side))) return;
            out.push(sqName(from) + sqName(to) + (promo || ''));
        }

        for (var i = 0; i < 64; i++) {
            var pc = b[i];
            if (!pc || pc.c !== side) continue;
            var row = rowOf(i), col = colOf(i), oi, rr, ff, tt, dirs;
            if (pc.p === 'p') {
                var dir = side === 'w' ? -1 : 1;
                var startRow = side === 'w' ? 6 : 1;
                var promoRow = side === 'w' ? 0 : 7;
                var one = i + dir * 8;
                if (one >= 0 && one < 64 && !b[one]) {
                    if (rowOf(one) === promoRow) add(i, one, 'q');
                    else {
                        add(i, one);
                        if (row === startRow) {
                            var two = i + dir * 16;
                            if (two >= 0 && two < 64 && !b[two]) add(i, two);
                        }
                    }
                }
                for (var dc = -1; dc <= 1; dc += 2) {
                    var cc = col + dc;
                    var tr = row + dir;
                    if (cc < 0 || cc > 7 || tr < 0 || tr > 7) continue;
                    tt = tr * 8 + cc;
                    if (b[tt] && b[tt].c !== side) {
                        if (tr === promoRow) add(i, tt, 'q');
                        else add(i, tt);
                    } else if (!b[tt] && CF.ep === sqName(tt)) {
                        add(i, tt);
                    }
                }
            } else if (pc.p === 'n' || pc.p === 'k') {
                var offs = pc.p === 'n'
                        ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2],
                           [1, -2], [1, 2], [2, -1], [2, 1]]
                        : [[-1, -1], [-1, 0], [-1, 1], [0, -1],
                           [0, 1], [1, -1], [1, 0], [1, 1]];
                for (oi = 0; oi < offs.length; oi++) {
                    rr = row + offs[oi][0]; ff = col + offs[oi][1];
                    if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
                    tt = rr * 8 + ff;
                    if (b[tt] && b[tt].c === side) continue;
                    add(i, tt);
                }
            } else {
                dirs = pc.p === 'b'
                        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
                        : pc.p === 'r'
                          ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
                          : [[-1, -1], [-1, 1], [1, -1], [1, 1],
                             [-1, 0], [1, 0], [0, -1], [0, 1]];
                for (var di = 0; di < dirs.length; di++) {
                    rr = row + dirs[di][0]; ff = col + dirs[di][1];
                    while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
                        tt = rr * 8 + ff;
                        if (b[tt]) {
                            if (b[tt].c !== side) add(i, tt);
                            break;
                        }
                        add(i, tt);
                        rr += dirs[di][0]; ff += dirs[di][1];
                    }
                }
            }
        }

        var rank = side === 'w' ? 7 : 0;
        var kingSq = rank * 8 + 4;
        var king = b[kingSq];
        if (king && king.p === 'k' && king.c === side) {
            var enemy = otherSide(side);
            var shortRight = side === 'w' ? 'K' : 'k';
            var longRight = side === 'w' ? 'Q' : 'q';
            if (CF.castling.indexOf(shortRight) >= 0
                    && !b[rank * 8 + 5] && !b[rank * 8 + 6]
                    && !attacked(b, kingSq, enemy) && !attacked(b, rank * 8 + 5, enemy)
                    && !attacked(b, rank * 8 + 6, enemy)) {
                out.push(sqName(kingSq) + sqName(rank * 8 + 6));
            }
            if (CF.castling.indexOf(longRight) >= 0
                    && !b[rank * 8 + 1] && !b[rank * 8 + 2] && !b[rank * 8 + 3]
                    && !attacked(b, kingSq, enemy) && !attacked(b, rank * 8 + 3, enemy)
                    && !attacked(b, rank * 8 + 2, enemy)) {
                out.push(sqName(kingSq) + sqName(rank * 8 + 2));
            }
        }
        return out;
    }

    CF.testLegal = function () { return legalMoves(); };
    CF.testFen = function () { return currentFen(); };

    function randomLegal(exclude) {
        var all = legalMoves();
        if (!all.length) return null;
        var filtered = [];
        for (var i = 0; i < all.length; i++) {
            if (exclude.indexOf(all[i]) < 0) filtered.push(all[i]);
        }
        if (!filtered.length) filtered = all;
        return filtered[Math.floor(Math.random() * filtered.length)];
    }

    function accuracyOf(c, bestCp) {
        if (!c) return 0;
        var loss = Math.max(0, bestCp - c.cp);
        return Math.max(5, Math.min(99, Math.round(100 * Math.exp(-loss / 120))));
    }

    // Pick the line whose own accuracy sits closest to the requested strength.
    // This is what "play at 1650" means in practice: not "best move N% of the
    // time", but the move a player of that level would actually consider. The
    // selection is deterministic per position: the main hint and the auto move
    // both show that line instead of the 99% engine move. A hard centipawn cap
    // keeps the Elo-appropriate choice from turning into a blunder.
    function pickAtAccuracy(list, target) {
        if (list.length < 2) return list[0];
        var bestCp = list[0].cp, i;
        var ev = CF.lastEval | 0;
        var cap = ev > 250 ? 70 : (ev < -150 ? 260 : 110);
        var pick = list[0], pickD = Infinity;
        for (i = 0; i < list.length; i++) {
            var loss = Math.max(0, bestCp - list[i].cp);
            if (i > 0 && loss > cap) continue;
            var acc = accuracyOf(list[i], bestCp);
            var d = Math.abs(acc - target);
            if (d < pickD) { pick = list[i]; pickD = d; }
        }
        return pick;
    }

    // Level 1 legitimacy: the engine-vs-human gap is kept near the declared
    // rating. IPR is a rolling 400-2900 estimate from actual move quality; if it
    // drifts above the target the selector starts taking less-perfect lines.
    function targetAccuracy() {
        return clamp(45 + (CF.config.rating - 600) / 2300 * 40, 40, 90);
    }

    function effectiveAccuracy(feat) {
        var p = CF.config.accuracy * 0.62 + targetAccuracy() * 0.38;
        if (CF.iprN >= 4) p -= clamp((CF.iprRating - CF.config.rating) / 12, -10, 10);
        if (feat && feat.complexity > 0.75) p -= 4;
        if (CF.topStreak >= 3) p -= 10;
        if (Math.abs(CF.lastEval | 0) > 700) p -= 6;
        return clamp(p, 18, 97);
    }

    function recordMove(chosen, list) {
        var bestCp = list[0] ? list[0].cp : chosen.cp;
        var acc = accuracyOf(chosen, bestCp);
        CF.iprSum += acc;
        CF.iprN++;
        var avg = CF.iprSum / Math.max(1, CF.iprN);
        CF.iprRating = Math.round(clamp(400 + 2500 * Math.pow(avg / 100, 2.2), 400, 2900));
        if (list[0] && chosen.mv === list[0].mv && !chosen.weak) CF.topStreak++;
        else CF.topStreak = 0;
    }

    function parseEloText(t) {
        if (!t) return 0;
        var m = String(t).match(/\b(\d{3,4})\b/);
        if (!m) return 0;
        var v = parseInt(m[1], 10);
        return (v >= 400 && v <= 3000) ? v : 0;
    }

    // Live opponent rating from the page. Chess.com always puts us at the
    // bottom of the board (auto-flip for black), so the player block on the
    // other side is the opponent. Falls back to the configured level.
    function opponentRating() {
        var turn = CF.moveCount;
        if (CF.oppElo && CF.oppEloTurn === turn) return CF.oppElo;
        if (CF.oppEloMissTurn === turn) return 0;
        var elo = 0;
        try {
            var board = getBoardEl();
            var nodes = document.querySelectorAll(
                '.player-component, .cc-player-component, [data-test-element="player-component"]');
            var found = [], i;
            for (i = 0; i < nodes.length; i++) {
                var el = nodes[i];
                var r = el.querySelector(
                    '.user-tagline-rating, .cc-user-rating, [data-test-element="user-tagline-rating"], .rating');
                var v = parseEloText(r && r.textContent);
                if (!v) continue;
                var rect = el.getBoundingClientRect();
                if (rect.width < 2 || rect.height < 2) continue;
                found.push({ el: el, elo: v, top: rect.top });
            }
            if (found.length === 1) {
                elo = found[0].elo;
            } else if (found.length >= 2) {
                found.sort(function (a, b) { return a.top - b.top; });
                var top = found[0], bottom = found[found.length - 1];
                var bottomTeam = isBlackBottom(board) ? 'b' : 'w';
                var opp = bottomTeam === CF.myColor ? top : bottom;
                elo = opp.elo;
            }
        } catch (e) {}
        if (elo) {
            CF.oppElo = elo;
            CF.oppEloTurn = turn;
        } else {
            CF.oppEloMissTurn = turn;
        }
        return elo;
    }

    // Accuracy off means "play at the declared Elo", not "play the engine's
    // best move": the rating is converted back through the same IPR curve the
    // app uses for its strength estimate. The live opponent rating sets the
    // level (+150 Elo), with the configured rating as fallback. A losing eval
    // adds a little more gas so it can come back instead of quietly going down.
    function ratingAccuracy() {
        var base = clamp(CF.config.rating, 400, 2900);
        var opp = opponentRating();
        if (opp) base = clamp(opp, 600, 2500);
        var elo = Math.min(2900, base + 150);
        var acc = 100 * Math.pow(Math.max(1, elo - 400) / 2500, 1 / 2.2);
        // Floor keeps a game against a weak opponent from becoming a piece
        // giveaway; the +150 base still leaves the game clearly winnable.
        acc = Math.max(60, acc);
        var ev = CF.lastEval | 0;
        if (CF.lastMate && ev < 0) acc += 12;
        else if (ev <= -400) acc += 10;
        else if (ev <= -150) acc += 6;
        else if (ev <= -60) acc += 3;
        return clamp(acc, 18, 97);
    }

    function chooseMove(list, feat) {
        if (!list || !list.length) return null;
        if (list.length < 2) return list[0];
        var target = CF.config.accuracyOn ? effectiveAccuracy(feat) : ratingAccuracy();
        return pickAtAccuracy(list, target);
    }

    function displayTarget() {
        return CF.config.accuracyOn
                ? effectiveAccuracy({ complexity: CF.complexity || 0.5 })
                : ratingAccuracy();
    }

    function buildDisplay(chosen, list) {
        var bestCp = list[0] ? list[0].cp : chosen.cp;
        var out = [{ mv: chosen.mv, cp: chosen.cp, acc: accuracyOf(chosen, bestCp), main: true }];
        if (CF.config.multi) {
            // Variants must match the strength actually being played: near the
            // Elo target when accuracy is off, near the slider target when on.
            var target = displayTarget();
            var pool = [];
            for (var i = 0; i < list.length; i++) {
                if (list[i].mv === chosen.mv) continue;
                var acc = accuracyOf(list[i], bestCp);
                pool.push({ mv: list[i].mv, cp: list[i].cp, acc: acc, main: false,
                            d: Math.abs(acc - target) });
            }
            pool.sort(function (a, b) { return a.d - b.d; });
            for (var j = 0; j < pool.length && out.length < 3; j++) out.push(pool[j]);
            out.sort(function (a, b) { return b.acc - a.acc; });
        }
        return out;
    }

    CF.onEngineLine = function (line) {
        if (line.indexOf('info ') === 0) {
            parseInfo(line);
            return;
        }
        if (line.indexOf('bestmove ') !== 0) return;
        var mv = line.split(/\s+/)[1];
        CF.busy = false;
        RV.onAnalysisDone();
        if (CF.reanalyze) {
            CF.reanalyze = false;
            CF.pendingFen = '';
            maybeAnalyze();
            return;
        }
        if (Date.now() - CF.analyzeAt < 120) return;
        if (CF.pendingFen !== currentFen()) return;
        if (!CF.enabled || CF.proctor || !mv || mv === '(none)' || mv.length < 4) {
            clearHint();
            status(CF.proctor ? 'Турнир: assist off' : 'Нет хода');
            return;
        }

        var list = CF.candidates.filter(function (x) { return !!x; });
        list.sort(function (a, b) { return b.cp - a.cp; });
        if (!list.length) list = [{ mv: mv, cp: 0 }];
        var found = false, i;
        for (i = 0; i < list.length; i++) {
            if (list[i].mv === mv) { found = true; break; }
        }
        if (!found) list.unshift({ mv: mv, cp: list[0].cp });

        var feat = moveFeatures(list[0] ? list[0].mv : mv, list);
        var chosen = chooseMove(list, feat);
        feat = moveFeatures(chosen.mv, list);
        planTiming(feat);
        var planned = plannedWeakMove(list, feat);
        if (planned) chosen = planned;
        var pc = CF.board && CF.board[sqIndex(chosen.mv.slice(0, 2))];
        if (pc && pc.c !== CF.myColor) {
            clearHint();
            CF.hint = null;
            status('Не наш ход');
            return;
        }
        recordMove(chosen, list);
        CF.hint = chosen.mv;
        CF.hintPiece = pc ? pc.p : null;
        CF.chosen = chosen;
        CF.display = buildDisplay(chosen, list);
        drawHint();
        var text = hintText(chosen.mv);
        status(text);
        logLine(text);

        // One deadline for both the non-auto toast and the auto mover. It is
        // anchored to the start of analysis, so engine time is part of the
        // human pause instead of being stacked on top of it.
        var now = Date.now();
        var due = Math.max(CF.analyzeAt + CF.bestDelayMs, now + 80);
        CF.autoFen = currentFen();
        CF.autoSetAt = CF.analyzeAt;
        CF.autoDue = due;
        if (CF.config.auto) {
            scheduleAuto(CF.autoFen, chosen.mv, Math.max(80, due - now));
        }
    };

    function engineReady() {
        return typeof CF.engineSend === 'function';
    }

    // Thinking time is position-dependent, not a fixed metronome:
    //  - opening moves (first ~6) are quick, like a player who knows the line;
    //  - a one-square shuffle is medium;
    //  - complex / unclear positions and anything near a mate get real thought;
    //  - every value is jittered so identical moves never take the same time.
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // Position complexity drives both engine time and the human-style delay.
    // Cheap book moves are fast; close candidate scores, equal evaluations,
    // many legal moves and mate threats push the delay into human "thinking".
    function moveFeatures(mv, list) {
        var from = CF.board ? CF.board[sqIndex(mv.slice(0, 2))] : null;
        var to = CF.board ? CF.board[sqIndex(mv.slice(2, 4))] : null;
        var capture = !!to;
        var promo = mv.length > 4;
        var legal = legalMoves().length;
        var top = list[0] ? list[0].cp : 0;
        var gap = list.length > 1 ? Math.max(0, top - list[1].cp) : 420;
        var spread = list.length > 1 ? Math.max(0, top - list[list.length - 1].cp) : 420;
        var abs = Math.abs(CF.lastEval | 0);
        var book = CF.moveCount <= 6;

        var c = 0.2;
        c += Math.min(0.2, legal / 110);
        c += gap < 45 ? 0.22 : (gap < 110 ? 0.12 : 0);
        c += spread < 90 ? 0.13 : 0;
        c += abs <= 60 ? 0.12 : 0;
        c += (CF.lastMate || abs >= 650) ? 0.16 : 0;
        c -= (capture && gap > 120) ? 0.18 : 0;
        c -= book ? 0.18 : 0;
        if (promo) c += 0.05;
        c = clamp(c, 0.06, 1);

        var kind = book ? 'дебют' : (capture && gap > 120 ? 'вынужденное взятие'
                : (gap < 45 ? 'нетипичное решение' : (c > 0.7 ? 'сложная позиция'
                : (c < 0.3 ? 'очевидный ход' : 'обычный ход'))));
        return { complexity: c, kind: kind, capture: capture, gap: gap, legal: legal };
    }

    function humanDelay(c) {
        return Math.round(clamp(520 + c * c * 8800, 480, 12000));
    }

    function planTiming(features) {
        CF.complexity = features.complexity;
        CF.moveKind = features.kind;
        if (!CF.config.timing) {
            CF.bestDelayMs = Math.round(850 + Math.random() * 550);
            CF.moveKind = 'без тайминга';
            return;
        }
        var c = features.complexity;
        var base = humanDelay(c);
        if (CF.lastMate) base += 1100;
        var j = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        var t = base * Math.exp(j * 0.33);
        if (Math.random() < 0.10) t *= 1.35 + Math.random() * 0.55;
        // Auto is judged by the pause, not just the move: on genuinely
        // thoughtful positions it sits 1.6-2x longer, which is what a human
        // staring at a hard position actually does.
        if (CF.config.auto && c >= 0.55) t *= 1.6 + Math.random() * 0.4;
        CF.bestDelayMs = Math.round(clamp(t, 480, CF.config.auto ? 26000 : 13000));
    }

    // Pre-analysis estimate: engine time must depend on the CURRENT position,
    // never on the previous move's delay. Otherwise one hard move makes every
    // following obvious move slow, which is exactly the metronome pattern.
    function preComplexity() {
        var c = 0.16 + Math.min(0.34, legalMoves().length / 90);
        if (CF.moveCount <= 6) c -= 0.12;
        if (CF.lastMate) c += 0.1;
        return clamp(c, 0.08, 1);
    }

    function analyzeBudget() {
        if (!CF.config.timing) return CF.config.auto ? 1300 : 900;
        var c = preComplexity();
        var b = clamp(420 + c * c * 4200, 420, 4600);
        // Auto also gets more search on hard positions; the longer human pause
        // above covers it, so this is real depth, not a stretched timer.
        if (CF.config.auto && c >= 0.55) b = Math.min(7000, Math.round(b * (1.3 + Math.random() * 0.4)));
        return b;
    }

    function thinkBudget() { return analyzeBudget(); }

    function plannedWeakMove(list, feat) {
        var turn = CF.moveCount + 1;
        if (!CF.config.weakMoves) return null;
        // Auto never hands the game away on purpose: no scripted blunders when
        // the app is the one moving.
        if (CF.config.auto) return null;
        if (!CF.blunderMoves.length || CF.blundersUsed >= CF.blunderQuota) return null;
        if (CF.blunderMoves.indexOf(turn) < 0) return null;
        // Only when the game is already won, and only an engine line with a
        // controlled centipawn drop. No random legal moves, no hanging pieces.
        if (CF.lastMate || feat.gap > 600 || (CF.lastEval | 0) < 220) return null;
        for (var i = 1; i < list.length; i++) {
            var loss = list[0].cp - list[i].cp;
            if (loss >= 40 && loss <= 140) {
                CF.blundersUsed++;
                return { mv: list[i].mv, cp: list[i].cp, mate: false, weak: true };
            }
        }
        return null;
    }

    function absSq(name) {
        return String(FILES.indexOf(name.charAt(0)) + 1) + name.charAt(1);
    }

    function firePtr(win, target, type, x, y, buttons, id) {
        var init = {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button: 0, buttons: buttons, which: buttons ? 1 : 0,
            pointerId: id, pointerType: 'touch', isPrimary: true,
            pressure: buttons ? 0.5 : 0, width: 1, height: 1,
            detail: 1, view: win
        };
        var ev;
        try { ev = new (win.PointerEvent || win.MouseEvent)(type, init); }
        catch (e) {
            ev = win.document.createEvent('MouseEvents');
            ev.initMouseEvent(type, true, true, win, 1, x, y, x, y,
                false, false, false, false, 0, null);
        }
        target.dispatchEvent(ev);
    }

    function findPieceEl(board, name) {
        var el = board.querySelector('.piece.square-' + absSq(name));
        if (el) return el;
        var g = boardGeom(board), r = squareRect(name, g);
        var ps = board.querySelectorAll('.piece, piece'), best = null, bd = 1e9;
        for (var i = 0; i < ps.length; i++) {
            var pr = ps[i].getBoundingClientRect();
            var d = Math.hypot(pr.left + pr.width / 2 - (r.x + r.s / 2),
                               pr.top + pr.height / 2 - (r.y + r.s / 2));
            if (d < bd && d < r.s * 0.6) { bd = d; best = ps[i]; }
        }
        return best;
    }

    function selectPromotion(board, mv) {
        var want = (mv.charAt(4) || 'q').toLowerCase();
        var sels = ['.promotion-piece-' + want, '[data-piece="' + want + '"]',
            '.promotion-piece.' + (CF.myColor === 'w' ? 'w' : 'b') + want,
            '.promotion-piece[class*="' + want + '"]'];
        for (var i = 0; i < sels.length; i++) {
            var el = board.ownerDocument.querySelector(sels[i]);
            if (el) {
                firePtr(board.ownerDocument.defaultView || window, el, 'click',
                    el.getBoundingClientRect().left + 4,
                    el.getBoundingClientRect().top + 4, 0, 1);
                return;
            }
        }
    }

    // Human-style drag: one smooth curved path, varied duration and easing,
    // a real grab point and a short hold before the drop. No per-frame jitter:
    // tremor is the first thing an anti-cheat filter picks out of a pointer
    // trace, so the curve is continuous and the variance lives in its shape.
    function dragMove(mv) {
        if ((document.visibilityState || 'visible') === 'hidden') return false;
        var board = getBoardEl();
        if (!board || !mv || mv.length < 4) return false;
        var piece = findPieceEl(board, mv.slice(0, 2));
        if (!piece) return false;
        var doc = piece.ownerDocument || document;
        var win = doc.defaultView || window;
        var g = boardGeom(board);
        var a = squareRect(mv.slice(0, 2), g), b = squareRect(mv.slice(2, 4), g);
        var id = 2 + ((Math.random() * 4) | 0);
        // Grab not exactly in the center, like a real finger on a piece.
        var sx = a.x + a.s * (0.38 + Math.random() * 0.24);
        var sy = a.y + a.s * (0.38 + Math.random() * 0.24);
        var tx = b.x + b.s * (0.40 + Math.random() * 0.20);
        var ty = b.y + b.s * (0.40 + Math.random() * 0.20);
        var dx = tx - sx, dy = ty - sy;
        var dist = Math.max(1, Math.hypot(dx, dy));
        var nx = -dy / dist, ny = dx / dist;
        // Arc: one smooth bow, sometimes an S-curve. Both control points use
        // the same normal, so the path never zigzags.
        var bow = (0.08 + Math.random() * 0.14) * dist;
        if (Math.random() < 0.5) bow = -bow;
        var sCurve = Math.random() < 0.32;
        var c1x = sx + dx * (0.24 + Math.random() * 0.10) + nx * bow;
        var c1y = sy + dy * (0.24 + Math.random() * 0.10) + ny * bow;
        var c2x = sx + dx * (0.66 + Math.random() * 0.10) + nx * bow * (sCurve ? -0.75 : 0.55);
        var c2y = sy + dy * (0.66 + Math.random() * 0.10) + ny * bow * (sCurve ? -0.75 : 0.55);
        var steps = Math.round(clamp(10 + dist / a.s * 7 + Math.random() * 9, 11, 38));
        var dur = clamp(240 + dist / a.s * 105 + Math.random() * 260, 260, 980);
        var pauseAt = Math.random() < 0.22 ? Math.round(steps * (0.25 + Math.random() * 0.4)) : -1;
        var pauseMs = 45 + Math.random() * 90;
        var profile = Math.floor(Math.random() * 4);
        function ease(t) {
            if (profile === 0) return t * t * (3 - 2 * t);              // smooth
            if (profile === 1) return 1 - (1 - t) * (1 - t);            // fast start
            if (profile === 2) return t * t;                            // slow start
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
        }
        function point(t) {
            var u = 1 - t;
            return {
                x: u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * tx,
                y: u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ty
            };
        }
        var i = 0;
        firePtr(win, piece, 'pointerdown', sx, sy, 1, id);
        function step() {
            i++;
            var t = i / steps;
            var e = ease(t);
            var p = point(e);
            var hit = doc.elementFromPoint(p.x, p.y) || board;
            firePtr(win, hit, 'pointermove', p.x, p.y, 1, id);
            if (i < steps) {
                var wait = dur / steps * (0.82 + Math.random() * 0.36);
                if (i === pauseAt) wait += pauseMs;
                win.setTimeout(step, wait);
            } else {
                // Short settle on the target, occasional tiny overshoot.
                var over = Math.random() < 0.18;
                var ox = (tx - sx) / dist * a.s * (0.03 + Math.random() * 0.05);
                var oy = (ty - sy) / dist * a.s * (0.03 + Math.random() * 0.05);
                var drop = 50 + Math.random() * 140;
                if (over) {
                    var oel = doc.elementFromPoint(tx + ox, ty + oy) || board;
                    firePtr(win, oel, 'pointermove', tx + ox, ty + oy, 1, id);
                    var back = 3 + ((Math.random() * 3) | 0), bi = 0;
                    var side = Math.random() < 0.5 ? 1 : -1;
                    function backStep() {
                        bi++;
                        var bt = bi / back;
                        var arc = Math.sin(Math.PI * bt) * a.s * 0.045 * side;
                        var bx = tx + ox * (1 - bt) + nx * arc;
                        var by = ty + oy * (1 - bt) + ny * arc;
                        var bel = doc.elementFromPoint(bx, by) || board;
                        firePtr(win, bel, 'pointermove', bx, by, 1, id);
                        if (bi < back) win.setTimeout(backStep, 16 + Math.random() * 20);
                        else win.setTimeout(dropIt, 45 + Math.random() * 90);
                    }
                    win.setTimeout(backStep, 45 + Math.random() * 60);
                } else {
                    win.setTimeout(dropIt, drop);
                }
            }
        }
        function dropIt() {
            var el = doc.elementFromPoint(tx, ty) || board;
            firePtr(win, el, 'pointerup', tx, ty, 0, id);
            if (mv.length > 4) win.setTimeout(function () { selectPromotion(board, mv); }, 140 + Math.random() * 120);
        }
        win.setTimeout(step, 26 + Math.random() * 70);
        return true;
    }

    function scheduleAuto(fen, mv, delay) {
        cancelAuto();
        CF.autoFen = fen;
        CF.autoMv = mv;
        CF.autoSetAt = Date.now();
        CF.autoDue = CF.autoSetAt + delay;
        if ((document.visibilityState || 'visible') === 'hidden') return;
        CF.autoTimer = setTimeout(runAuto, Math.max(60, delay));
    }

    function runAuto() {
        CF.autoTimer = 0;
        if (!CF.config.auto || !CF.autoMv || !CF.autoFen) return;
        if ((document.visibilityState || 'visible') === 'hidden') return;
        if (currentFen() !== CF.autoFen || CF.side !== CF.myColor) return;
        dragMove(CF.autoMv);
    }

    document.addEventListener('visibilitychange', function () {
        var vis = document.visibilityState || 'visible';
        if (vis === 'hidden') {
            if (!CF.hiddenAt) CF.hiddenAt = Date.now();
            return;
        }
        var now = Date.now();
        // Time spent away is not thinking time: shift the deadline forward by
        // the hidden interval, so both the toast countdown and auto move pause.
        if (CF.hiddenAt) {
            CF.awayMs += now - CF.hiddenAt;
            CF.awayCount++;
        }
        if (CF.config.focusPause && CF.hiddenAt && CF.autoDue) {
            var from = Math.max(CF.hiddenAt, CF.autoSetAt || 0);
            CF.autoDue += Math.max(0, now - from);
        }
        CF.hiddenAt = 0;
        if (CF.config.auto && CF.autoMv && CF.autoFen && currentFen() === CF.autoFen) {
            if (CF.autoTimer) clearTimeout(CF.autoTimer);
            CF.autoTimer = setTimeout(runAuto, Math.max(60, CF.autoDue - Date.now()));
        }
    });

    CF.getGuiState = function () {
        var left = CF.autoDue ? (CF.autoDue - Date.now()) : (CF.bestDelayMs || 1800);
        return {
            our: !!(CF.board && CF.side === CF.myColor && !CF.proctor),
            auto: !!CF.config.auto,
            delaySec: Math.max(1, Math.ceil(left / 1000)),
            kind: CF.moveKind || '',
            complexity: CF.complexity || 0,
            thinking: !!CF.busy,
            status: CF.proctor ? 'Турнир: assist off' : (CF.status || ''),
            proctor: !!CF.proctor,
            ipr: CF.iprRating || 0,
            rating: CF.config.rating,
            weakLeft: Math.max(0, (CF.blunderQuota || 0) - (CF.blundersUsed || 0)),
            weakTotal: CF.blunderQuota || 0,
            awaySec: Math.round((CF.awayMs || 0) / 1000),
            awayCount: CF.awayCount || 0
        };
    };

    // ---------- game review (в духе chess.com) ----------
    // Пассивный разбор: классификация каждого сыгранного хода + текущий перевес.
    // Пороги и формула шкалы портированы из chess-analyzer.js. Движок не получает
    // ни одного лишнего вызова: используются те же MultiPV-кандидаты, что и для
    // подсказок, поэтому логика хинтов/таймингов не меняется.
    var RV = {
        hist: [],        // { n, color, uci, san, label, loss, cp, mate, best, mine }
        ply: 0,
        pending: null,   // ход соперника: ждёт оценки из анализа новой позиции
        lastOurCp: null, // cp нашего последнего хода (наша перспектива)
        evalWhite: 0,    // перевес в сантипешках от лица белых
        evalMate: 0      // 0 = нет; +N = мат белыми за N, -N = мат чёрными за N
    };
    RV.LBL = {
        best: 'Лучший',
        excellent: 'Отличный',
        good: 'Хороший',
        inaccuracy: 'Неточность',
        mistake: 'Ошибка',
        blunder: 'Зевок'
    };
    RV.classify = function (loss) {
        if (loss <= 10) return RV.LBL.best;
        if (loss <= 25) return RV.LBL.excellent;
        if (loss <= 50) return RV.LBL.good;
        if (loss <= 100) return RV.LBL.inaccuracy;
        if (loss <= 200) return RV.LBL.mistake;
        return RV.LBL.blunder;
    };
    RV.fmtEval = function (cp, mate) {
        if (mate) return (mate > 0 ? 'M' : '-M') + Math.abs(mate);
        return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
    };
    RV.share = function (cp, mate) {   // доля белых на шкале 0..1
        if (mate) return cp > 0 ? 1 : 0;
        return 1 / (1 + Math.pow(10, -cp / 400));
    };
    RV.reset = function () {
        RV.hist = [];
        RV.ply = 0;
        RV.pending = null;
        RV.lastOurCp = null;
        RV.evalWhite = 0;
        RV.evalMate = 0;
    };

    // Компактная запись хода для списка (без уточнений неоднозначности).
    RV.sanOf = function (mv, oldB) {
        var from = sqIndex(mv.slice(0, 2)), to = sqIndex(mv.slice(2, 4));
        var pc = oldB ? oldB[from] : null;
        if (!pc) return mv;
        var promo = mv.length > 4 ? mv.charAt(4) : '';
        var cap = !!oldB[to] || (pc.p === 'p' && CF.ep === mv.slice(2, 4) && !oldB[to]);
        if (pc.p === 'k' && Math.abs(colOf(to) - colOf(from)) === 2) {
            return colOf(to) === 6 ? 'O-O' : 'O-O-O';
        }
        var s = '';
        if (pc.p === 'p') {
            if (cap) s += mv.charAt(0) + 'x';
        } else {
            s += pc.p.toUpperCase();
            if (cap) s += 'x';
        }
        s += mv.slice(2, 4);
        if (promo) s += '=' + promo.toUpperCase();
        return s;
    };

    // Вызывается из scan() при обнаружении хода. Кандидаты CF.candidates в этот
    // момент ещё принадлежат позиции ДО хода — именно они и нужны.
    RV.onMove = function (mover, mv) {
        if (!mover || !mv || mv.length < 4) return;
        var fresh = !!(CF.pendingFen && CF.pendingFen === currentFen());
        var list = [];
        if (fresh) {
            list = (CF.candidates || []).filter(function (x) { return !!x; });
            list.sort(function (a, b) { return b.cp - a.cp; });
        }
        var best = list[0] || null, played = null, i;
        for (i = 0; i < list.length; i++) {
            if (list[i].mv === mv) { played = list[i]; break; }
        }
        if (!played) {   // движок даёт промо с буквой (e7e8q), DOM-дифф — без неё
            for (i = 0; i < list.length; i++) {
                if (list[i].mv.slice(0, 4) === mv.slice(0, 4)) { played = list[i]; break; }
            }
        }
        var uci = played ? played.mv : mv;
        var e = {
            n: RV.ply + 1,
            color: mover,
            uci: uci,
            san: RV.sanOf(uci, CF.board),
            label: null,
            loss: 0,
            cp: null,
            mate: 0,
            best: null,
            mine: mover === CF.myColor
        };
        if (mover === CF.myColor) {
            if (played && best) {
                e.cp = played.cp;
                e.mate = played.mate ? Math.max(1, played.mateN || 1) : 0;
                e.loss = Math.max(0, best.cp - played.cp);
                e.label = RV.classify(e.loss);
                e.best = played.mv === best.mv ? null : best.mv;
                RV.lastOurCp = played.cp;
                RV.evalWhite = mover === 'w' ? played.cp : -played.cp;
                RV.evalMate = played.mate ? (RV.evalWhite > 0 ? e.mate : -e.mate) : 0;
            } else if (best && list.length) {
                // Ход вне топа MultiPV: точная потеря движку неизвестна, но она
                // не меньше разницы между лучшим и худшим из показанных ходов
                // (ход не попал в топ — значит он не лучше худшего из них).
                var worst = list[list.length - 1];
                e.loss = Math.max(0, best.cp - worst.cp);
                e.label = RV.classify(Math.max(e.loss, 55));
                e.approx = true;
                e.best = best.mv;
                RV.lastOurCp = worst.cp;
                RV.evalWhite = mover === 'w' ? worst.cp : -worst.cp;
                RV.evalMate = 0;
            } else {
                RV.lastOurCp = null;   // быстрый ход: анализ позиции не успел завершиться
            }
        } else {
            // Ход соперника: потеря станет известна после анализа позиции,
            // которая возникла после него (наш ход по очереди).
            RV.pending = e;
        }
        RV.hist.push(e);
        RV.ply++;
        if (RV.hist.length > 400) RV.hist.shift();
    };

    // Вызывается из onEngineLine, когда поиск завершился (bestmove). Кандидаты
    // соответствуют CF.pendingFen — позиции, где сейчас наш ход.
    RV.onAnalysisDone = function () {
        var list = (CF.candidates || []).filter(function (x) { return !!x; });
        if (!list.length) return;
        list.sort(function (a, b) { return b.cp - a.cp; });
        var best = list[0];
        var side = (CF.pendingFen || '').split(' ')[1];
        RV.evalWhite = side === 'w' ? best.cp : -best.cp;
        RV.evalMate = best.mate ? (RV.evalWhite > 0 ? 1 : -1) * Math.max(1, best.mateN || 1) : 0;
        if (RV.pending && RV.lastOurCp !== null) {
            // Наш cp после нашего хода -> наш лучший cp после ответа соперника:
            // разница и есть потеря соперника (в его перспективе).
            var loss = Math.max(0, best.cp - RV.lastOurCp);
            RV.pending.loss = loss;
            RV.pending.label = RV.classify(loss);
            RV.pending.cp = -best.cp;
            RV.pending.mate = best.mate ? -Math.max(1, best.mateN || 1) : 0;
        }
        RV.pending = null;
    };

    CF.getReviewState = function () {
        var i, e, s;
        var sum = {
            w: { n: 0, loss: 0, blunder: 0, mistake: 0, inaccuracy: 0 },
            b: { n: 0, loss: 0, blunder: 0, mistake: 0, inaccuracy: 0 }
        };
        for (i = 0; i < RV.hist.length; i++) {
            e = RV.hist[i];
            s = sum[e.color];
            if (!s) continue;
            s.n++;
            if (e.label !== null) s.loss += e.loss;
            if (e.label === RV.LBL.blunder) s.blunder++;
            else if (e.label === RV.LBL.mistake) s.mistake++;
            else if (e.label === RV.LBL.inaccuracy) s.inaccuracy++;
        }
        var moves = [];
        var start = Math.max(0, RV.hist.length - 30);
        for (i = start; i < RV.hist.length; i++) {
            e = RV.hist[i];
            moves.push({
                n: e.n, color: e.color, san: e.san, label: e.label,
                loss: Math.round(e.loss), best: e.best, mine: e.mine,
                approx: !!e.approx,
                evalWhite: (e.color === 'w' ? 1 : -1) * (e.cp || 0)
            });
        }
        return {
            moves: moves,
            total: RV.ply,
            evalWhite: Math.round(RV.evalWhite),
            evalMate: RV.evalMate,
            evalText: RV.fmtEval(Math.round(RV.evalWhite), RV.evalMate),
            share: RV.share(RV.evalWhite, RV.evalMate),
            sumW: sum.w,
            sumB: sum.b,
            myColor: CF.myColor
        };
    };

    function analyze(fen) {
        if (!engineReady()) return;
        if (!CF.engineInit) {
            CF.engineInit = true;
            initEngine();
        }
        if (CF.busy) return;
        CF.busy = true;
        CF.candidates = [];
        CF.pendingFen = fen;
        CF.analyzeAt = Date.now();
        CF.lastThinkMs = thinkBudget();
        // Preliminary countdown from the moment the position appeared. The
        // engine result refines the same deadline, it does not add a new delay.
        CF.autoFen = fen;
        CF.autoSetAt = CF.analyzeAt;
        var preC = preComplexity();
        var preDelay = humanDelay(preC);
        if (CF.config.auto && preC >= 0.55) preDelay *= 1.6 + Math.random() * 0.4;
        CF.autoDue = CF.analyzeAt + preDelay;
        cmd('stop');
        cmd('position fen ' + fen);
        cmd('go movetime ' + CF.lastThinkMs);
        status('Думаю...');
    }

    function maybeAnalyze() {
        if (!CF.enabled || !CF.board || CF.proctor) return;
        if (CF.side !== CF.myColor) return;
        var fen = currentFen();
        if (!fen) return;
        // The host injects the engine up front and attaches it via attachEngine().
        // If it is not there yet, simply wait — no bridge call, no global flag.
        if (!engineReady()) return;
        if (fen === CF.pendingFen && CF.busy) return;
        analyze(fen);
    }

    // ---------- board reading ----------

    function findBoard(doc, depth) {
        if (!doc) return null;
        // Real chess.com board is <wc-chess-board class="board"> with DIV.piece.square-XX
        // children. Older/lichess layouts use cg-board with <piece> children. Score
        // candidates instead of taking the first [class*=board] (that is BODY).
        var sels = ['wc-chess-board', 'cg-board', '.cg-board', 'chess-board',
                '[id*="board-play"]', '.board-layout-chessboard', '.board-board',
                '[class*="board"]'];
        var cands = [], seen = [], i, j;
        for (i = 0; i < sels.length; i++) {
            var els = doc.querySelectorAll(sels[i]);
            for (j = 0; j < els.length; j++) {
                var el = els[j];
                if (seen.indexOf(el) >= 0) continue;
                seen.push(el);
                var r = el.getBoundingClientRect();
                if (r.width > 80 && r.height > 80) cands.push(el);
            }
        }
        var best = null, bestScore = -1;
        for (i = 0; i < cands.length; i++) {
            var c = cands[i], cr = c.getBoundingClientRect();
            var np = c.querySelectorAll('piece, .piece, [class*="square-"]').length;
            if (!np) continue;
            var score = np * 10 - cr.width;
            var ratio = cr.width / Math.max(1, cr.height);
            if (ratio > 0.8 && ratio < 1.25) score += 1000;
            var tag = c.tagName || '';
            if (tag === 'WC-CHESS-BOARD' || tag === 'CG-BOARD') score += 2000;
            if (/board-play|chessboard|board-board/.test((c.id || '') + ' ' + (c.className || ''))) {
                score += 500;
            }
            if (score > bestScore) { bestScore = score; best = c; }
        }
        if (best) return best;
        if (depth > 0) {
            var frames = doc.querySelectorAll('iframe');
            for (var k = 0; k < frames.length; k++) {
                try {
                    var b = findBoard(frames[k].contentDocument, depth - 1);
                    if (b) return b;
                } catch (e) {}
            }
        }
        return null;
    }

    function getBoardEl() {
        var board = findBoard(document, 2);
        if (board && inGame(board)) return board;
        return null;
    }

    // Proctor / prize tournaments are the one place where no assist is worth
    // running: the client is wrapped, screen and inputs are monitored. The
    // guard disables hints, toast and auto there instead of pretending.
    function isProctorPage() {
        var u = '';
        try { u = (location.href || '').toLowerCase(); } catch (e) {}
        if (/proctor|fair-play|titled-tuesday|\/tournaments?\//.test(u)) return true;
        return !!document.querySelector('[class*="proctor"],[data-cy*="proctor"],[class*="fair-play"]');
    }

    function inGame(board) {
        // Bot training and coach/lesson pages use the same wc-chess-board as live games.
        // URL blacklists were the reason hints were silent there — only require pieces.
        return !!(board && board.querySelectorAll('.piece, piece').length >= 4);
    }

    function isBotGame(board) {
        var url = '';
        try { url = (board.ownerDocument && board.ownerDocument.URL) || location.href; } catch (e) {}
        // In computer/bot games Jack always plays white. The player rows carry no
        // reliable "You" marker there, so never let DOM guessing flip the team.
        return /\/play\/(computer|bot)(?:\/|\?|$)/i.test(url);
    }

    function isBlackBottom(board) {
        var el = board, s = '';
        for (var i = 0; i < 6 && el; i++) {
            s += ' ' + (el.className || '');
            if (el.getAttribute) s += ' ' + (el.getAttribute('data-orientation') || '');
            el = el.parentElement;
        }
        if (/orientation-black|black-bottom|board-flipped|flipped/.test(s)) return true;

        // chess.com encodes absolute squares in classes (square-88 = h8). Compare
        // visual cells with absolute cells and vote across pieces — a single piece
        // mid-animation must not flip the detected team.
        var br = board.getBoundingClientRect();
        var ps = board.querySelectorAll('.piece, piece');
        var voteFlip = 0, voteNormal = 0;
        for (var k = 0; k < Math.min(16, ps.length); k++) {
            var cls = ps[k].className || '';
            if (typeof cls !== 'string') continue;
            var m = cls.match(/\bsquare-([1-8])([1-8])\b/);
            if (!m) continue;
            var pr = ps[k].getBoundingClientRect();
            if (pr.width < 2 || br.width < 2) continue;
            var vc = (pr.left + pr.width / 2 - br.left) / br.width * 8;
            var vr = (pr.top + pr.height / 2 - br.top) / br.height * 8;
            var ec = (+m[1] - 1), er = 8 - (+m[2]);
            var normal = Math.abs(vc - (ec + 0.5)) + Math.abs(vr - (er + 0.5));
            var flip = Math.abs(vc - (7 - ec + 0.5)) + Math.abs(vr - (7 - er + 0.5));
            if (flip < normal) voteFlip++;
            else voteNormal++;
        }
        return voteFlip > voteNormal;
    }

    // Online team detection. Bottom color is unreliable when the board is flipped,
    // so identify the current user by three independent signals:
    //   1) "You" / "Вы" marker on a player row
    //   2) own username from the header profile link, matched in a player row
    //   3) own avatar URL from the header, matched against a player row avatar
    // Returns {color:'w'|'b', score:N} or null. Higher score = safer to lock.
    function detectTeamFromDom(board) {
        var d = board.ownerDocument || document;

        function normUrl(u) {
            if (!u) return '';
            u = String(u).trim();
            if (u.indexOf('//') === 0) u = (d.location ? d.location.protocol : location.protocol) + u;
            try { var a = d.createElement('a'); a.href = u; u = a.href; } catch (e) {}
            return u.split(/[?#]/)[0].toLowerCase();
        }
        function sameAvatar(x, y) {
            if (!x || !y) return false;
            if (x === y) return true;
            var a = normUrl(x), b = normUrl(y);
            if (a === b) return true;
            var pa = a.split('/'), pb = b.split('/');
            var fa = pa[pa.length - 1], fb = pb[pb.length - 1];
            if (fa && fa === fb && fa.length > 6) return true;
            var ua = a.match(/\/user\/(\d+)\//), ub = b.match(/\/user\/(\d+)\//);
            return !!(ua && ub && ua[1] === ub[1]);
        }
        function attrText(el) {
            var s = '', at = el && el.attributes ? el.attributes : [], i;
            for (i = 0; i < at.length; i++) s += ' ' + at[i].name + '=' + at[i].value;
            return s;
        }
        function collectAvatars(root, out) {
            if (!root || !root.querySelectorAll) return;
            var nodes = [root].concat([].slice.call(
                    root.querySelectorAll('img,[style*="background"],[data-src],[data-avatar],[data-image]')));
            nodes.forEach(function (n) {
                var vals = [];
                if (n.tagName === 'IMG') {
                    vals.push(n.getAttribute('src'), n.src, n.getAttribute('data-src'));
                }
                var st = n.getAttribute ? (n.getAttribute('style') || '') : '';
                var m = st.match(/url\(["']?([^"')]+)["']?\)/i);
                if (m) vals.push(m[1]);
                ['data-src', 'data-original', 'data-avatar', 'data-image'].forEach(function (key) {
                    if (n.getAttribute) vals.push(n.getAttribute(key));
                });
                vals.forEach(function (v) {
                    if (!v) return;
                    v = normUrl(v);
                    if (v && out.indexOf(v) < 0) out.push(v);
                });
            });
        }

        // Own identity from the top navigation. Restrict to the top 160 px so
        // an opponent's avatar elsewhere on the page cannot be mistaken for ours.
        var names = [], avatars = [], seenName = {}, seenAv = {};
        var candidates = d.querySelectorAll('a[href],[class*="profile"],[data-cy*="profile"],[class*="avatar"],[data-cy*="avatar"]');
        [].forEach.call(candidates, function (n) {
            var r = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
            if (r && r.top > 160) return;
            var sig = ((n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : '')
                    + ' ' + attrText(n)).toLowerCase();
            var href = n.getAttribute ? (n.getAttribute('href') || '') : '';
            var hm = href.match(/^\/([a-z0-9_-]{3,25})\/?(?:\?|$)/i);
            if (hm && /profile|user|account|nav|header|avatar|username/.test(sig)) {
                var nm = hm[1].toLowerCase();
                if (!seenName[nm]) { seenName[nm] = 1; names.push(nm); }
            }
            collectAvatars(n, avatars);
        });
        avatars = avatars.filter(function (v) {
            if (seenAv[v]) return false;
            seenAv[v] = 1;
            return true;
        });

        var bottomColor = isBlackBottom(board) ? 'b' : 'w';
        var topColor = bottomColor === 'w' ? 'b' : 'w';
        var br = board.getBoundingClientRect();
        var midY = br.top + br.height / 2;
        var rows = [], seen = [];
        var rowSel = ['#player-top', '#player-bottom',
            '[data-cy="player-row-top"]', '[data-cy="player-row-bottom"]',
            '[class*="player-row-top"]', '[class*="player-row-bottom"]',
            '.player-row', '[class*="player-row"]'];
        rowSel.forEach(function (sel) {
            [].forEach.call(d.querySelectorAll(sel), function (el) {
                if (seen.indexOf(el) >= 0) return;
                var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
                if (!r || r.height < 18 || r.width < 60) return;
                seen.push(el);
                var sig = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')
                        + ' ' + attrText(el)).toLowerCase();
                var isTop = /top/.test(sig) || (r.top + r.height / 2 < midY && !/bottom/.test(sig));
                rows.push({ el: el, color: isTop ? topColor : bottomColor });
            });
        });

        var best = null;
        rows.forEach(function (row) {
            var el = row.el;
            var sig = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')
                    + ' ' + attrText(el)).toLowerCase();
            var txt = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ');
            var score = 0;

            // An explicit "You" label wins over any avatar/name coincidence.
            if (/\b(you|вы|ты)\b/.test(sig) || /\b(you|вы|ты)\b/.test(txt)) score += 30;
            if (/is-me|my-profile|current-user|player-me|\bself\b/.test(sig)) score += 30;

            names.forEach(function (nm) {
                if (nm && txt.indexOf(nm) >= 0) score += 8;
            });

            var rowAvatars = [];
            collectAvatars(el, rowAvatars);
            var avatarHit = false;
            rowAvatars.forEach(function (u) {
                avatars.forEach(function (a) {
                    if (sameAvatar(u, a)) avatarHit = true;
                });
            });
            if (avatarHit) score += 10;

            if (score > 0 && (!best || score > best.score)) best = { color: row.color, score: score };
        });

        return best && best.score >= 4 ? best : null;
    }

    function visualToSquare(x, y, black) {
        var f = black ? (7 - x) : x;
        var rank = black ? (1 + y) : (8 - y);
        return FILES[f] + rank;
    }

    function readBoard(board) {
        var rect = board.getBoundingClientRect();
        if (rect.width < 80) return null;
        var pieces = [].slice.call(board.querySelectorAll('.piece, piece'));
        if (!pieces.length) return null;

        var b = new Array(64), i;
        for (i = 0; i < 64; i++) b[i] = null;
        var found = 0, raw = [], maxPct = 0, minV = 0;

        pieces.forEach(function (p) {
            var cls = p.className || '';
            if (typeof cls !== 'string') cls = cls.baseVal || '';

            // chess.com: <div class="piece br square-88"> — absolute square, no transform.
            var sq = cls.match(/\bsquare-([1-8])([1-8])\b/);
            var pc = cls.match(/\b([wb])([pnbrqk])\b/);
            if (sq && pc) {
                var name = FILES[+sq[1] - 1] + sq[2];
                b[sqIndex(name)] = { c: pc[1], p: pc[2] };
                found++;
                return;
            }

            // lichess/chessground: <piece class="white rook" style="transform:translate(X%,Y%)">
            var tr = p.style.transform || '';
            var m = tr.match(/translate(?:3d)?\(\s*([-+]?[\d.]+)(px|%)?\s*[, ]\s*([-+]?[\d.]+)(px|%)?/);
            if (!m) return;
            var vx = parseFloat(m[1]), vy = parseFloat(m[3]);
            var unit = m[2] || m[4] || 'px';
            if (unit === '%') maxPct = Math.max(maxPct, Math.abs(vx), Math.abs(vy));
            minV = Math.min(minV, vx, vy);
            raw.push({ el: p, vx: vx, vy: vy, unit: unit });
        });

        if (raw.length) {
            var off = minV < 0 ? -minV : 0;
            var scale = maxPct >= 100 ? 100 : 12.5;
            var sqPx = rect.width / 8;
            var black = isBlackBottom(board);
            raw.forEach(function (r) {
                var x = r.unit === '%' ? Math.round((r.vx + off) / scale) : Math.round((r.vx + off) / sqPx);
                var y = r.unit === '%' ? Math.round((r.vy + off) / scale) : Math.round((r.vy + off) / sqPx);
                if (x < 0 || x > 7 || y < 0 || y > 7) return;
                var name = visualToSquare(x, y, black);
                var cls = r.el.className || '';
                var color = /\bwhite\b/.test(cls) ? 'w' : (/\bblack\b/.test(cls) ? 'b' : null);
                var mt = cls.match(/\b(pawn|knight|bishop|rook|queen|king)\b/);
                if (!color || !mt) return;
                b[sqIndex(name)] = { c: color, p: PIECE[mt[1]] };
                found++;
            });
        }
        return found ? b : null;
    }

    function sqIndex(name) {
        return (8 - parseInt(name.charAt(1), 10)) * 8 + FILES.indexOf(name.charAt(0));
    }

    function sqName(idx) {
        return FILES.charAt(idx % 8) + (8 - Math.floor(idx / 8));
    }

    function rowOf(idx) { return Math.floor(idx / 8); }
    function colOf(idx) { return idx % 8; }

    // Which color actually played the last move — derived fresh from the two
    // board snapshots. No cumulative toggle, so a missed move can't desync it.
    function moverColor(oldB, newB) {
        if (!oldB || !newB) return null;
        var addedW = 0, addedB = 0, changedW = false, changedB = false, i;
        for (i = 0; i < 64; i++) {
            var a = oldB[i], b = newB[i];
            var wa = a && a.c === 'w', wb = b && b.c === 'w';
            var ba = a && a.c === 'b', bb = b && b.c === 'b';
            if (wa !== wb) changedW = true;
            if (ba !== bb) changedB = true;
            if (wb && !wa) addedW++;
            if (bb && !ba) addedB++;
        }
        if (addedW && !addedB) return 'w';
        if (addedB && !addedW) return 'b';
        if (changedW && !changedB) return 'w';
        if (changedB && !changedW) return 'b';
        return null;
    }

    function sameBoard(a, b) {
        if (!a || !b) return false;
        for (var i = 0; i < 64; i++) {
            var x = a[i], y = b[i];
            if (!x && !y) continue;
            if (!x || !y || x.c !== y.c || x.p !== y.p) return false;
        }
        return true;
    }

    function isStart(b) {
        var back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
        for (var f = 0; f < 8; f++) {
            if (!b[f] || b[f].c !== 'w' || b[f].p !== back[f]) return false;
            if (!b[48 + f] || b[48 + f].c !== 'b' || b[48 + f].p !== back[f]) return false;
            if (!b[8 + f] || b[8 + f].p !== 'p' || !b[56 + f] || b[56 + f].p !== 'p') return false;
        }
        return true;
    }

    function guessCastling(b) {
        var r = '';
        function at(name, c, p) {
            var x = b[sqIndex(name)];
            return x && x.c === c && x.p === p;
        }
        if (at('e1', 'w', 'k')) {
            if (at('h1', 'w', 'r')) r += 'K';
            if (at('a1', 'w', 'r')) r += 'Q';
        }
        if (at('e8', 'b', 'k')) {
            if (at('h8', 'b', 'r')) r += 'k';
            if (at('a8', 'b', 'r')) r += 'q';
        }
        return r || '-';
    }

    function currentFen() {
        if (!CF.board) return '';
        var rows = [], r, f, empty;
        for (r = 0; r < 8; r++) {
            var row = '';
            empty = 0;
            for (f = 0; f < 8; f++) {
                var pc = CF.board[r * 8 + f];
                if (!pc) { empty++; continue; }
                if (empty) { row += empty; empty = 0; }
                row += pc.c === 'w' ? pc.p.toUpperCase() : pc.p;
            }
            if (empty) row += empty;
            rows.push(row);
        }
        return rows.join('/') + ' ' + CF.side + ' ' + CF.castling + ' ' + CF.ep + ' 0 1';
    }

    // ---------- move inference ----------

    function diffMove(oldB, newB) {
        var emptied = [], filled = [], changed = [], i;
        for (i = 0; i < 64; i++) {
            var a = oldB[i], b = newB[i];
            if (a && !b) emptied.push(i);
            if (b && !a) filled.push(i);
            if (a && b && (a.c !== b.c || a.p !== b.p)) changed.push(i);
        }
        var from = -1, to = -1;
        if (emptied.length === 1 && changed.length === 1 && filled.length === 0) {
            from = emptied[0]; to = changed[0];
        } else if (emptied.length === 1 && filled.length === 1 && changed.length === 0) {
            from = emptied[0]; to = filled[0];
        } else if (emptied.length === 2 && filled.length === 1 && changed.length === 0) {
            to = filled[0];
            for (i = 0; i < emptied.length; i++) {
                var e = emptied[i];
                if (rowOf(e) === rowOf(to) && Math.abs(colOf(e) - colOf(to)) === 1) { from = e; break; }
            }
            if (from < 0) return null;
        } else if (emptied.length === 2 && filled.length === 2 && changed.length === 0) {
            for (i = 0; i < filled.length; i++) {
                if (newB[filled[i]].p === 'k') {
                    to = filled[i];
                    for (var j = 0; j < emptied.length; j++) {
                        var o = emptied[j];
                        if (oldB[o].p === 'k' && rowOf(o) === rowOf(to)
                                && Math.abs(colOf(o) - colOf(to)) === 2) { from = o; break; }
                    }
                    break;
                }
            }
            if (from < 0) return null;
        } else {
            return null;
        }

        var mv = sqName(from) + sqName(to);
        if (newB[to].p === 'q' && oldB[from].p === 'p'
                && (rowOf(to) === 0 || rowOf(to) === 7)) mv += 'q';
        return mv;
    }

    function applyMove(mv, oldB, newB) {
        var from = sqIndex(mv.slice(0, 2)), to = sqIndex(mv.slice(2, 4));
        var pc = oldB[from];
        if (!pc) return;
        var fn = mv.slice(0, 2), tn = mv.slice(2, 4);
        var epCap = -1;

        if (pc.p === 'p' && tn === CF.ep && !oldB[to]) {
            var capRow = rowOf(to) + (pc.c === 'w' ? 1 : -1);
            if (capRow >= 0 && capRow < 8) {
                epCap = capRow * 8 + colOf(to);
                var capPc = oldB[epCap];
                if (capPc && capPc.p === 'r') removeRookRight(sqName(epCap), capPc.c);
            }
        }

        if (pc.p === 'k') {
            CF.castling = CF.castling.replace(pc.c === 'w' ? 'K' : 'k', '');
            CF.castling = CF.castling.replace(pc.c === 'w' ? 'Q' : 'q', '');
        } else if (pc.p === 'r') {
            removeRookRight(fn, pc.c);
        }

        var victim = oldB[to];
        if (victim && victim.p === 'r') removeRookRight(tn, victim.c);

        if (pc.p === 'p' && Math.abs(rowOf(to) - rowOf(from)) === 2) {
            var mid = (rowOf(to) + rowOf(from)) / 2;
            CF.ep = FILES.charAt(colOf(from)) + (8 - mid);
        } else {
            CF.ep = '-';
        }
        if (!CF.castling) CF.castling = '-';
        // Side-to-move is set by scan() from moverColor(), never toggled here.
    }

    function removeRookRight(name, color) {
        var table = { h1: 'K', a1: 'Q', h8: 'k', a8: 'q' };
        var ch = table[name];
        if (ch && (color === 'w' ? /[KQ]/.test(ch) : /[kq]/.test(ch))) {
            CF.castling = CF.castling.replace(ch, '');
        }
    }

    // ---------- highlight ----------

    // Visual grid coords (col,row) of a square, accounting for the ACTUAL board
    // orientation. Player color is not the same thing: chess.com lets you flip.
    function squareXY(name, black) {
        var f = FILES.indexOf(name.charAt(0));
        var rank = parseInt(name.charAt(1), 10);
        var x = f, y = 8 - rank;
        if (black) { x = 7 - x; y = 7 - y; }
        return { x: x, y: y };
    }

    // Board geometry in TOP-document viewport coordinates. Square size comes from
    // an actual piece rect, so a CSS transform or padding on cg-board can't skew it.
    function boardGeom(board) {
        var r = board.getBoundingClientRect();
        var s = r.width / 8;
        var p = board.querySelector('.piece') || board.querySelector('piece');
        if (p) {
            var pr = p.getBoundingClientRect();
            // Only trust the piece rect when it's about one eighth of the board.
            if (pr.width > s * 0.6 && pr.width < s * 1.4) s = pr.width;
        }
        if (!(s > 2)) s = 40;

        // If the board is inside one or more iframes, add every frame offset.
        var left = r.left, top = r.top;
        var d = board.ownerDocument || document;
        var guard = 0;
        while (d && d !== document && guard++ < 5) {
            var w = d.defaultView;
            var fe = w && w.frameElement;
            if (!fe) break;
            var fr = fe.getBoundingClientRect();
            left += fr.left;
            top += fr.top;
            d = fe.ownerDocument;
        }
        return { left: left, top: top, s: s, w: r.width, h: r.height,
                 black: isBlackBottom(board) };
    }

    function squareRect(name, g) {
        var p = squareXY(name, g.black);
        return { x: g.left + p.x * g.s, y: g.top + p.y * g.s, s: g.s };
    }

    function clearHint() {
        CF.marker = false;
        CF.display = [];
    }

    function drawHint() {
        CF.marker = false;
        if (!CF.hint || !CF.enabled) return;
        var board = getBoardEl();
        if (!board) return;
        var g = boardGeom(board);
        CF.markerRect = g.left + '|' + g.top + '|' + g.w + '|' + g.h + '|' + g.s
                + '|' + g.black;
        CF.marker = true;
    }

    // Pulled by the host on a timer. No DOM node, no console channel, no bridge
    // object visible to the page.
    CF.getHintState = function () {
        if (CF.proctor) return null;
        if (!CF.enabled || !CF.hint || !CF.marker || !CF.display.length) return null;
        var board = getBoardEl();
        if (!board) return null;
        var g = boardGeom(board);
        var arrows = [];
        for (var i = 0; i < CF.display.length; i++) {
            var d = CF.display[i];
            arrows.push({
                from: squareRect(d.mv.slice(0, 2), g),
                to: squareRect(d.mv.slice(2, 4), g),
                label: CF.config.multi ? String(d.acc) : '',
                main: !!d.main
            });
        }
        var vv = window.visualViewport;
        var de = document.documentElement || document.body;
        var gst = CF.getGuiState();
        return {
            mode: CF.config.style,
            multi: CF.config.multi,
            auto: gst.auto,
            delaySec: gst.delaySec,
            kind: gst.kind,
            arrows: arrows,
            view: {
                w: vv ? vv.width : (de.clientWidth || window.innerWidth || 1),
                h: vv ? vv.height : (de.clientHeight || window.innerHeight || 1),
                ox: vv ? vv.offsetLeft : 0,
                oy: vv ? vv.offsetTop : 0
            }
        };
    };

    function pretty(mv) {
        return mv.slice(0, 2).toUpperCase() + ' → ' + mv.slice(2, 4).toUpperCase();
    }

    // ---------- loop ----------

    function scan() {
        var board = getBoardEl();
        if (!board) {
            if (CF.board) {
                CF.board = null;
                clearHint();
                CF.hint = null;
                status('Нет игры');
            }
            return;
        }
        // Proctor / prize tournament pages: no hints, no toast, no auto.
        if (CF.config.proctorGuard && isProctorPage()) {
            if (!CF.proctor) {
                CF.proctor = true;
                CF.hint = null;
                clearHint();
                cancelAuto();
                status('Турнир: assist off');
            }
            return;
        }
        if (CF.proctor) {
            CF.proctor = false;
            status('Assist on');
        }

        // A fresh board (no tracked position yet) starts a new game: drop an
        // automatically locked team, but keep an explicit manual override.
        if (!CF.board) {
            CF.candidates = [];
            RV.reset();
            CF.display = [];
            CF.chosen = null;
            CF.pendingFen = '';
            CF.busy = false;
            CF.reanalyze = false;
            CF.moveCount = 0;
            CF.lastEval = 0;
            CF.lastMate = false;
            CF.bestDelayMs = 1800;
            CF.complexity = 0.5;
            CF.moveKind = '';
            CF.iprSum = 0;
            CF.iprN = 0;
            CF.iprRating = 0;
            CF.topStreak = 0;
            CF.oppElo = 0;
            CF.oppEloTurn = -1;
            CF.oppEloMissTurn = -1;
            CF.awayMs = 0;
            CF.awayCount = 0;
            cancelAuto();
            planBlunders();
            if (!CF.manualTeam) CF.teamLocked = false;
        }

        var dom = CF.teamLocked ? null : detectTeamFromDom(board);
        if (!CF.manualTeam && isBotGame(board)) {
            CF.myColor = 'w';
            CF.teamLocked = true;
            dom = null;
        }
        var bottomTeam = isBlackBottom(board) ? 'b' : 'w';
        var team = dom && dom.score >= 4 ? dom.color : bottomTeam;
        if (!CF.teamLocked && CF.myColor !== team) {
            CF.myColor = team;
            CF.oppElo = 0;
            CF.oppEloTurn = -1;
            CF.oppEloMissTurn = -1;
            reportTeam();
            logLine('Я: ' + (team === 'w' ? 'БЕЛЫЕ' : 'ЧЁРНЫЕ'));
        }
        // Strong DOM/avatar evidence is stable — lock it so a later animation
        // or flipped view cannot silently swap the side we play.
        if (!CF.teamLocked && dom && dom.score >= 8) CF.teamLocked = true;

        var nb = readBoard(board);
        if (!nb) return;

        if (!CF.board) {
            CF.board = nb;
            CF.castling = isStart(nb) ? 'KQkq' : guessCastling(nb);
            CF.ep = '-';
            // Corrected on the first detected move; start position is white to move.
            CF.side = 'w';
            status('Игра найдена');
            if (CF.side === CF.myColor) {
                CF.autoFen = currentFen();
                CF.autoSetAt = Date.now();
                CF.autoDue = CF.autoSetAt + (CF.bestDelayMs || 1800);
            }
            maybeAnalyze();
            return;
        }
        if (sameBoard(nb, CF.board)) {
            if (CF.marker) {
                var g = boardGeom(board);
                var key = g.left + '|' + g.top + '|' + g.w + '|' + g.h + '|' + g.s
                        + '|' + g.black;
                if (key !== CF.markerRect) drawHint();
            }
            return;
        }

        // Recompute side-to-move from the actual color that played — never from
        // a running toggle or chess.com's DOM classes, both of which drift.
        var mover = moverColor(CF.board, nb);
        var mv = diffMove(CF.board, nb);
        if (mv && mover) RV.onMove(mover, mv);
        if (mover) CF.side = (mover === 'w') ? 'b' : 'w';
        if (mv) {
            applyMove(mv, CF.board, nb);
            if (mover === CF.myColor) CF.moveCount++;
            if (mover) CF.side = (mover === 'w') ? 'b' : 'w';
        } else {
            CF.castling = isStart(nb) ? 'KQkq' : guessCastling(nb);
            CF.ep = '-';
        }
        CF.board = nb;
        CF.busy = false;
        CF.pendingFen = '';
        CF.candidates = [];
        CF.display = [];
        CF.chosen = null;
        clearHint();
        CF.hint = null;
        cancelAuto();
        CF.bestDelayMs = 1800;
        CF.complexity = 0.5;
        if (CF.side === CF.myColor) {
            CF.autoFen = currentFen();
            CF.autoSetAt = Date.now();
            CF.autoDue = CF.autoSetAt + CF.bestDelayMs;
        }
        maybeAnalyze();
    }

    // Exposed for the DEV console dump.
    CF.detectTeam = detectTeamFromDom;

    // Deliberately no document-wide MutationObserver: chess.com mutates styles and
    // classes constantly. A plain poll keeps the renderer responsive on weak phones.
    setInterval(scan, 400);
    setTimeout(scan, 400);
})();
