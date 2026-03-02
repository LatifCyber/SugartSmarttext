# 🩺 SugarSmart — Diabetes Management App

> A comprehensive diabetes management companion designed to simplify glucose monitoring, provide real-time actionable insights, and enhance safety through emergency alerts.

---

## 📁 Project Structure

```
sugarsmart/
├── index.html    # App shell — all screens & page layouts
├── styles.css    # Theme, components, dark mode, animations
├── app.js        # Firebase, state management, all logic
└── README.md     # This file
```

---

## ✨ Features

### 💉 Smart Glucose Monitoring
- Log blood glucose readings manually with timing context (fasting, after meal, etc.)
- Color-coded status: **LOW** (red) / **NORMAL** (green) / **HIGH** (yellow/red)
- Animated SVG gauge with real-time needle and color feedback
- Trend detection: Rising Fast ↑↑ / Rising ↑ / Stable → / Falling ↓ / Falling Fast ↓↓
- SVG sparkline chart showing last 8 readings with normal range shading
- Automatic critical low alert (< 55 mg/dL) with alarm sound and vibration

### 🎯 Actionable Recommendations
Every glucose reading generates a specific action card:

| Range | Recommendation |
|-------|---------------|
| < 55 mg/dL | 🚨 CRITICAL — Call 911 or Doctor |
| 55–69 mg/dL | 🍬 Eat 15g fast-acting carbs now |
| 70–130 mg/dL | ✅ Excellent — maintain routine |
| 131–180 mg/dL | 👍 In range — avoid high-GI foods |
| 181–250 mg/dL | ⚠️ Elevated — consider insulin |
| > 250 mg/dL | 🚨 Dangerously high — call doctor |

### 📡 Device Integration
**Blood Glucose Meter (BGM)**
- Simulated Bluetooth pairing with realistic scan animation
- Auto-syncs a reading on successful connection
- Shows signal strength, battery, and last sync time
- Compatible brands: Accu-Chek, OneTouch, Contour, FreeStyle

**Continuous Glucose Monitor (CGM)**
- Supports FreeStyle Libre, Dexcom G7, and Medtronic Guardian
- Streams live glucose values every 30 seconds (demo) / 5 minutes (production)
- Real-time trend display even when the CGM display is off
- Auto-logs readings to history and triggers alerts if glucose drops critically

### 📷 Barcode Scanner
- Uses the browser's native `BarcodeDetector` API (Chrome/Edge on Android)
- Scans packaged food barcodes and returns carb, calorie, and sugar content
- Falls back to a simulated demo scan on unsupported browsers
- One-tap to add scanned food directly to the meal log

### 🍽️ Meal & Nutrition Log
- Log meals with description, carbs, calories, and sugar
- Optional photo attachment (uploads to Firebase Storage)
- Quick-add from a built-in food database (15 common foods with GI index)
- Daily nutrition summary bar (carbs / sugar / calories / items)
- Progress bars track intake against personal goals

### 🎯 Health Goals
- Adjustable daily targets via sliders: carbs, sugar, calories, target BG low/high
- Persisted to Firestore per user
- Dashboard progress bars reflect goal tracking in real time

### 🔔 Smart Reminders
- Create reminders by type: Medication 💊, Blood 💉, Meal 🍽️, Exercise 🏃, Water 💧, Other 🔔
- Set custom label and time
- Toggle ON/OFF per reminder
- Active reminders shown on the dashboard

### 📋 Doctor Report
- Patient info, device sources, and report date
- Blood glucose statistics: total readings, average, high/low episodes
- **Time-In-Range (TIR%)** — percentage of readings within 70–180 mg/dL
- **Estimated HbA1c** — calculated from average BG using standard formula
- Full reading log with source (Manual / BGM / CGM)
- Today's nutrition vs goals
- Browser print / PDF export

### 🚨 Emergency System
- Manual emergency alert button on the dashboard
- Critical low overlay (< 55 mg/dL) auto-triggers with:
  - Pulsing red screen animation
  - Vibration pattern (if device supports it)
  - Audible alarm beeps (Web Audio API)
  - Step-by-step treatment instructions
  - One-tap call buttons for 911 and the doctor

### 🌙 Dark Mode
- Full dark theme with CSS variables
- Persists within session; toggle in top bar or auth screen

