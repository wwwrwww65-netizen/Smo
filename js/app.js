/**
 * لعبة اسم حيوان نبات - الإصدار المطور باستخدام Agora RTM v2
 * تم إصلاح جميع الأخطاء - 2025
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
        this.isSubscribed = false;

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
     * ✅ تهيئة Agora RTM v2 - الطريقة الصحيحة
     */
    async initRTM() {
        try {
            console.log('🔄 Initializing RTM...');
            
            // إنشاء RTM Client
            this.rtmClient = new AgoraRTM.RTM(APP_ID, this.myId);
            
            // ✅ مستمع حالة الاتصال
            this.rtmClient.addEventListener('status', (event) => {
                console.log('📡 RTM Status:', event.state);
                if (event.state === 'CONNECTED') {
                    this.isLoggedIn = true;
                    console.log('✅ RTM Connected');
                } else if (event.state === 'DISCONNECTED') {
                    this.isLoggedIn = false;
                    this.showToast("⚠️ انقطع الاتصال بالخادم");
                }
            });

            // تسجيل الدخول
            await this.rtmClient.login();
            console.log('✅ RTM Login Success - UID:', this.myId);
            
        } catch (error) {
            console.error("❌ RTM Init Error:", error);
            this.showToast("فشل الاتصال: " + (error.message || "تحقق من App ID"));
        }
    }

    /**
     * ✅ الانضمام للقناة - API صحيح لـ RTM v2
     */
    async joinChannel(channelId) {
        try {
            if (!this.rtmClient) {
                throw new Error("RTM Client not initialized");
            }
            
            if (!this.isLoggedIn) {
                console.log('⏳ Waiting for login...');
                await new Promise(resolve => {
                    const checkLogin = setInterval(() => {
                        if (this.isLoggedIn) {
                            clearInterval(checkLogin);
                            resolve();
                        }
                    }, 100);
                    setTimeout(() => {
                        clearInterval(checkLogin);
                        resolve();
                    }, 5000);
                });
            }

            if (!this.isLoggedIn) {
                throw new Error("Failed to login to RTM");
            }

            this.roomId = channelId;
            console.log('🔄 Joining channel:', channelId);
            
            // ✅ إنشاء Channel instance (الطريقة الصحيحة)
            this.channel = this.rtmClient.createChannel(channelId);
            
            // ✅ إضافة مستمعي الأحداث على Channel
            this.channel.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.message.text);
                    this.handleMessage(event.publisher, data);
                } catch (e) {
                    console.error("Message parse error:", e);
                }
            });

            this.channel.addEventListener('presence', (event) => {
                console.log('👥 Presence Event:', event.eventType, event.publisher);
                
                if (event.eventType === 'REMOTE_JOIN') {
                    if (event.publisher !== this.myId) {
                        this.showToast(`👋 انضم لاعب جديد`);
                        if (this.isHost) {
                            setTimeout(() => this.syncState(), 500);
                        }
                    }
                } else if (event.eventType === 'REMOTE_LEAVE') {
                    this.handlePlayerLeave(event.publisher);
                }
            });

            this.channel.addEventListener('error', (error) => {
                console.error('❌ Channel Error:', error);
                this.showToast("خطأ في القناة: " + error.reason);
            });

            // ✅ الانضمام للقناة
            await this.channel.join();
            this.isSubscribed = true;
            console.log('✅ Successfully joined channel:', channelId);
            
            // إرسال رسالة الانضمام
            setTimeout(() => {
                this.sendMessage({
                    type: 'join',
                    name: this.playerName,
                    id: this.myId
                });
            }, 300);

        } catch (error) {
            console.error("❌ Join Channel Error:", error);
            this.showToast("فشل الانضمام: " + (error.message || "خطأ غير معروف"));
            throw error;
        }
    }

    /**
     * ✅ إرسال رسالة - API صحيح
     */
    async sendMessage(message) {
        if (!this.channel) {
            console.warn("⚠️ Channel not available");
            return;
        }
        
        try {
            await this.channel.sendMessage({ 
                text: JSON.stringify(message) 
            });
        } catch (err) {
            console.error("❌ Send Message Error:", err);
        }
    }

    handleMessage(publisher, data) {
        // تجاهل رسائلي الخاصة
        if (publisher === this.myId && data.type !== 'sync-state') return;

        console.log('📨 Message received:', data.type, 'from:', publisher);

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
                if (this.isHost) {
                    this.handleAnswers(data.id, data.answers);
                }
                break;

            case 'results-update':
                this.results = data.results || [];
                this.players = data.players || [];
                this.renderScores();
                if (!this.isSectionActive('score')) {
                    this.showSection('score');
                }
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
        if (this.isHost) {
            this.syncState();
        }
    }

    syncState() {
        if (!this.isHost || !this.channel) return;

        const gameState = this.getCurrentSection();
        
        this.sendMessage({
            type: 'sync-state',
            players: this.players,
            gameState: gameState,
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

    /**
     * ✅ تبديل الأقسام - متوافق مع CSS
     */
    showSection(name) {
        this.playSound('click');
        
        // إزالة active من جميع الأقسام
        Object.values(this.sections).forEach(s => {
            s.classList.remove('active');
        });
        
        // إضافة active للقسم المطلوب
        this.sections[name].classList.add('active');

        // إدارة زر الخروج
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

    /**
     * ✅ إنشاء الغرفة - مع معالجة كاملة للأخطاء
     */
    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) {
            this.showToast("⚠️ الرجاء إدخال اسمك أولاً");
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
            this.showToast("❌ فشل إنشاء الغرفة: " + error.message);
            this.isHost = false;
            this.roomId = "";
        } finally {
            this.btnCreateRoom.disabled = false;
            this.btnCreateRoom.innerHTML = originalText;
        }
    }

    /**
     * ✅ الانضمام للغرفة - مع تحقق من صحة الرمز
     */
    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();
        
        if (!this.playerName) {
            this.showToast("⚠️ يرجى إدخال اسمك");
            return;
        }
        if (!this.roomId) {
            this.showToast("⚠️ يرجى إدخال رمز الغرفة");
            return;
        }
        if (this.roomId.length !== 9 || !/^\d{9}$/.test(this.roomId)) {
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
            this.showToast("❌ فشل الانضمام: " + error.message);
        } finally {
            this.btnJoinRoom.disabled = false;
            this.btnJoinRoom.innerHTML = originalText;
        }
    }

    updatePlayerList() {
        this.playerList.innerHTML = '';
        
        if (this.players.length === 0) {
            this.playerList.innerHTML = '<li style="text-align: center; color: rgba(255,255,255,0.5);">لا يوجد لاعبين</li>';
            return;
        }
        
        this.players.forEach(p => {
            const li = document.createElement('li');
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name + (p.id === this.myId ? " (أنت)" : "");
            if (p.id === this.myId) {
                nameSpan.style.color = '#ffd54f';
                nameSpan.style.fontWeight = 'bold';
            }
            
            const statusSpan = document.createElement('span');
            statusSpan.textContent = p.ready ? '✅ مستعد' : '⏳ ينتظر';
            statusSpan.style.color = p.ready ? '#4caf50' : '#ff9800';
            statusSpan.style.fontSize = '14px';
            
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
            // Fallback
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
        if (allReady && this.players.length >= 1) {
            // اختيار حرف عشوائي
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
        
        // إعادة تفعيل زر الجاهزية للجولة القادمة
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
            this.sendMessage({ 
                type: 'submit-answers', 
                id: this.myId, 
                answers: answers 
            });
        }
    }

    handleAnswers(playerId, answers) {
        // تجنب التكرار
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

        // إذا استلمنا إجابات الجميع
        if (this.results.length === this.players.length) {
            this.renderScores();
            this.sendMessage({ 
                type: 'results-update', 
                results: this.results, 
                players: this.players 
            });
            this.showSection('score');
            if (this.isHost) {
                this.hostControls.classList.remove('hidden');
            }
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

            // اسم اللاعب
            const tdName = document.createElement('td');
            tdName.textContent = res.playerName;
            tdName.style.fontWeight = 'bold';
            tr.appendChild(tdName);

            // الإجابات والنقاط
            ['name', 'animal', 'plant', 'object', 'country'].forEach(field => {
                const td = document.createElement('td');
                
                const answer = res.answers[field] || '-';
                const answerDiv = document.createElement('div');
                answerDiv.textContent = answer;
                answerDiv.style.marginBottom = '5px';
                answerDiv.style.fontWeight = '500';
                td.appendChild(answerDiv);

                if (this.isHost) {
                    const controls = document.createElement('div');
                    controls.className = 'score-controls';
                    
                    [10, 5, 0].forEach(s => {
                        const btn = document.createElement('button');
                        btn.textContent = s;
                        btn.className = `btn-score btn-score-${s}`;
                        
                        // تمييز الزر المختار
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

            // المجموع
            const tdTotal = document.createElement('td');
            const player = this.players.find(p => p.id === res.playerId);
            const totalScore = player ? player.totalScore : 0;
            
            tdTotal.innerHTML = `
                <div style="font-size: 12px; color: rgba(255,255,255,0.7);">جولة: ${res.roundTotal}</div>
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

        // خصم النقاط القديمة
        res.roundTotal -= res.scores[field];
        player.totalScore -= res.scores[field];

        // إضافة النقاط الجديدة
        res.scores[field] = points;
        res.roundTotal += points;
        player.totalScore += points;

        this.renderScores();
        this.syncState();
    }

    nextRound() {
        // إعادة تعيين الجاهزية
        this.players.forEach(p => p.ready = false);
        this.updatePlayerList();

        // اختيار حرف جديد
        const letter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
        
        this.sendMessage({ type: 'start-game', letter: letter });
        this.syncState();
        this.startGame(letter);
    }

    async quitGame() {
        this.playSound('quit');
        this.showToast("🚪 جارٍ الخروج...");
        
        try {
            // إرسال رسالة الخروج
            if (this.channel) {
                await this.sendMessage({ 
                    type: 'quit', 
                    id: this.myId, 
                    name: this.playerName 
                });
                
                // مغادرة القناة
                await this.channel.leave();
                this.channel = null;
            }
            
            // تسجيل الخروج من RTM
            if (this.rtmClient) {
                await this.rtmClient.logout();
                this.rtmClient = null;
            }
            
        } catch (error) {
            console.error("Quit Error:", error);
        }
        
        // إعادة تحميل الصفحة
        setTimeout(() => {
            location.reload();
        }, 500);
    }
}

// ✅ تهيئة اللعبة عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Game initializing...');
    window.gameManager = new GameManager();
});
