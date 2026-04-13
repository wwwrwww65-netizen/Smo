/**
 * إدارة حالة اللعبة (GameManager)
 * تتولى هذه الفئة إدارة الاتصالات، اللاعبين، ومنطق اللعبة
 */
class GameManager {
    constructor() {
        this.peer = null;
        this.connections = []; // للمضيف: قائمة بالاتصالات مع الضيوف
        this.conn = null;      // للضيف: الاتصال مع المضيف
        this.isHost = false;
        this.playerName = "";
        this.roomId = "";
        this.players = [];     // قائمة بأسماء اللاعبين وحالاتهم
        this.gameState = 'home'; // home, lobby, game, score
        this.arabicLetters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
        this.currentLetter = "";
        this.results = [];

        this.initElements();
        this.initEvents();
    }

    // تهيئة عناصر واجهة المستخدم
    initElements() {
        this.sections = {
            home: document.getElementById('section-home'),
            lobby: document.getElementById('section-lobby'),
            game: document.getElementById('section-game'),
            score: document.getElementById('section-score')
        };
        this.playerNameInput = document.getElementById('player-name');
        this.roomIdInput = document.getElementById('room-id-input');
        this.displayRoomId = document.getElementById('display-room-id');
        this.playerList = document.getElementById('player-list');
        this.letterDisplay = document.getElementById('random-letter-display');
        this.scoreTableBody = document.querySelector('#score-table tbody');
    }

    // تهيئة أحداث الأزرار
    initEvents() {
        document.getElementById('btn-create-room').addEventListener('click', () => this.createRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.joinRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.setReady());
        document.getElementById('btn-stop').addEventListener('click', () => this.stopGame());
        document.getElementById('btn-new-round').addEventListener('click', () => this.newRound());
    }

    // الانتقال بين الأقسام
    showSection(sectionName) {
        Object.values(this.sections).forEach(s => s.classList.remove('active'));
        this.sections[sectionName].classList.add('active');
        this.gameState = sectionName;
    }

