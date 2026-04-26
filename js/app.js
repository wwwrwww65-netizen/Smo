/**
 * لعبة اسم حيوان نبات - النسخة المطورة
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, child, remove, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfcHB-d68R2Kf-jisYudWKIjHZ9lgjUdM",
  authDomain: "smo1-5f999.firebaseapp.com",
  projectId: "smo1-5f999",
  storageBucket: "smo1-5f999.firebasestorage.app",
  messagingSenderId: "376255463194",
  appId: "1:376255463194:web:26bd4efe2d8f4c279f76a3",
  measurementId: "G-T103PXE8LF"
};

const SOUNDS = {
    click: 'https://www.soundjay.com/buttons/sounds/button-16.mp3',
    join: 'https://www.soundjay.com/buttons/sounds/button-3.mp3',
    start: 'https://www.soundjay.com/buttons/sounds/button-09.mp3',
    buzzer: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3',
    copy: 'https://www.soundjay.com/buttons/sounds/button-50.mp3',
    quit: 'https://www.soundjay.com/buttons/sounds/button-10.mp3',
    timer: 'https://www.soundjay.com/clock/sounds/clock-ticking-2.mp3',
    success: 'https://www.soundjay.com/misc/sounds/bell-ringing-04.mp3',
    win: 'https://www.soundjay.com/misc/sounds/success-fanfare-trumpets-1.mp3',
    loss: 'https://www.soundjay.com/misc/sounds/fail-trombone-01.mp3'
};

const AVATARS = ["🦊", "🦁", "🐯", "🐼", "🐨", "🐸", "🐵", "🦄", "🐙", "🦋", "🦖", "🐧"];

class GameManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
        this.auth = getAuth(this.app);

        this.isHost = false;
        this.playerName = "";
        this.roomId = "";
        this.players = [];
        this.chatMessages = [];
        this.results = [];
        this.arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        this.currentLetter = "";
        this.myId = null;
        this.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

        this.gameTimer = null;
        this.timeLeft = 40;
        this.audioEnabled = false;

        // Voice/WebRTC properties
        this.pcs = {}; // remoteId -> RTCPeerConnection
        this.localStream = null;
        this.micEnabled = false;
        this.speakerEnabled = true;
        this.remoteAudios = {}; // remoteId -> Audio object

        this.initElements();
        this.initMicStatus();
        this.initEvents();
        this.initAuth();
        this.createParticles();
    }

    createParticles() {
        const bg = document.getElementById('bg-animated');
        if (!bg) return;
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 20 + 5;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.left = `${Math.random() * 100}%`;
            p.style.animationDuration = `${Math.random() * 10 + 10}s`;
            p.style.animationDelay = `${Math.random() * 10}s`;
            bg.appendChild(p);
        }
    }

    initElements() {
        // Chat elements
        this.chatContainer = document.getElementById('global-chat-container');
        this.chatMessagesEl = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.btnSendChat = document.getElementById('btn-send-chat');
        this.btnEmoji = document.getElementById('btn-emoji');
        this.emojiPicker = document.getElementById('emoji-picker');

        // Voice Controls
        this.btnMic = document.getElementById('btn-mic');
        this.btnSpeaker = document.getElementById('btn-speaker');
        this.micOnIcon = this.btnMic.querySelector('.mic-on');
        this.micOffIcon = this.btnMic.querySelector('.mic-off');
        this.speakerOnIcon = this.btnSpeaker.querySelector('.speaker-on');
        this.speakerOffIcon = this.btnSpeaker.querySelector('.speaker-off');

        this.sections = {
            home: document.getElementById('section-home'),
            lobby: document.getElementById('section-lobby'),
            game: document.getElementById('section-game'),
            score: document.getElementById('section-score')
        };
        this.btnQuit = document.getElementById('btn-quit');
        this.playerNameInput = document.getElementById('player-name');
        this.roomIdInput = document.getElementById('room-id-input');
        this.displayRoomId = document.getElementById('display-room-id');
        this.lobbyCountdownContainer = document.getElementById('lobby-countdown-container');
        this.lobbyCountdownTimer = document.getElementById('lobby-countdown-timer');
        this.playerList = document.getElementById('player-list');
        this.letterDisplay = document.getElementById('random-letter-display');
        this.timerDisplay = document.getElementById('timer-display');
        this.resultsSplitContainer = document.getElementById('results-split-container');
        this.mainToast = document.getElementById('main-toast');
        this.btnJoinRoom = document.getElementById('btn-join-room');
        this.btnCreateRoom = document.getElementById('btn-create-room');
        this.overlayStart = document.getElementById('overlay-start');

        // Opponent progress
        this.oppProgress = document.getElementById('opponent-progress');
        this.oppAvatar = this.oppProgress.querySelector('.opp-avatar');
        this.oppName = this.oppProgress.querySelector('.opp-name');
        this.oppStatus = this.oppProgress.querySelector('.opp-status');
        this.oppCounter = this.oppProgress.querySelector('.opp-counter');

        // Modal
        this.modalNextRound = document.getElementById('modal-next-round');
        this.btnModalAccept = document.getElementById('btn-modal-accept');
        this.modalTimeoutFill = document.getElementById('modal-timeout-fill');
    }

    initEvents() {
        document.getElementById('btn-start-app').addEventListener('click', () => {
            this.audioEnabled = true;
            this.overlayStart.classList.add('hidden');
            this.playSound('click');
        });

        // Chat Events
        this.btnSendChat.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        this.btnEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            this.emojiPicker.classList.toggle('hidden');
        });
        document.querySelectorAll('.emoji-list span').forEach(span => {
            span.addEventListener('click', () => {
                this.chatInput.value += span.textContent;
                this.emojiPicker.classList.add('hidden');
                this.chatInput.focus();
            });
        });
        document.addEventListener('click', () => this.emojiPicker.classList.add('hidden'));

        // Voice Events
        this.btnMic.addEventListener('click', () => this.toggleMic());
        this.btnSpeaker.addEventListener('click', () => this.toggleSpeaker());

        this.btnCreateRoom.addEventListener('click', () => this.createRoom());
        this.btnJoinRoom.addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.setReady());
        document.getElementById('btn-stop').addEventListener('click', () => this.stopGame());
        document.getElementById('btn-next-round-request').addEventListener('click', () => this.requestNextRound());
        document.getElementById('btn-copy-id').addEventListener('click', () => this.copyRoomId());
        this.btnQuit.addEventListener('click', () => this.quitGame());
        this.btnModalAccept.addEventListener('click', () => this.acceptNextRound());

        const btnGoToLive = document.getElementById('btn-go-to-live');
        if (btnGoToLive) {
            btnGoToLive.addEventListener('click', () => {
                window.location.href = './live/';
            });
        }

        // Tracking inputs
        document.querySelectorAll('.game-field').forEach((input, index, array) => {
            input.addEventListener('input', () => this.updateMyProgress(input));
            input.addEventListener('focus', () => {
                this.updateMyProgress(input);
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = array[index + 1];
                    if (next) {
                        next.focus();
                    } else {
                        document.getElementById('btn-stop').click();
                    }
                }
            });
        });
    }

    async initAuth() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.myId = user.uid;
            } else {
                signInAnonymously(this.auth).catch(() => this.showToast("فشل الاتصال بـ Firebase"));
            }
        });
    }

    async listenToRoom(roomId) {
        const roomRef = ref(this.db, `rooms/${roomId}`);

        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // Chat sync
            if (data.chat) {
                this.updateChatUI(data.chat);
            }

            // Handle Disconnects / Win condition if only 1 player left in active game
            if (data.players) {
                const prevPlayersCount = this.players.length;
                this.players = Object.entries(data.players).map(([id, p]) => ({ id, ...p }));
                this.updatePlayerList();

                if (prevPlayersCount > this.players.length && (data.config?.gameState === 'game')) {
                    this.showToast("لقد خرج أحد اللاعبين!");
                }

                if (this.isHost && data.config?.gameState === 'lobby') {
                    this.handleLobbyCountdown();
                }
            }

            // Update Game State
            if (data.config) {
                const state = data.config.gameState;
                const letter = data.config.currentLetter;

                if (state === 'game' && !this.isSectionActive('game')) {
                    this.startGame(letter);
                } else if (state === 'score' && !this.isSectionActive('score')) {
                    this.goToScoreSection();
                } else if (state === 'lobby' && !this.isSectionActive('lobby')) {
                    this.showSection('lobby');
                    this.resetLobbyUI();
                }

                this.currentLetter = letter;
                if (this.letterDisplay) this.letterDisplay.textContent = letter || '؟';

                if (data.config.stopTriggered && !this.inputsDisabled) {
                    this.endRoundManually();
                }

                // Sync Timer
                if (state === 'game' && data.config.timer !== undefined) {
                    this.updateLocalTimer(data.config.timer);
                }

                if (state === 'lobby' && data.config.lobbyCountdown !== undefined) {
                    this.updateLobbyTimerUI(data.config.lobbyCountdown);
                } else {
                    this.lobbyCountdownContainer.classList.add('hidden');
                }
            }

            // Progress Tracking
            if (data.progress) {
                this.updateOpponentProgressUI(data.progress);
            }

            // Handshake for Next Round
            if (data.nextRoundRequest) {
                this.handleNextRoundRequest(data.nextRoundRequest);
            } else {
                this.modalNextRound.classList.add('hidden');
            }

            // WebRTC Signaling
            if (data.signaling) {
                this.handleSignaling(data.signaling);
            }

            // Update results & Host Evaluation
            if (data.results) {
                this.results = Object.entries(data.results).map(([id, r]) => ({ playerId: id, ...r }));
                this.renderScores();
            } else {
                this.results = [];
                this.renderScores();
            }
        });
    }

    async updateMyProgress(input) {
        if (!this.roomId || !this.myId) return;
        const fields = document.querySelectorAll('.game-field');
        const filledCount = Array.from(fields).filter(f => f.value.trim().length > 0).length;
        const currentFieldName = input.parentElement.querySelector('label').textContent;

        await update(ref(this.db, `rooms/${this.roomId}/progress/${this.myId}`), {
            name: this.playerName,
            avatar: this.avatar,
            currentField: currentFieldName,
            count: filledCount,
            lastUpdate: serverTimestamp()
        });
    }

    updateOpponentProgressUI(progressData) {
        // Find most advanced opponent
        const otherIds = Object.keys(progressData).filter(id => id !== this.myId);
        if (otherIds.length === 0 || !this.isSectionActive('game')) {
            this.oppProgress.classList.add('hidden');
            this.topOppId = null;
            return;
        }

        // Show the one with the highest count, or the first one if all same
        this.topOppId = otherIds.reduce((prev, curr) =>
            (progressData[curr].count > progressData[prev].count) ? curr : prev
        );

        const opp = progressData[this.topOppId];
        this.oppProgress.classList.remove('hidden');
        this.oppAvatar.textContent = opp.avatar || '👤';
        this.oppName.textContent = opp.name;
        this.oppStatus.textContent = `يكتب في: ${opp.currentField}`;
        this.oppCounter.textContent = `${opp.count}/5`;
    }

    async joinRoomLogic(roomId) {
        const playerRef = ref(this.db, `rooms/${roomId}/players/${this.myId}`);
        onDisconnect(playerRef).remove();
        // Also remove progress on disconnect
        onDisconnect(ref(this.db, `rooms/${roomId}/progress/${this.myId}`)).remove();

        // Chat container should be visible once in a room
        this.chatContainer.style.display = 'flex';

        await update(playerRef, {
            name: this.playerName,
            avatar: this.avatar,
            ready: false,
            totalScore: 0,
            isOnline: true
        });

        this.listenToRoom(roomId);
        this.showSection('lobby');
        this.displayRoomId.textContent = roomId;
        this.playSound('join');
    }

    isSectionActive(name) {
        return this.sections[name].classList.contains('active');
    }

    playSound(name) {
        if (!this.audioEnabled) return;
        try {
            const audio = new Audio(SOUNDS[name]);
            audio.volume = (name === 'timer') ? 0.2 : 0.5;
            audio.play().catch(() => {});
        } catch(e) {}
    }

    showSection(name) {
        this.playSound('click');
        Object.values(this.sections).forEach(s => s.classList.remove('active'));
        this.sections[name].classList.add('active');
        if (name === 'home') this.btnQuit.classList.add('hidden');
        else this.btnQuit.classList.remove('hidden');
    }

    showToast(message) {
        this.mainToast.textContent = message;
        this.mainToast.classList.remove('hidden');
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => this.mainToast.classList.add('hidden'), 3500);
    }

    setLoading(btnId, isLoading) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (isLoading) {
            btn.classList.add('loading');
            btn.disabled = true;
            this._originalBtnContent = btn.innerHTML;
            btn.innerHTML = `<span class="spinner"></span> جاري...`;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
            if (this._originalBtnContent) btn.innerHTML = this._originalBtnContent;
        }
    }

    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) { this.showToast("⚠️ الرجاء إدخال اسمك"); return; }

        this.setLoading('btn-create-room', true);
        try {
            this.isHost = true;
            this.roomId = Math.floor(100000000 + Math.random() * 900000000).toString();
            const roomRef = ref(this.db, `rooms/${this.roomId}`);
            await set(roomRef, {
                config: {
                    hostId: this.myId,
                    gameState: 'lobby',
                    currentLetter: '',
                    timer: 40,
                    createdAt: serverTimestamp()
                }
            });
            await this.joinRoomLogic(this.roomId);
        } catch (e) {
            this.showToast("❌ فشل إنشاء الغرفة");
        } finally {
            this.setLoading('btn-create-room', false);
        }
    }

    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        if (!this.playerName || this.roomId.length !== 9) { this.showToast("⚠️ بيانات غير صحيحة"); return; }

        this.setLoading('btn-join-room', true);
        try {
            const snap = await get(ref(this.db, `rooms/${this.roomId}`));
            if (!snap.exists()) { this.showToast("❌ الغرفة غير موجودة"); return; }
            this.isHost = false;
            await this.joinRoomLogic(this.roomId);
        } catch (e) {
            this.showToast("❌ فشل الانضمام");
        } finally {
            this.setLoading('btn-join-room', false);
        }
    }

    updatePlayerList() {
        // Reset all seats to empty
        for (let i = 0; i < 6; i++) {
            const seat = document.getElementById(`seat-${i}`);
            if (!seat) continue;
            seat.removeAttribute('data-player-id');
            const wrapper = seat.querySelector('.avatar-wrapper');
            const img = seat.querySelector('.avatar-img');
            const readyIcon = seat.querySelector('.ready-icon');
            const label = seat.querySelector('.player-name-label');

            wrapper.classList.add('empty');
            wrapper.classList.remove('speaking');
            img.textContent = '👤';
            readyIcon.classList.add('hidden');
            label.textContent = 'بانتظار...';
        }

        // Fill seats with current players
        this.players.forEach((p, index) => {
            if (index >= 6) return;
            const seat = document.getElementById(`seat-${index}`);
            if (!seat) return;
            seat.setAttribute('data-player-id', p.id);
            const wrapper = seat.querySelector('.avatar-wrapper');
            const img = seat.querySelector('.avatar-img');
            const readyIcon = seat.querySelector('.ready-icon');
            const label = seat.querySelector('.player-name-label');

            wrapper.classList.remove('empty');
            img.textContent = p.avatar || '👤';
            if (p.ready) readyIcon.classList.remove('hidden');
            else readyIcon.classList.add('hidden');
            label.textContent = p.name + (p.id === this.myId ? ' (أنت)' : '');
        });
    }

    async setReady() {
        await update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), { ready: true });
        const btn = document.getElementById('btn-ready');
        btn.disabled = true;
        btn.classList.remove('btn-pulse');
        btn.innerHTML = `<span class="spinner"></span> بانتظار البقية...`;
    }

    async handleLobbyCountdown() {
        const readyPlayers = this.players.filter(p => p.ready);
        const playerCount = this.players.length;

        // Reset countdown if new player joins ("ظهر ثالث")
        if (this._lastPlayerCount !== undefined && playerCount > this._lastPlayerCount && readyPlayers.length >= 2) {
            this.startLobbyCountdown();
        }
        this._lastPlayerCount = playerCount;

        if (readyPlayers.length >= 2) {
            if (!this.lobbyInterval) {
                this.startLobbyCountdown();
            }
        } else {
            if (this.lobbyInterval) {
                clearInterval(this.lobbyInterval);
                this.lobbyInterval = null;
                await update(ref(this.db, `rooms/${this.roomId}/config`), { lobbyCountdown: null });
            }
        }
    }

    startLobbyCountdown() {
        if (this.lobbyInterval) clearInterval(this.lobbyInterval);
        let count = 15;

        const syncCountdown = async () => {
            await update(ref(this.db, `rooms/${this.roomId}/config`), { lobbyCountdown: count });
            if (count <= 0) {
                clearInterval(this.lobbyInterval);
                this.lobbyInterval = null;
                this.triggerStartGame();
            }
            count--;
        };

        syncCountdown();
        this.lobbyInterval = setInterval(syncCountdown, 1000);
    }

    async triggerStartGame() {
        const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
        await update(ref(this.db, `rooms/${this.roomId}/config`), {
            gameState: 'game',
            currentLetter: letter,
            stopTriggered: false,
            timer: 40,
            lobbyCountdown: null
        });
        await remove(ref(this.db, `rooms/${this.roomId}/results`));
        await remove(ref(this.db, `rooms/${this.roomId}/progress`));
        this.startHostTimerSync();
    }

    updateLobbyTimerUI(val) {
        if (val === null || val === undefined) {
            this.lobbyCountdownContainer.classList.add('hidden');
            return;
        }
        this.lobbyCountdownContainer.classList.remove('hidden');
        this.lobbyCountdownTimer.textContent = val;
        if (val <= 5) {
            this.lobbyCountdownTimer.style.color = '#ff4b2b';
            this.playSound('timer');
        } else {
            this.lobbyCountdownTimer.style.color = '#fff';
        }
    }

    startHostTimerSync() {
        if (this.gameInterval) clearInterval(this.gameInterval);
        let time = 40;
        this.gameInterval = setInterval(async () => {
            time--;
            if (time <= 0) {
                clearInterval(this.gameInterval);
                await update(ref(this.db, `rooms/${this.roomId}/config`), { stopTriggered: true, timer: 0 });
            } else {
                update(ref(this.db, `rooms/${this.roomId}/config`), { timer: time });
            }
        }, 1000);
    }

    updateLocalTimer(val) {
        this.timeLeft = val;
        this.timerDisplay.textContent = val;
        if (val <= 5) {
            this.timerDisplay.style.color = '#ff4b2b';
            this.playSound('timer');
        } else {
            this.timerDisplay.style.color = '#fff';
        }
    }

    startGame(letter) {
        this.currentLetter = letter;
        this.hasSubmitted = false;
        this.inputsDisabled = false;
        this._winCelebrated = false;
        this.clearInputs();
        this.enableInputs();
        this.showSection('game');
        this.playSound('start');
        this.oppProgress.classList.add('hidden');
    }

    clearInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.value = '');
    }

    enableInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.disabled = false);
        document.getElementById('btn-stop').disabled = false;
    }

    async stopGame() {
        await update(ref(this.db, `rooms/${this.roomId}/config`), { stopTriggered: true });
    }

    endRoundManually() {
        this.disableInputs();
        this.submitAnswers();
        this.playSound('buzzer');
        if (this.isHost && this.gameInterval) clearInterval(this.gameInterval);
    }

    disableInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.disabled = true);
        document.getElementById('btn-stop').disabled = true;
        this.inputsDisabled = true;
    }

    async submitAnswers() {
        if (this.hasSubmitted) return;
        this.hasSubmitted = true;

        const answers = {
            name: document.getElementById('input-name').value.trim(),
            animal: document.getElementById('input-animal').value.trim(),
            plant: document.getElementById('input-plant').value.trim(),
            object: document.getElementById('input-object').value.trim(),
            country: document.getElementById('input-country').value.trim()
        };

        await set(ref(this.db, `rooms/${this.roomId}/results/${this.myId}`), {
            playerName: this.playerName,
            avatar: this.avatar,
            answers: answers,
            scores: { name: 0, animal: 0, plant: 0, object: 0, country: 0 },
            roundTotal: 0
        });

        // If host, wait for all and transition
        if (this.isHost) {
            this.checkAllSubmitted();
        }
    }

    async autoEvaluateAnswers() {
        if (!this.isHost || this.results.length === 0) return;

        const fields = ['name', 'animal', 'plant', 'object', 'country'];
        const resultUpdates = {};
        const playerUpdates = {};

        // 1. Initial assignment
        this.results.forEach(res => {
            resultUpdates[res.playerId] = {
                scores: { name: 0, animal: 0, plant: 0, object: 0, country: 0 },
                roundTotal: 0
            };
        });

        // 2. Cross-check for duplicate answers and validity
        fields.forEach(f => {
            const answerGroups = {};
            this.results.forEach(res => {
                const ans = (res.answers[f] || '').trim();
                const valid = ans.length > 0 && ans.toLowerCase().startsWith(this.currentLetter.toLowerCase());

                if (valid) {
                    const normalized = ans.toLowerCase();
                    if (!answerGroups[normalized]) answerGroups[normalized] = [];
                    answerGroups[normalized].push(res.playerId);
                    // Default to 10 for valid answers
                    resultUpdates[res.playerId].scores[f] = 10;
                } else {
                    resultUpdates[res.playerId].scores[f] = 0;
                }
            });

            // If more than one person has the same answer, they get 5 points
            Object.values(answerGroups).forEach(pIds => {
                if (pIds.length > 1) {
                    pIds.forEach(pId => {
                        resultUpdates[pId].scores[f] = 5;
                    });
                }
            });
        });

        // 3. Finalize roundTotal and update cumulative totalScore
        for (const res of this.results) {
            const pId = res.playerId;
            const p = this.players.find(p => p.id === pId);
            const roundTotal = Object.values(resultUpdates[pId].scores).reduce((a, b) => a + b, 0);

            const prevTotal = p?.totalScore || 0;
            playerUpdates[`players/${pId}/totalScore`] = prevTotal + roundTotal;
            playerUpdates[`results/${pId}/scores`] = resultUpdates[pId].scores;
            playerUpdates[`results/${pId}/roundTotal`] = roundTotal;
        }

        await update(ref(this.db, `rooms/${this.roomId}`), playerUpdates);
    }

    async checkAllSubmitted() {
        const check = setInterval(async () => {
            const snap = await get(ref(this.db, `rooms/${this.roomId}/results`));
            if (snap.exists() && Object.keys(snap.val()).length >= this.players.length) {
                clearInterval(check);
                // Perform auto-evaluation before showing scores
                this.results = Object.entries(snap.val()).map(([id, r]) => ({ playerId: id, ...r }));
                await this.autoEvaluateAnswers();
                update(ref(this.db, `rooms/${this.roomId}/config`), { gameState: 'score' });
            }
        }, 1000);
    }

    goToScoreSection() {
        this.showSection('score');
        const hint = document.getElementById('host-eval-hint');
        if (this.isHost) hint.classList.remove('hidden');
        else hint.classList.add('hidden');

        // Play result sound
        setTimeout(() => {
            const myStatus = this.getRoundWinStatus(this.myId);
            if (myStatus.class === 'badge-win') this.playSound('win');
            else if (myStatus.class === 'badge-loss') this.playSound('loss');
        }, 500);
    }

    renderScores() {
        if (!this.resultsSplitContainer) return;
        this.resultsSplitContainer.innerHTML = '';

        if (this.results.length === 0) {
            this.resultsSplitContainer.innerHTML = '<div class="card" style="text-align:center">في انتظار النتائج...</div>';
            return;
        }

        // Sort results: Mine first, then others
        const sortedResults = [...this.results].sort((a, b) => {
            if (a.playerId === this.myId) return -1;
            if (b.playerId === this.myId) return 1;
            return 0;
        });

        sortedResults.forEach(res => {
            const section = document.createElement('div');
            section.className = 'player-result-section';
            section.setAttribute('data-player-id', res.playerId);

            let rowsHtml = '';
            const fields = [
                { id: 'name', label: 'اسم' },
                { id: 'animal', label: 'حيوان' },
                { id: 'plant', label: 'نبات' },
                { id: 'object', label: 'جماد' },
                { id: 'country', label: 'بلاد' }
            ];

            fields.forEach(f => {
                const answer = res.answers[f.id] || '-';
                const score = res.scores[f.id] || 0;
                const status = this.getFieldStatus(res.playerId, f.id);

                let scoreActionHtml = '';
                if (this.isHost) {
                    scoreActionHtml = `
                        <div style="color:var(--accent-color); font-weight:bold; margin-bottom:4px">${score}</div>
                        <div class="score-btns">
                            <button class="btn-small-score btn-score-10" onclick="window.gameManager.updateScore('${res.playerId}','${f.id}',10)">10</button>
                            <button class="btn-small-score btn-score-5" onclick="window.gameManager.updateScore('${res.playerId}','${f.id}',5)">5</button>
                            <button class="btn-small-score btn-score-0" onclick="window.gameManager.updateScore('${res.playerId}','${f.id}',0)">0</button>
                        </div>
                    `;
                } else {
                    scoreActionHtml = `<div style="color:var(--accent-color); font-weight:bold">${score}</div>`;
                }

                rowsHtml += `
                    <div class="grid-row">
                        <div class="grid-cell cell-label">${f.label}</div>
                        <div class="grid-cell cell-answer">${answer}</div>
                        <div class="grid-cell">${scoreActionHtml}</div>
                        <div class="grid-cell status-icon">${status.icon}</div>
                    </div>
                `;
            });

            const playerTotal = this.players.find(p => p.id === res.playerId)?.totalScore || 0;
            const roundWinStatus = this.getRoundWinStatus(res.playerId);

            // Winner celebration for current user
            if (res.playerId === this.myId && roundWinStatus.class === 'badge-win' && !this._winCelebrated) {
                this.showLottieCelebration('win');
                this._winCelebrated = true;
            } else if (res.playerId === this.myId && roundWinStatus.class === 'badge-loss' && !this._winCelebrated) {
                this.showLottieCelebration('loss');
                this._winCelebrated = true;
            }

            section.innerHTML = `
                <div class="player-header">
                    <div class="avatar">${res.avatar || '👤'}</div>
                    <div class="name">${res.playerName} ${res.playerId === this.myId ? '(أنت)' : ''}</div>
                </div>
                <div class="result-grid">
                    <div class="grid-header">الفئة</div>
                    <div class="grid-header">الإجابة</div>
                    <div class="grid-header">النقاط</div>
                    <div class="grid-header">الحالة</div>
                    ${rowsHtml}
                </div>
                <div class="section-footer">
                    <div class="total-score-badge">المجموع الكلي: ${playerTotal}</div>
                    <div class="win-status-badge ${roundWinStatus.class}">${roundWinStatus.text}</div>
                </div>
            `;
            this.resultsSplitContainer.appendChild(section);
        });
    }

    showLottieCelebration(type) {
        const overlay = document.createElement('div');
        overlay.className = 'lottie-overlay';
        const url = type === 'win'
            ? 'https://assets10.lottiefiles.com/packages/lf20_u4yrau.json' // Confetti
            : 'https://assets1.lottiefiles.com/packages/lf20_0yfs9vly.json'; // Sad face or similar

        overlay.innerHTML = `<lottie-player src="${url}" background="transparent" speed="1" style="width: 300px; height: 300px;" autoplay></lottie-player>`;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.remove(), 4000);
    }

    getFieldStatus(playerId, field) {
        if (this.results.length < 2) return { text: '', icon: '-' };
        const scores = this.results.map(r => r.scores[field] || 0);
        const maxScore = Math.max(...scores);
        const myScore = this.results.find(r => r.playerId === playerId)?.scores[field] || 0;

        if (myScore === 0 && maxScore === 0) return { text: '-', icon: '-' };
        if (myScore === maxScore) {
            const winners = this.results.filter(r => r.scores[field] === maxScore);
            return winners.length > 1 ? { text: 'تعادل', icon: '🤝' } : { text: 'فاز', icon: '✅' };
        }
        return { text: 'خسر', icon: '❌' };
    }

    getRoundWinStatus(playerId) {
        if (this.results.length < 2) return { text: '', class: '' };
        const totals = this.results.map(r => r.roundTotal || 0);
        const maxTotal = Math.max(...totals);
        const myTotal = this.results.find(r => r.playerId === playerId)?.roundTotal || 0;

        if (myTotal === maxTotal) {
            const winners = this.results.filter(r => r.roundTotal === maxTotal);
            return winners.length > 1 ? { text: 'تعادل 🤝', class: 'badge-draw' } : { text: 'فائز بالجولة 🏆', class: 'badge-win' };
        }
        return { text: 'خاسر بالجولة 📉', class: 'badge-loss' };
    }

    async updateScore(playerId, field, points) {
        const res = this.results.find(r => r.playerId === playerId);
        const player = this.players.find(p => p.id === playerId);
        if (!res || !player) return;

        const diff = points - res.scores[field];
        const newRoundTotal = res.roundTotal + diff;
        const newTotalScore = (player.totalScore || 0) + diff;

        await update(ref(this.db, `rooms/${this.roomId}/results/${playerId}/scores`), { [field]: points });
        await update(ref(this.db, `rooms/${this.roomId}/results/${playerId}`), { roundTotal: newRoundTotal });
        await update(ref(this.db, `rooms/${this.roomId}/players/${playerId}`), { totalScore: newTotalScore });
    }

    // Next Round Handshake Logic
    async requestNextRound() {
        this.playSound('click');
        this.setLoading('btn-next-round-request', true);
        try {
            await set(ref(this.db, `rooms/${this.roomId}/nextRoundRequest`), {
                fromId: this.myId,
                fromName: this.playerName,
                timestamp: serverTimestamp()
            });
            this.showToast("تم إرسال طلب جولة جديدة لصديقك...");
        } catch (e) {
            this.showToast("❌ فشل إرسال الطلب");
        } finally {
            this.setLoading('btn-next-round-request', false);
        }
    }

    handleNextRoundRequest(req) {
        if (req.fromId === this.myId) {
            this.modalNextRound.classList.add('hidden');
            return;
        }

        this.modalNextRound.classList.remove('hidden');
        document.getElementById('modal-message').textContent = `صديقك ${req.fromName} مستعد للجولة التالية، هل أنت مستعد؟`;

        // 15s timeout
        this.modalTimeoutFill.style.transition = 'none';
        this.modalTimeoutFill.style.width = '100%';
        setTimeout(() => {
            this.modalTimeoutFill.style.transition = 'width 15s linear';
            this.modalTimeoutFill.style.width = '0%';
        }, 10);

        if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);
        this.handshakeTimeout = setTimeout(() => {
            if (!this.modalNextRound.classList.contains('hidden')) {
                this.modalNextRound.classList.add('hidden');
                this.showToast("انتهى وقت الموافقة!");
                if (this.isHost) {
                    remove(ref(this.db, `rooms/${this.roomId}/nextRoundRequest`));
                }
            }
        }, 15000);
    }

    async acceptNextRound() {
        this.modalNextRound.classList.add('hidden');
        if (this.handshakeTimeout) clearTimeout(this.handshakeTimeout);

        // Reset game and start directly
        const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
        const updates = {};
        this.players.forEach(p => {
            updates[`players/${p.id}/ready`] = true; // Stay ready for immediate start
        });
        updates['config/gameState'] = 'game';
        updates['config/currentLetter'] = letter;
        updates['config/stopTriggered'] = false;
        updates['config/timer'] = 40;
        updates['nextRoundRequest'] = null;

        await update(ref(this.db, `rooms/${this.roomId}`), updates);
        await remove(ref(this.db, `rooms/${this.roomId}/results`));
        await remove(ref(this.db, `rooms/${this.roomId}/progress`));

        if (this.isHost) {
            this.startHostTimerSync();
        }
    }

    resetLobbyUI() {
        const btnReady = document.getElementById('btn-ready');
        if (btnReady) {
            btnReady.disabled = false;
            btnReady.innerHTML = 'أنا مستعد 👍';
        }
    }

    async quitGame() {
        this.playSound('quit');
        if (this.roomId && this.myId) {
            await remove(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`));
            await remove(ref(this.db, `rooms/${this.roomId}/progress/${this.myId}`));
        }
        location.reload();
    }

    copyRoomId() {
        if (!this.roomId) return;
        const el = document.createElement('textarea');
        el.value = this.roomId;
        document.body.appendChild(el);
        el.select();
        try {
            document.execCommand('copy');
            this.showToast("تم النسخ! ✅");
        } catch (err) {
            this.showToast("فشل النسخ");
        }
        document.body.removeChild(el);
        this.playSound('copy');
    }

    // Chat Methods
    async sendChatMessage() {
        const msg = this.chatInput.value.trim();
        if (!msg || !this.roomId) return;

        const chatRef = ref(this.db, `rooms/${this.roomId}/chat`);
        await push(chatRef, {
            senderId: this.myId,
            senderName: this.playerName,
            text: msg,
            timestamp: serverTimestamp()
        });

        this.chatInput.value = '';
        this.playSound('click');
    }

    updateChatUI(chatData) {
        const messages = Object.values(chatData).sort((a, b) => a.timestamp - b.timestamp);

        // Only re-render if count changed to avoid flickering
        if (messages.length === this.chatMessages.length) return;
        this.chatMessages = messages;

        this.chatMessagesEl.innerHTML = '';
        messages.forEach(m => {
            const div = document.createElement('div');
            div.className = `message ${m.senderId === this.myId ? 'mine' : ''}`;
            div.innerHTML = `
                <span class="sender">${m.senderName}</span>
                <span class="text">${this.escapeHtml(m.text)}</span>
            `;
            this.chatMessagesEl.appendChild(div);
        });

        // Auto-scroll
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==========================================
    // Voice Chat (WebRTC Multi-Peer Mesh) Methods
    // ==========================================

    initMicStatus() {
        this.micEnabled = false;
        this.micOnIcon.classList.add('hidden');
        this.micOffIcon.classList.remove('hidden');
    }

    async toggleMic() {
        if (!this.micEnabled) {
            try {
                if (!this.localStream) {
                    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                    this.setupAudioLevelIndicator(this.localStream, true);
                    // Connect to all existing players
                    this.players.forEach(p => {
                        if (p.id !== this.myId) this.initPeerConnection(p.id, true);
                    });
                } else {
                    this.localStream.getAudioTracks().forEach(t => t.enabled = true);
                }
                this.micEnabled = true;
                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
            } catch (err) {
                console.error("Mic Error:", err);
                this.showToast("⚠️ يجب السماح بالوصول للميكروفون");
            }
        } else {
            if (this.localStream) {
                this.localStream.getAudioTracks().forEach(t => t.enabled = false);
            }
            this.micEnabled = false;
            this.micOnIcon.classList.add('hidden');
            this.micOffIcon.classList.remove('hidden');
        }
    }

    toggleSpeaker() {
        this.speakerEnabled = !this.speakerEnabled;
        Object.values(this.remoteAudios).forEach(audio => audio.muted = !this.speakerEnabled);
        if (this.speakerEnabled) {
            this.speakerOnIcon.classList.remove('hidden');
            this.speakerOffIcon.classList.add('hidden');
        } else {
            this.speakerOnIcon.classList.add('hidden');
            this.speakerOffIcon.classList.remove('hidden');
        }
    }

    async initPeerConnection(remoteId, isOfferer) {
        if (this.pcs[remoteId]) return this.pcs[remoteId];

        const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        const pc = new RTCPeerConnection(configuration);
        this.pcs[remoteId] = pc;

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
        }

        pc.ontrack = (event) => {
            if (!this.remoteAudios[remoteId]) {
                const audio = new Audio();
                audio.autoplay = true;
                audio.muted = !this.speakerEnabled;
                this.remoteAudios[remoteId] = audio;
            }
            this.remoteAudios[remoteId].srcObject = event.streams[0];
            this.setupAudioLevelIndicator(event.streams[0], false, remoteId);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && this.roomId) {
                const candidatePath = `rooms/${this.roomId}/signaling/${this.getPairId(remoteId)}/ice/${this.myId}`;
                push(ref(this.db, candidatePath), event.candidate.toJSON());
            }
        };

        if (isOfferer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await set(ref(this.db, `rooms/${this.roomId}/signaling/${this.getPairId(remoteId)}/offer`), {
                sdp: offer.sdp,
                type: offer.type,
                from: this.myId
            });
        }

        return pc;
    }

    getPairId(remoteId) {
        return [this.myId, remoteId].sort().join('_');
    }

    async handleSignaling(signaling) {
        for (const [pairId, data] of Object.entries(signaling)) {
            if (!pairId.includes(this.myId)) continue;
            const remoteId = pairId.split('_').find(id => id !== this.myId);
            if (!remoteId) continue;

            const pc = this.pcs[remoteId] || await this.initPeerConnection(remoteId, false);

            try {
                // Receive Offer
                if (data.offer && data.offer.from !== this.myId && !pc.remoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    await set(ref(this.db, `rooms/${this.roomId}/signaling/${pairId}/answer`), {
                        sdp: answer.sdp,
                        type: answer.type,
                        from: this.myId
                    });
                }

                // Receive Answer
                if (data.answer && data.answer.from !== this.myId && !pc.remoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                }

                // Receive ICE
                if (data.ice && data.ice[remoteId]) {
                    if (!this._addedIce) this._addedIce = {};
                    if (!this._addedIce[remoteId]) this._addedIce[remoteId] = new Set();

                    Object.entries(data.ice[remoteId]).forEach(([iceId, candidate]) => {
                        if (!this._addedIce[remoteId].has(iceId)) {
                            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
                            this._addedIce[remoteId].add(iceId);
                        }
                    });
                }
            } catch (e) {
                console.error("Signaling Error:", e);
            }
        }
    }

    setupAudioLevelIndicator(stream, isLocal, remoteId = null) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
            // Stop if stream is inactive or mic disabled (for local)
            if (!stream.active || (isLocal && !this.micEnabled)) {
                audioContext.close();
                return;
            }

            analyser.getByteFrequencyData(dataArray);
            let values = 0;
            for (let i = 0; i < bufferLength; i++) {
                values += dataArray[i];
            }
            const average = values / bufferLength;
            const isSpeaking = average > 15; // Threshold for speaking

            const targetId = isLocal ? this.myId : remoteId;
            this.updateSpeakingUI(targetId, isSpeaking);
            requestAnimationFrame(checkVolume);
        };
        checkVolume();
    }

    updateSpeakingUI(playerId, isSpeaking) {
        if (!playerId) return;

        // 1. Lobby avatars
        const seat = document.querySelector(`.seat[data-player-id="${playerId}"] .avatar-wrapper`);
        if (seat) seat.classList.toggle('speaking', isSpeaking);

        // 2. Result avatars
        const resSection = document.querySelector(`.player-result-section[data-player-id="${playerId}"]`);
        if (resSection) {
            const av = resSection.querySelector('.avatar');
            if (av) av.classList.toggle('speaking', isSpeaking);
        }

        // 3. Opponent progress (if this player is currently featured in the progress banner)
        if (playerId === this.topOppId && this.oppAvatar) {
            this.oppAvatar.classList.toggle('speaking', isSpeaking);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameManager = new GameManager();
});
