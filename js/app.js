import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, child, remove, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL }
    from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfcHB-d68R2Kf-jisYudWKIjHZ9lgjUdM",
  authDomain: "smo1-5f999.firebaseapp.com",
  projectId: "smo1-5f999",
  storageBucket: "smo1-5f999.firebasestorage.app",
  messagingSenderId: "376255463194",
  appId: "1:376255463194:web:26bd4efe2d8f4c279f76a3",
  measurementId: "G-T103PXE8LF"
};

class SmoManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
        this.auth = getAuth(this.app);
        this.storage = getStorage(this.app);

        this.user = null; // Local user data
        this.peer = null;
        this.activeCalls = {};
        this.localStream = null;
        this.audioPool = [];

        this.initElements();
        this.initEvents();
        this.checkSession();
        this.initAudioPool();
    }

    initAudioPool() {
        for (let i = 0; i < 10; i++) {
            const audio = new Audio();
            audio.autoplay = true;
            this.audioPool.push(audio);
        }
    }

    initElements() {
        this.roomLayer = document.getElementById('room-layer');
        this.gameLayer = document.getElementById('game-layer');
        this.chatLayer = document.getElementById('chat-layer');
        this.gameFrame = document.getElementById('game-frame');

        // Media Elements
        this.ytPlayerContainer = document.getElementById('youtube-player-container');
        this.genericVideoContainer = document.getElementById('generic-video-container');
        this.genericVideo = document.getElementById('generic-video');
        this.browserContainer = document.getElementById('browser-container');
        this.browserIframe = document.getElementById('browser-iframe');
        this.vidPlaceholder = document.getElementById('vid-placeholder');
        this.vidTitle = document.getElementById('vid-title');
        this.vidOwner = document.getElementById('vid-owner');

        this.roomTabs = document.querySelectorAll('.room-tab');
        this.roomsList = document.getElementById('rooms-list');
        this.socialFeed = document.getElementById('social-feed');
        this.inboxList = document.getElementById('inbox-list');
        this.profileSection = document.getElementById('tab-profile');
        // Screens
        this.screenWelcome = document.getElementById('screen-welcome');
        this.screenAuth = document.getElementById('screen-auth');
        this.appMain = document.getElementById('app-main');

        // Auth
        this.authTabs = document.querySelectorAll('.auth-tab');
        this.authForms = {
            signup: document.getElementById('auth-signup'),
            login: document.getElementById('auth-login')
        };
        this.genderBtns = document.querySelectorAll('.gender-btn');
        this.selectedGender = null;

        // Navigation
        this.navItems = document.querySelectorAll('.nav-item');
        this.tabs = document.querySelectorAll('.tab-pane');

        // Profile
        this.miniAvatar = document.getElementById('mini-avatar');

        this.mainToast = document.getElementById('main-toast');

        // Close buttons
        document.getElementById('btn-close-room').addEventListener('click', () => {
            this.roomLayer.classList.add('hidden');
        });
        document.getElementById('btn-close-game').addEventListener('click', () => {
            this.gameLayer.classList.add('hidden');
            this.gameFrame.src = "";
        });
        document.getElementById('btn-close-chat').addEventListener('click', () => {
            this.chatLayer.classList.add('hidden');
        });

        document.getElementById('btn-open-media-control').addEventListener('click', () => {
            document.getElementById('modal-media-control').classList.remove('hidden');
        });
        document.getElementById('btn-close-media-modal').addEventListener('click', () => {
            document.getElementById('modal-media-control').classList.add('hidden');
        });
        document.getElementById('btn-load-media').addEventListener('click', () => this.ownerLoadMedia());

        document.getElementById('btn-playlist').addEventListener('click', () => {
            document.getElementById('modal-playlist').classList.remove('hidden');
        });
        document.getElementById('btn-close-playlist-modal').addEventListener('click', () => {
            document.getElementById('modal-playlist').classList.add('hidden');
        });

        document.getElementById('btn-browser-go').addEventListener('click', () => {
            const url = document.getElementById('browser-url-input').value.trim();
            if (url) this.syncBrowser(url);
        });

        // Media Type Selectors
        const typeBtns = ['type-auto', 'type-yt', 'type-web'];
        typeBtns.forEach(id => {
            document.getElementById(id).onclick = (e) => {
                typeBtns.forEach(b => document.getElementById(b).classList.remove('active'));
                e.target.classList.add('active');
                this.selectedMediaType = id.replace('type-', '');
            };
        });
        this.selectedMediaType = 'auto';
    }

    initEvents() {
        // Welcome
        document.getElementById('btn-welcome-start').addEventListener('click', () => {
            this.screenWelcome.classList.add('hidden');
            this.screenAuth.classList.remove('hidden');
        });

        // Auth Tabs
        this.authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.authTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                Object.keys(this.authForms).forEach(f => {
                    this.authForms[f].classList.toggle('hidden', f !== target);
                });
            });
        });

        // Gender Selection
        this.genderBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.genderBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedGender = btn.dataset.gender;
            });
        });

        // Sign Up
        document.getElementById('btn-do-signup').addEventListener('click', () => this.handleSignUp());
        document.getElementById('btn-do-login').addEventListener('click', () => this.handleLogin());

        // Navigation
        this.navItems.forEach(item => {
            item.addEventListener('click', () => {
                this.navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const targetTab = item.dataset.tab;
                this.tabs.forEach(t => {
                    t.classList.toggle('active', t.id === `tab-${targetTab}`);
                });
                if (targetTab === 'rooms') this.renderRoomsList();
                if (targetTab === 'social') this.renderSocialFeed();
                if (targetTab === 'inbox') this.renderInbox();
                if (targetTab === 'profile') this.renderProfile();
            });
        });

        // Room Tabs
        this.roomTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.roomTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderRoomsList(tab.dataset.roomTab);
            });
        });
    }

    showToast(msg) {
        this.mainToast.textContent = msg;
        this.mainToast.classList.remove('hidden');
        setTimeout(() => this.mainToast.classList.add('hidden'), 3000);
    }

    async checkSession() {
        const savedUser = localStorage.getItem('smo_user');
        if (savedUser) {
            this.user = JSON.parse(savedUser);
            // Ensure Firebase Auth is initialized
            signInAnonymously(this.auth).then(() => {
                this.launchApp();
            });
        }
    }

    async generateUniqueId() {
        let unique = false;
        let id = "";
        while (!unique) {
            id = "100" + Math.floor(100000 + Math.random() * 900000).toString().substring(0,6);
            const snapshot = await get(child(ref(this.db), `users/${id}`));
            if (!snapshot.exists()) unique = true;
        }
        return id;
    }

    async handleSignUp() {
        const username = document.getElementById('signup-username').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;

        if (!username || !password || !this.selectedGender) {
            this.showToast("يرجى إكمال جميع البيانات واختيار الجنس");
            return;
        }
        if (password !== confirm) {
            this.showToast("كلمات المرور غير متطابقة");
            return;
        }

        try {
            this.showToast("جاري إنشاء الحساب...");

            // Bypass Storage and use Dicebear for avatars
            const userId = await this.generateUniqueId();
            const hashedPassword = CryptoJS.SHA256(password).toString();

            // Generate Dicebear avatar URL based on gender
            // male -> adventurer, female -> adventurer (different seed or different collection)
            // Let's use 'adventurer' for both but with gender-specific seeds or different styles
            const sprite = this.selectedGender === 'male' ? 'adventurer' : 'adventurer';
            const avatarUrl = `https://api.dicebear.com/7.x/${sprite}/svg?seed=${username}&flip=true${this.selectedGender === 'female' ? '&hair=long' : ''}`;

            const userData = {
                id: userId,
                username: username,
                password: hashedPassword,
                avatar: avatarUrl,
                gender: this.selectedGender,
                gold: 1000,
                lv: 1,
                vip: 0
            };

            // Ensure Auth is ready
            if (!this.auth.currentUser) {
                await signInAnonymously(this.auth);
            }

            await set(ref(this.db, `users/${userId}`), userData);
            // Also index by username for login
            await set(ref(this.db, `usernames/${username}`), userId);

            this.user = userData;
            localStorage.setItem('smo_user', JSON.stringify(this.user));
            this.launchApp();

        } catch (e) {
            console.error(e);
            this.showToast("حدث خطأ أثناء إنشاء الحساب");
        }
    }

    async handleLogin() {
        const identifier = document.getElementById('login-identifier').value.trim();
        const password = document.getElementById('login-password').value;

        if (!identifier || !password) return;

        try {
            await signInAnonymously(this.auth);
            let userId = identifier;
            // Check if identifier is username
            const nameSnap = await get(ref(this.db, `usernames/${identifier}`));
            if (nameSnap.exists()) userId = nameSnap.val();

            const userSnap = await get(ref(this.db, `users/${userId}`));
            if (!userSnap.exists()) {
                this.showToast("المستخدم غير موجود");
                return;
            }

            const userData = userSnap.val();
            const hashedPassword = CryptoJS.SHA256(password).toString();

            if (userData.password === hashedPassword) {
                this.user = userData;
                localStorage.setItem('smo_user', JSON.stringify(this.user));
                this.launchApp();
            } else {
                this.showToast("كلمة المرور غير صحيحة");
            }
        } catch (e) {
            this.showToast("فشل تسجيل الدخول");
        }
    }

    launchApp() {
        this.screenWelcome.classList.add('hidden');
        this.screenAuth.classList.add('hidden');
        this.appMain.classList.remove('hidden');

        // Update UI
        document.getElementById('gold-balance').textContent = this.user.gold;
        this.miniAvatar.src = this.user.avatar;

        this.renderGamesGrid();
        this.renderFriendsTracker();
    }

    renderFriendsTracker() {
        const tracker = document.getElementById('friends-tracker');
        const content = tracker.querySelector('.tracker-content');
        tracker.classList.remove('hidden');

        const activeFriends = [
            { name: 'سارة', room: 'عالم الأونو 🔥', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Sara' },
            { name: 'خالد', room: 'مجلس الرياض 🇸🇦', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Khaled' }
        ];

        content.innerHTML = '';
        activeFriends.forEach(f => {
            const item = document.createElement('div');
            item.className = 'tracker-item glass';
            item.innerHTML = `
                <img src="${f.avatar}" class="tracker-avatar">
                <span>${f.name} في ${f.room}</span>
                <button class="btn-primary" style="padding: 2px 8px; font-size: 0.6rem; margin-right: 5px;">انضمام</button>
            `;
            content.appendChild(item);
        });
    }

    renderGamesGrid() {
        const games = [
            { id: 'ono', name: 'أونو No Mercy', icon: '🃏', color: '#ff4b2b', status: 'نشط', active: true },
            { id: 'animal', name: 'حيوان نبات', icon: '🦁', color: '#6366f1', status: 'نشط', active: true },
            { id: 'carrom', name: 'كيرم', icon: '⚪', color: '#fbbf24', status: 'قريباً', active: false },
            { id: 'jackaroo', name: 'جاكارو', icon: '🎲', color: '#10b981', status: 'قريباً', active: false },
            { id: 'candy', name: 'كاندي بوم', icon: '🍬', color: '#ec4899', status: 'قريباً', active: false },
            { id: 'domino', name: 'دومينو 50', icon: '🀄', color: '#64748b', status: 'قريباً', active: false },
            { id: '8ball', name: '8 بول', icon: '🎱', color: '#3b82f6', status: 'قريباً', active: false },
            { id: 'crossword', name: 'كلمات متقاطعة', icon: '📝', color: '#10b981', status: 'قريباً', active: false }
        ];

        const grid = document.getElementById('games-grid');
        grid.innerHTML = '';
        games.forEach(g => {
            const card = document.createElement('div');
            card.className = `game-card glass ${g.active ? 'active-game' : ''}`;
            card.innerHTML = `
                <div class="status-tag" style="color:${g.active ? 'var(--accent-color)' : 'inherit'}">${g.status}</div>
                <div class="icon-3d">${g.icon}</div>
                <div class="game-name">${g.name}</div>
            `;
            card.addEventListener('click', () => {
                if (g.status === 'نشط') {
                    this.openGame(g.id);
                } else {
                    this.showToast("هذه اللعبة ستتوفر قريباً!");
                }
            });
            grid.appendChild(card);
        });
    }

    openGame(gameId) {
        this.gameLayer.classList.remove('hidden');
        document.getElementById('game-title-text').textContent = gameId === 'ono' ? 'لعبة اونو' : 'حيوان نبات';

        let url = "";
        if (gameId === 'ono') {
            const roomId = Math.floor(100000 + Math.random() * 900000).toString();
            url = `./ono.html?roomID=${roomId}&username=${encodeURIComponent(this.user.username)}&role=owner`;
        } else {
            // Animal Plant
            url = `./legacy_game.html`;
        }

        this.gameFrame.src = url;
    }

    async renderRoomsList(type = 'discover') {
        if (type === 'myrooms') {
            this.roomsList.innerHTML = `
                <div style="text-align:center; padding: 40px 20px; color: var(--text-dim);">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🏘️</div>
                    <p>لا توجد غرف متابعة حالياً</p>
                    <button class="btn-primary" style="margin-top:20px" onclick="window.smoManager.roomTabs[0].click()">البحث عن غرف موصى بها</button>
                </div>
            `;
            return;
        }

        try {
            const snap = await get(ref(this.db, 'rooms'));
            let rooms = [];
            if (snap.exists()) {
                rooms = Object.entries(snap.val()).map(([id, data]) => ({ id, ...data }));
            }

            // Fallback mock if no active rooms
            if (rooms.length === 0) {
                rooms = [
                    { id: '123456', name: 'مجلس الرياض 🇸🇦', hostName: 'خالد', playersCount: 12, tags: ['الرياض', 'سوالف'] },
                    { id: '654321', name: 'عالم الأونو 🔥', hostName: 'سارة', playersCount: 4, tags: ['أونو', 'تحدي'] }
                ];
            }

            this.roomsList.innerHTML = '';
            rooms.forEach(r => {
                const card = document.createElement('div');
                card.className = 'room-card glass';
                card.innerHTML = `
                    <div class="room-cover">🎙️</div>
                    <div class="room-info">
                        <div class="room-name">${r.name || 'غرفة عامة'}</div>
                        <div class="room-meta">
                            <span>المضيف: ${r.hostName || 'غير معروف'}</span>
                            ${r.tags ? `<div class="room-tag">${r.tags[0]}</div>` : ''}
                        </div>
                    </div>
                    <div class="room-counter">${r.playersCount || 0}</div>
                `;
                card.addEventListener('click', () => this.joinRoom(r.id));
                this.roomsList.appendChild(card);
            });
        } catch (e) {
            console.error(e);
        }
    }

    joinRoom(roomId) {
        this.roomLayer.classList.remove('hidden');
        document.getElementById('room-id-tag').textContent = `ID: ${roomId}`;
        document.getElementById('room-title').textContent = "غرفة المحادثة";
        this.roomId = roomId;
        this.initPeer();
        this.listenToMediaSync();
    }

    listenToMediaSync() {
        onValue(ref(this.db, `rooms/${this.roomId}/media`), (snap) => {
            this.syncMedia(snap.val());
        });
        // Also listen to seats
        onValue(ref(this.db, `rooms/${this.roomId}/seats`), (snap) => {
            this.updateSeatsUI(snap.val());
        });
    }

    updateSeatsUI(seats) {
        const grid = document.querySelector('.seats-grid');
        grid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const seat = seats && seats[i];
            const div = document.createElement('div');
            div.className = `seat-circle ${seat ? 'occupied' : 'empty'}`;
            div.dataset.seatIndex = i;
            if (seat) {
                div.dataset.uid = seat.uid;
                div.innerHTML = `<img src="${seat.avatar}">`;
                if (seat.isSpeaking) div.classList.add('speaking');
            } else {
                div.innerHTML = '<div class="seat-plus">+</div>';
                div.onclick = () => this.joinSeat(i);
            }
            grid.appendChild(div);
        }
    }

    async joinSeat(index) {
        if (!this.user) return;
        const seatRef = ref(this.db, `rooms/${this.roomId}/seats/${index}`);
        await set(seatRef, {
            uid: this.user.id,
            username: this.user.username,
            avatar: this.user.avatar,
            isSpeaking: false
        });
        onDisconnect(seatRef).remove();
    }

    async initPeer() {
        if (this.peer || !this.user) return;

        this.peer = new Peer(this.user.id, {
            debug: 2
        });

        this.peer.on('open', (id) => {
            console.log('PeerJS: Connection opened:', id);
            this.listenToVoicePeers();
        });

        this.peer.on('call', (call) => {
            call.answer(this.localStream);
            this.handleCallStream(call);
        });
    }

    listenToVoicePeers() {
        // Logic to call others in the room
        // For now, we simulate room occupancy
        console.log("PeerJS: Listening for peers in room", this.roomId);
    }

    handleCallStream(call) {
        this.activeCalls[call.peer] = call;
        call.on('stream', (remoteStream) => {
            const audio = this.audioPool.find(el => !el.srcObject);
            if (audio) {
                audio.srcObject = remoteStream;
                audio.play().catch(() => {
                    this.showToast("اضغط لتفعيل الصوت 🔊");
                });
            }
            this.startVolumeDetection(remoteStream, call.peer);
        });
    }

    startVolumeDetection(stream, peerId) {
        if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const source = this.audioContext.createMediaStreamSource(stream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const check = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;

            const isSpeaking = avg > 10;
            this.updatePeerSpeakingState(peerId, isSpeaking);

            if (this.activeCalls[peerId]) requestAnimationFrame(check);
        };
        check();
    }

    updatePeerSpeakingState(peerId, isSpeaking) {
        // peerId is the UID of the user
        const frame = document.querySelector(`.seat-circle.occupied[data-uid="${peerId}"]`);
        if (frame) {
            if (isSpeaking) frame.classList.add('speaking');
            else frame.classList.remove('speaking');
        }
    }

    renderSocialFeed() {
        const posts = [
            { user: 'أحمد', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ahmed', content: 'اليوم فزت في اونو 5 مرات متتالية! من يتحداني؟ 😎', likes: 12, comments: 4, vip: 2, lv: 15 },
            { user: 'لينا', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Lina', content: 'أبحث عن فريق قوي للعب جاكارو الليلة 🎲', likes: 25, comments: 8, vip: 3, lv: 22 }
        ];

        this.socialFeed.innerHTML = '';
        posts.forEach(p => {
            const card = document.createElement('div');
            card.className = 'post-card glass';
            card.innerHTML = `
                <div class="post-header">
                    <img src="${p.avatar}" class="post-avatar">
                    <div class="post-user-info">
                        <div class="post-username">${p.user} <span class="vip-badge">VIP ${p.vip}</span></div>
                        <div class="post-lvl">Level ${p.lv}</div>
                    </div>
                </div>
                <div class="post-content">${p.content}</div>
                <div class="post-actions">
                    <div class="post-action">❤️ ${p.likes}</div>
                    <div class="post-action">💬 ${p.comments}</div>
                    <div class="post-action">🔗 مشاركة</div>
                </div>
            `;
            this.socialFeed.appendChild(card);
        });
    }

    renderInbox() {
        const chats = [
            { name: 'النظام', msg: 'مرحباً بك في سمو الأميرة! استمتع باللعب.', time: '10:30 ص', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=system' },
            { name: 'محمد', msg: 'يدعوك للعب أونو 🃏', time: 'أمس', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Moh' }
        ];

        this.inboxList.innerHTML = '';
        chats.forEach(c => {
            const item = document.createElement('div');
            item.className = 'chat-item glass';
            item.innerHTML = `
                <img src="${c.avatar}" class="tracker-avatar" style="width:50px; height:50px">
                <div class="chat-info">
                    <div class="chat-name">${c.name}</div>
                    <div class="chat-last-msg">${c.msg}</div>
                </div>
                <div class="chat-time">${c.time}</div>
            `;
            item.addEventListener('click', () => this.openChat(c.name));
            this.inboxList.appendChild(item);
        });
    }

    openChat(name) {
        this.chatLayer.classList.remove('hidden');
        document.getElementById('chat-user-name').textContent = name;
        const container = document.getElementById('chat-messages');
        container.innerHTML = `
            <div class="chat-bubble received">مرحباً بك! كيف يمكنني مساعدتك اليوم؟</div>
            <div class="chat-bubble sent">أهلاً، أنا بخير شكراً لك</div>
        `;

        if (name === 'محمد') {
            const card = document.createElement('div');
            card.className = 'interactive-card';
            card.innerHTML = `
                <div class="card-image"></div>
                <div class="card-body">
                    <div class="card-title">يدعوك محمد لمباراة أونو!</div>
                    <button class="btn-card-action">اذهب للعب 🎮</button>
                </div>
            `;
            card.querySelector('button').onclick = () => {
                this.chatLayer.classList.add('hidden');
                this.openGame('ono');
            };
            container.appendChild(card);
        }
    }

    // --- Watching Room Engine ---
    ownerLoadMedia() {
        const input = document.getElementById('media-url-input').value.trim();
        if (!input) return;

        let type = this.selectedMediaType;
        let url = input;
        let videoId = "";

        if (type === 'auto') {
            const ytMatch = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
            if (ytMatch && ytMatch[2].length === 11) {
                type = 'yt';
                videoId = ytMatch[2];
            } else if (url.match(/\.(mp4|webm|m3u8)/i)) {
                type = 'video';
            } else {
                type = 'web';
            }
        }

        const state = {
            type,
            url,
            videoId,
            state: 1,
            currentTime: 0,
            updatedAt: Date.now()
        };

        set(ref(this.db, `rooms/${this.roomId}/media`), state);
        document.getElementById('modal-media-control').classList.add('hidden');
    }

    syncMedia(state) {
        if (!state) return;
        this.ytPlayerContainer.classList.add('hidden');
        this.genericVideoContainer.classList.add('hidden');
        this.browserContainer.classList.add('hidden');
        this.vidPlaceholder.classList.add('hidden');

        if (state.type === 'yt') {
            this.ytPlayerContainer.classList.remove('hidden');
            this.playYouTube(state);
        } else if (state.type === 'video') {
            this.genericVideoContainer.classList.remove('hidden');
            this.playGenericVideo(state);
        } else if (state.type === 'web') {
            this.browserContainer.classList.remove('hidden');
            this.syncBrowser(state.url);
        } else {
            this.vidPlaceholder.classList.remove('hidden');
        }
    }

    playYouTube(state) {
        const id = state.videoId;
        const targetTime = (Date.now() - state.updatedAt) / 1000 + (state.currentTime || 0);

        if (!this.player) {
            this.player = new YT.Player('player', {
                height: '100%',
                width: '100%',
                videoId: id,
                playerVars: { 'autoplay': 1, 'playsinline': 1, 'start': Math.floor(targetTime) }
            });
        } else {
            const currentId = this.player.getVideoData().video_id;
            if (currentId !== id) {
                this.player.loadVideoById(id, targetTime);
            } else {
                const diff = Math.abs(this.player.getCurrentTime() - targetTime);
                if (diff > 5) this.player.seekTo(targetTime, true);
            }
        }
    }

    playGenericVideo(state) {
        const targetTime = (Date.now() - state.updatedAt) / 1000 + (state.currentTime || 0);
        if (this.genericVideo.src !== state.url) {
            this.genericVideo.src = state.url;
            this.genericVideo.currentTime = targetTime;
            this.genericVideo.play().catch(() => {});
        } else {
            const diff = Math.abs(this.genericVideo.currentTime - targetTime);
            if (diff > 5) this.genericVideo.currentTime = targetTime;
        }
    }

    syncBrowser(url) {
        let processedUrl = url;
        if (!url.startsWith('http')) processedUrl = 'https://' + url;
        // Google Search Fallback for browser
        if (processedUrl.includes('google.com')) {
             if (!processedUrl.includes('igu=1')) processedUrl += (processedUrl.includes('?') ? '&' : '?') + 'igu=1';
        }
        this.browserIframe.src = processedUrl;
    }

    renderProfile() {
        if (!this.user) return;
        this.profileSection.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar-big">
                    <img src="${this.user.avatar}">
                    <div class="vip-frame"></div>
                </div>
                <div class="profile-name">${this.user.username}</div>
                <div class="profile-id">ID: ${this.user.id}</div>
            </div>

            <div class="profile-stats glass" style="padding: 20px; border-radius: 24px;">
                <div class="stat-item">
                    <div class="stat-val">${this.user.lv}</div>
                    <div class="stat-label">المستوى</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val">${this.user.gold}</div>
                    <div class="stat-label">الذهب</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val">VIP ${this.user.vip}</div>
                    <div class="stat-label">الرتبة</div>
                </div>
            </div>

            <div class="shelf-section">
                <div class="shelf-title">معرض الهدايا 🎁</div>
                <div class="shelf-grid">
                    <div class="gift-item glass">🦁 <span class="gift-count">x2</span></div>
                    <div class="gift-item glass">🏰 <span class="gift-count">x1</span></div>
                    <div class="gift-item glass">💎 <span class="gift-count">x5</span></div>
                    <div class="gift-item glass">🌹 <span class="gift-count">x12</span></div>
                </div>
            </div>

            <div class="settings-list">
                <div class="setting-item glass"><span class="setting-icon">💰</span> محفظتي</div>
                <div class="setting-item glass"><span class="setting-icon">💎</span> متجر الـ VIP</div>
                <div class="setting-item glass" onclick="localStorage.clear(); location.reload();" style="color: #ef4444;"><span class="setting-icon">🚪</span> تسجيل الخروج</div>
            </div>
        `;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.smoManager = new SmoManager();
});
