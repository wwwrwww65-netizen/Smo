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

        // Voice/PeerJS properties
        this.peer = null;
        this.localStream = null;
        this.micEnabled = false;
        this.speakerEnabled = true;
        this.activeCalls = {}; // remoteId -> call
        this.analysers = {};
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.silentStream = this.createSilentAudioStream();
        this.audioPool = [];
        this.maxPoolSize = 6;

        this.iceConfig = {
            'iceServers': [
                { 'urls': 'stun:stun.l.google.com:19302' },
                { 'urls': 'stun:stun1.l.google.com:19302' },
                { 'urls': 'stun:stun2.l.google.com:19302' },
                {
                    'urls': 'turn:global.metered.ca:443',
                    'username': 'cc045d3456c33ca2d5c8b09d',
                    'credential': 'Ab6Gsl42QGT6sNcK'
                },
                {
                    'urls': 'turn:global.metered.ca:443?transport=tcp',
                    'username': 'cc045d3456c33ca2d5c8b09d',
                    'credential': 'Ab6Gsl42QGT6sNcK'
                }
            ]
        };

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
        // Resume audio context and initialize audio pool on first interaction
        document.addEventListener('click', () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.initializeAudioPool();
        }, { once: true });

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
        this.btnCreateViewingRoom = document.getElementById('btn-create-viewing-room');
        this.btnOnoRoom = document.getElementById('btn-ono-room');
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
        this.lobbyHeader = document.querySelector('.lobby-header');
    }

    initializeAudioPool() {
        if (this.audioPool.length > 0) return;
        console.log("Initializing Audio Pool...");
        for (let i = 0; i < this.maxPoolSize; i++) {
            const audio = document.createElement('audio');
            audio.id = `audio-pool-${i}`;
            audio.autoplay = true;
            audio.playsInline = true;
            audio.style.display = 'none';
            document.body.appendChild(audio);
            this.audioPool.push(audio);

            // "Prime" the element with a user gesture
            audio.play().catch(() => {
                // Expected to fail if no src, but it registers the intent
            });
        }
    }

    initEvents() {
        document.getElementById('btn-start-app').addEventListener('click', () => {
            this.audioEnabled = true;
            this.overlayStart.classList.add('hidden');
            this.playSound('click');

            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            this.initializeAudioPool();

            // Also try to play any remote audios
            document.querySelectorAll('audio').forEach(a => {
                if (a.id.startsWith('audio-')) a.play().catch(() => {});
            });
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

        this.btnCreateRoom.addEventListener('click', () => this.createRoom('game'));
        if (this.btnCreateViewingRoom) {
            this.btnCreateViewingRoom.addEventListener('click', () => this.createRoom('viewing'));
        }

        if (this.btnOnoRoom) {
            this.btnOnoRoom.addEventListener('click', () => this.handleOnoRoomClick());
        }

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
                console.log("Firebase Auth: Logged in as", user.uid);
                this.myId = user.uid;
                // If we are already in a room (e.g. refresh), re-init peer
                if (this.roomId) {
                    this.initPeer();
                }
            } else {
                console.log("Firebase Auth: Attempting anonymous login...");
                signInAnonymously(this.auth).catch((err) => {
                    console.error("Firebase Auth Error:", err);
                    this.showToast("فشل الاتصال بـ Firebase");
                });
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

            // Sync Speaking Indicators
            if (data.players) {
                Object.entries(data.players).forEach(([id, p]) => {
                    this.updateSpeakingUI(id, p.isSpeaking || false);
                });
            }

            // Handshake for Next Round
            if (data.nextRoundRequest) {
                this.handleNextRoundRequest(data.nextRoundRequest);
            } else {
                this.modalNextRound.classList.add('hidden');
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
        this.roomId = roomId; // Ensure roomId is set early
        const playerRef = ref(this.db, `rooms/${roomId}/players/${this.myId}`);
        onDisconnect(playerRef).remove();
        // Also remove progress on disconnect
        onDisconnect(ref(this.db, `rooms/${roomId}/progress/${this.myId}`)).remove();

        // Chat and Lobby elements should be visible once in a room
        this.chatContainer.style.display = 'flex';
        if (this.lobbyHeader) this.lobbyHeader.style.display = 'flex';

        await update(playerRef, {
            name: this.playerName,
            avatar: this.avatar,
            ready: false,
            totalScore: 0,
            isOnline: true
        });

        this.listenToRoom(roomId);
        this.initPeer(); // Initialize PeerJS when joining a room
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

    async handleOnoRoomClick() {
        if (!this.myId) {
            this.showToast("⏳ جاري الاتصال بالخادم... يرجى الانتظار");
            let attempts = 0;
            while (!this.myId && attempts < 15) {
                await new Promise(r => setTimeout(r, 400));
                attempts++;
            }
            if (!this.myId) {
                this.showToast("❌ فشل الاتصال، يرجى التحقق من الإنترنت");
                return;
            }
        }

        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) { this.showToast("⚠️ الرجاء إدخال اسمك"); return; }

        this.setLoading('btn-ono-room', true);

        try {
            // Always create new ONO room
            const roomId = Math.floor(100000 + Math.random() * 900000).toString();
            const roomRef = ref(this.db, `rooms/${roomId}`);
            await set(roomRef, {
                roomType: 'ono',
                config: {
                    hostId: this.myId,
                    gameState: 'lobby',
                    createdAt: serverTimestamp()
                }
            });

            window.location.href = `./ono.html?roomID=${roomId}&username=${encodeURIComponent(this.playerName)}&role=owner`;
        } catch(e) {
            console.error(e);
            this.showToast("❌ حدث خطأ");
        } finally {
            this.setLoading('btn-ono-room', false);
        }
    }

    async createRoom(type = 'game') {
        if (!this.myId) {
            this.showToast("⏳ جاري الاتصال بالخادم... يرجى الانتظار");
            let attempts = 0;
            while (!this.myId && attempts < 15) {
                await new Promise(r => setTimeout(r, 400));
                attempts++;
            }
            if (!this.myId) {
                this.showToast("❌ فشل الاتصال، يرجى التحقق من الإنترنت");
                return;
            }
        }
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) { this.showToast("⚠️ الرجاء إدخال اسمك"); return; }

        const btnId = type === 'game' ? 'btn-create-room' : 'btn-create-viewing-room';
        this.setLoading(btnId, true);
        try {
            this.isHost = true;
            this.roomId = Math.floor(100000 + Math.random() * 900000).toString();

            if (type === 'viewing') {
                const roomRef = ref(this.db, `rooms/${this.roomId}`);
                await set(roomRef, {
                    roomType: 'viewing',
                    config: {
                        hostId: this.myId,
                        createdAt: serverTimestamp()
                    }
                });
                window.location.href = `./live/?roomID=${this.roomId}&username=${encodeURIComponent(this.playerName)}&role=owner`;
                return;
            }

            const roomRef = ref(this.db, `rooms/${this.roomId}`);
            await set(roomRef, {
                roomType: 'game',
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
            this.setLoading(btnId, false);
        }
    }

    async joinRoom() {
        if (!this.myId) {
            this.showToast("⏳ جاري الاتصال بالخادم... يرجى الانتظار");
            let attempts = 0;
            while (!this.myId && attempts < 15) {
                await new Promise(r => setTimeout(r, 400));
                attempts++;
            }
            if (!this.myId) {
                this.showToast("❌ فشل الاتصال، يرجى التحقق من الإنترنت");
                return;
            }
        }
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        if (!this.playerName || (this.roomId.length !== 9 && this.roomId.length !== 6)) { this.showToast("⚠️ بيانات غير صحيحة"); return; }

        this.setLoading('btn-join-room', true);
        try {
            const snap = await get(ref(this.db, `rooms/${this.roomId}`));
            if (!snap.exists()) { this.showToast("❌ الغرفة غير موجودة"); return; }
            const roomData = snap.val();

            if (roomData.roomType === 'viewing') {
                window.location.href = `./live/?roomID=${this.roomId}&username=${encodeURIComponent(this.playerName)}&role=guest`;
                return;
            }

            if (roomData.roomType === 'ono') {
                window.location.href = `./ono.html?roomID=${this.roomId}&username=${encodeURIComponent(this.playerName)}&role=guest`;
                return;
            }

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
    // Voice Chat (PeerJS Multi-Peer Mesh) Methods
    // ==========================================

    initMicStatus() {
        this.micEnabled = false;
        this.micOnIcon.classList.add('hidden');
        this.micOffIcon.classList.remove('hidden');
    }

    async initPeer() {
        if (this.peer || !this.myId) {
            console.log("PeerJS: Initialization skipped (already exists or no ID). ID:", this.myId);
            return;
        }

        console.log("PeerJS: Initializing with ID:", this.myId);
        this.peer = new Peer(this.myId, {
            config: this.iceConfig,
            debug: 2
        });

        // Global access for debugging as requested
        window.peer = this.peer;

        this.peer.on('open', (id) => {
            console.log('PeerJS: Connection opened with ID:', id);
            this.listenToVoicePeers();
        });

        this.peer.on('call', (call) => {
            console.log('PeerJS: Incoming call from:', call.peer);
            call.answer(this.localStream || this.silentStream);
            this.handleCallStream(call);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err.type, err);
            if (err.type === 'peer-unavailable') {
                // Ignore
            } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'unavailable-id') {
                console.log("PeerJS: Critical error, attempting reset...");
                setTimeout(() => {
                    if (this.peer && !this.peer.destroyed) this.peer.destroy();
                    this.peer = null;
                    this.initPeer();
                }, 5000);
            }
        });
    }

    createSilentAudioStream() {
        const oscillator = this.audioContext.createOscillator();
        const dst = oscillator.connect(this.audioContext.createMediaStreamDestination());
        oscillator.start();
        const track = dst.stream.getAudioTracks()[0];
        track.enabled = false;
        return new MediaStream([track]);
    }

    listenToVoicePeers() {
        if (!this.roomId) return;
        console.log("PeerJS: Starting listener for room:", this.roomId);

        const callOthers = () => {
            if (!this.peer || !this.peer.open) return;

            this.players.forEach(p => {
                // Handshake: lower ID calls higher ID to avoid double calls
                if (p.id && p.id !== this.myId && !this.activeCalls[p.id] && this.myId < p.id) {
                    console.log('PeerJS: Initiating call to:', p.id);
                    const stream = this.localStream || this.silentStream;

                    try {
                        const call = this.peer.call(p.id, stream);
                        if (call) {
                            this.handleCallStream(call);
                        }
                    } catch (e) {
                        console.error("PeerJS: Call initiation failed:", e);
                    }
                }
            });
        };

        // Listen for player changes to trigger calls
        const playerRef = ref(this.db, `rooms/${this.roomId}/players`);
        onValue(playerRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.players = Object.entries(data).map(([id, p]) => ({ id, ...p }));
                if (this.peer && this.peer.open) callOthers();
            }
        });

        // Immediate check if list already exists
        if (this.peer && this.peer.open) callOthers();
    }

    handleCallStream(call) {
        this.activeCalls[call.peer] = call;

        const onStreamReceived = (remoteStream) => {
            console.log('Receiving stream from:', call.peer);

            // 1. Check if this peer already has an assigned element
            let audio = this.audioPool.find(el => el.getAttribute('data-peer-id') === call.peer);

            if (!audio) {
                // 2. Find an available element in the pool (srcObject is null)
                audio = this.audioPool.find(el => !el.srcObject);

                if (!audio) {
                    console.warn("No available audio elements in the pool for peer:", call.peer);
                    return;
                }

                // 3. Mark it as used by this peer
                audio.setAttribute('data-peer-id', call.peer);
            }

            // 4. Assign the stream and play
            if (audio.srcObject !== remoteStream) {
                audio.srcObject = remoteStream;
            }

            audio.muted = !this.speakerEnabled;

            // Ensure playback starts
            audio.play().catch(e => {
                console.warn("Autoplay blocked for remote stream:", call.peer, e);
                // Try again after a small delay
                setTimeout(() => audio.play().catch(() => {}), 1000);
            });

            this.setupAudioLevelIndicator(remoteStream, false, call.peer);
        };

        // Standard PeerJS stream event
        call.on('stream', (remoteStream) => {
            onStreamReceived(remoteStream);
        });

        // Backup: Use ontrack via peerConnection for more reliability
        if (call.peerConnection) {
            call.peerConnection.ontrack = (event) => {
                if (event.streams && event.streams[0]) {
                    onStreamReceived(event.streams[0]);
                }
            };
        }

        call.on('close', () => {
            delete this.activeCalls[call.peer];
            const audio = this.audioPool.find(el => el.getAttribute('data-peer-id') === call.peer);
            if (audio) {
                audio.srcObject = null;
                audio.removeAttribute('data-peer-id');
                console.log("Released audio element for peer:", call.peer);
            }
        });
    }

    async toggleMic() {
        try {
            if (!this.micEnabled) {
                if (!this.localStream) {
                    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    this.setupAudioLevelIndicator(this.localStream, true);

                    // Replace tracks in all active calls
                    const newTrack = this.localStream.getAudioTracks()[0];
                    Object.values(this.activeCalls).forEach(call => {
                        if (call.peerConnection) {
                            const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                            if (sender) {
                                sender.replaceTrack(newTrack);
                            } else {
                                // If no sender, we might need to re-call or the connection is in a weird state
                                console.warn("No audio sender found for call:", call.peer);
                            }
                        }
                    });
                } else {
                    this.localStream.getAudioTracks().forEach(t => t.enabled = true);
                }
                this.micEnabled = true;
                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
                this.showToast("الميكروفون مفعل");
            } else {
                if (this.localStream) {
                    this.localStream.getAudioTracks().forEach(t => t.enabled = false);
                }
                this.micEnabled = false;
                this.micOnIcon.classList.add('hidden');
                this.micOffIcon.classList.remove('hidden');
                this.showToast("تم كتم الميكروفون");
                this.updateSpeakingUI(this.myId, false);
            }
        } catch (err) {
            console.error("Mic Error:", err);
            this.showToast("⚠️ فشل تفعيل الميكروفون");
        }
    }

    toggleSpeaker() {
        this.speakerEnabled = !this.speakerEnabled;
        document.querySelectorAll('audio').forEach(audio => {
            if (audio.id.startsWith('audio-')) {
                audio.muted = !this.speakerEnabled;
            }
        });
        if (this.speakerEnabled) {
            this.speakerOnIcon.classList.remove('hidden');
            this.speakerOffIcon.classList.add('hidden');
            this.showToast("الصوت مفعّل");
        } else {
            this.speakerOnIcon.classList.add('hidden');
            this.speakerOffIcon.classList.remove('hidden');
            this.showToast("الصوت مكتوم");
        }
    }

    setupAudioLevelIndicator(stream, isLocal, remoteId = null) {
        const uid = isLocal ? this.myId : remoteId;

        if (this.audioContext.state === 'suspended' && (this.audioEnabled || isLocal)) {
            this.audioContext.resume();
        }

        // Clean up old analyser if exists
        if (this.analysers[uid]) {
            try { this.analysers[uid].source.disconnect(); } catch(e) {}
            delete this.analysers[uid];
        }

        const analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;

        this.analysers[uid] = { analyser, source };

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
            if (!this.analysers[uid]) return;

            if (!stream.active || (isLocal && !this.micEnabled)) {
                this.updateSpeakingUI(uid, false);
                if (!stream.active) {
                    delete this.analysers[uid];
                    return;
                }
            } else {
                analyser.getByteFrequencyData(dataArray);
                let values = 0;
                for (let i = 0; i < bufferLength; i++) {
                    values += dataArray[i];
                }
                const average = values / bufferLength;
                const isSpeaking = average > 15;
                if (isLocal) {
                    this.updateSpeakingInFirebase(isSpeaking);
                } else {
                    this.updateSpeakingUI(uid, isSpeaking);
                }
            }
            requestAnimationFrame(checkVolume);
        };
        checkVolume();
    }

    updateSpeakingInFirebase(isSpeaking) {
        if (!this.roomId || !this.myId || this._lastSpeakingState === isSpeaking) return;
        this._lastSpeakingState = isSpeaking;

        update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), {
            isSpeaking: isSpeaking
        });
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
