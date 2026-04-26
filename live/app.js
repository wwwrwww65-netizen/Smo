/**
 * Live Broadcast (TopTop Clone) Logic
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, serverTimestamp, remove }
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

class LiveManager {
    constructor() {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
        this.auth = getAuth(this.app);

        this.urlParams = new URLSearchParams(window.location.search);
        this.roomId = this.urlParams.get('roomID');
        this.username = this.urlParams.get('username') || 'ضيف';
        this.role = this.urlParams.get('role') || 'guest';
        this.myId = null;
        this.userAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.username}_${Math.random()}`;

        this.player = null; // YouTube Player
        this.ytState = { videoId: '', state: -1, currentTime: 0 };
        this.isSyncing = false;

        this.initElements();
        this.initAuth();
        this.setupYouTube();
    }

    initElements() {
        this.onlineCountEl = document.getElementById('online-count');
        this.chatLogEl = document.getElementById('chat-log');
        this.chatInput = document.getElementById('chat-input');
        this.btnSendChat = document.getElementById('btn-send-chat');
        this.seatsContainer = document.getElementById('seats-container');

        // YouTube Control Modal
        this.btnOpenControl = document.getElementById('btn-open-control');
        this.modalYT = document.getElementById('modal-yt-control');
        this.ytUrlInput = document.getElementById('yt-url-input');
        this.btnLoadVid = document.getElementById('btn-load-vid');
        this.btnPlayVid = document.getElementById('btn-play-vid');
        this.btnPauseVid = document.getElementById('btn-pause-vid');
        this.btnCloseModal = document.getElementById('btn-close-modal');

        // Seat Admin Modal
        this.modalSeat = document.getElementById('modal-seat-admin');
        this.seatAdminInfo = document.getElementById('seat-admin-info');
        this.btnLockSeat = document.getElementById('btn-lock-seat');
        this.btnKickPlayer = document.getElementById('btn-kick-player');
        this.btnCloseSeatModal = document.getElementById('btn-close-seat-modal');

        this.vidPlaceholder = document.getElementById('vid-placeholder');
        this.vidStoppedMessage = document.getElementById('vid-stopped-message');
        this.ytPlayerContainer = document.getElementById('youtube-player-container');
        this.playerOverlay = document.getElementById('player-overlay');
        this.vidMiniThumb = document.getElementById('vid-mini-thumb');
        this.vidTitle = document.getElementById('vid-title');
        this.vidOwner = document.getElementById('vid-owner');
        this.btnFullscreen = document.getElementById('btn-fullscreen');

        // Event Listeners
        if (this.role === 'owner') {
            this.btnOpenControl.classList.remove('hidden');
            this.btnOpenControl.addEventListener('click', () => this.modalYT.classList.remove('hidden'));
        }

        this.btnSendChat.addEventListener('click', () => this.sendChatMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        this.btnCloseModal.addEventListener('click', () => this.modalYT.classList.add('hidden'));
        this.btnLoadVid.addEventListener('click', () => this.ownerLoadVideo());
        this.btnPlayVid.addEventListener('click', () => this.ownerChangeState(1)); // Playing
        this.btnPauseVid.addEventListener('click', () => this.ownerChangeState(2)); // Paused

        this.btnCloseSeatModal.addEventListener('click', () => this.modalSeat.classList.add('hidden'));

        this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

        // Update UI with Room ID & Username
        document.querySelector('.user-display-name').textContent = this.username;
        document.querySelector('.user-display-id').textContent = `ID: ${this.roomId}`;
        document.querySelector('.profile-square').src = this.userAvatar;
    }

    async initAuth() {
        onAuthStateChanged(this.auth, (user) => {
            if (user) {
                this.myId = user.uid;
                this.joinRoom();
            } else {
                signInAnonymously(this.auth);
            }
        });
    }

    async joinRoom() {
        if (!this.roomId) return;
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        const userRef = ref(this.db, `rooms/${this.roomId}/users/${this.myId}`);

        // Presence System
        onDisconnect(userRef).remove();
        await update(userRef, {
            name: this.username,
            avatar: this.userAvatar,
            isOnline: true
        });

        this.listenToRoom();
    }

    listenToRoom() {
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // 1. Online Users Count
            if (data.users) {
                this.onlineCountEl.textContent = Object.keys(data.users).length;
            }

            // 2. Chat
            if (data.messages) {
                this.updateChatUI(data.messages);
            }

            // 3. Seats
            this.updateSeatsUI(data.seats || {});

            // 4. YouTube Sync
            if (data.youtube_state) {
                this.syncYouTube(data.youtube_state);
            }
        });
    }

    // ================== SEATS LOGIC ==================

    updateSeatsUI(seats) {
        this.seatsContainer.innerHTML = '';
        for (let i = 1; i <= 6; i++) {
            const seat = seats[i] || { status: 'empty' };
            const seatBox = document.createElement('div');
            seatBox.className = 'seat-box';

            let content = '';
            if (seat.status === 'locked') {
                content = `
                    <span class="lock-seat">🔒</span>
                    <span class="seat-label-num">${i}</span>
                `;
                seatBox.classList.add('seat-locked');
            } else if (seat.status === 'occupied') {
                content = `
                    <div class="avatar-circle-frame ${seat.userId === this.myId ? 'green-border' : ''}">
                        <img src="${seat.avatar}" alt="${seat.name}">
                    </div>
                    <span class="seat-label-num" style="font-size: 9px; color: #fff;">${seat.name}</span>
                `;
            } else {
                content = `
                    <div class="avatar-circle-frame seat-empty">
                        <span style="font-size: 20px; color: rgba(255,255,255,0.3);">+</span>
                    </div>
                    <button class="btn-join-small" onclick="window.liveManager.joinSeat(${i})">انضم</button>
                    <span class="seat-label-num">${i}</span>
                `;
            }

            seatBox.innerHTML = content;

            // Owner click listener
            if (this.role === 'owner') {
                seatBox.style.cursor = 'pointer';
                seatBox.addEventListener('click', () => this.openSeatAdmin(i, seat));
            }

            this.seatsContainer.appendChild(seatBox);
        }
    }

    async joinSeat(index) {
        const seatRef = ref(this.db, `rooms/${this.roomId}/seats/${index}`);
        const snap = await get(seatRef);
        if (snap.exists() && snap.val().status !== 'empty') return;

        // Check if user is already in another seat
        const seatsSnap = await get(ref(this.db, `rooms/${this.roomId}/seats`));
        const currentSeats = seatsSnap.val() || {};
        for (const [idx, s] of Object.entries(currentSeats)) {
            if (s.userId === this.myId) {
                await update(ref(this.db, `rooms/${this.roomId}/seats/${idx}`), {
                    status: 'empty',
                    userId: null,
                    name: null,
                    avatar: null
                });
            }
        }

        await update(seatRef, {
            status: 'occupied',
            userId: this.myId,
            name: this.username,
            avatar: this.userAvatar
        });

        onDisconnect(seatRef).update({
            status: 'empty',
            userId: null,
            name: null,
            avatar: null
        });
    }

    openSeatAdmin(index, seat) {
        this.selectedSeatIndex = index;
        this.selectedSeatData = seat;

        this.seatAdminInfo.textContent = `إدارة المقعد رقم ${index}`;
        this.modalSeat.classList.remove('hidden');

        this.btnLockSeat.onclick = () => this.ownerToggleLock(index, seat);
        this.btnKickPlayer.onclick = () => this.ownerKickPlayer(index, seat);

        if (seat.status === 'occupied') {
            this.btnKickPlayer.classList.remove('hidden');
        } else {
            this.btnKickPlayer.classList.add('hidden');
        }
    }

    async ownerToggleLock(index, seat) {
        const newStatus = seat.status === 'locked' ? 'empty' : 'locked';
        await update(ref(this.db, `rooms/${this.roomId}/seats/${index}`), {
            status: newStatus,
            userId: null,
            name: null,
            avatar: null
        });
        this.modalSeat.classList.add('hidden');
    }

    async ownerKickPlayer(index, seat) {
        if (seat.status !== 'occupied') return;
        await update(ref(this.db, `rooms/${this.roomId}/seats/${index}`), {
            status: 'empty',
            userId: null,
            name: null,
            avatar: null
        });
        this.modalSeat.classList.add('hidden');
    }

    // ================== YOUTUBE LOGIC ==================

    setupYouTube() {
        if (window.YT && window.YT.Player) {
            this.initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = () => this.initPlayer();
        }
    }

    initPlayer() {
        this.player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            playerVars: {
                'autoplay': 1,
                'controls': 0,
                'disablekb': 1,
                'modestbranding': 1,
                'rel': 0,
                'iv_load_policy': 3,
                'showinfo': 0,
                'fs': 1,
                'playsinline': 1
            },
            events: {
                'onReady': (event) => this.onPlayerReady(event),
                'onStateChange': (event) => this.onPlayerStateChange(event),
                'onError': (event) => console.error("YT Player Error:", event.data)
            }
        });

        // Apply guest overlay
        if (this.role !== 'owner') {
            this.playerOverlay.style.display = 'block';
        }
    }

    onPlayerReady(event) {
        if (this.role === 'owner') {
            // Owner can start by syncing current state if exists
        }
    }

    onPlayerStateChange(event) {
        if (this.role === 'owner' && !this.isSyncing) {
            this.ownerUpdateFirebase();
        }
    }

    ownerLoadVideo() {
        let val = this.ytUrlInput.value.trim();
        let videoId = '';
        if (val.includes('v=')) {
            videoId = val.split('v=')[1].split('&')[0];
        } else if (val.includes('youtu.be/')) {
            videoId = val.split('youtu.be/')[1].split('?')[0];
        } else {
            videoId = val;
        }

        if (videoId) {
            this.ytState.videoId = videoId;
            this.ytState.state = 1; // Play
            this.ytState.currentTime = 0;
            this.ownerUpdateFirebase();
            this.modalYT.classList.add('hidden');
        }
    }

    ownerChangeState(state) {
        this.ytState.state = state;
        this.ytState.currentTime = this.player.getCurrentTime();
        this.ownerUpdateFirebase();
    }

    ownerUpdateFirebase() {
        if (!this.roomId) return;
        update(ref(this.db, `rooms/${this.roomId}/youtube_state`), {
            videoId: this.ytState.videoId,
            state: this.ytState.state,
            currentTime: this.player.getCurrentTime(),
            updatedAt: serverTimestamp()
        });
    }

    syncYouTube(state) {
        if (this.role === 'owner' && this.ytState.videoId === state.videoId) {
            // Owner already has the state, just update local ref if needed
            this.ytState = state;
            return;
        }

        this.ytState = state;

        if (!state.videoId) {
            this.ytPlayerContainer.classList.add('hidden');
            this.vidPlaceholder.classList.remove('hidden');
            this.vidStoppedMessage.textContent = 'المالك او المشرف قاموا بإيقاف الفيديو';
            if (this.player && this.player.stopVideo) this.player.stopVideo();
            return;
        }

        // We have a videoId
        this.ytPlayerContainer.classList.remove('hidden');
        this.vidPlaceholder.classList.add('hidden');

        if (this.player && this.player.loadVideoById) {
            const currentVideoId = this.player.getVideoData ? this.player.getVideoData().video_id : null;

            if (state.videoId !== currentVideoId) {
                this.player.loadVideoById({
                    videoId: state.videoId,
                    startSeconds: state.currentTime || 0
                });
                // Update mini-thumb
                this.vidMiniThumb.src = `https://img.youtube.com/vi/${state.videoId}/mqdefault.jpg`;
            }

            const diff = Math.abs(this.player.getCurrentTime() - state.currentTime);
            if (diff > 3) {
                this.player.seekTo(state.currentTime);
            }

            if (state.state === 1) { // Playing
                this.player.playVideo();
            } else if (state.state === 2) { // Paused
                this.player.pauseVideo();
            }
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.ytPlayerContainer.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    // ================== CHAT LOGIC ==================

    async sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (!text || !this.roomId) return;

        const chatRef = ref(this.db, `rooms/${this.roomId}/messages`);
        await push(chatRef, {
            userId: this.myId,
            userName: this.username,
            avatar: this.userAvatar,
            text: text,
            timestamp: serverTimestamp()
        });

        this.chatInput.value = '';
    }

    updateChatUI(messages) {
        this.chatLogEl.innerHTML = '<p class="chat-intro">أهلاً بك في الغرفة! ✨</p>';
        const msgs = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
        msgs.forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = `
                <img class="chat-avatar" src="${m.avatar}" alt="u">
                <div class="chat-body">
                    <span class="chat-user-name">${m.userName}</span>
                    <div class="chat-bubble-new">${this.escapeHtml(m.text)}</div>
                </div>
            `;
            this.chatLogEl.appendChild(div);
        });
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.liveManager = new LiveManager();
});
