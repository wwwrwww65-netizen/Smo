/**
 * لعبة اسم حيوان نبات - الإصدار الاحترافي
 * تطوير: Senior Frontend Developer
 * المتطلبات: 9 أرقام للغرفة، تصميم متجاوب، نظام نقاط تراكمي، تقييم يدوي، تأثيرات صوتية
 */

const SOUNDS = {
    click: 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAIlYAAClWAAABAAgAZGF0YREAAACAgICAgICAgICAgICAgICA',
    join: 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAIlYAAClWAAABAAgAZGF0YQYAAACAgICAgA==',
    start: 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAIlYAAClWAAABAAgAZGF0YREAAACAgICAgICAgICAgICAgICA',
    buzzer: 'data:audio/wav;base64,UklGRkYAAABXQVZFZm10IBAAAAABAAEAIlYAAClWAAABAAgAZGF0YToAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'
};

class GameManager {
    constructor() {
        this.peer = null;
        this.connections = []; // للمضيف
        this.conn = null;      // للضيف
        this.isHost = false;
        this.playerName = "";
        this.roomId = "";
        this.players = [];     // {id, name, ready, totalScore}
        this.results = [];     // {playerId, playerName, answers: {}, scores: {}, roundTotal: 0}
        this.arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        this.currentLetter = "";

        this.initElements();
        this.initEvents();
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
    }

