/**
 * لعبة اسم حيوان نبات - Firebase Realtime Database Edition
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
    quit: 'https://www.soundjay.com/buttons/sounds/button-10.mp3'
};

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
        this.scoreTableBody = document.querySelector('#score-table tbody');
        this.hostControls = document.getElementById('host-controls');
        this.mainToast = document.getElementById('main-toast');
        this.btnJoinRoom = document.getElementById('btn-join-room');
        this.btnCreateRoom = document.getElementById('btn-create-room');
    }

    initEvents() {
        this.btnCreateRoom.addEventListener('click', () => this.createRoom());
        this.btnJoinRoom.addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.setReady());
        document.getElementById('btn-stop').addEventListener('click', () => this.stopGame());
        document.getElementById('btn-next-round').addEventListener('click', () => this.nextRound());
        document.getElementById('btn-copy-id').addEventListener('click', () => this.copyRoomId());
        this.btnQuit.addEventListener('click', () => this.quitGame());
    }

    async initAuth() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.myId = user.uid;
                console.log("✅ Authenticated as:", this.myId);
            } else {
                signInAnonymously(this.auth).catch(err => {
                    console.error("❌ Auth Error:", err);
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

            // Update players
            if (data.players) {
                this.players = Object.entries(data.players).map(([id, p]) => ({ id, ...p }));
                this.updatePlayerList();

                // Check if all ready (only host does this)
                if (this.isHost && data.config?.gameState === 'lobby') {
                    this.checkAllReady();
                }
            }

            // Update game state
            if (data.config) {
                const state = data.config.gameState;
                const letter = data.config.currentLetter;

                if (state === 'game' && !this.isSectionActive('game')) {
                    this.startGame(letter);
                } else if (state === 'score' && !this.isSectionActive('score')) {
                    this.showSection('score');
                } else if (state === 'lobby' && !this.isSectionActive('lobby')) {
                    this.showSection('lobby');
                    const btnReady = document.getElementById('btn-ready');
                    if (btnReady) {
                        btnReady.disabled = false;
                        btnReady.innerHTML = 'أنا مستعد 👍';
                    }
                }

                this.currentLetter = letter;
                if (this.letterDisplay) this.letterDisplay.textContent = letter || '؟';

                // Host controls visibility
                if (this.isHost && state === 'score') {
                    this.hostControls.classList.remove('hidden');
                } else {
                    this.hostControls.classList.add('hidden');
                }

                // If someone stopped the game
                if (data.config.stopTriggered && !this.inputsDisabled) {
                    this.disableInputs();
                    this.submitAnswers();
                    this.playSound('buzzer');
                }
            }

            // Update results
            if (data.results) {
                this.results = Object.entries(data.results).map(([id, r]) => ({ playerId: id, ...r }));
                this.renderScores();

                // Auto transition to score state if all players submitted (Host only)
                if (this.isHost && data.config?.gameState === 'game') {
                    const resultsCount = Object.keys(data.results).length;
                    const playersCount = Object.keys(data.players || {}).length;
                    if (resultsCount >= playersCount && playersCount > 0) {
                        update(ref(this.db, `rooms/${this.roomId}/config`), { gameState: 'score' });
                    }
                }
            } else {
                this.results = [];
                this.renderScores();
            }
        });
    }

    async joinRoomLogic(roomId) {
        const playerRef = ref(this.db, `rooms/${roomId}/players/${this.myId}`);

        // Presence: Remove player when disconnected
        onDisconnect(playerRef).remove();

        await update(playerRef, {
            name: this.playerName,
            ready: false,
            totalScore: 0,
            isOnline: true
        });

        this.listenToRoom(roomId);
        this.showSection('lobby');
        this.displayRoomId.textContent = roomId;
        this.playSound('join');
    }

    getCurrentSection() {
        if (this.sections.game.classList.contains('active')) return 'game';
        if (this.sections.score.classList.contains('active')) return 'score';
        return 'lobby';
    }

    isSectionActive(name) {
        return this.sections[name].classList.contains('active');
    }

    playSound(name) {
        try { const audio = new Audio(SOUNDS[name]); audio.volume = 0.4; audio.play().catch(() => {}); } catch(e) {}
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
        this.toastTimeout = setTimeout(() => this.mainToast.classList.add('hidden'), 3000);
    }

    generateId() {
        return Math.floor(100000000 + Math.random() * 900000000).toString();
    }

    async createRoom() {
        if (!this.myId) { this.showToast("⏳ جاري الاتصال... حاول مرة أخرى"); return; }
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) { this.showToast("⚠️ الرجاء إدخال اسمك"); return; }

        this.btnCreateRoom.disabled = true;
        const originalText = this.btnCreateRoom.innerHTML;
        this.btnCreateRoom.innerHTML = `<span>جارٍ الإنشاء...</span> <div class="spinner"></div>`;

        try {
            this.isHost = true;
            this.roomId = this.generateId();

            const roomRef = ref(this.db, `rooms/${this.roomId}`);
            await set(roomRef, {
                config: {
                    hostId: this.myId,
                    gameState: 'lobby',
                    currentLetter: '',
                    createdAt: serverTimestamp()
                }
            });

            await this.joinRoomLogic(this.roomId);
        } catch (error) {
            console.error("Create Error:", error);
            this.showToast("❌ فشل إنشاء الغرفة");
            this.isHost = false;
            this.roomId = "";
        } finally {
            this.btnCreateRoom.disabled = false;
            this.btnCreateRoom.innerHTML = originalText;
        }
    }

    async joinRoom() {
        if (!this.myId) { this.showToast("⏳ جاري الاتصال... حاول مرة أخرى"); return; }
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();

        if (!this.playerName) { this.showToast("⚠️ يرجى إدخال اسمك"); return; }
        if (!this.roomId || this.roomId.length !== 9 || !/^\d{9}$/.test(this.roomId)) {
            this.showToast("⚠️ رمز الغرفة يجب أن يكون 9 أرقام");
            return;
        }

        this.btnJoinRoom.disabled = true;
        const originalText = this.btnJoinRoom.innerHTML;
        this.btnJoinRoom.innerHTML = `<span>جارٍ الانضمام...</span> <div class="spinner"></div>`;

        try {
            const roomSnapshot = await get(ref(this.db, `rooms/${this.roomId}`));
            if (!roomSnapshot.exists()) {
                this.showToast("❌ الغرفة غير موجودة");
                return;
            }

            this.isHost = false;
            await this.joinRoomLogic(this.roomId);
        } catch (error) {
            console.error("Join Error:", error);
            this.showToast("❌ فشل الانضمام");
        } finally {
            this.btnJoinRoom.disabled = false;
            this.btnJoinRoom.innerHTML = originalText;
        }
    }

    updatePlayerList() {
        this.playerList.innerHTML = '';
        if (this.players.length === 0) {
            this.playerList.innerHTML = '<li style="text-align: center; opacity: 0.5;">لا يوجد لاعبين</li>';
            return;
        }
        this.players.forEach(p => {
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = (p.name || "مجهول") + (p.id === this.myId ? " (أنت)" : "");
            if (p.id === this.myId) nameSpan.style.color = '#ffd54f';
            const statusSpan = document.createElement('span');
            statusSpan.textContent = p.ready ? '✅ مستعد' : '⏳ ينتظر';
            statusSpan.style.color = p.ready ? '#4caf50' : '#ff9800';
            li.appendChild(nameSpan);
            li.appendChild(statusSpan);
            this.playerList.appendChild(li);
        });
    }

    copyRoomId() {
        if (!this.roomId) return;
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showToast("✅ تم نسخ الرمز!");
            this.playSound('copy');
        }).catch(() => {
            const textArea = document.createElement("textarea");
            textArea.value = this.roomId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            this.showToast("✅ تم نسخ الرمز!");
            this.playSound('copy');
        });
    }

    async setReady() {
        const btnReady = document.getElementById('btn-ready');
        await update(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`), { ready: true });
        btnReady.disabled = true;
        btnReady.innerHTML = '⏳ في انتظار البقية...';
    }

    async checkAllReady() {
        if (this.players.length < 1) return;
        const allReady = this.players.every(p => p.ready);
        if (allReady) {
            const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
            await update(ref(this.db, `rooms/${this.roomId}/config`), {
                gameState: 'game',
                currentLetter: letter,
                stopTriggered: false
            });
            // Clear previous results
            await remove(ref(this.db, `rooms/${this.roomId}/results`));
        }
    }

    startGame(letter) {
        this.currentLetter = letter;
        this.letterDisplay.textContent = letter;
        this.results = [];
        this.hasSubmitted = false;
        this.clearInputs();
        this.enableInputs();
        this.showSection('game');
        this.playSound('start');
        this.hostControls.classList.add('hidden');
        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = false;
        btnReady.innerHTML = 'أنا مستعد 👍';
        this.inputsDisabled = false;
    }

    clearInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.value = '');
    }

    enableInputs() {
        document.querySelectorAll('.game-field').forEach(i => { i.disabled = false; i.value = ''; });
        document.getElementById('btn-stop').disabled = false;
    }

    disableInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.disabled = true);
        document.getElementById('btn-stop').disabled = true;
        this.inputsDisabled = true;
    }

    async stopGame() {
        await update(ref(this.db, `rooms/${this.roomId}/config`), { stopTriggered: true });
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

        const player = this.players.find(p => p.id === this.myId);
        await set(ref(this.db, `rooms/${this.roomId}/results/${this.myId}`), {
            playerName: player ? player.name : this.playerName,
            answers: answers,
            scores: { name: 0, animal: 0, plant: 0, object: 0, country: 0 },
            roundTotal: 0
        });
    }

    renderScores() {
        this.scoreTableBody.innerHTML = '';
        if (this.results.length === 0) {
            this.scoreTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">لا توجد نتائج بعد...</td></tr>';
            return;
        }
        this.results.forEach(res => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td');
            tdName.textContent = res.playerName;
            tdName.style.fontWeight = 'bold';
            tr.appendChild(tdName);
            ['name', 'animal', 'plant', 'object', 'country'].forEach(field => {
                const td = document.createElement('td');
                const answerDiv = document.createElement('div');
                answerDiv.textContent = res.answers[field] || '-';
                answerDiv.style.marginBottom = '5px';
                td.appendChild(answerDiv);

                if (this.isHost) {
                    const controls = document.createElement('div');
                    controls.className = 'score-controls';
                    [10, 5, 0].forEach(s => {
                        const btn = document.createElement('button');
                        btn.textContent = s;
                        btn.className = `btn-score btn-score-${s}`;
                        if (res.scores[field] === s) {
                            btn.style.transform = 'scale(1.1)';
                            btn.style.boxShadow = '0 0 10px rgba(255,255,255,0.5)';
                        }
                        btn.onclick = () => this.updateScore(res.playerId, field, s);
                        controls.appendChild(btn);
                    });
                    td.appendChild(controls);
                } else {
                    const scoreDiv = document.createElement('div');
                    scoreDiv.innerHTML = `<span style="color: #ffd54f; font-size: 12px;">${res.scores[field]} نقطة</span>`;
                    td.appendChild(scoreDiv);
                }
                tr.appendChild(td);
            });
            const tdTotal = document.createElement('td');
            const player = this.players.find(p => p.id === res.playerId);
            const totalScore = player ? player.totalScore : 0;
            tdTotal.innerHTML = `<div style="font-size:12px;opacity:0.7;">جولة: ${res.roundTotal}</div><div style="font-size:16px;font-weight:bold;color:#4caf50;">${totalScore}</div>`;
            tr.appendChild(tdTotal);
            this.scoreTableBody.appendChild(tr);
        });
    }

    async updateScore(playerId, field, points) {
        const res = this.results.find(r => r.playerId === playerId);
        const player = this.players.find(p => p.id === playerId);
        if (!res || !player) return;

        const oldScore = res.scores[field];
        const diff = points - oldScore;

        const newRoundTotal = res.roundTotal + diff;
        const newTotalScore = player.totalScore + diff;

        // Update results
        await update(ref(this.db, `rooms/${this.roomId}/results/${playerId}/scores`), { [field]: points });
        await update(ref(this.db, `rooms/${this.roomId}/results/${playerId}`), { roundTotal: newRoundTotal });

        // Update player total score
        await update(ref(this.db, `rooms/${this.roomId}/players/${playerId}`), { totalScore: newTotalScore });
    }

    async nextRound() {
        // Reset ready status for all players
        const updates = {};
        this.players.forEach(p => {
            updates[`players/${p.id}/ready`] = false;
        });
        updates['config/gameState'] = 'lobby';
        updates['config/stopTriggered'] = false;

        await update(ref(this.db, `rooms/${this.roomId}`), updates);
        await remove(ref(this.db, `rooms/${this.roomId}/results`));

        this.showSection('lobby');
    }

    async quitGame() {
        this.playSound('quit');
        this.showToast("🚪 جارٍ الخروج...");
        if (this.roomId && this.myId) {
            await remove(ref(this.db, `rooms/${this.roomId}/players/${this.myId}`));
        }
        setTimeout(() => location.reload(), 500);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Game initializing with Firebase...');
    window.gameManager = new GameManager();
});