---

## 🚀 Getting Started

### 1. Open Without Firebase (Demo Mode)
Just open `index.html` in any modern browser. The app runs fully in demo mode with pre-loaded sample data. No server or internet required.

```
index.html  ← double-click or drag into browser
```

### 2. Enable Firebase (Cloud Sync)

#### Step 1 — Create a Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `SugarSmart` → Continue
3. Click **</>** (Web) → App nickname: `SugarSmart Web` → Register app
4. Copy the `firebaseConfig` object shown

#### Step 2 — Paste Config into `app.js`
Find this block near the top of `app.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_AUTH_DOMAIN",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
```

#### Step 3 — Enable Authentication
Firebase Console → **Authentication** → Get Started
- Enable **Email/Password**
- Enable **Google** (add your domain to authorized domains)

#### Step 4 — Create Firestore Database
Firebase Console → **Firestore Database** → Create database → Start in test mode

Paste these security rules under **Firestore → Rules**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

#### Step 5 — Enable Storage (for meal photos)
Firebase Console → **Storage** → Get Started

Paste these storage rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

---

## 🗄️ Firestore Data Structure

```
users/
  {uid}/
    settings/
      goals              → { carbs, sugar, calories, targetBGLow, targetBGHigh }
    glucoseReadings/
      {autoId}           → { value, note, noteExtra, source, time, date, ts }
    meals/
      {autoId}           → { description, carbs, calories, sugar, photoURL, ts }
    reminders/
      {autoId}           → { label, time, type, active }
```

---

## 🌐 Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Core app | ✅ | ✅ | ✅ | ✅ |
| Dark mode | ✅ | ✅ | ✅ | ✅ |
| Camera / Barcode | ✅ | ✅ | ✅ | ✅ |
| BarcodeDetector API | ✅ | ❌ (falls back to demo) | ❌ (falls back to demo) | ✅ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ |
| Vibration API | ✅ Android | ❌ | ❌ | ✅ Android |
| Firebase Auth | ✅ | ✅ | ✅ | ✅ |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styling | CSS3 with custom properties (no framework) |
| Scripting | Vanilla JavaScript ES2022 (modules) |
| Auth | Firebase Authentication (Email + Google) |
| Database | Cloud Firestore (real-time) |
| Storage | Firebase Storage |
| Fonts | Syne · Manrope · DM Mono (Google Fonts) |
| Charts | Custom SVG sparklines |
| Camera | MediaDevices API + BarcodeDetector API |
| Audio | Web Audio API |

---

## 📱 Supported Devices (per the product spec)

### Blood Glucose Meters (BGM)
Portable finger-prick devices connected via **Bluetooth**. Data is automatically pushed to the app. Manual entry is available for non-Bluetooth meters.

### Continuous Glucose Monitors (CGM)
| Brand | Connection |
|-------|-----------|
| FreeStyle Libre | Bluetooth / NFC |
| Dexcom G7 | Bluetooth |
| Medtronic Guardian | Bluetooth |

CGM data streams continuously. SugarSmart displays live readings even when the CGM's own display is off.

---

## 🔐 Privacy & Security
- All user data is scoped to the authenticated user's UID in Firestore
- Firestore security rules prevent any cross-user data access
- Meal photos are stored in user-scoped Firebase Storage paths
- No data is shared with third parties
- Demo mode stores nothing — all data is in-memory only

---

## 👨‍💻 Development Notes

### Running Locally
Because `app.js` uses ES modules (`import`/`export`), browsers block module loading from `file://` URLs. Use a simple local server:

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
Install "Live Server" extension → right-click index.html → Open with Live Server
```

Then open `http://localhost:8080` in your browser.

### CGM Simulation Interval
In demo mode, the CGM updates every **30 seconds** so you can see live data change during testing. In a real integration, set the interval to **5 minutes** (300,000 ms):

```js
// In app.js → startCGMSimulation()
}, 300000); // Change 30000 → 300000 for production
```

---

## 📄 License
Built for personal use to support a diabetic family member. Modify and distribute freely.

---

> **Disclaimer:** SugarSmart is a supplementary tracking tool and is **not a medical device**. Always follow your doctor's instructions. In a medical emergency, call 911 immediately.
