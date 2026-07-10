/**
 * Voice Chat Diagnostic Tool
 * This script runs a comprehensive test of all voice components.
 */

const VoiceDiagnostic = {
    results: [],

    async runAllTests() {
        console.log("%c--- بدء فحص نظام الصوت الشامل ---", "color: cyan; font-size: 16px; font-weight: bold;");
        this.results = [];

        await this.testFirebase();
        await this.testPeerJS();
        await this.testMediaDevices();
        await this.testAudioContext();

        this.showFinalReport();
    },

    log(name, status, message) {
        this.results.push({ name, status, message });
        const color = status === 'OK' ? 'lightgreen' : 'orange';
        console.log(`%c[${status}] %c${name}: ${message}`, `color: ${color}; font-weight: bold;`, "color: white;");
    },

    async testFirebase() {
        try {
            if (window.liveManager && window.liveManager.db) {
                this.log("Firebase", "OK", "قاعدة البيانات متصلة وجاهزة.");
            } else {
                throw new Error("LiveManager أو Firebase غير معرف.");
            }
        } catch (e) {
            this.log("Firebase", "ERROR", e.message);
        }
    },

    async testPeerJS() {
        try {
            if (window.liveManager && window.liveManager.peer) {
                if (window.liveManager.peer.open) {
                    this.log("PeerJS", "OK", `خادم الاتصال متصل بالهوية: ${window.liveManager.peer.id}`);
                } else {
                    this.log("PeerJS", "WAIT", "جاري انتظار فتح الاتصال بالخادم...");
                }
            } else {
                throw new Error("نظام PeerJS غير مفعل.");
            }
        } catch (e) {
            this.log("PeerJS", "ERROR", e.message);
        }
    },

    async testMediaDevices() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("المتصفح لا يدعم الوصول للميكروفون (قد تحتاج HTTPS).");
            }
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            
            if (mics.length > 0) {
                this.log("Microphone", "OK", `تم العثور على ${mics.length} ميكروفون متاح.`);
            } else {
                throw new Error("لم يتم العثور على أي ميكروفون موصل بالجهاز.");
            }
        } catch (e) {
            this.log("Microphone", "ERROR", e.message);
        }
    },

    async testAudioContext() {
        try {
            const ctx = window.liveManager ? window.liveManager.audioContext : new (window.AudioContext || window.webkitAudioContext)();
            this.log("AudioEngine", "OK", `محرك الصوت في حالة: ${ctx.state}`);
            
            if (ctx.state === 'suspended') {
                this.log("AudioEngine", "TIP", "المتصفح يحتاج لضغطة زر لتفعيل الصوت بالكامل.");
            }
        } catch (e) {
            this.log("AudioEngine", "ERROR", e.message);
        }
    },

    showFinalReport() {
        const errors = this.results.filter(r => r.status === 'ERROR').length;
        console.log("%c--------------------------------", "color: gray;");
        if (errors === 0) {
            console.log("%c✅ مبروك! النظام سليم برمجياً وجاهز للعمل.", "color: lightgreen; font-size: 14px;");
        } else {
            console.log(`%c⚠️ يوجد ${errors} مشاكل تحتاج للمراجعة (انظر التفاصيل أعلاه).`, "color: orange; font-size: 14px;");
        }
    }
};

// تشغيل الفحص بعد ثواني من تحميل الصفحة
setTimeout(() => {
    VoiceDiagnostic.runAllTests();
}, 3000);

window.VoiceDiagnostic = VoiceDiagnostic;
