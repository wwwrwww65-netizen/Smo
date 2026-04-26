/**
 * Live Broadcast (هــَــش Fyo) Logic
 * Updated for Absolute Sync, Agora Voice, and Professional UI
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, push, update, onDisconnect, get, serverTimestamp }
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

// Agora Configuration
const AGORA_APP_ID = "YOUR_AGORA_APP_ID";

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

        // YouTube State
        this.player = null;
        this.ytState = { videoId: '', state: -1, currentTime: 0, updatedAt: 0 };
        this.isSyncing = false;
        this.serverOffset = 0;
        this.lastTapTime = 0;
        this.isMutedByPolicy = true;
        this.guestRevertInterval = null;

        // Agora State
        this.agoraClient = null;
        this.localAudioTrack = null;
        this.isMicOn = false;
        this.remoteUsers = {};

        this.initElements();
        this.initAuth();
        this.setupYouTube();
        this.initAgora();
        this.calculateServerOffset();
    }

    initElements() {
        // UI Refs
        this.onlineCountEl = document.getElementById('online-count');
        this.chatLogEl = document.getElementById('chat-log');
        this.chatInput = document.getElementById('chat-input');
        this.btnSendChat = document.getElementById('btn-send-chat');
        this.seatsContainer = document.getElementById('seats-container');
        this.toastContainer = document.getElementById('toast-container');

        // YouTube
        this.ytPlayerContainer = document.getElementById('youtube-player-container');
        this.vidPlaceholder = document.getElementById('vid-placeholder');
        this.playerOverlay = document.getElementById('player-overlay');
        this.unmuteOverlay = document.getElementById('unmute-overlay');
        this.btnUnmuteTap = document.getElementById('btn-unmute-tap');
        this.centralControl = document.getElementById('central-play-pause');
        this.btnCentralToggle = document.getElementById('btn-central-toggle');
        this.iconCentralPlay = document.getElementById('icon-central-play');
        this.iconCentralPause = document.getElementById('icon-central-pause');
        this.tapBack = document.getElementById('tap-back');
        this.tapForward = document.getElementById('tap-forward');
        this.vidTouchZone = document.getElementById('vid-touch-zone');
        this.vidMiniThumb = document.getElementById('vid-mini-thumb');
        this.vidTitle = document.getElementById('vid-title');
        this.vidOwner = document.getElementById('vid-owner');

        // Modals
        this.btnOpenControl = document.getElementById('btn-open-control');
        this.modalYT = document.getElementById('modal-yt-control');
        this.ytUrlInput = document.getElementById('yt-url-input');
        this.btnLoadVid = document.getElementById('btn-load-vid');
        this.btnPlayVid = document.getElementById('btn-play-vid');
        this.btnPauseVid = document.getElementById('btn-pause-vid');
        this.btnCloseModal = document.getElementById('btn-close-modal');

        // Mic
        this.btnToggleMic = document.getElementById('btn-toggle-mic');
        this.micOnIcon = document.getElementById('mic-on-icon');
        this.micOffIcon = document.getElementById('mic-off-icon');

        // Events
        this.btnSendChat.onclick = () => this.sendChatMessage();
        this.chatInput.onkeypress = (e) => { if (e.key === 'Enter') this.sendChatMessage(); };

        if (this.role === 'owner') {
            this.btnOpenControl.classList.remove('hidden');
            this.btnOpenControl.onclick = () => this.modalYT.classList.remove('hidden');
            this.btnCentralToggle.onclick = (e) => {
                e.stopPropagation();
                this.ownerTogglePlayPause();
            };
            this.tapBack.onclick = (e) => { e.stopPropagation(); this.ownerHandleDoubleTap('back'); };
            this.tapForward.onclick = (e) => { e.stopPropagation(); this.ownerHandleDoubleTap('forward'); };
            this.vidTouchZone.onclick = () => this.ownerToggleCentralUI();
        } else {
            // Guest click to unmute if needed or just toggle UI visibility (like volume)
            this.vidTouchZone.onclick = () => {
                if (this.isMutedByPolicy) this.handleUserUnmute();
            };
        }

        this.btnLoadVid.onclick = () => this.ownerLoadVideo();
        this.btnPlayVid.onclick = () => this.ownerChangeState(1);
        this.btnPauseVid.onclick = () => this.ownerChangeState(2);
        this.btnCloseModal.onclick = () => this.modalYT.classList.add('hidden');
        this.btnUnmuteTap.onclick = () => this.handleUserUnmute();
        this.btnToggleMic.onclick = () => this.toggleMic();

        document.getElementById('btn-fullscreen').onclick = () => this.toggleFullscreen();

        // Profile UI
        document.querySelector('.user-display-name').textContent = this.username;
        document.querySelector('.user-display-id').textContent = `ID: ${this.roomId}`;
        document.querySelector('.profile-square').src = this.userAvatar;
    }

    // ================== CORE / AUTH ==================

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

    async calculateServerOffset() {
        const offsetRef = ref(this.db, ".info/serverTimeOffset");
        onValue(offsetRef, (snap) => {
            this.serverOffset = snap.val() || 0;
        });
    }

    async joinRoom() {
        if (!this.roomId) return;
        const userRef = ref(this.db, `rooms/${this.roomId}/users/${this.myId}`);
        onDisconnect(userRef).remove();
        await update(userRef, {
            name: this.username,
            avatar: this.userAvatar,
            isOnline: true,
            lastSeen: serverTimestamp()
        });
        this.listenToRoom();
    }

    listenToRoom() {
        const roomRef = ref(this.db, `rooms/${this.roomId}`);
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            if (data.users) this.onlineCountEl.textContent = Object.keys(data.users).length;
            if (data.messages) this.updateChatUI(data.messages);
            this.updateSeatsUI(data.seats || {});
            if (data.youtube_state) this.syncYouTube(data.youtube_state);
        });
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'glass-toast';
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // ================== YOUTUBE SYNC ==================

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
                'controls': 1,
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'playsinline': 1,
                'disablekb': (this.role === 'owner' ? 0 : 1)
            },
            events: {
                'onReady': () => this.onPlayerReady(),
                'onStateChange': (e) => this.onPlayerStateChange(e)
            }
        });

        if (this.role !== 'owner') {
            // Start guest check interval to prevent seeking
            this.guestRevertInterval = setInterval(() => this.guestEnforceSync(), 2000);
        }
    }

    onPlayerReady() {
        if (this.ytState.videoId) {
            this.syncYouTube(this.ytState);
        }
    }

    onPlayerStateChange(event) {
        if (this.isSyncing) return;

        if (this.role === 'owner') {
            this.ytState.state = event.data;
            this.ownerUpdateFirebase();
            this.updateCentralIconButton(event.data);
        } else {
            // Guest tried to change state
            const targetState = this.ytState.state;
            if (event.data !== targetState && targetState !== -1) {
                if (event.data === 3) return; // Buffering is fine
                this.showToast("التحكم مقتصر على المالك فقط");
                if (targetState === 1) this.player.playVideo();
                if (targetState === 2) this.player.pauseVideo();
            }
        }
    }

    guestEnforceSync() {
        if (this.role === 'owner' || !this.player || !this.ytState.videoId || this.ytState.state === -1) return;

        const now = Date.now() + this.serverOffset;
        let targetTime = this.ytState.currentTime;
        if (this.ytState.state === 1 && this.ytState.updatedAt) {
            targetTime += (now - this.ytState.updatedAt) / 1000;
        }

        const currentLocalTime = this.player.getCurrentTime();
        const diff = Math.abs(currentLocalTime - targetTime);

        if (diff > 5) {
            this.showToast("التحكم مقتصر على المالك فقط");
            this.player.seekTo(targetTime, true);
        }
    }

    syncYouTube(state) {
        if (!this.player || !this.player.loadVideoById) {
            this.ytState = state;
            return;
        }

        // Calculate absolute time
        const now = Date.now() + this.serverOffset;
        let targetTime = state.currentTime;
        if (state.state === 1 && state.updatedAt) {
            const elapsed = (now - state.updatedAt) / 1000;
            targetTime += elapsed;
        }

        const isNewVideo = state.videoId !== this.ytState.videoId;
        this.ytState = state;

        if (!state.videoId) {
            this.ytPlayerContainer.classList.add('hidden');
            this.vidPlaceholder.classList.remove('hidden');
            if (this.player.stopVideo) this.player.stopVideo();
            return;
        }

        this.ytPlayerContainer.classList.remove('hidden');
        this.vidPlaceholder.classList.add('hidden');

        if (isNewVideo) {
            this.player.loadVideoById({
                videoId: state.videoId,
                startSeconds: targetTime
            });
            if (this.isMutedByPolicy) {
                this.player.mute();
                this.unmuteOverlay.classList.remove('hidden');
            }
            this.vidMiniThumb.src = `https://img.youtube.com/vi/${state.videoId}/mqdefault.jpg`;

            // Try to get title after load
            const checkTitle = setInterval(() => {
                if (this.player.getVideoData && this.player.getVideoData().title) {
                    const data = this.player.getVideoData();
                    this.vidTitle.textContent = data.title;
                    this.vidOwner.textContent = "بواسطة: " + (data.author || "يوتيوب");
                    clearInterval(checkTitle);
                }
            }, 1000);
            setTimeout(() => clearInterval(checkTitle), 10000);
        }

        // Sync Time
        const currentLocalTime = this.player.getCurrentTime();
        const diff = Math.abs(currentLocalTime - targetTime);
        if (diff > 3) {
            this.player.seekTo(targetTime, true);
        }

        // Sync State
        const currentLocalState = this.player.getPlayerState();
        if (state.state === 1 && currentLocalState !== 1) this.player.playVideo();
        if (state.state === 2 && currentLocalState !== 2) this.player.pauseVideo();

        this.updateCentralIconButton(state.state);
    }

    handleUserUnmute() {
        if (this.player) {
            this.player.unMute();
            this.player.setVolume(100);
            this.isMutedByPolicy = false;
            this.unmuteOverlay.classList.add('hidden');
            this.showToast("تم تفعيل الصوت بنجاح");
        }
    }

    // ================== OWNER ACTIONS ==================

    ownerLoadVideo() {
        const val = this.ytUrlInput.value.trim();
        let videoId = '';
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = val.match(regExp);
        videoId = (match && match[2].length === 11) ? match[2] : val;

        if (videoId.length === 11) {
            this.ytState = {
                videoId: videoId,
                state: 1,
                currentTime: 0,
                updatedAt: serverTimestamp()
            };
            this.ownerUpdateFirebase();
            this.modalYT.classList.add('hidden');

            // Immediate local feedback
            this.player.loadVideoById({ videoId: videoId });
            this.ytPlayerContainer.classList.remove('hidden');
            this.vidPlaceholder.classList.add('hidden');
        } else {
            this.showToast("رابط غير صالح");
        }
    }

    ownerUpdateFirebase() {
        if (!this.roomId || !this.player || this.isSyncing) return;
        this.isSyncing = true;

        const time = this.player.getCurrentTime();
        update(ref(this.db, `rooms/${this.roomId}/youtube_state`), {
            videoId: this.ytState.videoId,
            state: this.ytState.state,
            currentTime: time,
            updatedAt: serverTimestamp()
        }).then(() => {
            setTimeout(() => { this.isSyncing = false; }, 500);
        });
    }

    ownerTogglePlayPause() {
        const currentState = this.player.getPlayerState();
        if (currentState === 1) this.ownerChangeState(2);
        else this.ownerChangeState(1);
    }

    ownerChangeState(state) {
        if (state === 1) this.player.playVideo();
        else this.player.pauseVideo();
        this.ytState.state = state;
        this.ownerUpdateFirebase();
    }

    ownerHandleDoubleTap(dir) {
        const now = Date.now();
        if (now - this.lastTapTime < 350) {
            const current = this.player.getCurrentTime();
            const seek = (dir === 'forward') ? current + 10 : current - 10;
            this.player.seekTo(seek, true);
            this.showToast(dir === 'forward' ? "تقديم 10 ثوانٍ" : "تأخير 10 ثوانٍ");
            setTimeout(() => this.ownerUpdateFirebase(), 100);
        }
        this.lastTapTime = now;
    }

    ownerToggleCentralUI() {
        this.centralControl.classList.toggle('hidden');
        if (!this.centralControl.classList.contains('hidden')) {
            if (this.player.getPlayerState() === 1) {
                setTimeout(() => {
                    if (this.player.getPlayerState() === 1) {
                        this.centralControl.classList.add('hidden');
                    }
                }, 3000);
            }
        }
    }

    updateCentralIconButton(state) {
        if (state === 1) {
            this.iconCentralPlay.classList.add('hidden');
            this.iconCentralPause.classList.remove('hidden');
        } else {
            this.iconCentralPlay.classList.remove('hidden');
            this.iconCentralPause.classList.add('hidden');
            this.centralControl.classList.remove('hidden');
        }
    }

    toggleFullscreen() {
        const container = document.getElementById('main-video-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => console.log(err));
        } else {
            document.exitFullscreen();
        }
    }

    // ================== AGORA VOICE ==================

    async initAgora() {
        if (AGORA_APP_ID === "YOUR_AGORA_APP_ID") return;
        this.agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

        this.agoraClient.on("user-published", async (user, mediaType) => {
            await this.agoraClient.subscribe(user, mediaType);
            if (mediaType === "audio") {
                user.audioTrack.play();
                this.remoteUsers[user.uid] = user;
            }
        });

        this.agoraClient.on("user-unpublished", (user) => {
            delete this.remoteUsers[user.uid];
        });

        AgoraRTC.setParameter("AUDIO_VOLUME_INDICATION_INTERVAL", 200);
        this.agoraClient.on("volume-indicator", (volumes) => {
            volumes.forEach((volume) => {
                const isSpeaking = volume.level > 5;
                this.updateSpeakingUI(volume.uid, isSpeaking);
            });
        });
        this.agoraClient.enableAudioVolumeIndicator();
    }

    async toggleMic() {
        if (AGORA_APP_ID === "YOUR_AGORA_APP_ID") {
            this.showToast("يرجى إعداد Agora App ID أولاً");
            return;
        }

        try {
            if (!this.isMicOn) {
                if (!this.localAudioTrack) {
                    this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                }
                if (this.agoraClient.connectionState === "DISCONNECTED") {
                    await this.agoraClient.join(AGORA_APP_ID, this.roomId, null, this.myId);
                }
                await this.agoraClient.publish([this.localAudioTrack]);
                this.isMicOn = true;
                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
                this.btnToggleMic.classList.remove('muted');
                this.showToast("الميكروفون قيد التشغيل");
            } else {
                if (this.localAudioTrack) {
                    await this.agoraClient.unpublish([this.localAudioTrack]);
                }
                this.isMicOn = false;
                this.micOnIcon.classList.add('hidden');
                this.micOffIcon.classList.remove('hidden');
                this.btnToggleMic.classList.add('muted');
                this.showToast("تم كتم الميكروفون");
            }
        } catch (err) {
            console.error(err);
            this.showToast("خطأ في الوصول للميكروفون");
        }
    }

    updateSpeakingUI(uid, isSpeaking) {
        const frames = document.querySelectorAll('.avatar-circle-frame');
        frames.forEach(frame => {
            if (frame.dataset.uid === String(uid)) {
                if (isSpeaking) frame.classList.add('speaking');
                else frame.classList.remove('speaking');
            }
        });
    }

    // ================== SEATS ==================

    updateSeatsUI(seats) {
        this.seatsContainer.innerHTML = '';
        for (let i = 1; i <= 6; i++) {
            const seat = seats[i] || { status: 'empty' };
            const seatBox = document.createElement('div');
            seatBox.className = 'seat-box';

            let content = '';
            if (seat.status === 'locked') {
                content = `<span class="lock-seat">🔒</span><span class="seat-label-num">${i}</span>`;
            } else if (seat.status === 'occupied') {
                const isMe = seat.userId === this.myId;
                content = `
                    <div class="avatar-circle-frame ${isMe ? 'green-border' : ''}" data-uid="${seat.userId}">
                        <img src="${seat.avatar}" alt="${seat.name}">
                    </div>
                    <span class="seat-label-num" style="color:#fff;">${seat.name}</span>
                `;
            } else {
                content = `
                    <div class="avatar-circle-frame seat-empty" onclick="window.liveManager.joinSeat(${i})">
                        <span style="font-size:20px;color:rgba(255,255,255,0.3);">+</span>
                    </div>
                    <button class="btn-join-small" onclick="window.liveManager.joinSeat(${i})">انضم</button>
                    <span class="seat-label-num">${i}</span>
                `;
            }
            seatBox.innerHTML = content;
            this.seatsContainer.appendChild(seatBox);
        }
    }

    async joinSeat(index) {
        const seatRef = ref(this.db, `rooms/${this.roomId}/seats/${index}`);
        const snap = await get(seatRef);
        if (snap.exists() && snap.val().status !== 'empty') return;

        const seatsSnap = await get(ref(this.db, `rooms/${this.roomId}/seats`));
        const currentSeats = seatsSnap.val() || {};
        for (const [idx, s] of Object.entries(currentSeats)) {
            if (s.userId === this.myId) {
                await set(ref(this.db, `rooms/${this.roomId}/seats/${idx}`), { status: 'empty' });
            }
        }

        await update(seatRef, {
            status: 'occupied',
            userId: this.myId,
            name: this.username,
            avatar: this.userAvatar
        });
        onDisconnect(seatRef).set({ status: 'empty' });
    }

    // ================== CHAT ==================

    async sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (!text) return;
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
                <img class="chat-avatar" src="${m.avatar}">
                <div class="chat-body">
                    <span class="chat-user-name">${m.userName}</span>
                    <div class="chat-bubble-new">${this.escapeHtml(m.text)}</div>
                </div>
            `;
            this.chatLogEl.appendChild(div);
        });
        this.chatLogEl.scrollTo({ top: this.chatLogEl.scrollHeight, behavior: 'smooth' });
    }

    escapeHtml(t) {
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.liveManager = new LiveManager();
});
