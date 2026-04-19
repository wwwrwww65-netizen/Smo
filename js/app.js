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
        this.results = [];
        this.arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        this.currentLetter = "";
        this.myId = null;
        this.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

        this.gameTimer = null;
        this.timeLeft = 40;
        this.audioEnabled = false;

        this.initElements();
        this.initEvents();
        this.initAuth();
    }

    initElements() {
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

        this.btnCreateRoom.addEventListener('click', () => this.createRoom());
        this.btnJoinRoom.addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.setReady());
        document.getElementById('btn-stop').addEventListener('click', () => this.stopGame());
        document.getElementById('btn-next-round-request').addEventListener('click', () => this.requestNextRound());
        document.getElementById('btn-copy-id').addEventListener('click', () => this.copyRoomId());
        this.btnQuit.addEventListener('click', () => this.quitGame());
        this.btnModalAccept.addEventListener('click', () => this.acceptNextRound());

        // Tracking inputs
        document.querySelectorAll('.game-field').forEach(input => {
            input.addEventListener('input', () => this.updateMyProgress(input));
            input.addEventListener('focus', () => this.updateMyProgress(input));
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

            // Handle Disconnects / Win condition if only 1 player left in active game
            if (data.players) {
                const prevPlayersCount = this.players.length;
                this.players = Object.entries(data.players).map(([id, p]) => ({ id, ...p }));
                this.updatePlayerList();

                if (prevPlayersCount > this.players.length && (data.config?.gameState === 'game')) {
                    this.showToast("لقد خرج أحد اللاعبين!");
                }

                if (this.isHost && data.config?.gameState === 'lobby') {
                    this.checkAllReady();
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
        const opponentId = Object.keys(progressData).find(id => id !== this.myId);
        if (!opponentId || !this.isSectionActive('game')) {
            this.oppProgress.classList.add('hidden');
            return;
        }

        const opp = progressData[opponentId];
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

    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) { this.showToast("⚠️ الرجاء إدخال اسمك"); return; }

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
        } catch (e) { this.showToast("❌ فشل إنشاء الغرفة"); }
    }

    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        if (!this.playerName || this.roomId.length !== 9) { this.showToast("⚠️ بيانات غير صحيحة"); return; }

        try {
            const snap = await get(ref(this.db, `rooms/${this.roomId}`));
            if (!snap.exists()) { this.showToast("❌ الغرفة غير موجودة"); return; }
            this.isHost = false;
            await this.joinRoomLogic(this.roomId);
        } catch (e) { this.showToast("❌ فشل الانضمام"); }
    }

    updatePlayerList() {
        this.playerList.innerHTML = '';
        this.players.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.5rem">${p.avatar || '👤'}</span>
                    <span>${p.name} ${p.id === this.myId ? '(أنت)' : ''}</span>
                </div>
                <span style="color: ${p.ready ? '#4caf50' : '#ff9800'}">${p.ready ? '✅ مستعد' : '⏳ ينتظر'}</span>
            `;
            this.playerList.appendChild(li);
        });
    }

    async setReady() {
        await update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), { ready: true });
        const btn = document.getElementById('btn-ready');
        btn.disabled = true;
        btn.innerHTML = '⏳ بانتظار الخصم...';
    }

    async checkAllReady() {
        if (this.players.length < 2) return; // Need at least 2 players
        if (this.players.every(p => p.ready)) {
            const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
            await update(ref(this.db, `rooms/${this.roomId}/config`), {
                gameState: 'game',
                currentLetter: letter,
                stopTriggered: false,
                timer: 40
            });
            await remove(ref(this.db, `rooms/${this.roomId}/results`));
            await remove(ref(this.db, `rooms/${this.roomId}/progress`));
            this.startHostTimerSync();
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
        if (!this.isHost || this.results.length < 2) return;

        const res1 = this.results[0];
        const res2 = this.results[1];
        const p1 = this.players.find(p => p.id === res1.playerId);
        const p2 = this.players.find(p => p.id === res2.playerId);

        const fields = ['name', 'animal', 'plant', 'object', 'country'];
        const p1Updates = { scores: { ...res1.scores }, roundTotal: 0 };
        const p2Updates = { scores: { ...res2.scores }, roundTotal: 0 };

        fields.forEach(f => {
            const ans1 = res1.answers[f]?.toLowerCase().trim();
            const ans2 = res2.answers[f]?.toLowerCase().trim();

            if (ans1 && ans2 && ans1 === ans2) {
                p1Updates.scores[f] = 5;
                p2Updates.scores[f] = 5;
            }
        });

        p1Updates.roundTotal = Object.values(p1Updates.scores).reduce((a, b) => a + b, 0);
        p2Updates.roundTotal = Object.values(p2Updates.scores).reduce((a, b) => a + b, 0);

        await update(ref(this.db, `rooms/${this.roomId}/results/${res1.playerId}`), p1Updates);
        await update(ref(this.db, `rooms/${this.roomId}/results/${res2.playerId}`), p2Updates);

        // Update global cumulative scores with the auto-evaluated points
        if (p1 && p1Updates.roundTotal > 0) {
            await update(ref(this.db, `rooms/${this.roomId}/players/${res1.playerId}`), {
                totalScore: (p1.totalScore || 0) + p1Updates.roundTotal
            });
        }
        if (p2 && p2Updates.roundTotal > 0) {
            await update(ref(this.db, `rooms/${this.roomId}/players/${res2.playerId}`), {
                totalScore: (p2.totalScore || 0) + p2Updates.roundTotal
            });
        }
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

    getFieldStatus(playerId, field) {
        if (this.results.length < 2) return { text: '', icon: '-' };
        const myScore = this.results.find(r => r.playerId === playerId)?.scores[field] || 0;
        const oppScore = this.results.find(r => r.playerId !== playerId)?.scores[field] || 0;

        if (myScore > oppScore) return { text: 'فاز', icon: '✅' };
        if (myScore < oppScore) return { text: 'خسر', icon: '❌' };
        if (myScore === 0 && oppScore === 0) return { text: '-', icon: '-' };
        return { text: 'تعادل', icon: '🤝' };
    }

    getRoundWinStatus(playerId) {
        if (this.results.length < 2) return { text: '', class: '' };
        const myTotal = this.results.find(r => r.playerId === playerId)?.roundTotal || 0;
        const oppTotal = this.results.find(r => r.playerId !== playerId)?.roundTotal || 0;

        if (myTotal > oppTotal) return { text: 'فائز بالجولة 🏆', class: 'badge-win' };
        if (myTotal < oppTotal) return { text: 'خاسر بالجولة 📉', class: 'badge-loss' };
        return { text: 'تعادل في الجولة 🤝', class: 'badge-draw' };
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
        await set(ref(this.db, `rooms/${this.roomId}/nextRoundRequest`), {
            fromId: this.myId,
            fromName: this.playerName,
            timestamp: serverTimestamp()
        });
        this.showToast("تم إرسال طلب جولة جديدة لصديقك...");
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
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameManager = new GameManager();
});