    // التعامل مع أخطاء PeerJS
    handlePeerErrors() {
        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err.type);
            let msg = "حدث خطأ في الاتصال";
            if (err.type === 'peer-unavailable') msg = "رمز الغرفة غير صحيح أو المضيف غير متصل";
            if (err.type === 'network') msg = "خطأ في الشبكة، يرجى التحقق من اتصالك";
            alert(msg);
        });
    }

    // إنشاء غرفة جديدة (المضيف)
    createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        if (!this.playerName) return alert("يرجى إدخال اسمك");

        this.isHost = true;
        this.peer = new Peer();
        this.handlePeerErrors();

        this.peer.on('open', (id) => {
            this.roomId = id;
            this.displayRoomId.innerText = id;
            this.players = [{ name: this.playerName, id: id, ready: false }];
            this.updatePlayerList();
            this.showSection('lobby');
        });

        this.peer.on('connection', (conn) => {
            this.handleHostConnection(conn);
        });
    }

    // الانضمام لغرفة موجودة (الضيف)
    joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim();

        if (!this.playerName || !this.roomId) return alert("يرجى إدخال اسمك ورمز الغرفة");

        this.isHost = false;
        this.peer = new Peer();
        this.handlePeerErrors();

        this.peer.on('open', (id) => {
            this.conn = this.peer.connect(this.roomId);
            this.handleGuestConnection(this.conn);
        });
    }

    // التعامل مع الاتصالات القادمة للمضيف
    handleHostConnection(conn) {
        conn.on('open', () => {
            // انتظار بيانات اللاعب (الاسم)
            conn.on('data', (data) => {
                if (data.type === 'join') {
                    this.players.push({ name: data.name, id: conn.peer, ready: false });
                    this.connections.push(conn);
                    this.broadcastPlayers();
                    this.updatePlayerList();
                } else if (data.type === 'ready') {
                    const player = this.players.find(p => p.id === conn.peer);
                    if (player) player.ready = true;
                    this.updatePlayerList();
                    this.broadcastPlayers();
                    this.checkAllReady();
                } else if (data.type === 'stop') {
                    this.broadcastStop();
                } else if (data.type === 'submit-answers') {
                    this.handleAnswers(conn.peer, data.answers);
                }
            });
        });
    }

    // التعامل مع الاتصال بالمضيف للضيف
    handleGuestConnection(conn) {
        conn.on('open', () => {
            conn.send({ type: 'join', name: this.playerName });
            this.showSection('lobby');
            this.displayRoomId.innerText = this.roomId;
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
            } else if (data.type === 'show-scores') {
                this.showScores(data.results);
            }
        });

        conn.on('close', () => {
            alert("انقطع الاتصال بالمضيف");
            location.reload();
        });
    }

    // تحديث قائمة اللاعبين في الواجهة (بشكل آمن من XSS)
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

    // إرسال تحديثات قائمة اللاعبين للجميع
    broadcastPlayers() {
        this.connections.forEach(c => c.send({ type: 'players-update', players: this.players }));
    }

    // الضغط على زر "أنا مستعد"
    setReady() {
        if (this.isHost) {
            const hostPlayer = this.players.find(p => p.id === this.roomId);
            if (hostPlayer) hostPlayer.ready = true;
            this.updatePlayerList();
            this.broadcastPlayers();
            this.checkAllReady();
        } else {
            this.conn.send({ type: 'ready' });
        }
        document.getElementById('btn-ready').disabled = true;
        document.getElementById('btn-ready').innerText = "في انتظار البقية...";
    }

    // التحقق من استعداد الجميع لبدء اللعبة (للمضيف فقط)
    checkAllReady() {
        if (this.players.length > 1 && this.players.every(p => p.ready)) {
            const randomLetter = this.arabicLetters[Math.floor(Math.random() * this.arabicLetters.length)];
            this.currentLetter = randomLetter;
            this.broadcastStart(randomLetter);
            this.startGame(randomLetter);
        }
    }

    // بث إشارة البدء (للمضيف)
    broadcastStart(letter) {
        this.connections.forEach(c => c.send({ type: 'start-game', letter: letter }));
    }

    // بدء اللعبة فعلياً في الواجهة
    startGame(letter) {
        this.currentLetter = letter;
        this.letterDisplay.innerText = letter;
        this.results = [];
        this.clearInputs();
        this.enableInputs();
        this.showSection('game');
    }

    // مسح الحقول قبل الجولة
    clearInputs() {
        document.querySelectorAll('.game-field').forEach(f => f.value = '');
    }

    // تفعيل الحقول
    enableInputs() {
        document.querySelectorAll('.game-field').forEach(f => f.disabled = false);
        document.getElementById('btn-stop').disabled = false;
    }

    // تعطيل الحقول عند انتهاء الوقت أو ضغط البزر
    disableInputs() {
        document.querySelectorAll('.game-field').forEach(f => f.disabled = true);
        document.getElementById('btn-stop').disabled = true;
    }

    // الضغط على زر "انتهيت!"
    stopGame() {
        if (this.isHost) {
            this.broadcastStop();
        } else {
            this.conn.send({ type: 'stop' });
        }
    }

    // بث إشارة التوقف للجميع (للمضيف)
    broadcastStop() {
        this.disableInputs();
        this.submitAnswers();
        this.connections.forEach(c => c.send({ type: 'stop-game' }));
    }

    // إرسال الإجابات للمضيف
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
        } else {
            this.conn.send({ type: 'submit-answers', answers: answers });
        }
    }

    // تجميع الإجابات (للمضيف)
    handleAnswers(playerId, answers) {
        const player = this.players.find(p => p.id === playerId);
        this.results.push({ playerName: player.name, ...answers });

        // إذا وصلت إجابات الجميع
        if (this.results.length === this.players.length) {
            this.showScores(this.results);
            this.connections.forEach(c => c.send({ type: 'show-scores', results: this.results }));
        }
    }

    // عرض جدول النتائج (بشكل آمن من XSS)
    showScores(results) {
        this.scoreTableBody.innerHTML = '';
        results.forEach(res => {
            const tr = document.createElement('tr');

            const fields = ['playerName', 'name', 'animal', 'plant', 'object', 'country'];
            fields.forEach(field => {
                const td = document.createElement('td');
                td.textContent = res[field];
                tr.appendChild(td);
            });

            this.scoreTableBody.appendChild(tr);
        });
        this.showSection('score');
    }

    // العودة للوبي لجولة جديدة
    newRound() {
        this.players.forEach(p => p.ready = false);
        document.getElementById('btn-ready').disabled = false;
        document.getElementById('btn-ready').innerText = "أنا مستعد";
        this.updatePlayerList();
        if (this.isHost) {
            this.broadcastPlayers();
        }
        this.showSection('lobby');
    }
}

// تشغيل اللعبة عند تحميل الصفحة
window.onload = () => {
    window.gameManager = new GameManager();
};
