import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, remove, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Using the same config as app.js
const firebaseConfig = {
  apiKey: "AIzaSyDfcHB-d68R2Kf-jisYudWKIjHZ9lgjUdM",
  authDomain: "smo1-5f999.firebaseapp.com",
  projectId: "smo1-5f999",
  storageBucket: "smo1-5f999.firebasestorage.app",
  messagingSenderId: "376255463194",
  appId: "1:376255463194:web:26bd4efe2d8f4c279f76a3",
  measurementId: "G-T103PXE8LF"
};

const COLORS = ['red', 'blue', 'green', 'yellow'];
const ACTION_TYPES = ['skip', 'reverse', '+2'];
const WILD_TYPES = ['wild', 'wild+4'];

class OnoGameManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
        this.auth = getAuth(this.app);

        this.urlParams = new URLSearchParams(window.location.search);
        this.roomId = this.urlParams.get('roomID');
        this.playerName = this.urlParams.get('username');
        this.isHostParam = this.urlParams.get('role') === 'owner';

        this.myId = null;
        this.isHost = false;
        this.isSpectator = false;
        this.players = []; // Array of objects
        this.gameState = 'lobby'; // lobby, game, over
        this.turnIndex = 0;
        this.direction = 1; // 1 for clockwise, -1 for counter-clockwise

        this.deck = [];
        this.playedPile = []; // Top card is last element
        this.currentColor = null;

        // Voice / Chat
        this.chatMessages = [];

        if (!this.roomId || !this.playerName) {
            // window.location.href = './index.html';
            return;
        }

        this.initDOM();
        this.initEvents();
        this.initAuth();
        this.createSparkles();
    }

    initDOM() {
        this.elBtnExit = document.getElementById('btn-exit');
        this.elDisplayRoomId = document.getElementById('display-room-id');
        this.elSystemBanner = document.getElementById('system-banner');
        this.elSectionLobby = document.getElementById('section-lobby');
        this.elSectionGame = document.getElementById('section-game');

        this.elBtnStart = document.getElementById('btn-start-game');
        this.elBtnAddBot = document.getElementById('btn-add-bot');
        this.elBtnDraw = document.getElementById('btn-draw-card');
        this.elBtnOno = document.getElementById('btn-ono-action');

        this.elGameTimerCapsule = document.getElementById('game-timer-capsule');
        this.elGameTimer = document.getElementById('game-timer');

        this.elMyHand = document.getElementById('my-hand');
        this.elPlayedPile = document.getElementById('played-pile');
        this.elDrawPile = document.getElementById('draw-pile');
        this.elPlayerNodesContainer = document.getElementById('player-nodes-container');
        this.elDirectionArrows = document.getElementById('direction-arrows');

        // Chat
        this.elChatInput = document.getElementById('chat-input');
        this.elBtnSendChat = document.getElementById('btn-send-chat');
        this.elGameChatHistory = document.getElementById('game-chat-history');

        // Modals
        this.modalColorPicker = document.getElementById('modal-color-picker');
        this.modalOnoPenalty = document.getElementById('modal-ono-penalty');
        this.modalExitConfirm = document.getElementById('modal-exit-confirm');
        this.modalResults = document.getElementById('modal-results');
        this.elResultsBody = document.getElementById('results-body');
        this.elResultsTimeoutBar = document.getElementById('results-timeout-bar');
        this.toast = document.getElementById('main-toast');

        this.elDisplayRoomId.textContent = this.roomId;
    }

    createSparkles() {
        const container = document.getElementById('sparkles');
        if (!container) return;
        for (let i=0; i<30; i++) {
            let spark = document.createElement('div');
            spark.className = 'sparkle';
            spark.style.top = Math.random() * 100 + '%';
            spark.style.left = Math.random() * 100 + '%';
            spark.style.animationDelay = Math.random() * 2 + 's';
            container.appendChild(spark);
        }
    }

    initEvents() {
        if(this.elBtnStart) this.elBtnStart.addEventListener('click', () => this.startGame());
        if(this.elBtnAddBot) this.elBtnAddBot.addEventListener('click', () => this.addBot());
        if(this.elBtnDraw) this.elBtnDraw.addEventListener('click', () => this.drawCardAction());
        if(this.elDrawPile) this.elDrawPile.addEventListener('click', () => this.drawCardAction());
        if(this.elBtnOno) this.elBtnOno.addEventListener('click', () => this.claimOno());

        if (this.elBtnExit) {
            this.elBtnExit.addEventListener('click', () => this.showExitConfirm());
        }
        document.getElementById('btn-exit-yes').addEventListener('click', () => this.quitGame());
        document.getElementById('btn-exit-no').addEventListener('click', () => {
            this.modalExitConfirm.classList.add('hidden');
        });

        // Intercept browser back button
        window.history.pushState(null, null, window.location.href);
        window.onpopstate = () => {
            this.showExitConfirm();
            window.history.pushState(null, null, window.location.href);
        };

        if(this.elBtnSendChat) this.elBtnSendChat.addEventListener('click', () => this.sendChat());
        if(this.elChatInput) this.elChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });

        document.querySelectorAll('.color-option').forEach(el => {
            el.addEventListener('click', (e) => {
                const color = e.target.getAttribute('data-color');
                this.handleColorSelection(color);
            });
        });

        document.getElementById('btn-accept-penalty').addEventListener('click', () => {
            this.modalOnoPenalty.classList.add('hidden');
        });
    }

    showExitConfirm() {
        this.modalExitConfirm.classList.remove('hidden');
    }

    showToast(msg) {
        this.toast.textContent = msg;
        this.toast.classList.remove('hidden');
        setTimeout(() => this.toast.classList.add('hidden'), 3000);
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
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        const snap = await get(roomRef);

        if (!snap.exists()) {
            alert("الغرفة غير موجودة");
            // window.location.href = './index.html';
            return;
        }

        const data = snap.val();
        this.isHost = data.config.hostId === this.myId;

        // Spectator mode if game is already in progress
        if (data.config.gameState === 'game') {
            this.isSpectator = true;
            this.showToast("اللعبة بدأت بالفعل، أنت تشاهد الآن 👀");
        }

        // Avatar generation
        const seed = Math.random().toString(36).substring(7);
        const avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;

        const playerRef = ref(this.db, `rooms/${this.roomId}/players/${this.myId}`);

        // Use a flag for online status instead of pure removal to handle "surrendered" state
        onDisconnect(playerRef).update({ isOnline: false });

        await update(playerRef, {
            name: this.playerName,
            avatar: avatarUrl,
            joinedAt: serverTimestamp(),
            hand: [],
            cardsCount: 0,
            hasSaidOno: false,
            isOnline: true,
            isSpectator: this.isSpectator,
            surrendered: false
        });

        this.listenToRoom();
    }

    listenToRoom() {
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // Update Players
            if (data.players) {
                // Sort players by joinedAt to keep order consistent across clients
                this.players = Object.entries(data.players)
                    .map(([id, p]) => ({ id, ...p }))
                    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

                this.renderLobby();
                if (this.gameState === 'game') {
                    this.renderGameNodes();
                }
            } else {
                this.players = [];
                this.renderLobby();
            }

            // Update Config/GameState
            if (data.config) {
                // Host Migration logic
                const hostOnline = this.players.find(p => p.id === data.config.hostId && p.isOnline);
                if (!hostOnline && this.players.length > 0) {
                    const firstOnline = this.players.find(p => p.isOnline);
                    if (firstOnline && firstOnline.id === this.myId) {
                        update(ref(this.db, `rooms/${this.roomId}/config`), { hostId: this.myId });
                    }
                }

                this.isHost = data.config.hostId === this.myId;

                if (this.isHost && this.players.length >= 2 && data.config.gameState === 'lobby') {
                    this.elBtnStart.classList.remove('disabled');
                } else if (this.isHost && this.players.length < 2) {
                    this.elBtnStart.classList.add('disabled');
                }

                if (data.config.gameState !== this.gameState) {
                    this.gameState = data.config.gameState;
                    if (this.gameState === 'game') {
                        this.transitionToGame();
                    } else if (this.gameState === 'results') {
                        this.showResultsUI(data.config.winnerId);
                        if (this.isHost) {
                            setTimeout(async () => {
                                const currentSnap = await get(ref(this.db, `rooms/${this.roomId}/config/gameState`));
                                if (currentSnap.val() === 'results') {
                                    await update(ref(this.db, `rooms/${this.roomId}/config`), {
                                        gameState: 'lobby',
                                        winnerId: null
                                    });
                                }
                            }, 5000);
                        }
                    } else if (this.gameState === 'lobby') {
                        this.transitionToLobby();
                    }
                }

                if (this.gameState === 'game') {
                    const prevTurnIndex = this.turnIndex;
                    this.turnIndex = data.config.turnIndex || 0;
                    this.direction = data.config.direction || 1;
                    this.currentColor = data.config.currentColor;

                    if (this.elGameTimerCapsule) this.elGameTimerCapsule.classList.remove('hidden');

                    if (data.config.gameTimeLeft !== undefined) {
                        this.updateGameTimerUI(data.config.gameTimeLeft);
                    }

                    if (data.playedPile) {
                        this.playedPile = data.playedPile;
                        this.renderPlayedPile();
                    }
                    if (data.deck) {
                        this.deck = data.deck;
                    } else {
                        this.deck = [];
                    }

                    if (data.config.turnStartedAt !== this.turnStartedAt) {
                        this.turnStartedAt = data.config.turnStartedAt;
                        this.startTurnTimer();
                    }

                    this.renderGameNodes();
                    this.renderHand();
                    this.updateArrows();

                    if (this.isHost && this.players.length > 0 && prevTurnIndex !== this.turnIndex) {
                        this.handleBotTurn();
                    }

                    // Host checks for auto-skip of surrendered players
                    if (this.isHost) {
                        const currentPlayer = this.players[this.turnIndex];
                        if (currentPlayer && currentPlayer.surrendered) {
                             this.passTurn();
                        }
                    }
                }
            }

            // Chat
            if (data.chat) {
                this.renderChat(data.chat);
            }
        });
    }

    // ==========================================
    // Lobby UI
    // ==========================================
    renderLobby() {
        for (let i = 0; i < 6; i++) {
            const slot = document.getElementById(`lobby-slot-${i}`);
            if (!slot) continue;
            slot.innerHTML = ''; // clear

            if (i < this.players.length) {
                const p = this.players[i];
                const avatar = p.surrendered ? "🏳️" : `<img src="${p.avatar}" alt="${this.escapeHtml(p.name)}">`;
                slot.innerHTML = `
                    ${avatar}
                    <div class="name">${this.escapeHtml(p.name)}</div>
                    ${this.isHostPlayer(p.id) ? '<div class="host-icon">👑</div>' : ''}
                `;
                slot.style.background = 'transparent';
                slot.style.border = '2px solid rgba(255,255,255,0.5)';
            } else {
                slot.innerHTML = `<div style="color:rgba(255,255,255,0.3); font-size:1.5rem">👤</div>`;
                slot.style.background = 'rgba(0,0,0,0.4)';
                slot.style.border = '1px dashed rgba(255,255,255,0.3)';
            }
        }

        if (this.players.length > 0) {
            const lastJoined = this.players[this.players.length - 1];
            this.elSystemBanner.innerHTML = `<span style="color:#ffc107">${this.escapeHtml(lastJoined.name)}</span> انضم إلى الغرفة`;
        }

        if (!this.isHost) {
            this.elBtnStart.style.display = 'none';
            if(this.elBtnAddBot) this.elBtnAddBot.style.display = 'none';
        } else {
            this.elBtnStart.style.display = 'block';
            if(this.elBtnAddBot) this.elBtnAddBot.style.display = 'inline-block';
        }
    }

    async addBot() {
        if (!this.isHost) return;
        if (this.players.length >= 6) {
            this.showToast("الحد الأقصى للاعبين هو 6");
            return;
        }

        const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
        const botNames = ['بوت عبقري', 'بوت سريع', 'بوت محترف', 'بوت ذكي'];
        const seed = Math.random().toString(36).substring(7);
        const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;

        const botRef = ref(this.db, `rooms/${this.roomId}/players/${botId}`);
        await update(botRef, {
            name: botNames[Math.floor(Math.random() * botNames.length)],
            avatar: avatarUrl,
            joinedAt: serverTimestamp(),
            hand: [],
            cardsCount: 0,
            hasSaidOno: false,
            isBot: true,
            surrendered: false
        });
    }

    isHostPlayer(id) {
        return this.players.length > 0 && this.players[0].id === id; // first joined is usually host, or check config.hostId
    }

    transitionToGame() {
        this.elSectionLobby.classList.add('hidden');
        this.elSectionLobby.classList.remove('active');
        this.elSectionGame.classList.remove('hidden');
        this.elSectionGame.classList.add('active');
        if (this.isSpectator) {
            this.elBtnDraw.classList.add('hidden');
            this.elBtnOno.classList.add('hidden');
        }
    }

    transitionToLobby() {
        this.elSectionGame.classList.add('hidden');
        this.elSectionGame.classList.remove('active');
        this.elSectionLobby.classList.remove('hidden');
        this.elSectionLobby.classList.add('active');
        if (this.elGameTimerCapsule) this.elGameTimerCapsule.classList.add('hidden');
        if (this.globalGameTimerInterval) clearInterval(this.globalGameTimerInterval);

        this.modalResults.classList.add('hidden');
        // Reset spectator flag for next round
        this.isSpectator = false;
        // Update my state in Firebase to not be spectator anymore
        update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), {
            isSpectator: false,
            surrendered: false
        });
    }

    // ==========================================
    // Game Logic - Host Only
    // ==========================================
    async startGame() {
        if (!this.isHost || this.players.length < 2) return;

        this.elBtnStart.innerText = 'جاري التحضير...';

        const newDeck = this.generateDeck();
        this.shuffle(newDeck);

        // Deal 7 cards to each player
        const updates = {};
        // Reset all players to not be spectators/surrendered for the new game
        this.players.forEach(p => {
            updates[`players/${p.id}/isSpectator`] = false;
            updates[`players/${p.id}/surrendered`] = false;
        });

        const activePlayers = this.players; // Everyone in the room

        for (let i = 0; i < activePlayers.length; i++) {
            const hand = newDeck.splice(0, 7);
            updates[`players/${activePlayers[i].id}/hand`] = hand;
            updates[`players/${activePlayers[i].id}/cardsCount`] = hand.length;
            updates[`players/${activePlayers[i].id}/hasSaidOno`] = false;
        }

        // First card for pile
        let firstCardIndex = newDeck.findIndex(c => c.type === 'number');
        if(firstCardIndex === -1) firstCardIndex = 0;
        const firstCard = newDeck.splice(firstCardIndex, 1)[0];

        updates[`playedPile`] = [firstCard];
        updates[`deck`] = newDeck;

        updates['config/gameState'] = 'game';
        updates['config/turnIndex'] = 0;
        updates['config/direction'] = 1;
        updates['config/currentColor'] = firstCard.color;
        updates['config/turnStartedAt'] = serverTimestamp();
        updates['config/gameTimeLeft'] = 300; // 5 minutes

        await update(ref(this.db, `rooms/${this.roomId}`), updates);

        this.startGameTimer();
    }

    startGameTimer() {
        if (this.globalGameTimerInterval) clearInterval(this.globalGameTimerInterval);

        let timeLeft = 300;
        this.globalGameTimerInterval = setInterval(async () => {
            if (this.gameState !== 'game') {
                clearInterval(this.globalGameTimerInterval);
                return;
            }

            timeLeft--;

            // Literal countdown sync every second to be "literal" as requested
            update(ref(this.db, `rooms/${this.roomId}/config`), { gameTimeLeft: timeLeft });

            if (timeLeft <= 0) {
                clearInterval(this.globalGameTimerInterval);
                await this.endGameDueToTime();
            }
        }, 1000);
    }

    updateGameTimerUI(timeLeft) {
        if (!this.elGameTimer) return;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        this.elGameTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        if (timeLeft <= 10) {
            this.elGameTimer.style.color = '#ff4b2b';
        } else {
            this.elGameTimer.style.color = 'inherit';
        }
    }

    async endGameDueToTime() {
        if (!this.isHost) return;

        // Find player with the fewest cards (excluding spectators)
        let winner = null;
        let minCards = Infinity;

        this.players.filter(p => !p.isSpectator).forEach(p => {
            if (p.cardsCount < minCards) {
                minCards = p.cardsCount;
                winner = p;
            }
        });

        await this.showResults(winner);
    }

    async showResults(winner) {
        // Winner or Host can trigger results state
        if (this.isHost || (winner && winner.id === this.myId)) {
            await update(ref(this.db, `rooms/${this.roomId}/config`), {
                gameState: 'results',
                winnerId: winner ? winner.id : null
            });
        }
    }

    showResultsUI(winnerId) {
        const results = this.players.filter(p => !p.isSpectator).sort((a,b) => a.cardsCount - b.cardsCount);
        let html = '<div style="margin-top:10px">';
        results.forEach((p, i) => {
            const isWinner = p.id === winnerId;
            html += `<div style="display:flex; justify-content:space-between; margin-bottom:5px; padding: 10px; background: ${isWinner ? 'rgba(56, 239, 125, 0.2)' : 'rgba(255,255,255,0.1)'}; border-radius: 8px; border: ${isWinner ? '1px solid #38ef7d' : 'none'}">
                <span>${i+1}. ${p.name} ${isWinner ? '🏆' : ''}</span>
                <span>${p.cardsCount} بطاقات</span>
            </div>`;
        });
        html += '</div>';

        this.elResultsBody.innerHTML = html;
        this.modalResults.classList.remove('hidden');

        // Animate progress bar
        this.elResultsTimeoutBar.style.width = '100%';
        this.elResultsTimeoutBar.style.transition = 'none';
        setTimeout(() => {
            this.elResultsTimeoutBar.style.transition = 'width 5s linear';
            this.elResultsTimeoutBar.style.width = '0%';
        }, 50);

        setTimeout(() => {
            this.modalResults.classList.add('hidden');
        }, 5000);
    }

    startTurnTimer() {
        if (this.turnInterval) clearInterval(this.turnInterval);

        let timeLeft = 10;
        const currentPlayer = this.players[this.turnIndex];

        this.turnInterval = setInterval(async () => {
            if (this.gameState !== 'game') {
                clearInterval(this.turnInterval);
                return;
            }

            // UI Update (local for everyone)
            if (currentPlayer && !currentPlayer.isBot) {
                const el = document.getElementById(`timer-${currentPlayer.id}`);
                if (el) el.textContent = timeLeft;
            }

            if (timeLeft <= 0) {
                clearInterval(this.turnInterval);
                // Host handles timeout action
                if (this.isHost && currentPlayer) {
                    await this.handleTurnTimeout(currentPlayer);
                }
            }
            timeLeft--;
        }, 1000);
    }

    async handleTurnTimeout(player) {
        const snap = await get(ref(this.db, `rooms/${this.roomId}/config/turnIndex`));
        if (snap.val() !== this.turnIndex) return;

        if (player.isBot) return;

        const hand = player.hand || [];
        const validPlays = [];
        hand.forEach((card, index) => {
            if (this.isValidPlay(card)) {
                validPlays.push({ card, index });
            }
        });

        if (validPlays.length > 0) {
            const play = validPlays[Math.floor(Math.random() * validPlays.length)];
            const { card, index } = play;
            let chosenColor = card.color;
            if (chosenColor === 'black') chosenColor = COLORS[Math.floor(Math.random() * COLORS.length)];

            const newHand = [...hand];
            newHand.splice(index, 1);
            await this.commitPlayForPlayer(player, card, newHand, chosenColor);
        } else {
            await this.drawCardForPlayer(player);
        }
    }

    generateDeck() {
        let deck = [];
        COLORS.forEach(color => {
            deck.push({ id: Math.random().toString(), color: color, type: 'number', value: '0' });
            for (let i = 1; i <= 9; i++) {
                deck.push({ id: Math.random().toString(), color: color, type: 'number', value: i.toString() });
                deck.push({ id: Math.random().toString(), color: color, type: 'number', value: i.toString() });
            }
            ACTION_TYPES.forEach(type => {
                deck.push({ id: Math.random().toString(), color: color, type: type, value: type });
                deck.push({ id: Math.random().toString(), color: color, type: type, value: type });
            });
        });
        for (let i = 0; i < 4; i++) {
            deck.push({ id: Math.random().toString(), color: 'black', type: 'wild', value: 'wild' });
            deck.push({ id: Math.random().toString(), color: 'black', type: 'wild+4', value: 'wild+4' });
        }
        return deck;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // ==========================================
    // Player Actions
    // ==========================================

    getTopCard() {
        if (!this.playedPile || this.playedPile.length === 0) return null;
        return this.playedPile[this.playedPile.length - 1];
    }

    isMyTurn() {
        if (this.players.length === 0) return false;
        return this.players[this.turnIndex].id === this.myId && !this.isSpectator;
    }

    isValidPlay(card) {
        if (card.color === 'black') return true;
        const topCard = this.getTopCard();
        if (!topCard) return true;

        if (card.color === this.currentColor) return true;
        if (card.value === topCard.value) return true;

        return false;
    }

    async playCard(cardIndex) {
        if (!this.isMyTurn()) return;

        const me = this.players.find(p => p.id === this.myId);
        if (!me || !me.hand || me.surrendered) return;

        const card = me.hand[cardIndex];
        if (!this.isValidPlay(card)) {
            this.showToast("لا يمكنك لعب هذه البطاقة!");
            return;
        }

        const newHand = [...me.hand];
        newHand.splice(cardIndex, 1);

        this._pendingCard = card;
        this._pendingHand = newHand;

        if (card.color === 'black') {
            this.modalColorPicker.classList.remove('hidden');
        } else {
            await this.commitPlay(card, newHand, card.color);
        }
    }

    handleColorSelection(color) {
        this.modalColorPicker.classList.add('hidden');
        if (this._pendingCard) {
            this.commitPlay(this._pendingCard, this._pendingHand, color);
            this._pendingCard = null;
            this._pendingHand = null;
        }
    }

    async commitPlay(card, newHand, chosenColor) {
        const me = this.players.find(p => p.id === this.myId);
        return this.commitPlayForPlayer(me, card, newHand, chosenColor);
    }

    async commitPlayForPlayer(player, card, newHand, chosenColor) {
        const updates = {};

        let cardsCount = newHand.length;
        updates[`players/${player.id}/hand`] = newHand;
        updates[`players/${player.id}/cardsCount`] = cardsCount;

        let penaltyCards = [];
        if (cardsCount === 1 && !player.hasSaidOno) {
            if (player.id === this.myId) {
                this.showToast("عقوبة ONO! سحب ورقتين");
                this.modalOnoPenalty.classList.remove('hidden');
            } else {
                push(ref(this.db, `rooms/${this.roomId}/chat`), {
                    senderId: 'system',
                    text: `${player.name} نسي قول ONO وسحب ورقتين!`,
                    timestamp: serverTimestamp()
                });
            }

            const deckSnap = await get(ref(this.db, `rooms/${this.roomId}/deck`));
            let currentDeck = deckSnap.val() || [];
            if (currentDeck.length < 2) {
                currentDeck = this.reshufflePileIntoDeck(currentDeck, [...this.playedPile]);
            }
            penaltyCards = currentDeck.splice(0, 2);

            updates[`players/${player.id}/hand`] = [...newHand, ...penaltyCards];
            updates[`players/${player.id}/cardsCount`] = newHand.length + penaltyCards.length;
            cardsCount = updates[`players/${player.id}/cardsCount`];

            updates[`deck`] = currentDeck;
        }

        updates[`players/${player.id}/hasSaidOno`] = false;

        const newPile = [...(this.playedPile || []), card];
        updates[`playedPile`] = newPile;
        updates[`config/currentColor`] = chosenColor;

        let nextTurnDelta = this.direction;
        let cardsToDrawNext = 0;
        let newDirection = this.direction;

        if (card.type === 'reverse') {
            if (this.players.length === 2) {
                nextTurnDelta = this.direction * 2;
            } else {
                newDirection = this.direction * -1;
                nextTurnDelta = newDirection;
                updates[`config/direction`] = newDirection;
            }
        } else if (card.type === 'skip') {
            nextTurnDelta = this.direction * 2;
        } else if (card.type === '+2') {
            nextTurnDelta = this.direction * 2;
            cardsToDrawNext = 2;
        } else if (card.type === 'wild+4') {
            nextTurnDelta = this.direction * 2;
            cardsToDrawNext = 4;
        }

        let nextTurn = (this.turnIndex + nextTurnDelta) % this.players.length;
        if (nextTurn < 0) nextTurn += this.players.length;
        updates[`config/turnIndex`] = nextTurn;
        updates[`config/turnStartedAt`] = serverTimestamp();

        if (cardsToDrawNext > 0) {
            const nextPlayerTargetIndex = (this.turnIndex + newDirection) % this.players.length;
            const targetIndex = nextPlayerTargetIndex < 0 ? nextPlayerTargetIndex + this.players.length : nextPlayerTargetIndex;
            const targetPlayer = this.players[targetIndex];

            const deckSnap = await get(ref(this.db, `rooms/${this.roomId}/deck`));
            let currentDeck = deckSnap.val() || [];

            if (currentDeck.length < cardsToDrawNext) {
                currentDeck = this.reshufflePileIntoDeck(currentDeck, newPile);
            }

            const drawnCards = currentDeck.splice(0, cardsToDrawNext);
            updates[`deck`] = currentDeck;

            const targetHandSnap = await get(ref(this.db, `rooms/${this.roomId}/players/${targetPlayer.id}/hand`));
            let targetHand = targetHandSnap.val() || [];
            targetHand = [...targetHand, ...drawnCards];

            updates[`players/${targetPlayer.id}/hand`] = targetHand;
            updates[`players/${targetPlayer.id}/cardsCount`] = targetHand.length;
            updates[`players/${targetPlayer.id}/hasSaidOno`] = false;
        }

        if (cardsCount === 0) {
            await this.showResults(player);
            return;
        }

        await update(ref(this.db, `rooms/${this.roomId}`), updates);
    }

    reshufflePileIntoDeck(currentDeck, currentPile) {
        const top = currentPile.pop();
        let newDeck = [...currentDeck, ...currentPile];
        this.shuffle(newDeck);
        return newDeck;
    }

    async handleBotTurn() {
        const currentPlayer = this.players[this.turnIndex];
        if (!currentPlayer || !currentPlayer.isBot) return;

        setTimeout(async () => {
            const snap = await get(ref(this.db, `rooms/${this.roomId}/config/turnIndex`));
            if (snap.val() !== this.turnIndex) return;

            const botHand = currentPlayer.hand || [];
            if (botHand.length === 0) return;

            const validPlays = [];
            botHand.forEach((card, index) => {
                if (this.isValidPlay(card)) {
                    validPlays.push({ card, index });
                }
            });

            if (validPlays.length > 0) {
                let chosenPlay = validPlays.find(p => p.card.type !== 'number');
                if (!chosenPlay) {
                    chosenPlay = validPlays[0];
                }

                const { card, index } = chosenPlay;
                let chosenColor = card.color;
                if (chosenColor === 'black') {
                    const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
                    botHand.forEach(c => {
                        if (c.color !== 'black') colorCounts[c.color]++;
                    });
                    chosenColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b) || COLORS[Math.floor(Math.random() * COLORS.length)];
                }

                const newHand = [...botHand];
                newHand.splice(index, 1);

                if (newHand.length === 1) {
                    await update(ref(this.db, `rooms/${this.roomId}/players/${currentPlayer.id}`), {
                        hasSaidOno: true
                    });
                }

                await this.commitPlayForPlayer(currentPlayer, card, newHand, chosenColor);
            } else {
                await this.drawCardForPlayer(currentPlayer);
            }
        }, 2000);
    }

    async drawCardAction() {
        if (!this.isMyTurn()) return;
        const me = this.players.find(p => p.id === this.myId);
        if (me.surrendered) return;
        await this.drawCardForPlayer(me);
    }

    async drawCardForPlayer(player) {

        let currentDeck = [...this.deck];
        if (currentDeck.length === 0) {
            currentDeck = this.reshufflePileIntoDeck([], [...this.playedPile]);
        }

        const card = currentDeck.splice(0, 1)[0];

        const newHand = [...(player.hand || []), card];

        const updates = {};
        updates[`players/${player.id}/hand`] = newHand;
        updates[`players/${player.id}/cardsCount`] = newHand.length;
        updates[`players/${player.id}/hasSaidOno`] = false;
        updates[`deck`] = currentDeck;

        if (this.isValidPlay(card) && !player.isBot) {
            if(player.id === this.myId) {
                this.showToast("يمكنك لعب البطاقة المسحوبة فوراً!");
            }
        } else {
            let nextTurn = (this.turnIndex + this.direction) % this.players.length;
            if (nextTurn < 0) nextTurn += this.players.length;
            updates[`config/turnIndex`] = nextTurn;
            updates[`config/turnStartedAt`] = serverTimestamp();
        }

        await update(ref(this.db, `rooms/${this.roomId}`), updates);
    }

    async passTurn() {
        if (!this.isHost) return;
        let nextTurn = (this.turnIndex + this.direction) % this.players.length;
        if (nextTurn < 0) nextTurn += this.players.length;
        await update(ref(this.db, `rooms/${this.roomId}/config`), {
            turnIndex: nextTurn,
            turnStartedAt: serverTimestamp()
        });
    }

    async claimOno() {
        const me = this.players.find(p => p.id === this.myId);
        if (me && me.cardsCount === 2) {
            await update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), {
                hasSaidOno: true
            });
            this.showToast("قلت ONO!");

            push(ref(this.db, `rooms/${this.roomId}/chat`), {
                senderId: 'system',
                text: `${this.playerName} قال ONO!`,
                timestamp: serverTimestamp()
            });
        } else {
            this.showToast("يمكنك قول ONO فقط إذا كان لديك بطاقتين وأنت على وشك اللعب!");
        }
    }

    // ==========================================
    // UI Rendering (Game)
    // ==========================================

    renderPlayedPile() {
        const topCard = this.getTopCard();
        if (!topCard) {
            this.elPlayedPile.innerHTML = '';
            return;
        }

        let content = topCard.type === 'number' ? topCard.value : this.getIconForType(topCard.type);
        let bgClass = topCard.color;
        if (topCard.type.startsWith('wild')) {
            bgClass = this.currentColor || 'black';
        }

        this.elPlayedPile.innerHTML = `
            <div class="card-top">
              <div class="top-info">
                <span class="rank-num ${bgClass}">${content}</span>
                <span class="mini-suit ${bgClass}">${this.getSuitIcon(bgClass)}</span>
              </div>
              <span class="center-suit ${bgClass}">${this.getSuitIcon(bgClass)}</span>
            </div>
        `;
    }

    getSuitIcon(color) {
        if(color === 'red') return '♦';
        if(color === 'green') return '♥';
        if(color === 'blue') return '♣';
        if(color === 'yellow' || color === 'orange') return '♠';
        return '★';
    }

    getTinySuitForType(type, suit) {
        if(type === '+2') return '✚';
        if(type === 'skip') return '⊖';
        return suit;
    }

    getIconForType(type) {
        switch(type) {
            case 'skip': return '⊖';
            case 'reverse': return '⇄';
            case '+2': return '+';
            case 'wild': return '🌈';
            case 'wild+4': return '+4';
            default: return '';
        }
    }


    renderHand() {
        const me = this.players.find(p => p.id === this.myId);
        this.elMyHand.innerHTML = '';

        if (!me || !me.hand) return;

        const count = me.hand.length;

        let displayCount = count;
        if (count > 10 && !this.handExpanded) {
            displayCount = 10;
        } else if (count <= 10) {
            this.handExpanded = false;
        }

        const extraCards = count - displayCount;

        const counterBtn = document.getElementById('btn-draw-card');
        if (counterBtn) {
            if (count > 10) {
                counterBtn.classList.remove('hidden');
                counterBtn.textContent = extraCards > 0 ? extraCards : '↑';
                counterBtn.onclick = () => {
                    this.handExpanded = !this.handExpanded;
                    this.renderHand();
                };
            } else {
                counterBtn.classList.add('hidden');
            }
        }

        const maxAngle = 35; // Total angle spread
        const radius = 180; // Distance to rotation point
        const totalAngle = Math.min(maxAngle, displayCount * 5); // Angle spread based on cards

        const cardsToRender = me.hand.slice(0, displayCount);

        cardsToRender.forEach((card, index) => {
            const el = document.createElement('div');

            const isHidden = this.isSpectator || me.surrendered;

            // Calculate rotation and translation for curved hand
            let rotate = 0;
            let translateY = 0;
            let left = 50; // percentage

            if (displayCount > 1) {
                const fraction = index / (displayCount - 1);
                // Angle goes from -totalAngle/2 to +totalAngle/2
                rotate = -totalAngle / 2 + fraction * totalAngle;
                // left position goes from 0% to ~80%
                left = (index / (displayCount - 1)) * 80;
                // Parabola shape for translateY
                const centeredIndex = index - (displayCount - 1) / 2;
                translateY = Math.abs(centeredIndex) * 2;
            } else {
                left = 40;
            }

            if (isHidden) {
                el.className = `playing-card back`;
                el.style.background = "#222";
                el.style.left = `${left}%`;
                el.style.transform = `rotate(${rotate}deg) translateY(${translateY}%)`;
                el.style.zIndex = index + 1;
            } else {
                let colorClass = card.color;
                if(colorClass === 'yellow') colorClass = 'orange'; // CSS uses orange for yellow

                el.className = `playing-card ${colorClass}`;
                if (card.color === 'black') el.classList.add('black-card');

                el.style.left = `${left}%`;
                el.style.transform = `rotate(${rotate}deg) translateY(${translateY}%)`;
                el.style.zIndex = index + 1;

                let content = card.type === 'number' ? card.value : this.getIconForType(card.type);

                let mainSuit = this.getSuitIcon(colorClass);
                let tinySuit = this.getTinySuitForType(card.type, mainSuit);

                let sizeClass = (card.type === '+2' || card.type === 'skip') ? 'mid' : 'big';
                let midSuit = (card.type === '+2') ? '✚' : ((card.type === 'skip') ? '⊖' : mainSuit);

                if (card.color === 'black') {
                    // Custom design for black cards
                    el.innerHTML = `
                        <div class="card-top-left ${colorClass}">
                            <span class="num">${content}</span>
                            <span class="tiny-suit">${tinySuit}</span>
                        </div>
                        <div style="position:absolute; inset:25%; border-radius:50%; background:conic-gradient(#d62c41 0 90deg, #1e6ac5 90deg 180deg, #1fb154 180deg 270deg, #e88604 270deg 360deg); box-shadow:0 2px 5px rgba(0,0,0,0.5); border: 2px solid #fff;"></div>
                        <div style="position:absolute; inset:35%; border-radius:50%; background:#111; display:grid; place-items:center; font-weight:bold; font-size:18px;">${card.type === 'wild' ? '🌈' : '+4'}</div>
                    `;
                } else {
                    el.innerHTML = `
                        <div class="card-top-left ${colorClass}">
                            <span class="num">${content}</span>
                            <span class="tiny-suit">${tinySuit}</span>
                        </div>
                        <div class="${sizeClass} ${colorClass}">${midSuit}</div>
                    `;
                }
            }

            if (!isHidden && this.isMyTurn() && this.isValidPlay(card)) {
                el.classList.add('valid-play');
                el.onclick = () => this.playCard(me.hand.indexOf(card));
            } else if (!isHidden && this.isMyTurn()) {
                el.classList.add('invalid-play');
                el.onclick = () => this.showToast("لا يمكنك لعب هذه البطاقة!");
            } else if (!isHidden) {
                el.onclick = () => this.showToast("ليس دورك!");
            }

            this.elMyHand.appendChild(el);
        });

        if (!this.isSpectator && !me.surrendered && count === 2 && !me.hasSaidOno) {
            this.elBtnOno.classList.remove('hidden');
        } else {
            this.elBtnOno.classList.add('hidden');
        }
    }
