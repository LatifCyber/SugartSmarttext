# 🔥 SugarSmart — Firebase Integration Guide

> Complete step-by-step instructions for connecting SugarSmart to Firebase for cloud authentication, real-time data sync, and meal photo storage.

---

## 📋 Prerequisites

- A Google account
- Your 3 project files: `index.html`, `styles.css`, `app.js`
- A terminal (for local dev server) or VS Code with Live Server extension
- Node.js installed (optional, for Firebase CLI hosting)

---

## Step 1 — Create a Firebase Project

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**
2. Click **"Add project"**
3. Enter project name: `SugarSmart` → click **Continue**
4. Disable Google Analytics (optional) → click **"Create project"**
5. Wait for provisioning to complete → click **"Continue"**

---

## Step 2 — Register Your Web App

1. On the project overview page, click the **`</>`** (Web) icon
2. Enter app nickname: `SugarSmart Web`
3. Leave **"Firebase Hosting"** unchecked for now
4. Click **"Register app"**
5. You will see a `firebaseConfig` object — **copy it entirely**:

```js
const firebaseConfig = {
  apiKey: "AIzaSyAbc123...",
  authDomain: "sugarsmart-abc.firebaseapp.com",
  projectId: "sugarsmart-abc",
  storageBucket: "sugarsmart-abc.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Open **`app.js`** and find the config block near the top of the file
7. Replace all `"YOUR_..."` placeholder values with your real values:

```js
// ❌ BEFORE — placeholder values
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_AUTH_DOMAIN",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

// ✅ AFTER — your real values pasted in
const firebaseConfig = {
  apiKey:            "AIzaSyAbc123...",
  authDomain:        "sugarsmart-abc.firebaseapp.com",
  projectId:         "sugarsmart-abc",
  storageBucket:     "sugarsmart-abc.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
};
```

> ⚠️ The app checks whether `apiKey` still contains `"YOUR_"`. If it does, it runs in demo mode with no persistence. Once you paste real values, Firebase activates automatically.

---

## Step 3 — Enable Authentication

1. In Firebase Console, go to **Build → Authentication**
2. Click **"Get started"**
3. Under the **"Sign-in method"** tab, enable the following providers:

**Email/Password**
- Click **Email/Password**
- Toggle the first switch to **Enabled**
- Click **Save**

**Google**
- Click **Google**
- Toggle to **Enabled**
- Enter a project support email address
- Click **Save**

4. Go to **Settings → Authorized domains**
5. Confirm `localhost` is listed (it should be by default)
6. If deploying live, click **"Add domain"** and add your live domain (e.g. `sugarsmart-abc.web.app`)

---

## Step 4 — Create Firestore Database

1. Go to **Build → Firestore Database**
2. Click **"Create database"**
3. Select **"Start in test mode"** → click **Next**
4. Choose a region close to your users (e.g. `us-east1`, `europe-west1`) → click **"Enable"**
5. Once the database is created, click the **"Rules"** tab
6. Replace the default rules with the following and click **"Publish"**:

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

> 🔐 These rules ensure every user can only access their own data. No user can read or write another user's records.

---

## Step 5 — Enable Storage (Meal Photos)

1. Go to **Build → Storage**
2. Click **"Get started"**
3. Accept the default security rules → click **"Next"**
4. Choose the same region you selected for Firestore → click **"Done"**
5. Once Storage is ready, click the **"Rules"** tab
6. Replace the default rules with the following and click **"Publish"**:

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

> 📷 Meal photos are stored at the path `users/{uid}/meals/{filename}` — scoped to the authenticated user only.

---

## Step 6 — Run the App Locally

> ⚠️ **Important:** `app.js` uses ES module `import` statements. Browsers block these when opening files directly from the filesystem (`file://`). You must use a local development server.

Choose one of the following options:

### Option A — Python (no install required)
```bash
cd path/to/sugarsmart/
python3 -m http.server 8080
```
Open your browser at: **`http://localhost:8080`**

### Option B — Node.js (npx serve)
```bash
npx serve path/to/sugarsmart/
```
Open the URL shown in the terminal output.

### Option C — VS Code Live Server
1. Install the **"Live Server"** extension by Ritwick Dey
2. Right-click `index.html` in the file explorer
3. Select **"Open with Live Server"**
4. The browser will open automatically at `http://127.0.0.1:5500`

---

## Step 7 — Test the Integration

After the app loads in your browser, verify each Firebase service is working:

### ✅ Authentication
1. Click **"Sign Up"** on the auth screen
2. Enter an email and password → submit
3. The app should load the main dashboard
4. In Firebase Console → **Authentication → Users**, your new account should appear

