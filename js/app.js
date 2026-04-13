/**
 * لعبة اسم حيوان نبات - Agora RTM v2
 * مشروع جديد بدون Certificate
 */

const APP_ID = "36713fd4db3d48919d8e393e71c78026";

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
        this.rtmClient = null;
        this.channel = null;
        this.isHost = false;
        this.playerName = "";
        this.roomId = "";
        this.players = [];
        this.results = [];
        this.arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        this.currentLetter = "";
        this.myId = Math.floor(Math.random() * 1000000000).toString();
        this.isLoggedIn = false;

        this.initElements();
        this.initEvents();
        this.initRTM();
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

    async initRTM() {
        try {
            console.log('🔄 Initializing RTM...');
            
            this.rtmClient = new AgoraRTM.RTM(APP_ID, this.myId);
            
            this.rtmClient.addEventListener('status', (event) => {
                console.log('📡 RTM Status:', event.state);
                if (event.state === 'CONNECTED') {
                    this.isLoggedIn = true;
                    console.log('✅ RTM Connected');
                } else if (event.state === 'DISCONNECTED') {
                    this.isLoggedIn = false;
                }
            });

            await this.rtmClient.login();
            console.log('✅ RTM Login Success');
            
        } catch (error) {
            console.error("❌ RTM Init Error:", error);
            this.showToast("فشل الاتصال: " + error.message);
        }
    }

    async joinChannel(channelId) {
        try {
            if (!this.rtmClient) throw new Error("RTM Client not initialized");
            
            if (!this.isLoggedIn) {
                await this.waitForLogin();
            }

            this.roomId = channelId;
            console.log('🔄 Joining channel:', channelId);
            
            this.channel = this.rtmClient.createChannel(channelId);
            
            this.channel.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.message.text);
                    this.handleMessage(event.publisher, data);
                } catch (e) {
                    console.error("Message parse error:", e);
                }
            });

            this.channel.addEventListener('presence', (event) => {
                console.log('👥 Presence:', event.eventType);
                if (event.eventType === 'REMOTE_JOIN' && event.publisher !== this.myId) {
                    this.showToast(`👋 انضم لاعب جديد`);
                    if (this.isHost) setTimeout(() => this.syncState(), 500);
                } else if (event.eventType === 'REMOTE_LEAVE') {
                    this.handlePlayerLeave(event.publisher);
                }
            });

            await this.channel.join();
            console.log('✅ Joined channel:', channelId);
            
            setTimeout(() => {
                this.sendMessage({
                    type: 'join',
                    name: this.playerName,
                    id: this.myId
                });
            }, 300);

        } catch (error) {
            console.error("❌ Join Channel Error:", error);
            this.showToast("فشل الانضمام: " + error.message);
            throw error;
        }
    }

    async waitForLogin() {
        let attempts = 0;
        while (!this.isLoggedIn && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
    }

    async sendMessage(message) {
        if (!this.channel) return;
        try {
            await this.channel.sendMessage({ text: JSON.stringify(message) });
        } catch (err) {
            console.error("Send error:", err);
        }
    }

    handleMessage(publisher, data) {
        if (publisher === this.myId && data.type !== 'sync-state') return;
        console.log('📨 Message:', data.type);

        switch (data.type) {
            case 'join':
                if (this.isHost && publisher !== this.myId) {
                    if (!this.players.find(p => p.id === data.id)) {
                        this.players.push({ 
                            id: data.id, 
                            name: data.name, 
                            ready: false, 
                            totalScore: 0 
                        });
                        this.updatePlayerList();
                        setTimeout(() => this.syncState(), 200);
                    }
                }
                break;
            case 'sync-state':
                if (!this.isHost) {
                    this.players = data.players || [];
                    this.updatePlayerList();
                    if (data.gameState === 'game' && !this.isSectionActive('game')) {
                        this.startGame(data.letter);
                    } else if (data.gameState === 'score') {
                        this.results = data.results || [];
                        this.renderScores();
                        this.showSection('score');
                    }
                }
                break;
            case 'ready':
                if (this.isHost) {
                    const p = this.players.find(p => p.id === data.id);
                    if (p) {
                        p.ready = true;
                        this.updatePlayerList();
                        this.syncState();
                        this.checkAllReady();
                    }
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
                if (this.isHost) this.handleAnswers(data.id, data.answers);
                break;
            case 'results-update':
                this.results = data.results || [];
                this.players = data.players || [];
                this.renderScores();
                if (!this.isSectionActive('score')) this.showSection('score');
                break;
            case 'quit':
                this.showToast(`🚪 انسحب اللاعب ${data.name}`);
                this.handlePlayerLeave(data.id);
                break;
        }
    }

    handlePlayerLeave(id) {
        this.players = this.players.filter(p => p.id !== id);
        this.updatePlayerList();
        if (this.isHost) this.syncState();
    }

    syncState() {
        if (!this.isHost || !this.channel) return;
        this.sendMessage({
            type: 'sync-state',
            players: this.players,
            gameState: this.getCurrentSection(),
            letter: this.currentLetter,
            results: this.results
        });
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
        try {
            const audio = new Audio(SOUNDS[name]);
            audio.volume = 0.4;
            audio.play().catch(() => {});
        } catch (e) {}
    }

    showSection(name) {
        this.playSound('click');
        Object.values(this.sections).forEach(s => s.classList.remove('active'));
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
        }, 3000);
    }

    generateId() {
        return Math.floor(100000000 + Math.random() * 900000000).toString();
    }

    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) {
            this.showToast("⚠️ الرجاء إدخال اسمك");
            return;
        }

        this.btnCreateRoom.disabled = true;
        const originalText = this.btnCreateRoom.innerHTML;
        this.btnCreateRoom.innerHTML = `<span>جارٍ الإنشاء...</span> <div class="spinner"></div>`;

        try {
            this.isHost = true;
            this.roomId = this.generateId();
            this.players = [{ 
                id: this.myId, 
                name: this.playerName, 
                ready: false, 
                totalScore: 0 
            }];

            await this.joinChannel(this.roomId);
            this.showSection('lobby');
            this.displayRoomId.textContent = this.roomId;
            this.updatePlayerList();
            this.playSound('join');
            
        } catch (error) {
            console.error("Create Room Error:", error);
            this.showToast("❌ فشل إنشاء الغرفة");
            this.isHost = false;
            this.roomId = "";
        } finally {
            this.btnCreateRoom.disabled = false;
            this.btnCreateRoom.innerHTML = originalText;
        }
    }

    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        
        if (!this.playerName) {
            this.showToast("⚠️ يرجى إدخال اسمك");
            return;
        }
        if (!this.roomId || this.roomId.length !== 9 || !/^\d{9}$/.test(this.roomId)) {
            this.showToast("⚠️ رمز الغرفة يجب أن يكون 9 أرقام");
            return;
        }

        this.isHost = false;
        this.btnJoinRoom.disabled = true;
        const originalText = this.btnJoinRoom.innerHTML;
        this.btnJoinRoom.innerHTML = `<span>جارٍ الانضمام...</span> <div class="spinner"></div>`;

        try {
            await this.joinChannel(this.roomId);
            this.showSection('lobby');
            this.displayRoomId.textContent = this.roomId;
            this.playSound('join');
            
        } catch (error) {
            console.error("Join Room Error:", error);
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
            nameSpan.textContent = p.name + (p.id === this.myId ? " (أنت)" : "");
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

    setReady() {
        const btnReady = document.getElementById('btn-ready');
        if (this.isHost) {
            const p = this.players.find(p => p.id === this.myId);
            if (p) p.ready = true;
            this.updatePlayerList();
            this.syncState();
            this.checkAllReady();
        } else {
            this.sendMessage({ type: 'ready', id: this.myId });
        }
        btnReady.disabled = true;
        btnReady.innerHTML = '⏳ في انتظار البقية...';
    }

    checkAllReady() {
        if (this.players.length < 1) return;
        const allReady = this.players.every(p => p.ready);
        if (allReady) {
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
        
        const btnReady = document.getElementById('btn-ready');
        btnReady.disabled = false;
        btnReady.innerHTML = 'أنا مستعد 👍';
    }

    clearInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.value = '');
    }

    enableInputs() {
        document.querySelectorAll('.game-field').forEach(i => {
            i.disabled = false;
            i.value = '';
        });
        document.getElementById('btn-stop').disabled = false;
    }

    disableInputs() {
        document.querySelectorAll('.game-field').forEach(i => i.disabled = true);
        document.getElementById('btn-stop').disabled = true;
    }

    stopGame() {
        this.sendMessage({ type: 'stop-game' });
        this.disableInputs();
        this.submitAnswers();
        this.playSound('buzzer');
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
        if (this.results.length === 0) {
            this.scoreTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">لا توجد نتائج</td></tr>';
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
            tdTotal.innerHTML = `
                <div style="font-size: 12px; opacity: 0.7;">جولة: ${res.roundTotal}</div>
                <div style="font-size: 16px; font-weight: bold; color: #4caf50;">${totalScore}</div>
            `;
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
        this.syncState();
    }

    nextRound() {
        this.players.forEach(p => p.ready = false);
        this.updatePlayerList();
        const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
        this.sendMessage({ type: 'start-game', letter: letter });
        this.syncState();
        this.startGame(letter);
    }

    async quitGame() {
        this.playSound('quit');
        this.showToast("🚪 جارٍ الخروج...");
        
        try {
            if (this.channel) {
                await this.sendMessage({ type: 'quit', id: this.myId, name: this.playerName });
                await this.channel.leave();
                this.channel = null;
            }
            if (this.rtmClient) {
                await this.rtmClient.logout();
                this.rtmClient = null;
            }
        } catch (error) {
            console.error("Quit Error:", error);
        }
        
        setTimeout(() => location.reload(), 500);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Game initializing...');
    window.gameManager = new GameManager();
});
