/**
 * لعبة الشطرنج - سمو الأميرة
 * Chess Game Module using chess.js and Firebase
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, remove, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { CHESS_PIECES } from "./chess-pieces.js";
import { firebaseConfig } from "./config.js";

class ChessGameManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
        this.auth = getAuth(this.app);

        this.urlParams = new URLSearchParams(window.location.search);
        this.roomId = this.urlParams.get('roomID');
        this.playerName = this.urlParams.get('username') || "لاعب";
        this.role = this.urlParams.get('role'); // owner or guest

        this.myId = null;
        this.isHost = false;
        this.isSpectator = false;
        this.playerColor = null; // 'w' or 'b'
        this.game = new window.Chess();
        this.board = null;

        this.players = [];
        this.gameState = 'lobby'; // lobby, game, over

        if (!this.roomId) {
            window.location.href = './index.html';
            return;
        }

        this.initDOM();
        this.initEvents();
        this.initAuth();
    }

    initDOM() {
        this.elSectionLobby = document.getElementById('section-lobby');
        this.elSectionGame = document.getElementById('section-game');
        this.elDisplayRoomId = document.getElementById('display-room-id');
        this.elBtnStart = document.getElementById('btn-start-game');
        this.elBtnAddBot = document.getElementById('btn-add-bot');
        this.elBtnCopyId = document.getElementById('btn-copy-id');
        this.elBoard = document.getElementById('board');

        this.elBtnToggleChat = document.getElementById('btn-toggle-chat');
        this.elBtnCloseChat = document.getElementById('btn-close-chat');
        this.elChatContainer = document.getElementById('chat-container');
        this.elChatMessages = document.getElementById('chat-messages');
        this.elChatInput = document.getElementById('chat-input');
        this.elBtnSendChat = document.getElementById('btn-send-chat');

        this.toast = document.getElementById('main-toast');
    }

    initEvents() {
        this.elBtnCopyId.onclick = () => this.copyRoomId();
        this.elBtnStart.onclick = () => this.startGame();
        this.elBtnAddBot.onclick = () => this.addBot();

        this.elBtnToggleChat.onclick = () => {
            this.elChatContainer.classList.add('active');
            this.elChatContainer.classList.remove('hidden');
            document.body.classList.add('chat-open');
        };
        this.elBtnCloseChat.onclick = () => {
            this.elChatContainer.classList.remove('active');
            document.body.classList.remove('chat-open');
        };

        this.elBtnSendChat.onclick = () => this.sendChat();
        this.elChatInput.onkeypress = (e) => {
            if (e.key === 'Enter') this.sendChat();
        };

        document.querySelectorAll('.promo-option').forEach(el => {
            el.onclick = () => {
                if (!this.pendingPromotionMove) return;
                const piece = el.dataset.piece;
                const move = this.game.move({
                    from: this.pendingPromotionMove.from,
                    to: this.pendingPromotionMove.to,
                    promotion: piece
                });
                if (move) {
                    this.syncMove(this.game.fen());
                }
                this.selectedSquare = null;
                this.pendingPromotionMove = null;
                document.getElementById('modal-promotion').classList.add('hidden');
                this.renderBoard();
            };
        });

        document.getElementById('btn-exit-game').onclick = () => {
            window.location.href = './index.html';
        };

        document.getElementById('btn-back-lobby').onclick = () => {
            if (this.isHost) {
                update(ref(this.db, `rooms/${this.roomId}/config`), { gameState: 'lobby' });
            }
            document.getElementById('modal-results').classList.add('hidden');
        };
    }

    async initAuth() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.myId = user.uid;
                this.joinRoom();
            } else {
                signInAnonymously(this.auth).catch(err => console.error(err));
            }
        });
    }

    async joinRoom() {
        const playerRef = ref(this.db, `rooms/${this.roomId}/players/${this.myId}`);
        const roomRef = ref(this.db, `rooms/${this.roomId}`);

        const snap = await get(roomRef);
        if (!snap.exists()) {
            if (this.role === 'owner') {
                // Initial setup for host
                await set(roomRef, {
                    roomType: 'chess',
                    config: {
                        hostId: this.myId,
                        gameState: 'lobby',
                        createdAt: serverTimestamp()
                    }
                });
            } else {
                alert("الغرفة غير موجودة");
                window.location.href = './index.html';
                return;
            }
        }

        const data = snap.val();
        this.isHost = data.config.hostId === this.myId;

        onDisconnect(playerRef).remove();

        await update(playerRef, {
            name: this.playerName,
            avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${this.myId}`,
            joinedAt: serverTimestamp(),
            isOnline: true
        });

        this.listenToRoom();
    }

    listenToRoom() {
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // Chat sync
            if (data.chat) {
                this.renderChat(data.chat);
            }

            // Handle players and roles
            if (data.players) {
                this.players = Object.entries(data.players)
                    .map(([id, p]) => ({ id, ...p }))
                    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

                this.updateLobbyUI();
            }

            if (data.config) {
                const oldGameState = this.gameState;
                this.gameState = data.config.gameState;
                this.whitePlayerId = data.config.whitePlayerId;
                this.blackPlayerId = data.config.blackPlayerId;

                this.isSpectator = false;
                if (this.myId === this.whitePlayerId) this.playerColor = 'w';
                else if (this.myId === this.blackPlayerId) this.playerColor = 'b';
                else this.isSpectator = true;

                if (data.config.fen && data.config.fen !== this.game.fen()) {
                    const oldFen = this.game.fen();
                    this.game.load(data.config.fen);
                    if (this.gameState === 'game' || this.gameState === 'over') {
                        // Animation: only if it's not the very first position or we have a lastMove
                        if (data.config.lastMove) {
                            this.renderBoardWithAnimation(data.config.lastMove);
                        } else {
                            this.renderBoard();
                        }
                    }
                }

                if (this.gameState === 'over') {
                    this.showResults(data.config.resultTitle, data.config.resultMessage);
                }

                if (this.gameState === 'game' && this.elSectionLobby.classList.contains('active')) {
                    this.transitionToGame();
                } else if (this.gameState === 'lobby' && oldGameState === 'game') {
                    location.reload(); // Simple way to reset everything
                }

                if (this.gameState === 'game' && this.isHost && this.game.turn() !== this.playerColor) {
                    const currentPlayer = this.players.find(p => (this.game.turn() === 'w' ? this.whitePlayerId : this.blackPlayerId) === p.id);
                    if (currentPlayer && currentPlayer.isBot) {
                        this.makeBotMove();
                    }
                }
            }
        });
    }

    updateLobbyUI() {
        this.elDisplayRoomId.textContent = this.roomId;

        // Clear slots
        document.getElementById('slot-0').querySelector('.player-name').textContent = "بانتظار...";
        document.getElementById('slot-1').querySelector('.player-name').textContent = "بانتظار...";
        document.getElementById('slot-0').querySelector('.avatar-wrapper').classList.remove('active-turn-glow');
        document.getElementById('slot-1').querySelector('.avatar-wrapper').classList.remove('active-turn-glow');

        this.players.filter(p => !p.isSpectator).forEach((p, i) => {
            if (i < 2) {
                const slot = document.getElementById(`slot-${i}`);
                slot.querySelector('.player-name').textContent = p.name;
                slot.querySelector('.avatar-wrapper').classList.remove('empty');
                slot.querySelector('.avatar-img').innerHTML = `<img src="${p.avatar}">`;
            }
        });

        if (this.isHost && this.players.length >= 2) {
            this.elBtnStart.classList.remove('disabled');
        } else {
            this.elBtnStart.classList.add('disabled');
        }

        const spectators = this.players.filter(p => p.isSpectator).length;
        document.getElementById('spectators-count').textContent = spectators;
    }

    copyRoomId() {
        navigator.clipboard.writeText(this.roomId);
        this.showToast("تم نسخ رمز الغرفة!");
    }

    showToast(msg) {
        this.toast.textContent = msg;
        this.toast.classList.remove('hidden');
        setTimeout(() => this.toast.classList.add('hidden'), 3000);
    }

    async startGame() {
        if (!this.isHost || this.players.length < 2) return;

        await update(ref(this.db, `rooms/${this.roomId}/config`), {
            gameState: 'game',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'w',
            whitePlayerId: this.players[0].id,
            blackPlayerId: this.players[1].id
        });
    }

    async addBot() {
        if (!this.isHost) return;
        const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
        await update(ref(this.db, `rooms/${this.roomId}/players/${botId}`), {
            name: "بوت محترف 🤖",
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${botId}`,
            joinedAt: serverTimestamp(),
            isOnline: true,
            isBot: true
        });
    }

    transitionToGame() {
        this.elSectionLobby.classList.add('hidden');
        this.elSectionLobby.classList.remove('active');
        this.elSectionGame.classList.remove('hidden');
        this.elSectionGame.classList.add('active');

        this.initChessBoard();
    }

    async sendChat() {
        const text = this.elChatInput.value.trim();
        if (!text) return;

        await push(ref(this.db, `rooms/${this.roomId}/chat`), {
            senderId: this.myId,
            senderName: this.playerName,
            text: text,
            timestamp: serverTimestamp()
        });

        this.elChatInput.value = '';
    }

    renderChat(chatObj) {
        const messages = Object.values(chatObj).sort((a, b) => a.timestamp - b.timestamp);
        this.elChatMessages.innerHTML = '';

        messages.forEach(m => {
            const el = document.createElement('div');
            const isMine = m.senderId === this.myId;
            el.className = `message ${isMine ? 'mine' : 'opponent'}`;
            el.textContent = `${m.senderName}: ${m.text}`;
            this.elChatMessages.appendChild(el);
        });

        this.elChatMessages.scrollTop = this.elChatMessages.scrollHeight;
    }

    initChessBoard() {
        this.renderBoard();
        this.initMoveListeners();
    }

    // Support drag and drop natively or via existing click
    // the previous click listeners are in initMoveListeners()
    // let's add CSS for sliding animations and visual highlights in chess.css




    initMoveListeners() {
        this.selectedSquare = null;
        let draggedSquare = null;
        let ghostEl = null;

        const btnExit = document.getElementById('btn-exit');
        if (btnExit) {
            btnExit.addEventListener('click', () => {
                 if (this.gameState === 'game') {
                     if (confirm("هل أنت متأكد من الانسحاب؟")) {
                         this.handleGameOver(true);
                     }
                 } else {
                     window.location.href = './index.html';
                 }
            });
        }

        const handleStart = (e) => {
            if (this.isSpectator || this.gameState !== 'game') return;
            if (this.game.turn() !== this.playerColor) return;

            const squareEl = e.target.closest('.square-55d63');
            if (!squareEl) return;

            const pieceEl = squareEl.querySelector('.piece-417db');
            if (!pieceEl) return;

            // إذا كان المستخدم ضغط للتو على اللمس، نعطيه أولوية (يمنع click مزدوج)
            if (e.type === 'touchstart') {
                this.isTouchDrag = true;
            }

            const square = squareEl.dataset.square;
            const piece = this.game.get(square);

            if (piece && piece.color === this.playerColor) {
                e.preventDefault(); // منع السلوك الافتراضي المزعج للموبايل
                draggedSquare = square;
                this.selectedSquare = square;
                this.highlightPossibleMoves(square);

                // Create ghost
                ghostEl = pieceEl.cloneNode(true);
                ghostEl.classList.add('dragging');
                ghostEl.style.position = 'fixed'; // fixed افضل للموبايل
                ghostEl.style.pointerEvents = 'none';
                ghostEl.style.zIndex = '9999';

                const rect = squareEl.getBoundingClientRect();
                ghostEl.style.width = rect.width + 'px';
                ghostEl.style.height = rect.height + 'px';

                document.body.appendChild(ghostEl);
                pieceEl.style.opacity = '0.3';

                const getClientPos = (evt) => {
                    if (evt.touches && evt.touches.length > 0) {
                        return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
                    }
                    return { x: evt.clientX, y: evt.clientY };
                };

                const moveGhost = (moveEvent) => {
                    if (!ghostEl) return;
                    moveEvent.preventDefault(); // منع الـ scrolling عند السحب
                    const pos = getClientPos(moveEvent);
                    ghostEl.style.left = (pos.x - rect.width / 2) + 'px';
                    ghostEl.style.top = (pos.y - rect.height / 2) + 'px';
                };

                moveGhost(e);

                const upHandler = (upEvent) => {
                    document.removeEventListener('mousemove', moveGhost);
                    document.removeEventListener('mouseup', upHandler);
                    document.removeEventListener('touchmove', moveGhost);
                    document.removeEventListener('touchend', upHandler);

                    if (ghostEl) {
                        ghostEl.remove();
                        ghostEl = null;
                    }
                    if (pieceEl) {
                        pieceEl.style.opacity = '1';
                    }

                    const pos = upEvent.changedTouches && upEvent.changedTouches.length > 0
                                ? { x: upEvent.changedTouches[0].clientX, y: upEvent.changedTouches[0].clientY }
                                : { x: upEvent.clientX, y: upEvent.clientY };

                    const dropTarget = document.elementFromPoint(pos.x, pos.y);
                    const targetSquareEl = dropTarget ? dropTarget.closest('.square-55d63') : null;

                    if (targetSquareEl) {
                        const targetSquare = targetSquareEl.dataset.square;
                        if (targetSquare !== draggedSquare) {
                            this.attemptMove(draggedSquare, targetSquare);
                            draggedSquare = null;
                            setTimeout(() => this.isTouchDrag = false, 100);
                            return;
                        }
                    }
                    draggedSquare = null;
                    setTimeout(() => this.isTouchDrag = false, 100);
                };

                document.addEventListener('mousemove', moveGhost, {passive: false});
                document.addEventListener('mouseup', upHandler);
                document.addEventListener('touchmove', moveGhost, {passive: false});
                document.addEventListener('touchend', upHandler);
            }
        };

        this.elBoard.addEventListener('mousedown', handleStart);
        this.elBoard.addEventListener('touchstart', handleStart, {passive: false});

        this.elBoard.addEventListener('click', (e) => {
            if (draggedSquare || this.isTouchDrag) return; // handled by up/touchend
            if (this.isSpectator || this.gameState !== 'game') return;
            if (this.game.turn() !== this.playerColor) return;

            const squareEl = e.target.closest('.square-55d63');
            if (!squareEl) return;

            const square = squareEl.dataset.square;

            if (this.selectedSquare) {
                if (this.selectedSquare === square) {
                    this.selectedSquare = null;
                    this.renderBoard();
                    return;
                }
                this.attemptMove(this.selectedSquare, square);
            } else {
                const piece = this.game.get(square);
                if (piece && piece.color === this.playerColor) {
                    this.selectedSquare = square;
                    this.highlightPossibleMoves(square);
                }
            }
        });
    }

    attemptMove(fromSquare, toSquare) {
        // Check if move is promotion
        const moves = this.game.moves({ square: fromSquare, verbose: true });
        let isPromotion = moves.some(m => m.to === toSquare && m.promotion);

        let promote = 'q';
        const piece = this.game.get(fromSquare);
        if (piece && piece.type === 'p' && (toSquare[1] === '8' || toSquare[1] === '1')) {
            promote = 'q';
            isPromotion = false;
        }

        if (isPromotion) {
            this.pendingPromotionMove = { from: fromSquare, to: toSquare };
            document.getElementById('modal-promotion').classList.remove('hidden');
            return;
        }

        const move = this.game.move({
            from: fromSquare,
            to: toSquare,
            promotion: promote
        });

        if (move) {
            this.syncMove(this.game.fen());
            this.selectedSquare = null;
        } else {
            // Check if clicked on another of my own pieces
            const piece = this.game.get(toSquare);
            if (piece && piece.color === this.playerColor) {
                this.selectedSquare = toSquare;
                this.renderBoard();
                this.highlightPossibleMoves(toSquare);
            } else {
                this.selectedSquare = null;
                this.renderBoard();
            }
        }
    }

    highlightPossibleMoves(square) {
        const moves = this.game.moves({
            square: square,
            verbose: true
        });

        moves.forEach(m => {
            const sqEl = this.elBoard.querySelector(`[data-square="${m.to}"]`);
            if (sqEl) {
                const dot = document.createElement('div');
                dot.className = 'move-dot';
                sqEl.appendChild(dot);
            }
        });

        const currentSqEl = this.elBoard.querySelector(`[data-square="${square}"]`);
        if (currentSqEl) currentSqEl.classList.add('highlight-square');
    }

    async syncMove(fen) {
        const history = this.game.history({ verbose: true });
        const lastMove = history.pop();

        // Optimistically render my own move with animation locally first
        this.renderBoardWithAnimation(lastMove);

        await update(ref(this.db, `rooms/${this.roomId}/config`), {
            fen: fen,
            lastMove: lastMove,
            lastMoveTime: serverTimestamp()
        });

        this.makeBotMove();
        if (this.game.game_over()) {
            this.handleGameOver();
        }
    }


    // --- TIMER LOGIC ---
    startTimer() {
        this.stopTimer();
        const pill = document.getElementById('turn-timer-pill');
        if (!pill) return;

        if (this.gameState !== 'game') {
             pill.classList.add('hidden');
             return;
        }

        pill.classList.remove('hidden');
        this.turnStartTime = Date.now();
        this.turnDuration = 30000; // 30 seconds

        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.turnStartTime;
            let remaining = Math.max(0, this.turnDuration - elapsed);
            const seconds = Math.ceil(remaining / 1000);

            const display = document.getElementById('turn-timer-display');
            if (display) display.textContent = seconds;

            if (remaining <= 0) {
                this.stopTimer();
                this.handleTimeout();
            }
        }, 100);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    async handleTimeout() {
        if (this.isSpectator || this.game.game_over() || this.gameState !== 'game') return;

        const turn = this.game.turn();

        if (this.playerColor === turn) {
             let title = "انتهى الوقت!";
             let message = `لقد خسر ${this.playerName} بسبب نفاد الوقت`;
             await update(ref(this.db, `rooms/${this.roomId}/config`), {
                 gameState: 'over',
                 resultTitle: title,
                 resultMessage: message
             });
        } else if (this.isHost && !this.players.find(p => p.id === (turn === 'w' ? this.whitePlayerId : this.blackPlayerId))) {
             let title = "انتهى الوقت!";
             let message = `اللاعب خسر بسبب نفاد الوقت`;
             await update(ref(this.db, `rooms/${this.roomId}/config`), {
                 gameState: 'over',
                 resultTitle: title,
                 resultMessage: message
             });
        }
    }

    // --- BOT LOGIC (MINIMAX) ---
    makeBotMove() {
        if (this.game.game_over() || this.gameState !== 'game') return;

        const turn = this.game.turn();
        const blackPlayer = this.players.find(p => p.id === this.blackPlayerId);

        if (blackPlayer && blackPlayer.isBot && turn === 'b') {
            if (this.botTimeout) clearTimeout(this.botTimeout);
            this.botTimeout = setTimeout(() => {
                if (this.game.game_over() || this.gameState !== 'game') return; // Guard
                const bestMove = this.getBestMove(3); // depth 3
                if (bestMove) {
                    this.game.move(bestMove);
                    this.syncMove(this.game.fen());
                }
            }, 500);
        }
    }


    getBestMove(depth) {
        const moves = this.game.moves({ verbose: true });
        if (moves.length === 0) return null;

        let bestMove = null;
        let bestValue = -Infinity;

        // Since the bot plays black, we want to maximize Black's score.
        // Or if we evaluate relative to the current player, we just maximize for whoever is calling this.
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            this.game.move(move);
            // After moving, it's the opponent's turn. We want the opponent to MINIMIZE our score.
            // So we call minimax with isMaximizingPlayer = false
            const boardValue = this.minimax(depth - 1, -Infinity, Infinity, false, this.game.turn() === 'w' ? 'b' : 'w');
            this.game.undo();

            if (boardValue > bestValue) {
                bestValue = boardValue;
                bestMove = move;
            }
        }

        if (!bestMove) {
            return moves[Math.floor(Math.random() * moves.length)];
        }

        return bestMove;
    }

    minimax(depth, alpha, beta, isMaximizingPlayer, botColor) {
        if (depth === 0) return this.evaluateBoard(botColor);

        const moves = this.game.moves();
        if (moves.length === 0) {
            if (this.game.in_checkmate()) {
                return isMaximizingPlayer ? -Infinity : Infinity;
            }
            return 0; // Draw
        }

        if (isMaximizingPlayer) {
            let bestVal = -Infinity;
            for (let i = 0; i < moves.length; i++) {
                this.game.move(moves[i]);
                bestVal = Math.max(bestVal, this.minimax(depth - 1, alpha, beta, false, botColor));
                this.game.undo();
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) break;
            }
            return bestVal;
        } else {
            let bestVal = Infinity;
            for (let i = 0; i < moves.length; i++) {
                this.game.move(moves[i]);
                bestVal = Math.min(bestVal, this.minimax(depth - 1, alpha, beta, true, botColor));
                this.game.undo();
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) break;
            }
            return bestVal;
        }
    }

    evaluateBoard(botColor) {
        let totalEvaluation = 0;
        const board = this.game.board();

        const pieceValues = {
            'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900
        };

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const val = pieceValues[piece.type];
                    // If the piece belongs to the bot, it's a positive score, otherwise negative
                    totalEvaluation += piece.color === botColor ? val : -val;
                }
            }
        }
        return totalEvaluation;
    }


    async handleGameOver(isSurrender = false) {
        this.stopTimer();
        if (isSurrender) {
             await update(ref(this.db, `rooms/${this.roomId}/config`), {
                 gameState: 'over',
                 resultTitle: "انسحاب!",
                 resultMessage: `لقد انسحب ${this.playerName}`
             });
             return;
        }

        let title = "انتهت اللعبة";
        let message = "";

        if (this.game.in_checkmate()) {
            const winner = this.game.turn() === 'w' ? 'الأسود' : 'الأبيض';
            title = "كش مات!";
            message = `الفائز هو ${winner}`;
        } else if (this.game.in_draw()) {
            title = "تعادل";
            message = "انتهت المباراة بالتعادل";
        } else if (this.game.in_stalemate()) {
            title = "خنقة (Stalemate)";
            message = "تعادل بسبب الخنق";
        }

        await update(ref(this.db, `rooms/${this.roomId}/config`), {
            gameState: 'over',
            resultTitle: title,
            resultMessage: message
        });
    }

    async handleBotTurn() {
        setTimeout(async () => {
            const moves = this.game.moves();
            if (moves.length > 0) {
                const move = moves[Math.floor(Math.random() * moves.length)];
                this.game.move(move);
                this.syncMove(this.game.fen());
            }
        }, 1500);
    }


    renderBoardWithAnimation(lastMove) {
        if (lastMove) {
            const pieceEl = this.elBoard.querySelector(`[data-square="${lastMove.from}"] .piece-417db`);
            if (pieceEl) {
                const fromRect = this.elBoard.querySelector(`[data-square="${lastMove.from}"]`).getBoundingClientRect();
                const toSq = this.elBoard.querySelector(`[data-square="${lastMove.to}"]`);
                if (toSq) {
                    const toRect = toSq.getBoundingClientRect();
                    const dx = toRect.left - fromRect.left;
                    const dy = toRect.top - fromRect.top;

                    pieceEl.classList.add('moving');
                    pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;

                    setTimeout(() => {
                        this.renderBoard();
                        const newToSq = this.elBoard.querySelector(`[data-square="${lastMove.to}"]`);
                        const newFromSq = this.elBoard.querySelector(`[data-square="${lastMove.from}"]`);
                        if (newToSq) newToSq.classList.add('last-move');
                        if (newFromSq) newFromSq.classList.add('last-move');
                        this.checkCheckStatus();
                    }, 300);
                    return;
                }
            }
        }
        this.renderBoard();
        this.checkCheckStatus();
    }


    checkCheckStatus() {
        if (this.game.in_check()) {
            const turn = this.game.turn();
            const board = this.game.board();
            for (let r=0; r<8; r++) {
                for (let c=0; c<8; c++) {
                    const p = board[r][c];
                    if (p && p.type === 'k' && p.color === turn) {
                        const sq = String.fromCharCode(97 + c) + (8 - r);
                        const sqEl = this.elBoard.querySelector(`[data-square="${sq}"]`);
                        if (sqEl) sqEl.classList.add('check-square');
                    }
                }
            }
        }
    }

    renderBoard() {
        this.elBoard.innerHTML = '';
        const position = this.game.board();
        const orientation = this.playerColor === 'b' ? 'black' : 'white';

        for (let r = 0; r < 8; r++) {
            const rowIdx = orientation === 'black' ? 7 - r : r;
            for (let c = 0; c < 8; c++) {
                const colIdx = orientation === 'black' ? 7 - c : c;
                const square = position[rowIdx][colIdx];

                const squareEl = document.createElement('div');
                const isLight = (rowIdx + colIdx) % 2 === 0;
                squareEl.className = `square-55d63 ${isLight ? 'white-1e1d7' : 'black-3b854'}`;
                squareEl.dataset.square = String.fromCharCode(97 + colIdx) + (8 - rowIdx);

                if (square) {
                    const pieceKey = square.color + square.type.toUpperCase();
                    const pieceEl = document.createElement('div');
                    pieceEl.className = 'piece-417db';
                    pieceEl.innerHTML = CHESS_PIECES[pieceKey];
                    pieceEl.dataset.piece = pieceKey;
                    squareEl.appendChild(pieceEl);
                }

                this.elBoard.appendChild(squareEl);
            }
        }

        this.updatePlayerInfo();
        this.startTimer();
    }

    showResults(title, message) {
        document.getElementById('result-title').textContent = title;
        document.getElementById('result-message').textContent = message;
        document.getElementById('modal-results').classList.remove('hidden');
    }

    updatePlayerInfo() {
        const whitePlayer = this.players.find(p => p.id === (this.whitePlayerId));
        const blackPlayer = this.players.find(p => p.id === (this.blackPlayerId));

        const me = this.players.find(p => p.id === this.myId);
        const opponent = this.players.find(p => p.id !== this.myId && !p.isSpectator);

        if (me) {
            document.getElementById('current-name').textContent = me.name;
            document.getElementById('current-avatar').innerHTML = `<img src="${me.avatar}">`;
        }

        if (opponent) {
            document.getElementById('opponent-name').textContent = opponent.name;
            document.getElementById('opponent-avatar').innerHTML = `<img src="${opponent.avatar}">`;
        }


        // Highlight turn
        const turn = this.game.turn();
        const currInfo = document.getElementById('current-info');
        if (currInfo) {
            currInfo.classList.toggle('active', this.playerColor === turn);
            const wrapper = currInfo.querySelector('.avatar-wrapper');
            if (wrapper) wrapper.classList.toggle('active-turn-pulse', this.playerColor === turn);
        }

        const oppInfo = document.getElementById('opponent-info');
        if (oppInfo) {
            oppInfo.classList.toggle('active', this.playerColor !== turn);
            const oppWrapper = oppInfo.querySelector('.avatar-wrapper');
            if (oppWrapper) oppWrapper.classList.toggle('active-turn-pulse', this.playerColor !== turn);
        }


        // Highlight lobby avatars if in lobby
        if (this.gameState === 'lobby') {
            const whiteActive = turn === 'w';
            document.getElementById('slot-0').querySelector('.avatar-wrapper').classList.toggle('active-turn-glow', whiteActive);
            document.getElementById('slot-1').querySelector('.avatar-wrapper').classList.toggle('active-turn-glow', !whiteActive);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.chessGameManager = new ChessGameManager();
});
