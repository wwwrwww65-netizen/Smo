const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get, child } = require("firebase/database");

const firebaseConfig = {
  apiKey: "AIzaSyDfcHB-d68R2Kf-jisYudWKIjHZ9lgjUdM",
  authDomain: "smo1-5f999.firebaseapp.com",
  projectId: "smo1-5f999",
  storageBucket: "smo1-5f999.firebasestorage.app",
  messagingSenderId: "376255463194",
  appId: "1:376255463194:web:26bd4efe2d8f4c279f76a3"
};

async function runTerminalTest() {
    console.log("\n🚀 بدء فحص خادم البيانات من الترمنل...");
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const dbRef = ref(db);

    try {
        // محاولة القراءة من قاعدة البيانات للتأكد من الاتصال
        const snapshot = await get(child(dbRef, `rooms`));
        if (snapshot.exists()) {
            console.log("✅ تم الاتصال بنجاح: الخادم مستجيب وقاعدة البيانات تعمل.");
            console.log("📊 عدد الغرف النشطة حالياً:", Object.keys(snapshot.val()).length);
        } else {
            console.log("✅ تم الاتصال بنجاح: الخادم يعمل لكن لا توجد بيانات غرف حالياً.");
        }
        console.log("\n--- نظام البيانات جاهز 100% ---\n");
        process.exit(0);
    } catch (error) {
        console.error("❌ فشل الاتصال بالخادم:", error.message);
        process.exit(1);
    }
}

runTerminalTest();