renderGameNodes() {
        this.elPlayerNodesContainer.innerHTML = '';

        let myIndex = this.players.findIndex(p => p.id === this.myId);
        if (myIndex === -1) myIndex = 0;

        const totalPlayers = this.players.length;

        const getPositionClass = (offset, total) => {
            if (offset === 0) return 'p-bottom';
            if (total === 2) { return offset === 1 ? 'p-top' : 'p-bottom'; }
            if (total === 3) { return offset === 1 ? 'p-left-top' : 'p-right-top'; }
            if (total === 4) {
                if (offset === 1) return 'p-left-mid';
                if (offset === 2) return 'p-top';
                if (offset === 3) return 'p-right-mid';
            }
            if (total === 5) {
                if (offset === 1) return 'p-left-mid';
                if (offset === 2) return 'p-left-top';
                if (offset === 3) return 'p-right-top';
                if (offset === 4) return 'p-right-mid';
            }
            if (offset === 1) return 'p-left-mid';
            if (offset === 2) return 'p-left-top';
            if (offset === 3) return 'p-top';
            if (offset === 4) return 'p-right-top';
            if (offset === 5) return 'p-right-mid';
            return 'p-top';
        };

        for (let i = 0; i < totalPlayers; i++) {
            const idx = (myIndex + i) % totalPlayers;
            const p = this.players[idx];
            const posClass = getPositionClass(i, totalPlayers);

            const el = document.createElement('div');
            el.className = `player ${posClass}`;
            if (this.players[this.turnIndex]?.id === p.id) el.classList.add('active-turn');

            const avatarHtml = p.surrendered ? "🏳️" : `<img src="${p.avatar}" alt="${this.escapeHtml(p.name)}">`;

            let innerHtml = `
                <div class="avatar">${avatarHtml}</div>
                <div class="badge">${p.cardsCount || 0}</div>
                <div class="name">${this.escapeHtml(p.name)}</div>
            `;

            if (this.players[this.turnIndex]?.id === p.id && !p.isBot) {
                innerHtml += `<div class="turn-timer" id="timer-${p.id}">10</div>`;
            }

            if (p.isOnline === false || p.surrendered) el.style.opacity = '0.5';

            el.innerHTML = innerHtml;
            this.elPlayerNodesContainer.appendChild(el);
        }
    }


    updateArrows() {
        const arrowsContainer = document.getElementById('direction-arrows');
        if (!arrowsContainer) return;
        if (this.direction === 1) {
            arrowsContainer.innerHTML = `
              <div class="arrows"><div class="arrow">««««</div></div>
              <div class="arrows left"><div class="arrow small">««««</div></div>
              <div class="arrows right"><div class="arrow small">««««</div></div>
              <div class="arrows bottom"><div class="arrow">»»»»</div></div>
            `;
        } else {
            arrowsContainer.innerHTML = `
              <div class="arrows"><div class="arrow">»»»»</div></div>
              <div class="arrows left"><div class="arrow small">»»»»</div></div>
              <div class="arrows right"><div class="arrow small">»»»»</div></div>
              <div class="arrows bottom"><div class="arrow">««««</div></div>
            `;
        }
    }
    // ==========================================
    // Chat
    // ==========================================
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
        const messages = Object.values(chatObj).sort((a,b) => a.timestamp - b.timestamp);
        if (messages.length === this.chatMessages.length) return;
        this.chatMessages = messages;

        this.elGameChatHistory.innerHTML = '';

        messages.slice(-10).forEach(m => {
            const el = document.createElement('div');
            if (m.senderId === 'system') {
                el.className = 'chat-group system-style';
                el.innerHTML = `
                    <div class="chat-header">
                      <div class="tiny-avatar" style="background:linear-gradient(180deg,#d9d9d9,#555);"></div>
                      <span>النظام</span>
                    </div>
                    <div class="chat-bubble">${this.escapeHtml(m.text)}</div>
                `;
            } else {
                el.className = 'chat-group';
                el.innerHTML = `
                    <div class="chat-header">
                      <div class="tiny-avatar" style="background:linear-gradient(180deg,#f1d1d1,#c77); border: 2px solid #fff;">
                        <img src="https://api.dicebear.com/7.x/adventurer/svg?seed=${m.senderName}" />
                      </div>
                      <span>${this.escapeHtml(m.senderName)}</span>
                    </div>
                    <div class="chat-bubble">${this.escapeHtml(m.text)}</div>
                `;
            }
            this.elGameChatHistory.appendChild(el);
        });
        setTimeout(() => { this.elGameChatHistory.scrollTop = this.elGameChatHistory.scrollHeight; }, 100);
    }
    async quitGame() {
        if (this.gameState === 'game' && !this.isSpectator) {
            // Mark as surrendered
            await update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), {
                surrendered: true
            });

            push(ref(this.db, `rooms/${this.roomId}/chat`), {
                senderId: 'system',
                text: `${this.playerName} استسلم من اللعبة! 🏳️`,
                timestamp: serverTimestamp()
            });

            // If it was my turn, pass it
            if (this.isMyTurn()) {
                // Since update might be slow, we trigger it locally if we're host or wait for listener
            }
        } else {
             await remove(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`));
        }

        // window.location.href = './index.html';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.onoGameManager = new OnoGameManager();
});