    initEvents() {
        document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.setReady());
        document.getElementById('btn-stop').addEventListener('click', () => this.stopGame());
        document.getElementById('btn-next-round').addEventListener('click', () => this.nextRound());
        document.getElementById('btn-copy-id').addEventListener('click', () => this.copyRoomId());
        this.btnQuit.addEventListener('click', () => this.quitGame());
    }

    playSound(name) {
        try {
            const audio = new Audio(SOUNDS[name]);
            audio.play().catch(() => {});
        } catch (e) {}
    }

    showSection(name) {
        this.playSound('click');
        Object.values(this.sections).forEach(s => {
            s.classList.add('hidden');
            s.classList.remove('active');
        });
        this.sections[name].classList.remove('hidden');
        this.sections[name].classList.add('active');

        if (name === 'home') {
            this.btnQuit.classList.add('hidden');
        } else {
            this.btnQuit.classList.remove('hidden');
        }
    }

    showToast(message) {
        this.mainToast.textContent = message;
        this.mainToast.classList.remove('hidden');
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.mainToast.classList.add('hidden');
        }, 3500);
    }

    generateId() {
        return Math.floor(100000000 + Math.random() * 900000000).toString();
    }

    createRoom(retryCount = 0) {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) return this.showToast("الرجاء إدخال اسمك أولاً");

        const btnCreate = document.getElementById('btn-create-room');
        btnCreate.disabled = true;
        const originalText = btnCreate.innerHTML;
        btnCreate.innerHTML = `<span>جارٍ الإنشاء...</span> <div class="spinner"></div>`;

        const resetBtn = () => {
            btnCreate.disabled = false;
            btnCreate.innerHTML = originalText;
        };

        if (this.peer) this.peer.destroy();

        const id = this.generateId();
        this.peer = new Peer(id, {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });
        this.isHost = true;

        this.peer.on('open', (id) => {
            resetBtn();
            this.roomId = id;
            this.displayRoomId.textContent = id;
            this.players = [{ id: id, name: this.playerName, ready: false, totalScore: 0 }];
            this.updatePlayerList();
            this.showSection('lobby');
        });

        this.peer.on('connection', (conn) => {
            this.handleHostConnection(conn);
        });

        this.peer.on('error', (err) => {
            resetBtn();
            if (err.type === 'unavailable-id' && retryCount < 5) {
                setTimeout(() => this.createRoom(retryCount + 1), 500);
            } else if (err.type === 'network' || err.type === 'disconnected') {
                this.showToast("انقطع الاتصال بالشبكة، يرجى المحاولة مرة أخرى");
            } else {
                this.showToast("فشل إنشاء الغرفة، يرجى التأكد من اتصالك بالإنترنت والمحاولة مجدداً");
            }
        });
    }

    joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        if (!this.playerName || !this.roomId) return this.showToast("يرجى إدخال اسمك ورمز الغرفة");

        this.isHost = false;

        // UI Loading State
        this.btnJoinRoom.disabled = true;
        const originalText = this.btnJoinRoom.innerHTML;
        this.btnJoinRoom.innerHTML = `<span>جارٍ الانضمام...</span> <div class="spinner"></div>`;

        const resetJoinBtn = () => {
            this.btnJoinRoom.disabled = false;
            this.btnJoinRoom.innerHTML = originalText;
            if (this.joinTimeout) {
                clearTimeout(this.joinTimeout);
                this.joinTimeout = null;
            }
        };

        if (this.peer) this.peer.destroy();

        this.peer = new Peer({
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        // Timeout for the joining process
        this.joinTimeout = setTimeout(() => {
            if (!this.conn || !this.conn.open) {
                this.showToast("استغرق الاتصال وقتاً طويلاً. تأكد من وجود المضيف ومن جودة الإنترنت.");
                resetJoinBtn();
                if (this.peer) this.peer.destroy();
            }
        }, 15000);

        this.peer.on('open', () => {
            this.conn = this.peer.connect(this.roomId, {
                reliable: true
            });

            this.conn.on('error', (err) => {
                resetJoinBtn();
                this.showToast("حدث خطأ أثناء الاتصال بالطرف الآخر");
                console.error("Connection Error:", err);
            });

            this.handleGuestConnection(this.conn, resetJoinBtn);
        });

        this.peer.on('error', (err) => {
            resetJoinBtn();
            if (err.type === 'peer-unavailable') {
                this.showToast("عذراً، رمز الغرفة غير صحيح أو أن المضيف غادر اللعبة");
            } else if (err.type === 'network' || err.type === 'disconnected') {
                this.showToast("انقطع الاتصال بالشبكة، يرجى المحاولة مرة أخرى");
            } else {
                this.showToast("فشل الانضمام، تأكد من الرمز وحاول مجدداً");
            }
            console.error("Peer Error:", err);
        });
    }

    handleHostConnection(conn) {
        conn.on('open', () => {
            this.playSound('join');
            conn.on('data', (data) => {
                if (data.type === 'join') {
                    this.players.push({ id: conn.peer, name: data.name, ready: false, totalScore: 0 });
                    this.connections.push(conn);
                    this.broadcast({ type: 'players-update', players: this.players });
                    this.updatePlayerList();
                } else if (data.type === 'ready') {
                    const p = this.players.find(p => p.id === conn.peer);
                    if (p) p.ready = true;
                    this.updatePlayerList();
                    this.broadcast({ type: 'players-update', players: this.players });
                    this.checkAllReady();
                } else if (data.type === 'stop') {
                    this.broadcastStop();
                } else if (data.type === 'submit-answers') {
                    this.handleAnswers(conn.peer, data.answers);
                }
            });
        });

        conn.on('close', () => {
            this.players = this.players.filter(p => p.id !== conn.peer);
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
            this.updatePlayerList();
            this.broadcast({ type: 'players-update', players: this.players });
        });
    }

    handleGuestConnection(conn, resetBtnCallback) {
        conn.on('open', () => {
            if (resetBtnCallback) resetBtnCallback();
            conn.send({ type: 'join', name: this.playerName });
            this.showSection('lobby');
            this.displayRoomId.textContent = this.roomId;
        });

        conn.on('data', (data) => {
            if (data.type === 'players-update') {
                this.players = data.players;
                this.updatePlayerList();
            } else if (data.type === 'start-game') {
                this.startGame(data.letter);
            } else if (data.type === 'stop-game') {
                this.disableInputs();
                this.submitAnswers();
                this.playSound('buzzer');
            } else if (data.type === 'results-update') {
                this.results = data.results;
                this.players = data.players;
                this.renderScores();
                if (this.sections.score.classList.contains('hidden')) {
                    this.showSection('score');
                }
            }
        });

        conn.on('close', () => {
            this.showToast("انقطع الاتصال بالمضيف");
            setTimeout(() => this.quitGame(), 2000);
        });
    }

    broadcast(data) {
        this.connections.forEach(c => {
            if (c.open) c.send(data);
        });
    }

    updatePlayerList() {
        this.playerList.innerHTML = '';
        this.players.forEach(p => {
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;
            const statusSpan = document.createElement('span');
            statusSpan.textContent = p.ready ? '✅ مستعد' : '⏳ ينتظر';
            li.appendChild(nameSpan);
            li.appendChild(statusSpan);
            this.playerList.appendChild(li);
        });
    }

    copyRoomId() {
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showToast("تم النسخ!");
        });
    }

    setReady() {
        if (this.isHost) {
            const p = this.players.find(p => p.id === this.roomId);
            if (p) p.ready = true;
            this.updatePlayerList();
            this.broadcast({ type: 'players-update', players: this.players });
            this.checkAllReady();
        } else if (this.conn && this.conn.open) {
            this.conn.send({ type: 'ready' });
        } else {
            return this.showToast("انقطع الاتصال بالمضيف");
        }
        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = true;
        btnReady.textContent = 'في انتظار البقية...';
    }

    checkAllReady() {
        if (this.players.length > 1 && this.players.every(p => p.ready)) {
            const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
            this.broadcast({ type: 'start-game', letter: letter });
            this.startGame(letter);
        }
    }

    startGame(letter) {
        this.currentLetter = letter;
        this.letterDisplay.textContent = letter;
        this.results = [];
        this.clearInputs();
        this.enableInputs();
        this.showSection('game');
        this.playSound('start');
        this.hostControls.classList.add('hidden');
    }

    clearInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.value = '');
    }

    enableInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.disabled = false);
        document.getElementById('btn-stop').disabled = false;
    }

    disableInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.disabled = true);
        document.getElementById('btn-stop').disabled = true;
    }

    stopGame() {
        if (this.isHost) {
            this.broadcastStop();
        } else if (this.conn && this.conn.open) {
            this.conn.send({ type: 'stop' });
        }
    }

    broadcastStop() {
        this.playSound('buzzer');
        this.disableInputs();
        this.submitAnswers();
        this.broadcast({ type: 'stop-game' });
    }

    submitAnswers() {
        const answers = {
            name: document.getElementById('input-name').value.trim(),
            animal: document.getElementById('input-animal').value.trim(),
            plant: document.getElementById('input-plant').value.trim(),
            object: document.getElementById('input-object').value.trim(),
            country: document.getElementById('input-country').value.trim()
        };
        if (this.isHost) {
            this.handleAnswers(this.roomId, answers);
        } else if (this.conn && this.conn.open) {
            this.conn.send({ type: 'submit-answers', answers: answers });
        }
    }

    handleAnswers(playerId, answers) {
        if (this.results.find(r => r.playerId === playerId)) return;

        const player = this.players.find(p => p.id === playerId);
        this.results.push({
            playerId: playerId,
            playerName: player.name,
            answers: answers,
            scores: { name: 0, animal: 0, plant: 0, object: 0, country: 0 },
            roundTotal: 0
        });

        if (this.results.length === this.players.length) {
            this.renderScores();
            this.broadcast({ type: 'results-update', results: this.results, players: this.players });
            this.showSection('score');
            if (this.isHost) this.hostControls.classList.remove('hidden');
        }
    }

    renderScores() {
        this.scoreTableBody.innerHTML = '';
        this.results.forEach(res => {
            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            tdName.textContent = res.playerName;
            tr.appendChild(tdName);

            ['name', 'animal', 'plant', 'object', 'country'].forEach(field => {
                const td = document.createElement('td');
                const val = document.createElement('div');
                val.textContent = res.answers[field] || '-';
                td.appendChild(val);

                if (this.isHost) {
                    const controls = document.createElement('div');
                    controls.className = 'score-controls';
                    [10, 5, 0].forEach(s => {
                        const btn = document.createElement('button');
                        btn.textContent = s;
                        btn.className = `btn-score btn-score-${s}`;
                        btn.onclick = () => this.updateScore(res.playerId, field, s);
                        controls.appendChild(btn);
                    });
                    td.appendChild(controls);
                } else {
                    const scoreVal = document.createElement('div');
                    scoreVal.innerHTML = `<small style="color:#ffd54f">(${res.scores[field]})</small>`;
                    td.appendChild(scoreVal);
                }
                tr.appendChild(td);
            });

            const tdTotal = document.createElement('td');
            const player = this.players.find(p => p.id === res.playerId);
            tdTotal.innerHTML = `<span style="font-size:12px">جولة: ${res.roundTotal}</span><br><strong>كلي: ${player.totalScore}</strong>`;
            tr.appendChild(tdTotal);

            this.scoreTableBody.appendChild(tr);
        });
    }

    updateScore(playerId, field, points) {
        const res = this.results.find(r => r.playerId === playerId);
        const player = this.players.find(p => p.id === playerId);

        res.roundTotal -= res.scores[field];
        player.totalScore -= res.scores[field];

        res.scores[field] = points;
        res.roundTotal += points;
        player.totalScore += points;

        this.renderScores();
        this.broadcast({ type: 'results-update', results: this.results, players: this.players });
    }

    nextRound() {
        this.players.forEach(p => p.ready = false);
        this.updatePlayerList();
        this.broadcast({ type: 'players-update', players: this.players });

        const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
        this.broadcast({ type: 'start-game', letter: letter });
        this.startGame(letter);

        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = false;
        btnReady.textContent = 'أنا مستعد 👍';
    }

    quitGame() {
        if (this.peer) this.peer.destroy();
        location.reload();
    }
}

window.onload = () => {
    window.gameManager = new GameManager();
};