### ✅ Firestore — Glucose Readings
1. Navigate to the **Glucose** tab
2. Click **"+ Log New Reading"**
3. Enter a value and save
4. In Firebase Console → **Firestore Database → Data**, navigate to:
   `users → {your UID} → glucoseReadings`
   The new document should appear in real time

### ✅ Firestore — Meals
1. Navigate to the **Meals** tab
2. Add a meal entry
3. In Firestore, check: `users → {uid} → meals`

### ✅ Firestore — Goals
1. Navigate to the **Goals** tab
2. Adjust any slider → click **"Save Goals"**
3. In Firestore, check: `users → {uid} → settings → goals`

### ✅ Firestore — Reminders
1. Navigate to the **Reminders** tab
2. Add a reminder
3. In Firestore, check: `users → {uid} → reminders`

### ✅ Storage — Meal Photos
1. Navigate to the **Meals** tab
2. When adding a meal, tap the photo area and select an image
3. Click **"Log Meal"**
4. In Firebase Console → **Storage**, navigate to: `users/{uid}/meals/`
   The uploaded photo should appear

### ✅ Real-Time Listener
1. Open the app in **two browser tabs** (both signed in as the same user)
2. Log a glucose reading in one tab
3. The dashboard in the other tab should update automatically without refreshing — this confirms the Firestore `onSnapshot` real-time listener is working

---

## Step 8 — Go Live with Firebase Hosting (Optional)

To publish the app online with a free Firebase-hosted URL:

### Install Firebase CLI
```bash
npm install -g firebase-tools
```

### Login to Firebase
```bash
firebase login
```

### Initialise Hosting inside the project folder
```bash
cd path/to/sugarsmart/
firebase init hosting
```

Answer the prompts as follows:

| Prompt | Answer |
|--------|--------|
| Select project | Choose your `SugarSmart` project |
| Public directory | `.` (current folder) |
| Configure as single-page app? | `No` |
| Set up automatic builds with GitHub? | `No` |
| Overwrite `index.html`? | `No` |

### Deploy
```bash
firebase deploy
```

Your app will be live at:
```
https://sugarsmart-abc.web.app
https://sugarsmart-abc.firebaseapp.com
```

---

## 🗄️ Firestore Data Structure Reference

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

## 🔄 What Firebase Does for Each App Action

| Action in App | Firebase Service | What Happens |
|---|---|---|
| Sign Up | Authentication | New user account created |
| Sign In | Authentication | Session token issued |
| Sign Out | Authentication | Session cleared, Firestore listener detached |
| Log glucose reading | Firestore | Document added to `glucoseReadings/` |
| CGM auto-reading | Firestore | Same collection, `source: "cgm"` |
| Dashboard updates | Firestore | `onSnapshot` listener pushes changes in real time |
| Add a meal | Firestore | Document added to `meals/` |
| Upload meal photo | Storage | File saved to `users/{uid}/meals/`, URL stored in Firestore |
| Save goals | Firestore | `settings/goals` document written |
| Add reminder | Firestore | Document added to `reminders/` |
| Toggle reminder | Firestore | `active` field updated with `updateDoc` |
| Delete reminder | Firestore | Document removed with `deleteDoc` |

---

## 🛠️ Troubleshooting

**App still showing demo mode after pasting config**
- Make sure none of the values still contain `"YOUR_"` — even one will trigger demo mode
- Save `app.js` and hard-refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`)

**"Permission denied" error in console**
- Your Firestore or Storage security rules may not have been published yet
- Go to Firebase Console → Rules tab → click **"Publish"**

**Google sign-in popup blocked**
- The browser may block popups on first use — allow popups for `localhost` in browser settings

**Camera not working for barcode scanner**
- Camera access requires HTTPS or `localhost` — it will not work on plain `http://` remote URLs
- Use `localhost` for local dev, or Firebase Hosting (which provides HTTPS) for live deployment

**Module import errors in console**
- You are opening `index.html` directly from the filesystem — use a local server as described in Step 6

**Real-time listener not firing**
- Confirm Firestore is created and rules are published
- Check the browser console for any Firestore permission errors

---

## 🔐 Security Checklist Before Going Live

- [ ] Firestore rules published (not left in test mode)
- [ ] Storage rules published
- [ ] Authorized domains updated with your live domain
- [ ] API key restrictions set in **Google Cloud Console → APIs & Services → Credentials** (restrict to your domain)
- [ ] Firebase App Check enabled (optional, prevents API abuse)

---

> **Disclaimer:** SugarSmart is a supplementary tracking tool and is **not a medical device**. Always follow your doctor's instructions. In a medical emergency, call 911 immediately.
