/**
 * لعبة اسم حيوان نبات - الإصدار المطور باستخدام Agora RTM v2
 */

const APP_ID = "560000db55ef467f8da4f5075b7a979c";

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
        this.rtm = null;
        this.channel = null;
        this.isHost = false;
        this.playerName = "";
        this.roomId = "";
        this.players = [];     // {id, name, ready, totalScore}
        this.results = [];     // {playerId, playerName, answers: {}, scores: {}, roundTotal: 0}
        this.arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        this.currentLetter = "";
        this.myId = Math.floor(Math.random() * 1000000000).toString();

        this.initElements();
        this.initEvents();
        this.setupRTM();
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

    async setupRTM() {
        try {
            this.rtm = new AgoraRTM.RTM(APP_ID, this.myId);

            this.rtm.addEventListener("message", (event) => {
                this.handleMessage(event.publisher, JSON.parse(event.message));
            });

            this.rtm.addEventListener("presence", (event) => {
                if (event.eventType === "SNAPSHOT") {
                    // Initial state of users in channel
                } else if (event.eventType === "REMOTE_JOIN") {
                    this.showToast(`انضم لاعب جديد`);
                    if (this.isHost) {
                        this.syncState();
                    }
                } else if (event.eventType === "REMOTE_LEAVE") {
                    this.handlePlayerLeave(event.publisher);
                }
            });

            await this.rtm.login();
        } catch (error) {
            console.error("RTM Setup Error:", error);
            this.showToast("فشل الاتصال بالخادم. يرجى تحديث الصفحة.");
        }
    }

    async joinChannel(channelId) {
        try {
            this.channel = channelId;
            await this.rtm.subscribe(channelId);
            this.showSection('lobby');
            this.displayRoomId.textContent = channelId;
            this.playSound('join');

            // Send join message
            this.sendMessage({
                type: 'join',
                name: this.playerName,
                id: this.myId
            });
        } catch (error) {
            console.error("Join Channel Error:", error);
            this.showToast("فشل الانضمام للغرفة");
        }
    }

    sendMessage(message) {
        if (this.rtm && this.channel) {
            this.rtm.publish(this.channel, JSON.stringify(message));
        }
    }

    handleMessage(publisher, data) {
        switch (data.type) {
            case 'join':
                if (this.isHost) {
                    if (!this.players.find(p => p.id === data.id)) {
                        this.players.push({ id: data.id, name: data.name, ready: false, totalScore: 0 });
                        this.syncState();
                        this.updatePlayerList();
                    }
                }
                break;
            case 'sync-state':
                if (!this.isHost) {
                    this.players = data.players;
                    this.updatePlayerList();
                    if (data.gameState === 'game' && this.sections.game.classList.contains('hidden')) {
                        this.startGame(data.letter);
                    } else if (data.gameState === 'score') {
                        this.results = data.results;
                        this.renderScores();
                        this.showSection('score');
                    }
                }
                break;
            case 'ready':
                if (this.isHost) {
                    const p = this.players.find(p => p.id === data.id);
                    if (p) p.ready = true;
                    this.updatePlayerList();
                    this.syncState();
                    this.checkAllReady();
                }
                break;
            case 'start-game':
                this.startGame(data.letter);
                break;
            case 'stop-game':
                this.disableInputs();
                this.submitAnswers();
                this.playSound('buzzer');
                break;
            case 'submit-answers':
                if (this.isHost) {
                    this.handleAnswers(data.id, data.answers);
                }
                break;
            case 'results-update':
                this.results = data.results;
                this.players = data.players;
                this.renderScores();
                if (this.sections.score.classList.contains('hidden')) {
                    this.showSection('score');
                }
                break;
            case 'quit':
                this.showToast(`انسحب اللاعب ${data.name}`);
                this.handlePlayerLeave(data.id);
                break;
        }
    }

    handlePlayerLeave(id) {
        this.players = this.players.filter(p => p.id !== id);
        this.updatePlayerList();
        if (this.isHost) {
            this.syncState();
        }
    }

    syncState() {
        if (this.isHost) {
            let gameState = 'lobby';
            if (this.sections.game.classList.contains('active')) gameState = 'game';
            if (this.sections.score.classList.contains('active')) gameState = 'score';

            this.sendMessage({
                type: 'sync-state',
                players: this.players,
                gameState: gameState,
                letter: this.currentLetter,
                results: this.results
            });
        }
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

    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) return this.showToast("الرجاء إدخال اسمك أولاً");

        this.btnCreateRoom.disabled = true;
        const originalText = this.btnCreateRoom.innerHTML;
        this.btnCreateRoom.innerHTML = `<span>جارٍ الإنشاء...</span> <div class="spinner"></div>`;

        this.isHost = true;
        this.roomId = this.generateId();
        this.players = [{ id: this.myId, name: this.playerName, ready: false, totalScore: 0 }];

        await this.joinChannel(this.roomId);

        this.btnCreateRoom.disabled = false;
        this.btnCreateRoom.innerHTML = originalText;
        this.updatePlayerList();
    }

    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        if (!this.playerName || !this.roomId) return this.showToast("يرجى إدخال اسمك ورمز الغرفة");
        if (this.roomId.length !== 9) return this.showToast("رمز الغرفة يجب أن يتكون من 9 أرقام");

        this.isHost = false;
        this.btnJoinRoom.disabled = true;
        const originalText = this.btnJoinRoom.innerHTML;
        this.btnJoinRoom.innerHTML = `<span>جارٍ الانضمام...</span> <div class="spinner"></div>`;

        await this.joinChannel(this.roomId);

        this.btnJoinRoom.disabled = false;
        this.btnJoinRoom.innerHTML = originalText;
    }

    updatePlayerList() {
        this.playerList.innerHTML = '';
        this.players.forEach(p => {
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name + (p.id === this.myId ? " (أنت)" : "");
            const statusSpan = document.createElement('span');
            statusSpan.textContent = p.ready ? '✅ مستعد' : '⏳ ينتظر';
            li.appendChild(nameSpan);
            li.appendChild(statusSpan);
            this.playerList.appendChild(li);
        });
    }

    copyRoomId() {
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showToast("تم نسخ الرمز بنجاح!");
            this.playSound('copy');
        });
    }

    setReady() {
        if (this.isHost) {
            const p = this.players.find(p => p.id === this.myId);
            if (p) p.ready = true;
            this.updatePlayerList();
            this.syncState();
            this.checkAllReady();
        } else {
            this.sendMessage({ type: 'ready', id: this.myId });
        }
        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = true;
        btnReady.textContent = 'في انتظار البقية...';
    }

    checkAllReady() {
        if (this.players.length > 1 && this.players.every(p => p.ready)) {
            const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
            this.sendMessage({ type: 'start-game', letter: letter });
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
        this.sendMessage({ type: 'stop-game' });
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
            this.handleAnswers(this.myId, answers);
        } else {
            this.sendMessage({ type: 'submit-answers', id: this.myId, answers: answers });
        }
    }

    handleAnswers(playerId, answers) {
        if (this.results.find(r => r.playerId === playerId)) return;

        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        this.results.push({
            playerId: playerId,
            playerName: player.name,
            answers: answers,
            scores: { name: 0, animal: 0, plant: 0, object: 0, country: 0 },
            roundTotal: 0
        });

        if (this.results.length === this.players.length) {
            this.renderScores();
            this.sendMessage({ type: 'results-update', results: this.results, players: this.players });
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
            const total = player ? player.totalScore : 0;
            tdTotal.innerHTML = `<span style="font-size:12px">جولة: ${res.roundTotal}</span><br><strong>كلي: ${total}</strong>`;
            tr.appendChild(tdTotal);

            this.scoreTableBody.appendChild(tr);
        });
    }

    updateScore(playerId, field, points) {
        const res = this.results.find(r => r.playerId === playerId);
        const player = this.players.find(p => p.id === playerId);

        if (!res || !player) return;

        res.roundTotal -= res.scores[field];
        player.totalScore -= res.scores[field];

        res.scores[field] = points;
        res.roundTotal += points;
        player.totalScore += points;

        this.renderScores();
        this.sendMessage({ type: 'results-update', results: this.results, players: this.players });
    }

    nextRound() {
        this.players.forEach(p => p.ready = false);
        this.updatePlayerList();

        const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
        this.sendMessage({ type: 'start-game', letter: letter });
        this.syncState();
        this.startGame(letter);

        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = false;
        btnReady.textContent = 'أنا مستعد 👍';
    }

    async quitGame() {
        this.playSound('quit');
        if (this.rtm) {
            this.sendMessage({ type: 'quit', id: this.myId, name: this.playerName });
            if (this.channel) {
                await this.rtm.unsubscribe(this.channel);
            }
            await this.rtm.logout();
        }
        location.reload();
    }
}

window.onload = () => {
    window.gameManager = new GameManager();
};
