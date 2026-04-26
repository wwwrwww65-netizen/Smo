/**
 * Live Broadcast (هــَــش Fyo) Logic
 * Updated for Absolute Sync, PeerJS Voice Chat, and Professional UI
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

        // YouTube State
        this.player = null;
        this.ytState = { videoId: '', state: -1, currentTime: 0, updatedAt: 0 };
        this.isSyncing = false;
        this.serverOffset = 0;
        this.isMutedByPolicy = true;
        this.guestRevertInterval = null;

        // PeerJS Voice State
        this.peer = null;
        this.myStream = null;
        this.isMicOn = false;
        this.activeCalls = {}; // peerId -> call object
        this.audioContext = null;
        this.analysers = {}; // uid -> analyser node
        this.isPeerInitialized = false;

        this.initElements();
        this.initAuth();
        this.setupYouTube();
        this.calculateServerOffset();
    }

    initElements() {
        // Unmute logic - connect to button/overlay
        const unmuteOverlay = document.getElementById('unmute-overlay');
        const btnUnmuteTap = document.getElementById('btn-unmute-tap');
        if (unmuteOverlay) {
            unmuteOverlay.onclick = () => this.handleUserUnmute();
        }
        if (btnUnmuteTap) {
            btnUnmuteTap.onclick = (e) => {
                e.stopPropagation();
                this.handleUserUnmute();
            };
        }

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
        this.unmuteOverlay = document.getElementById('unmute-overlay');
        this.btnUnmuteTap = document.getElementById('btn-unmute-tap');
        this.vidMiniThumb = document.getElementById('vid-mini-thumb');
        this.vidTitle = document.getElementById('vid-title');
        this.vidOwner = document.getElementById('vid-owner');
        this.vidHeaderTop = document.querySelector('.vid-header-top');
        this.vidFooterRow = document.querySelector('.vid-footer-row');

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

        // Initialize Peer immediately on room entry
        this.initPeer();
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
                'controls': 1, // Explicitly ensure controls are on
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'playsinline': 1,
                'disablekb': 0
            },
            events: {
                'onReady': () => this.onPlayerReady(),
                'onStateChange': (e) => this.onPlayerStateChange(e)
            }
        });

        if (this.role !== 'owner') {
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
        } else {
            const targetState = this.ytState.state;
            if (event.data !== targetState && targetState !== -1) {
                if (event.data === 3) return;

                // Allow buffering/ready, but enforce play/pause sync
                if (targetState === 1 && event.data !== 1) {
                    this.player.playVideo();
                } else if (targetState === 2 && event.data !== 2) {
                    this.player.pauseVideo();
                }
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

            // For guests, always start muted and show overlay
            if (this.role !== 'owner' && this.isMutedByPolicy) {
                this.player.mute();
                if (this.unmuteOverlay) {
                    this.unmuteOverlay.classList.remove('hidden');
                }
            }
            this.vidMiniThumb.src = `https://img.youtube.com/vi/${state.videoId}/mqdefault.jpg`;

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

        const currentLocalTime = this.player.getCurrentTime();
        const diff = Math.abs(currentLocalTime - targetTime);
        if (diff > 3) {
            this.player.seekTo(targetTime, true);
        }

        const currentLocalState = this.player.getPlayerState();
        if (state.state === 1 && currentLocalState !== 1) this.player.playVideo();
        if (state.state === 2 && currentLocalState !== 2) this.player.pauseVideo();
    }

    handleUserUnmute() {
        if (this.player) {
            this.player.unMute();
            this.player.setVolume(100);
            this.isMutedByPolicy = false;
            if (this.unmuteOverlay) {
                this.unmuteOverlay.remove();
                this.unmuteOverlay = null;
            }
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

    ownerChangeState(state) {
        if (state === 1) this.player.playVideo();
        else this.player.pauseVideo();
        this.ytState.state = state;
        this.ownerUpdateFirebase();
    }


    toggleFullscreen() {
        const container = document.getElementById('main-video-container');
        if (!container) return;
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen().catch(err => console.log(err));
            } else if (container.webkitRequestFullscreen) { /* Safari */
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) { /* IE11 */
                container.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    // ================== PEERJS VOICE CHAT ==================

    async initPeer() {
        if (this.isPeerInitialized) return;
        this.isPeerInitialized = true;

        // Create a silent track initially so we can connect before mic access
        this.myStream = this.createSilentAudioStream();

        this.peer = new Peer(this.myId);

        this.peer.on('open', (id) => {
            console.log('Peer connected with ID:', id);
            this.registerVoicePeer();
            this.setupPeerListeners();
            this.listenToVoicePeers();
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            this.isPeerInitialized = false; // Allow retry
        });
    }

    createSilentAudioStream() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const oscillator = this.audioContext.createOscillator();
        const dst = oscillator.connect(this.audioContext.createMediaStreamDestination());
        oscillator.start();
        const track = dst.stream.getAudioTracks()[0];
        track.enabled = false; // Truly silent
        return new MediaStream([track]);
    }

    async registerVoicePeer() {
        const voiceRef = ref(this.db, `rooms/${this.roomId}/voice_peers/${this.myId}`);
        onDisconnect(voiceRef).remove();
        await set(voiceRef, {
            peerId: this.myId,
            name: this.username,
            active: true
        });
    }

    setupPeerListeners() {
        this.peer.on('call', (call) => {
            console.log('Incoming call from:', call.peer);
            call.answer(this.myStream);
            this.handleCallStream(call);
        });
    }

    handleCallStream(call) {
        call.on('stream', (remoteStream) => {
            console.log('Receiving stream from:', call.peer);

            // Hidden audio element for playback
            let audio = document.getElementById(`audio-${call.peer}`);
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = `audio-${call.peer}`;
                audio.autoplay = true;
                audio.style.display = 'none';
                document.body.appendChild(audio);
            }
            audio.srcObject = remoteStream;
            audio.play().catch(e => console.error("Audio playback blocked:", e));

            this.activeCalls[call.peer] = call;
            this.startVolumeDetection(remoteStream, call.peer);
        });

        call.on('close', () => {
            console.log('Call closed with:', call.peer);
            const audio = document.getElementById(`audio-${call.peer}`);
            if (audio) audio.remove();
            delete this.activeCalls[call.peer];
            if (this.analysers[call.peer]) delete this.analysers[call.peer];
        });

        call.on('error', (err) => {
            console.error('Call error:', err);
            call.close();
        });
    }

    async toggleMic() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        try {
            if (!this.realMicTrack) {
                // First time: Request Permission and get real stream
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.realMicTrack = stream.getAudioTracks()[0];

                // Replace silent track with real mic track in all active calls
                this.replaceTrackInActiveCalls(this.realMicTrack);

                // Update local stream reference
                const currentTrack = this.myStream.getAudioTracks()[0];
                this.myStream.removeTrack(currentTrack);
                this.myStream.addTrack(this.realMicTrack);

                this.isMicOn = true;
                this.micOnIcon.classList.remove('hidden');
                this.micOffIcon.classList.add('hidden');
                this.btnToggleMic.classList.remove('muted');
                this.showToast("الميكروفون قيد التشغيل");

                // Start detecting my volume
                this.startVolumeDetection(this.myStream, this.myId);
            } else {
                // Toggle mute (disable track)
                this.isMicOn = !this.isMicOn;
                this.realMicTrack.enabled = this.isMicOn;

                if (this.isMicOn) {
                    this.micOnIcon.classList.remove('hidden');
                    this.micOffIcon.classList.add('hidden');
                    this.btnToggleMic.classList.remove('muted');
                    this.showToast("الميكروفون قيد التشغيل");
                } else {
                    this.micOnIcon.classList.add('hidden');
                    this.micOffIcon.classList.remove('hidden');
                    this.btnToggleMic.classList.add('muted');
                    this.showToast("تم كتم الميكروفون");
                    this.updateSpeakingUI(this.myId, false);
                }
            }
        } catch (err) {
            console.error(err);
            this.showToast("خطأ في الوصول للميكروفون");
        }
    }

    replaceTrackInActiveCalls(newTrack) {
        Object.values(this.activeCalls).forEach(call => {
            const peerConnection = call.peerConnection;
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const sender = senders.find(s => s.track && s.track.kind === 'audio');
                if (sender) {
                    sender.replaceTrack(newTrack);
                }
            }
        });
    }

    async callExistingPeers(peers) {
        Object.keys(peers).forEach(pid => {
            // Rule: Only call peers with "smaller" ID string to avoid duplicate calls
            if (pid !== this.myId && !this.activeCalls[pid] && this.myId < pid) {
                console.log('Calling peer:', pid);
                const call = this.peer.call(pid, this.myStream);
                if (call) {
                    this.activeCalls[pid] = call;
                    this.handleCallStream(call);
                }
            }
        });
    }

    listenToVoicePeers() {
        const voicePeersRef = ref(this.db, `rooms/${this.roomId}/voice_peers`);
        onValue(voicePeersRef, (snap) => {
            if (!this.peer) return;
            const peers = snap.val() || {};
            this.callExistingPeers(peers);
        });
    }

    startVolumeDetection(stream, uid) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Always resume audioContext if it's suspended (browser policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        try {
            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            this.analysers[uid] = { analyser, source }; // Keep source to prevent GC

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                if (!this.analysers[uid]) return;

                // Check if track is actually enabled and active
                const track = stream.getAudioTracks()[0];
                if (!track || !track.enabled || track.readyState === 'ended') {
                    this.updateSpeakingUI(uid, false);
                } else {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                    const average = sum / bufferLength;
                    this.updateSpeakingUI(uid, average > 15);
                }

                requestAnimationFrame(checkVolume);
            };
            checkVolume();
        } catch (e) {
            console.error("Volume detection error for", uid, e);
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

        // Auto-scroll logic as requested by user
        this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
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
