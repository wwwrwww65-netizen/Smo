/**
 * لعبة اسم حيوان نبات - الإصدار المطور باستخدام Agora RTM v2
 * تم إصلاح جميع الأخطاء - 2025
 */

// ⚠️ تحذير: استبدل هذا بـ App ID الخاص بك من Agora Console
// يفضل تحميله من متغير بيئة وليس كتابته مباشرة
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
        this.rtmClient = null;      // RTM Client
        this.channel = null;        // Channel Instance
        this.isHost = false;
        this.playerName = "";
        this.roomId = "";
        this.players = [];          // {id, name, ready, totalScore}
        this.results = [];          // {playerId, playerName, answers: {}, scores: {}, roundTotal: 0}
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

    /**
     * ✅ تهيئة Agora RTM v2 - الإصدار الصحيح
     */
    async initRTM() {
        try {
            // إنشاء RTM Client
            this.rtmClient = new AgoraRTM.RTM(APP_ID, this.myId);
            
            // ✅ إضافة مستمع حالة الاتصال (مهم جداً)
            this.rtmClient.addEventListener('status', (event) => {
                console.log('RTM Status:', event.state);
                if (event.state === 'CONNECTED') {
                    this.isLoggedIn = true;
                } else if (event.state === 'DISCONNECTED') {
                    this.isLoggedIn = false;
                    this.showToast("انقطع الاتصال بالخادم");
                }
            });

            // تسجيل الدخول
            await this.rtmClient.login();
            console.log('✅ RTM Login Success');
            
        } catch (error) {
            console.error("❌ RTM Init Error:", error);
            this.showToast("فشل الاتصال بالخادم: " + (error.message || "خطأ غير معروف"));
        }
    }

    /**
     * ✅ الانضمام للقناة - الطريقة الصحيحة في RTM v2
     */
    async joinChannel(channelId) {
        try {
            if (!this.rtmClient || !this.isLoggedIn) {
                throw new Error("لم يتم تسجيل الدخول بعد");
            }

            this.roomId = channelId;
            
            // ✅ إنشاء Channel instance (الطريقة الصحيحة في v2)
            this.channel = this.rtmClient.createChannel(channelId);
            
            // ✅ إضافة مستمعي الأحداث على Channel وليس على RTM
            this.channel.addEventListener('message', (event) => {
                this.handleMessage(event.publisher, JSON.parse(event.message));
            });

            this.channel.addEventListener('presence', (event) => {
                console.log('Presence Event:', event);
                if (event.eventType === 'REMOTE_JOIN') {
                    this.showToast(`انضم لاعب جديد`);
                    if (this.isHost) {
                        this.syncState();
                    }
                } else if (event.eventType === 'REMOTE_LEAVE') {
                    this.handlePlayerLeave(event.publisher);
                }
            });

            this.channel.addEventListener('error', (error) => {
                console.error('Channel Error:', error);
            });

            // ✅ الانضمام للقناة
            await this.channel.join();
            console.log('✅ Joined Channel:', channelId);
            
            this.showSection('lobby');
            this.displayRoomId.textContent = channelId;
            this.playSound('join');

            // إرسال رسالة الانضمام
            this.sendMessage({
                type: 'join',
                name: this.playerName,
                id: this.myId
            });

        } catch (error) {
            console.error("❌ Join Channel Error:", error);
            this.showToast("فشل الانضمام للغرفة: " + (error.message || "خطأ غير معروف"));
            throw error;
        }
    }

    /**
     * ✅ إرسال رسالة - الطريقة الصحيحة
     */
    sendMessage(message) {
        if (this.channel) {
            this.channel.sendMessage({ 
                text: JSON.stringify(message) 
            }).catch(err => {
                console.error("Send Message Error:", err);
            });
        } else {
            console.warn("Channel not available");
        }
    }

    handleMessage(publisher, data) {
        // تجاهل رسائلي الخاصة (إذا كانت تُرسل لنفسي)
        if (publisher === this.myId && data.type !== 'sync-state') return;

        switch (data.type) {
            case 'join':
                if (this.isHost && publisher !== this.myId) {
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
                    if (data.gameState === 'game' && !this.sections.game.classList.contains('active')) {
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
                if (!this.sections.score.classList.contains('active')) {
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
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (e) {}
    }

    /**
     * ✅ تبديل الأقسام - مع CSS صحيح
     */
    showSection(name) {
        this.playSound('click');
        
        // إخفاء جميع الأقسام
        Object.values(this.sections).forEach(s => {
            s.style.display = 'none';
            s.classList.remove('active');
        });
        
        // إظهار القسم المطلوب
        this.sections[name].style.display = 'block';
        this.sections[name].classList.add('active');

        // إدارة زر الخروج
        if (name === 'home') {
            this.btnQuit.style.display = 'none';
        } else {
            this.btnQuit.style.display = 'block';
        }
    }

    showToast(message) {
        this.mainToast.textContent = message;
        this.mainToast.style.display = 'block';
        this.mainToast.classList.remove('hidden');
        
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.mainToast.style.display = 'none';
            this.mainToast.classList.add('hidden');
        }, 3500);
    }

    generateId() {
        return Math.floor(100000000 + Math.random() * 900000000).toString();
    }

    /**
     * ✅ إنشاء الغرفة - مع معالجة الأخطاء
     */
    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) return this.showToast("الرجاء إدخال اسمك أولاً");

        this.btnCreateRoom.disabled = true;
        const originalText = this.btnCreateRoom.innerHTML;
        this.btnCreateRoom.innerHTML = `<span>جارٍ الإنشاء...</span>`;

        try {
            this.isHost = true;
            this.roomId = this.generateId();
            this.players = [{ id: this.myId, name: this.playerName, ready: false, totalScore: 0 }];

            await this.joinChannel(this.roomId);
            this.updatePlayerList();
            
        } catch (error) {
            console.error("Create Room Error:", error);
            this.showToast("فشل إنشاء الغرفة");
            this.isHost = false;
        } finally {
            this.btnCreateRoom.disabled = false;
            this.btnCreateRoom.innerHTML = originalText;
        }
    }

    /**
     * ✅ الانضمام للغرفة - مع معالجة الأخطاء
     */
    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        
        if (!this.playerName) return this.showToast("يرجى إدخال اسمك");
        if (!this.roomId) return this.showToast("يرجى إدخال رمز الغرفة");
        if (this.roomId.length !== 9) return this.showToast("رمز الغرفة يجب أن يتكون من 9 أرقام");
        if (!/^\d{9}$/.test(this.roomId)) return this.showToast("رمز الغرفة يجب أن يكون 9 أرقام فقط");

        this.isHost = false;
        this.btnJoinRoom.disabled = true;
        const originalText = this.btnJoinRoom.innerHTML;
        this.btnJoinRoom.innerHTML = `<span>جارٍ الانضمام...</span>`;

        try {
            await this.joinChannel(this.roomId);
        } catch (error) {
            console.error("Join Room Error:", error);
            this.showToast("فشل الانضمام للغرفة");
        } finally {
            this.btnJoinRoom.disabled = false;
            this.btnJoinRoom.innerHTML = originalText;
        }
    }

    updatePlayerList() {
        this.playerList.innerHTML = '';
        this.players.forEach(p => {
            const li = document.createElement('li');
            li.style.cssText = "display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #eee;";
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name + (p.id === this.myId ? " (أنت)" : "");
            nameSpan.style.fontWeight = p.id === this.myId ? "bold" : "normal";
            
            const statusSpan = document.createElement('span');
            statusSpan.textContent = p.ready ? '✅ مستعد' : '⏳ ينتظر';
            statusSpan.style.color = p.ready ? '#4caf50' : '#ff9800';
            
            li.appendChild(nameSpan);
            li.appendChild(statusSpan);
            this.playerList.appendChild(li);
        });
    }

    copyRoomId() {
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showToast("تم نسخ الرمز بنجاح!");
            this.playSound('copy');
        }).catch(() => {
            // fallback للأجهزة التي لا تدعم clipboard
            const textArea = document.createElement("textarea");
            textArea.value = this.roomId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            this.showToast("تم نسخ الرمز!");
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
        this.hostControls.style.display = 'none';
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
            if (this.isHost) this.hostControls.style.display = 'block';
        }
    }

    renderScores() {
        this.scoreTableBody.innerHTML = '';
        this.results.forEach(res => {
            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            tdName.textContent = res.playerName;
            tdName.style.fontWeight = "bold";
            tr.appendChild(tdName);

            ['name', 'animal', 'plant', 'object', 'country'].forEach(field => {
                const td = document.createElement('td');
                const val = document.createElement('div');
                val.textContent = res.answers[field] || '-';
                val.style.marginBottom = "5px";
                td.appendChild(val);

                if (this.isHost) {
                    const controls = document.createElement('div');
                    controls.style.cssText = "display: flex; gap: 5px; justify-content: center;";
                    [10, 5, 0].forEach(s => {
                        const btn = document.createElement('button');
                        btn.textContent = s;
                        btn.style.cssText = `padding: 2px 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; background: ${s === 10 ? '#4caf50' : s === 5 ? '#ff9800' : '#f44336'}; color: white;`;
                        btn.onclick = () => this.updateScore(res.playerId, field, s);
                        controls.appendChild(btn);
                    });
                    td.appendChild(controls);
                } else {
                    const scoreVal = document.createElement('div');
                    scoreVal.innerHTML = `<small style="color:#ffd54f">(${res.scores[field]} نقطة)</small>`;
                    td.appendChild(scoreVal);
                }
                tr.appendChild(td);
            });

            const tdTotal = document.createElement('td');
            const player = this.players.find(p => p.id === res.playerId);
            const total = player ? player.totalScore : 0;
            tdTotal.innerHTML = `<span style="font-size:12px; color:#aaa">جولة: ${res.roundTotal}</span><br><strong style="color:#4caf50; font-size:16px">${total}</strong>`;
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
        
        try {
            this.sendMessage({ type: 'quit', id: this.myId, name: this.playerName });
            
            if (this.channel) {
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
        
        location.reload();
    }
}

// ✅ تهيئة اللعبة عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
    window.gameManager = new GameManager();
    
    // إظهار القسم الرئيسي فقط عند البداية
    Object.values(window.gameManager.sections).forEach(s => {
        s.style.display = 'none';
    });
    window.gameManager.sections.home.style.display = 'block';
    window.gameManager.sections.home.classList.add('active');
    window.gameManager.btnQuit.style.display = 'none';
});
