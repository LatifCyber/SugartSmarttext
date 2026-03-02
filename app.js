// ================================================================
//  SugarSmart – app.js
//  Firebase + full app logic
// ================================================================

// ================================================================
//  🔥 FIREBASE CONFIGURATION
//  Replace placeholders with your Firebase project config.
//  Steps: console.firebase.google.com → Add web app → Copy config
// ================================================================
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_AUTH_DOMAIN",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

const FIREBASE_ENABLED = !firebaseConfig.apiKey.includes("YOUR_");

// ================================================================
//  Firebase imports
// ================================================================
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, getDocs, doc, setDoc,
  getDoc, deleteDoc, updateDoc, query, orderBy, onSnapshot,
  serverTimestamp, limit,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// ================================================================
//  App Initialisation
// ================================================================
let app, auth, db, storage;
let currentUser = null;
let glucoseUnsubscribe = null;
let cgmIntervalId = null;
let scannerStream = null;

if (FIREBASE_ENABLED) {
  app     = initializeApp(firebaseConfig);
  auth    = getAuth(app);
  db      = getFirestore(app);
  storage = getStorage(app);
} else {
  console.warn('SugarSmart: Running in DEMO MODE (no Firebase config)');
}

// ================================================================
//  DEMO USER
// ================================================================
const DEMO_USER = { uid: 'demo', displayName: 'Sarah Johnson', email: 'sarah@demo.com' };

// ================================================================
//  APP STATE
// ================================================================
const state = {
  dark: false,
  currentTab: 'dashboard',

  glucose: [
    { id:'g1', value:126, note:'Fasting',      noteExtra:'', source:'bgm', time:'07:00 AM', date:todayStr(), ts: Date.now()-10800000 },
    { id:'g2', value:168, note:'After Meal',   noteExtra:'', source:'cgm', time:'12:30 PM', date:todayStr(), ts: Date.now()-3600000  },
    { id:'g3', value:142, note:'Before Meal',  noteExtra:'', source:'manual', time:'06:00 PM', date:todayStr(), ts: Date.now()-600000 },
  ],

  meals: [
    { id:'m1', description:'Oatmeal with berries',    carbs:35, calories:180, sugar:8,  photoURL:'', ts: Date.now()-7200000 },
    { id:'m2', description:'Grilled chicken salad',   carbs:12, calories:320, sugar:3,  photoURL:'', ts: Date.now()-3600000 },
  ],

  goals: { carbs:150, sugar:30, calories:1800, targetBGLow:80, targetBGHigh:180 },

  reminders: [
    { id:'r1', label:'Take morning metformin', time:'08:00', type:'Medication', active:true  },
    { id:'r2', label:'Check blood sugar',       time:'12:00', type:'Blood',      active:true  },
    { id:'r3', label:'Evening medication',      time:'20:00', type:'Medication', active:false },
  ],

  devices: {
    bgm: { connected: false, signal: 'Strong', battery: '85%', lastSync: null },
    cgm: { connected: false, brand: 'FreeStyle Libre', sensorLife: '12 days left', liveValue: null, trend: '→' },
  },

  selectedReminderType: 'Medication',
  selectedPhotoFile: null,
};

// ================================================================
//  QUICK FOOD DATABASE
// ================================================================
const FOODS = [
  { id:1,  name:'Oatmeal',            carbs:27,  calories:150, sugar:1,   gi:'Low',  icon:'🥣' },
  { id:2,  name:'Apple',              carbs:25,  calories:95,  sugar:19,  gi:'Low',  icon:'🍎' },
  { id:3,  name:'White Rice',         carbs:45,  calories:200, sugar:0,   gi:'High', icon:'🍚' },
  { id:4,  name:'Grilled Chicken',    carbs:0,   calories:165, sugar:0,   gi:'None', icon:'🍗' },
  { id:5,  name:'Orange Juice',       carbs:26,  calories:112, sugar:21,  gi:'High', icon:'🍊' },
  { id:6,  name:'Whole Wheat Bread',  carbs:24,  calories:120, sugar:3,   gi:'Med',  icon:'🍞' },
  { id:7,  name:'Banana',             carbs:27,  calories:105, sugar:14,  gi:'Med',  icon:'🍌' },
  { id:8,  name:'Boiled Egg',         carbs:0.6, calories:78,  sugar:0.6, gi:'None', icon:'🥚' },
  { id:9,  name:'Greek Yogurt',       carbs:9,   calories:100, sugar:7,   gi:'Low',  icon:'🥛' },
  { id:10, name:'Brown Rice',         carbs:46,  calories:215, sugar:0.7, gi:'Med',  icon:'🍚' },
  { id:11, name:'Sweet Potato',       carbs:26,  calories:112, sugar:5.4, gi:'Low',  icon:'🍠' },
  { id:12, name:'Salmon',             carbs:0,   calories:208, sugar:0,   gi:'None', icon:'🐟' },
  { id:13, name:'Broccoli',           carbs:6,   calories:31,  sugar:1.5, gi:'Low',  icon:'🥦' },
  { id:14, name:'Avocado',            carbs:9,   calories:160, sugar:0.7, gi:'Low',  icon:'🥑' },
  { id:15, name:'Strawberries (1 cup)',carbs:11, calories:49,  sugar:7,   gi:'Low',  icon:'🍓' },
];

// Simulated barcode database
const BARCODE_DB = {
  '012345678901': { name:'Nature Valley Granola Bar', carbs:29, calories:190, sugar:12, icon:'🍫' },
  '023000006948': { name:'Tropicana Orange Juice',     carbs:26, calories:110, sugar:22, icon:'🍊' },
  '038000138416': { name:'Special K Cereal',           carbs:23, calories:120, sugar:4,  icon:'🥣' },
  '016000275010': { name:'Cheerios',                   carbs:29, calories:140, sugar:1,  icon:'🥣' },
  '040000494157': { name:'Snickers Bar',               carbs:35, calories:280, sugar:27, icon:'🍬' },
};

const REMINDER_TYPES = {
  Medication: '💊', Blood: '💉', Meal: '🍽️', Exercise: '🏃', Water: '💧', Other: '🔔',
};

// ================================================================
//  HELPERS
// ================================================================
function todayStr() {
  return new Date().toLocaleDateString();
}

function fmt(n) { return Math.round(n); }

function getBGColor(v) {
  if (v < 55)  return 'var(--danger)';
  if (v < 70)  return 'var(--danger)';
  if (v <= 180) return 'var(--success)';
  if (v <= 250) return 'var(--warning)';
  return 'var(--danger)';
}

function getBGLabel(v) {
  if (v < 55)  return 'CRITICAL LOW';
  if (v < 70)  return 'LOW';
  if (v <= 180) return 'NORMAL';
  if (v <= 250) return 'ELEVATED';
  return 'HIGH';
}

function getGIColor(gi) {
  if (gi === 'Low')  return 'var(--success)';
  if (gi === 'Med')  return 'var(--warning)';
  if (gi === 'High') return 'var(--danger)';
  return 'var(--text-light)';
}

function getActionRecommendation(val) {
  if (val < 55) return {
    icon: '🚨', title: 'CRITICAL — Act Now!',
    desc: 'Your glucose is dangerously low. Eat 15–20g of fast-acting carbs immediately (juice, glucose tablets, candy).',
    cta: '📞 Call Doctor', ctaFn: "window.location.href='tel:+15550100'",
    color: 'var(--danger)', bg: 'var(--danger-light)',
  };
  if (val < 70) return {
    icon: '🍬', title: 'Eat 15g Carbs Now',
    desc: 'Your glucose is low. Eat 15g of fast carbs: 4 glucose tablets, ½ cup juice, or 3 hard candies.',
    cta: '+ Log Snack', ctaFn: "switchTab('food')",
    color: 'var(--danger)', bg: 'var(--danger-light)',
  };
  if (val <= 130) return {
    icon: '✅', title: 'Excellent Control',
    desc: 'Your glucose is in the ideal range. Maintain your current routine, meals, and medication schedule.',
    cta: '+ Log Reading', ctaFn: "showLogForm();switchTab('glucose')",
    color: 'var(--success)', bg: 'var(--success-light)',
  };
  if (val <= 180) return {
    icon: '👍', title: 'In Range — Good',
    desc: 'Your glucose is normal. Keep monitoring and avoid high-GI foods for the next few hours.',
    cta: '🍽️ View Meals', ctaFn: "switchTab('food')",
    color: 'var(--success)', bg: 'var(--success-light)',
  };
  if (val <= 250) return {
    icon: '⚠️', title: 'Elevated — Take Insulin',
    desc: 'Your glucose is high. Consider taking insulin as prescribed. Drink water and avoid carbs.',
    cta: '💉 Log Reading', ctaFn: "showLogForm();switchTab('glucose')",
    color: 'var(--warning)', bg: 'var(--warning-light)',
  };
  return {
    icon: '🚨', title: 'Dangerously High!',
    desc: 'Your glucose is very high. Take insulin immediately and contact your doctor if readings stay elevated.',
    cta: '📞 Call Doctor', ctaFn: "window.location.href='tel:+15550100'",
    color: 'var(--danger)', bg: 'var(--danger-light)',
  };
}

function getTrendData(readings) {
  if (readings.length < 2) return { arrow: '→', label: 'Stable', color: 'var(--text-med)' };
  const latest = readings[0].value;
  const prev   = readings[1].value;
  const diff   = latest - prev;
  if (diff > 40)  return { arrow: '↑↑', label: 'Rising Fast',  color: 'var(--danger)' };
  if (diff > 15)  return { arrow: '↑',  label: 'Rising',       color: 'var(--warning)' };
  if (diff < -40) return { arrow: '↓↓', label: 'Falling Fast', color: 'var(--danger)' };
  if (diff < -15) return { arrow: '↓',  label: 'Falling',      color: 'var(--success)' };
  return { arrow: '→', label: 'Stable', color: 'var(--text-med)' };
}

function showToast(msg, color) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color || 'var(--success)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ================================================================
//  AUTH
// ================================================================
let authMode = 'login';

window.setAuthMode = function(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('confirmGroup').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('authError').classList.remove('show');
};

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
}

window.handleEmailAuth = async function() {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const confirm  = document.getElementById('authConfirm').value;
  const btn      = document.getElementById('authSubmitBtn');

  if (!email || !password) { showAuthError('Please enter email and password.'); return; }
  if (!FIREBASE_ENABLED)   { onUserSignedIn(DEMO_USER); return; }

  btn.innerHTML = '<span class="loading-spinner"></span>';
  btn.disabled  = true;

  try {
    if (authMode === 'signup') {
      if (password !== confirm) { showAuthError('Passwords do not match.'); return; }
      if (password.length < 6)  { showAuthError('Minimum 6 characters required.'); return; }
      const c = await createUserWithEmailAndPassword(auth, email, password);
      onUserSignedIn(c.user);
    } else {
      const c = await signInWithEmailAndPassword(auth, email, password);
      onUserSignedIn(c.user);
    }
  } catch(e) {
    const msgs = {
      'auth/user-not-found':     'No account found with this email.',
      'auth/wrong-password':     'Incorrect password.',
      'auth/email-already-in-use': 'Email already registered. Sign in instead.',
      'auth/invalid-email':      'Invalid email address.',
      'auth/too-many-requests':  'Too many attempts. Try again later.',
    };
    showAuthError(msgs[e.code] || e.message);
  } finally {
    btn.innerHTML = authMode === 'login' ? 'Sign In' : 'Create Account';
    btn.disabled  = false;
  }
};

window.handleGoogleAuth = async function() {
  if (!FIREBASE_ENABLED) { onUserSignedIn(DEMO_USER); return; }
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    onUserSignedIn(cred.user);
  } catch(e) { showAuthError('Google sign-in failed: ' + e.message); }
};

window.handleSignOut = async function() {
  if (FIREBASE_ENABLED && auth) await signOut(auth);
  if (glucoseUnsubscribe) { glucoseUnsubscribe(); glucoseUnsubscribe = null; }
  if (cgmIntervalId) { clearInterval(cgmIntervalId); cgmIntervalId = null; }
  stopBarcodeScanner();
  currentUser = null;
  document.getElementById('mainApp').classList.remove('show');
  document.getElementById('authScreen').style.display = 'flex';
};

// ================================================================
//  ON USER SIGNED IN
// ================================================================
async function onUserSignedIn(user) {
  currentUser = user;
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').classList.add('show');

  if (FIREBASE_ENABLED && db) {
    await loadGoals();
    await loadMeals();
    await loadReminders();
    setupGlucoseListener();
  }

  initApp();
}

// ================================================================
//  FIRESTORE: GLUCOSE
// ================================================================
function setupGlucoseListener() {
  if (!currentUser || !db) return;
  const col = collection(db, 'users', currentUser.uid, 'glucoseReadings');
  const q   = query(col, orderBy('ts', 'desc'), limit(50));

  glucoseUnsubscribe = onSnapshot(q, (snap) => {
    state.glucose = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCurrentTab(state.currentTab);
    const latest = state.glucose[0];
    if (latest && latest.value < 55) triggerCriticalLow(latest.value);
  }, (err) => console.error('Glucose listener:', err));
}

async function saveReadingToFirestore(reading) {
  if (!FIREBASE_ENABLED || !db || !currentUser) {
    state.glucose.unshift({ id: 'g' + Date.now(), ...reading });
    state.glucose.sort((a, b) => b.ts - a.ts);
    return;
  }
  await addDoc(collection(db, 'users', currentUser.uid, 'glucoseReadings'), {
    ...reading, ts: serverTimestamp(),
  });
}

// ================================================================
//  FIRESTORE: MEALS
// ================================================================
async function loadMeals() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'users', currentUser.uid, 'meals'), orderBy('ts', 'desc'), limit(20)
    ));
    state.meals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error('Load meals:', e); }
}

async function saveMealToFirestore(meal) {
  if (!FIREBASE_ENABLED || !db || !currentUser) {
    state.meals.unshift({ id: 'm' + Date.now(), ...meal });
    return;
  }
  const r = await addDoc(collection(db, 'users', currentUser.uid, 'meals'), {
    ...meal, ts: serverTimestamp(),
  });
  state.meals.unshift({ id: r.id, ...meal });
}

async function deleteMealFromFirestore(id) {
  state.meals = state.meals.filter(m => m.id !== id);
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'meals', id)); }
  catch(e) { console.error('Delete meal:', e); }
}

// ================================================================
//  FIRESTORE: GOALS
// ================================================================
async function loadGoals() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'settings', 'goals'));
    if (snap.exists()) Object.assign(state.goals, snap.data());
  } catch(e) { console.error('Load goals:', e); }
}

async function saveGoalsToFirestore() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'goals'), state.goals); }
  catch(e) { console.error('Save goals:', e); }
}

// ================================================================
//  FIRESTORE: REMINDERS
// ================================================================
async function loadReminders() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'reminders'));
    if (!snap.empty) state.reminders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error('Load reminders:', e); }
}

async function saveReminderToFirestore(r) {
  if (!FIREBASE_ENABLED || !db || !currentUser) {
    state.reminders.push({ id: 'r' + Date.now(), ...r });
    return;
  }
  const ref = await addDoc(collection(db, 'users', currentUser.uid, 'reminders'), r);
  state.reminders.push({ id: ref.id, ...r });
}

async function updateReminderInFirestore(id, data) {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await updateDoc(doc(db, 'users', currentUser.uid, 'reminders', id), data); }
  catch(e) { console.error('Update reminder:', e); }
}

async function deleteReminderFromFirestore(id) {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'reminders', id)); }
  catch(e) { console.error('Delete reminder:', e); }
}

// ================================================================
//  FIREBASE STORAGE: PHOTO
// ================================================================
async function uploadMealPhoto(file) {
  if (!FIREBASE_ENABLED || !storage || !currentUser) return null;
  return new Promise((resolve, reject) => {
    const storRef = ref(storage, `users/${currentUser.uid}/meals/${Date.now()}_${file.name}`);
    const task    = uploadBytesResumable(storRef, file);
    const bar     = document.getElementById('uploadProgressBar');
    const prog    = document.getElementById('uploadProgress');
    prog.classList.add('show');
    task.on('state_changed',
      snap => { bar.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + '%'; },
      err  => { prog.classList.remove('show'); reject(err); },
      async () => { prog.classList.remove('show'); resolve(await getDownloadURL(task.snapshot.ref)); }
    );
  });
}

// ================================================================
//  AUTH STATE OBSERVER
// ================================================================
if (FIREBASE_ENABLED && auth) {
  onAuthStateChanged(auth, user => {
    if (user) onUserSignedIn(user);
    else {
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('mainApp').classList.remove('show');
    }
  });
} else {
  document.getElementById('authScreen').style.display = 'flex';
}

// ================================================================
//  DARK MODE
// ================================================================
window.toggleDark = function() {
  state.dark = !state.dark;
  document.body.classList.toggle('dark', state.dark);
  ['toggleTrack','authToggleTrack'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', state.dark);
  });
  ['toggleThumb','authToggleThumb'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.toggle('on', state.dark); el.textContent = state.dark ? '🌙' : '☀️'; }
  });
};

// ================================================================
//  TAB SWITCHING
// ================================================================
window.switchTab = function(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('mainContent').scrollTop = 0;
  renderCurrentTab(tab);
};

function renderCurrentTab(tab) {
  if (tab === 'dashboard') renderDashboard();
  else if (tab === 'glucose')   renderGlucose();
  else if (tab === 'devices')   renderDevices();
  else if (tab === 'food')      renderFood();
  else if (tab === 'goals')     renderGoals();
  else if (tab === 'reminders') renderReminders();
  else if (tab === 'report')    renderReport();
}

// ================================================================
//  DASHBOARD
// ================================================================
function renderDashboard() {
  const now = new Date();
  const h   = now.getHours();
  const name = currentUser?.displayName?.split(' ')[0] || 'there';
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  document.getElementById('heroDate').textContent =
    now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  document.getElementById('heroGreeting').textContent = greeting + ', ' + name + ' 👋';

  const latest = state.glucose[0];
  const trend  = getTrendData(state.glucose);

  // Gauge
  if (latest) {
    const val   = latest.value;
    const pct   = Math.min(val / 400, 1);
    const arc   = pct * 188.5;
    const color = getBGColor(val);
    const lbl   = getBGLabel(val);

    document.getElementById('gaugeFill').setAttribute('stroke-dasharray', arc + ' 188.5');
    document.getElementById('gaugeFill').setAttribute('stroke', color);
    document.getElementById('gaugeVal').textContent = val;

    const gStatus = document.getElementById('gaugeStatus');
    gStatus.textContent = lbl;
    gStatus.style.color = color;
    gStatus.style.background = color + '22';

    document.getElementById('gaugeTime').textContent = 'Last: ' + latest.time;

    // Trend chip
    const trendEl = document.getElementById('trendChip');
    trendEl.textContent = trend.arrow + ' ' + trend.label;
    trendEl.style.color = trend.color;

    // Action recommendation
    const rec = getActionRecommendation(val);
    const box = document.getElementById('actionBox');
    box.style.background = rec.bg;
    box.style.borderColor = rec.color;
    document.getElementById('actionIcon').textContent  = rec.icon;
    document.getElementById('actionTitle').textContent = rec.title;
    document.getElementById('actionDesc').textContent  = rec.desc;
    const ctaBtn = document.getElementById('actionCta');
    ctaBtn.textContent = rec.cta;
    ctaBtn.style.background = rec.color;
    ctaBtn.onclick = () => eval(rec.ctaFn); // safe: controlled strings above
  }

  // Goals progress
  const tc   = state.meals.reduce((s,m) => s + (m.carbs||0), 0);
  const ts   = state.meals.reduce((s,m) => s + (m.sugar||0), 0);
  const tcal = state.meals.reduce((s,m) => s + (m.calories||0), 0);
  const g    = state.goals;

  function setBar(valId, fillId, val, max, unit, color) {
    document.getElementById(valId).textContent = fmt(val) + unit + ' / ' + max + unit;
    document.getElementById(valId).style.color = val > max ? 'var(--danger)' : 'var(--text)';
    document.getElementById(fillId).style.width = Math.min(val / max * 100, 100) + '%';
    document.getElementById(fillId).style.background = val > max ? 'var(--danger)' : color;
  }
  setBar('carbsVal', 'carbsFill', tc,   g.carbs,    'g',    'var(--primary)');
  setBar('sugarVal', 'sugarFill', ts,   g.sugar,    'g',    'var(--warning)');
  setBar('calVal',   'calFill',   tcal, g.calories, 'kcal', 'var(--success)');

  document.getElementById('statMeals').textContent    = state.meals.length;
  document.getElementById('statReadings').textContent = state.glucose.length;

  // Mini trend chart (last 6 readings)
  renderMiniChart();

  // Active reminders
  const active = state.reminders.filter(r => r.active);
  const card   = document.getElementById('dashRemindersCard');
  const list   = document.getElementById('dashRemindersList');
  if (!active.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  list.innerHTML = active.slice(0, 4).map(r => `
    <div class="reminder-row">
      <div class="reminder-dot" style="background:var(--success)"></div>
      <div style="flex:1;font-weight:600;color:var(--text);font-size:13px">${r.label}</div>
      <div style="font-size:12px;color:var(--primary);font-weight:700;font-family:'DM Mono',monospace">${r.time}</div>
    </div>
  `).join('');
}

// ================================================================
//  MINI TREND CHART (SVG sparkline)
// ================================================================
function renderMiniChart() {
  const container = document.getElementById('miniTrendChart');
  const readings  = [...state.glucose].slice(0, 8).reverse();
  if (readings.length < 2) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);font-size:12px;padding:20px 0">Log 2+ readings to see trend</div>';
    return;
  }

  const W = 340, H = 70, PAD = 8;
  const values = readings.map(r => r.value);
  const minV   = Math.min(...values, 70);
  const maxV   = Math.max(...values, 180);
  const range  = maxV - minV || 1;

  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - minV) / range) * (H - PAD * 2);
    return { x, y, v };
  });

  const pathD = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

  // Reference lines
  const normalLowY  = H - PAD - ((70  - minV) / range) * (H - PAD * 2);
  const normalHighY = H - PAD - ((180 - minV) / range) * (H - PAD * 2);

  const dots = pts.map(p => {
    const col = p.v < 70 ? '#EF4444' : p.v <= 180 ? '#10B981' : '#F59E0B';
    return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${col}" stroke="var(--card)" stroke-width="2"/>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px;overflow:visible">
      <!-- Normal zone shading -->
      <rect x="${PAD}" y="${Math.max(normalHighY, PAD)}" width="${W - PAD*2}" height="${normalLowY - normalHighY}" fill="#10B98111" rx="2"/>
      <!-- Reference lines -->
      ${minV <= 70  ? `<line x1="${PAD}" x2="${W-PAD}" y1="${normalLowY}"  y2="${normalLowY}"  stroke="#EF444444" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
      ${maxV >= 180 ? `<line x1="${PAD}" x2="${W-PAD}" y1="${normalHighY}" y2="${normalHighY}" stroke="#F59E0B44" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
      <!-- Line -->
      <path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- Dots -->
      ${dots}
    </svg>
  `;
}

// ================================================================
//  GLUCOSE
// ================================================================
window.showLogForm = function() {
  document.getElementById('logForm').classList.add('show');
  document.getElementById('logBtnWrap').style.display = 'none';
};

window.hideLogForm = function() {
  document.getElementById('logForm').classList.remove('show');
  document.getElementById('logBtnWrap').style.display = 'block';
  document.getElementById('bgInput').value     = '';
  document.getElementById('bgNoteExtra').value = '';
};

window.saveReading = async function() {
  const val = parseFloat(document.getElementById('bgInput').value);
  if (!val || val < 20 || val > 600) { showToast('Enter a valid value (20–600)', 'var(--danger)'); return; }

  const note      = document.getElementById('bgNote').value;
  const source    = document.getElementById('bgSource').value;
  const noteExtra = document.getElementById('bgNoteExtra').value.trim();
  const now       = new Date();
  const btn       = document.getElementById('saveReadingBtn');

  btn.innerHTML = '<span class="loading-spinner"></span>';
  btn.disabled  = true;

  const reading = {
    value: val, note, source, noteExtra,
    time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
    date: now.toLocaleDateString(),
    ts: now.getTime(),
  };

  try {
    await saveReadingToFirestore(reading);
    hideLogForm();
    renderGlucose();
    renderDashboard();
    showToast('✅ Reading saved!');
    if (val < 55) triggerCriticalLow(val);
    else if (val < 70) showToast('⚠️ Low glucose! Eat 15g carbs now.', 'var(--danger)');
    else if (val > 250) showToast('⚠️ High glucose! Check with doctor.', 'var(--warning)');
  } catch(e) {
    showToast('Error: ' + e.message, 'var(--danger)');
  } finally {
    btn.innerHTML = 'Save';
    btn.disabled  = false;
  }
};

function renderGlucose() {
  const hist = document.getElementById('glucoseHistory');
  if (!state.glucose.length) {
    hist.innerHTML = '<div class="card empty-state">No readings yet. Log your first reading above!</div>';
    return;
  }
  hist.innerHTML = state.glucose.map(r => {
    const c    = getBGColor(r.value);
    const lbl  = getBGLabel(r.value);
    const src  = r.source === 'cgm' ? '📡' : r.source === 'bgm' ? '🩸' : '✏️';
    return `
      <div class="card list-item mb10" style="padding:12px 14px">
        <div class="list-icon-box" style="background:${c}22">
          <span style="font-size:16px;font-weight:800;color:${c};font-family:'Syne',sans-serif">${r.value}</span>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${r.note} ${src}</div>
          ${r.noteExtra ? `<div style="font-size:12px;color:var(--text-med);font-style:italic">${r.noteExtra}</div>` : ''}
          <div style="font-size:11px;color:var(--text-light)">${r.date} · ${r.time}</div>
        </div>
        <span class="badge" style="color:${c};background:${c}22">${lbl}</span>
      </div>
    `;
  }).join('');
}

// ================================================================
//  DEVICES PAGE
// ================================================================
function renderDevices() {
  // Just update UI based on state (live data comes from CGM interval)
  updateDeviceUI();
}

function updateDeviceUI() {
  const d = state.devices;

  // BGM
  const bgmBadge = document.getElementById('bgmBadge');
  const bgmBody  = document.getElementById('bgmBody');
  const bgmInfo  = document.getElementById('bgmConnectedInfo');
  if (d.bgm.connected) {
    bgmBadge.textContent = 'Connected ✓';
    bgmBadge.className   = 'device-badge connected';
    bgmBody.style.display = 'none';
    bgmInfo.style.display = 'block';
    document.getElementById('bgmLastSync').textContent = d.bgm.lastSync || 'Just now';
  } else {
    bgmBadge.textContent  = 'Disconnected';
    bgmBadge.className    = 'device-badge';
    bgmBody.style.display = 'block';
    bgmInfo.style.display = 'none';
  }

  // CGM
  const cgmBadge = document.getElementById('cgmBadge');
  const cgmBody  = document.getElementById('cgmBody');
  const cgmInfo  = document.getElementById('cgmConnectedInfo');
  if (d.cgm.connected) {
    cgmBadge.textContent = 'Streaming Live ✓';
    cgmBadge.className   = 'device-badge connected';
    cgmBody.style.display = 'none';
    cgmInfo.style.display = 'block';
    document.getElementById('cgmLiveVal').textContent   = d.cgm.liveValue || '—';
    document.getElementById('cgmLiveTrend').textContent = d.cgm.trend + ' ' + (d.cgm.trendLabel || 'Stable');
    document.getElementById('cgmBrand').textContent     = d.cgm.brand;
  } else {
    cgmBadge.textContent  = 'Disconnected';
    cgmBadge.className    = 'device-badge';
    cgmBody.style.display = 'block';
    cgmInfo.style.display = 'none';
  }

  // Top bar connection status
  const dot   = document.getElementById('connDot');
  const label = document.getElementById('connLabel');
  if (d.cgm.connected) {
    dot.className   = 'conn-dot cgm-connected';
    label.textContent = 'CGM Live';
  } else if (d.bgm.connected) {
    dot.className   = 'conn-dot connected';
    label.textContent = 'BGM';
  } else {
    dot.className   = 'conn-dot disconnected';
    label.textContent = 'No Device';
  }
}

window.connectDevice = async function(type) {
  const scanCard = document.getElementById('btScanCard');
  scanCard.style.display = 'block';
  document.getElementById(type === 'bgm' ? 'bgmBody' : 'cgmBody').style.display = 'none';
  showToast('🔵 Scanning for ' + type.toUpperCase() + '...', 'var(--primary)');

  // Simulate Bluetooth scan (2.5 seconds)
  await new Promise(resolve => setTimeout(resolve, 2500));

  scanCard.style.display = 'none';

  if (type === 'bgm') {
    state.devices.bgm.connected = true;
    state.devices.bgm.lastSync  = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    showToast('✅ BGM Connected! Reading synced.', 'var(--success)');
    // Simulate a synced reading
    const syncedVal = Math.round(100 + Math.random() * 80);
    const now = new Date();
    await saveReadingToFirestore({
      value: syncedVal, note: 'Random', source: 'bgm', noteExtra: 'Auto-synced via Bluetooth',
      time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      date: now.toLocaleDateString(), ts: now.getTime(),
    });
    renderDashboard();
    renderGlucose();
  } else {
    const brand = document.getElementById('cgmBrandSelect').value;
    const brandName = { freestyle: 'FreeStyle Libre', dexcom: 'Dexcom G7', medtronic: 'Medtronic Guardian' }[brand];
    state.devices.cgm.connected = true;
    state.devices.cgm.brand     = brandName;
    state.devices.cgm.liveValue = Math.round(110 + Math.random() * 60);
    startCGMSimulation();
    showToast('📡 ' + brandName + ' Connected! Live data streaming.', 'var(--success)');
  }

  updateDeviceUI();
};

window.disconnectDevice = function(type) {
  if (type === 'bgm') {
    state.devices.bgm.connected = false;
    showToast('BGM disconnected', 'var(--text-med)');
  } else {
    state.devices.cgm.connected  = false;
    state.devices.cgm.liveValue  = null;
    if (cgmIntervalId) { clearInterval(cgmIntervalId); cgmIntervalId = null; }
    showToast('CGM sensor disconnected', 'var(--text-med)');
  }
  updateDeviceUI();
};

window.cancelScan = function() {
  document.getElementById('btScanCard').style.display = 'none';
  showToast('Scan cancelled', 'var(--text-med)');
};

function startCGMSimulation() {
  if (cgmIntervalId) clearInterval(cgmIntervalId);
  cgmIntervalId = setInterval(async () => {
    if (!state.devices.cgm.connected) return;
    const last = state.devices.cgm.liveValue || 120;
    const delta = (Math.random() - 0.45) * 12;
    const newVal = Math.max(40, Math.min(400, Math.round(last + delta)));
    const trendData = getTrendData([{ value: newVal }, { value: last }]);
    state.devices.cgm.liveValue  = newVal;
    state.devices.cgm.trend      = trendData.arrow;
    state.devices.cgm.trendLabel = trendData.label;

    // Auto-save CGM reading every 5 min (simulated as every interval)
    const now = new Date();
    await saveReadingToFirestore({
      value: newVal, note: 'CGM Auto', source: 'cgm', noteExtra: state.devices.cgm.brand,
      time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      date: now.toLocaleDateString(), ts: now.getTime(),
    });
    renderDashboard();
    renderGlucose();
    if (state.currentTab === 'devices') updateDeviceUI();
    if (newVal < 55) triggerCriticalLow(newVal);
    else if (newVal < 70) showToast('⚠️ CGM: Low glucose! Eat 15g carbs.', 'var(--danger)');
    else if (newVal > 280) showToast('⚠️ CGM: High glucose detected.', 'var(--warning)');
  }, 30000); // every 30 seconds in demo (real = 5 min)
}

window.saveManualReading = async function() {
  const val = parseFloat(document.getElementById('manualBgInput').value);
  if (!val || val < 20 || val > 600) { showToast('Enter valid reading', 'var(--danger)'); return; }
  const now = new Date();
  await saveReadingToFirestore({
    value: val, note: 'Random', source: 'manual', noteExtra: 'Manual entry from Devices page',
    time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
    date: now.toLocaleDateString(), ts: now.getTime(),
  });
  document.getElementById('manualBgInput').value = '';
  renderDashboard(); renderGlucose();
  showToast('✅ Reading saved!');
  if (val < 55) triggerCriticalLow(val);
};

// ================================================================
//  BARCODE SCANNER
// ================================================================
window.startBarcodeScanner = async function() {
  const placeholder = document.getElementById('barcodePlaceholder');
  const scanner     = document.getElementById('barcodeScanner');
  const video       = document.getElementById('scannerVideo');

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = scannerStream;
    placeholder.style.display = 'none';
    scanner.style.display     = 'block';
    showToast('📷 Camera active — scanning...', 'var(--primary)');

    // Try BarcodeDetector API (Chrome/Edge on Android)
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'] });
      const scanLoop = async () => {
        if (!scannerStream) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) {
            handleBarcodeResult(codes[0].rawValue);
            return;
          }
        } catch(_) {}
        if (scannerStream) requestAnimationFrame(scanLoop);
      };
      requestAnimationFrame(scanLoop);
    } else {
      // Fallback: simulate scan after 3s with demo barcode
      setTimeout(() => {
        if (scannerStream) {
          const demoCodes = Object.keys(BARCODE_DB);
          handleBarcodeResult(demoCodes[Math.floor(Math.random() * demoCodes.length)]);
        }
      }, 3000);
      showToast('Demo mode: simulating scan...', 'var(--warning)');
    }
  } catch(e) {
    placeholder.style.display = 'block';
    scanner.style.display     = 'none';
    showToast('Camera not available. Use manual entry.', 'var(--warning)');
  }
};

window.stopBarcodeScanner = function() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  document.getElementById('barcodePlaceholder').style.display = 'block';
  document.getElementById('barcodeScanner').style.display     = 'none';
};

function handleBarcodeResult(barcode) {
  stopBarcodeScanner();
  const food   = BARCODE_DB[barcode];
  const result = document.getElementById('barcodeResult');
  result.style.display = 'block';

  if (food) {
    result.innerHTML = `
      <div style="font-size:22px;margin-bottom:6px">${food.icon}</div>
      <div style="font-weight:700;color:var(--success);font-size:14px;margin-bottom:8px">✅ Found: ${food.name}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;font-size:12px;text-align:center">
        <div><div style="font-weight:800;color:var(--primary);font-size:16px">${food.carbs}g</div><div style="color:var(--text-light)">Carbs</div></div>
        <div><div style="font-weight:800;color:var(--success);font-size:16px">${food.calories}</div><div style="color:var(--text-light)">Calories</div></div>
        <div><div style="font-weight:800;color:var(--warning);font-size:16px">${food.sugar}g</div><div style="color:var(--text-light)">Sugar</div></div>
      </div>
      <button class="btn-primary" onclick="addScannedFood('${food.name}',${food.carbs},${food.calories},${food.sugar})">+ Add to Meal Log</button>
    `;
    showToast('🎯 Barcode scanned!', 'var(--success)');
  } else {
    result.innerHTML = `
      <div style="color:var(--text-med);font-size:13px;margin-bottom:8px">Barcode: <code style="font-family:'DM Mono',monospace">${barcode}</code></div>
      <div style="color:var(--text-med);font-size:12px;margin-bottom:10px">Product not found in database. Enter details manually.</div>
      <button class="btn-secondary" onclick="document.getElementById('barcodeResult').style.display='none'">Dismiss</button>
    `;
  }
}

window.addScannedFood = async function(name, carbs, calories, sugar) {
  const meal = { description: name, carbs, calories, sugar, photoURL: '', ts: Date.now() };
  await saveMealToFirestore(meal);
  renderTodayLog();
  updateFoodSummary();
  renderDashboard();
  document.getElementById('barcodeResult').style.display = 'none';
  switchTab('food');
  showToast('🍽️ ' + name + ' added!');
};

// ================================================================
//  FOOD
// ================================================================
window.handlePhotoSelect = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  state.selectedPhotoFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('photoPreview');
    preview.src   = ev.target.result;
    preview.classList.add('show');
    document.getElementById('photoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.addMeal = async function() {
  const description = document.getElementById('mealDescription').value.trim();
  if (!description) { showToast('Please enter a meal description', 'var(--danger)'); return; }

  const carbs    = parseFloat(document.getElementById('mealCarbs').value) || 0;
  const calories = parseFloat(document.getElementById('mealCal').value)   || 0;
  const sugar    = parseFloat(document.getElementById('mealSugar').value) || 0;

  const btn = document.getElementById('addMealBtn');
  btn.innerHTML = '<span class="loading-spinner"></span> Saving...';
  btn.disabled  = true;

  let photoURL = '';
  try {
    if (state.selectedPhotoFile) photoURL = await uploadMealPhoto(state.selectedPhotoFile) || '';
    await saveMealToFirestore({ description, carbs, calories, sugar, photoURL, ts: Date.now() });
    document.getElementById('mealDescription').value = '';
    document.getElementById('mealCarbs').value       = '';
    document.getElementById('mealCal').value         = '';
    document.getElementById('mealSugar').value       = '';
    document.getElementById('photoPreview').src      = '';
    document.getElementById('photoPreview').classList.remove('show');
    document.getElementById('photoPlaceholder').style.display = 'block';
    state.selectedPhotoFile = null;
    renderFood(); renderDashboard();
    showToast('🍽️ Meal logged!');
  } catch(e) {
    showToast('Error: ' + e.message, 'var(--danger)');
  } finally {
    btn.innerHTML = '🍽️ Log Meal';
    btn.disabled  = false;
  }
};

window.removeMeal = async function(id) {
  await deleteMealFromFirestore(id);
  renderFood(); renderDashboard();
  showToast('Meal removed', 'var(--text-med)');
};

window.filterFoods = function() {
  renderFoodList(document.getElementById('foodSearch').value.toLowerCase());
};

window.quickAddFood = async function(id) {
  const food = FOODS.find(f => f.id === id);
  if (!food) return;
  await saveMealToFirestore({
    description: food.name, carbs: food.carbs, calories: food.calories, sugar: food.sugar,
    photoURL: food.icon, ts: Date.now(),
  });
  renderTodayLog(); updateFoodSummary(); renderDashboard();
  showToast('🍽️ ' + food.name + ' added!');
};

function renderFood() {
  renderFoodList('');
  renderTodayLog();
  updateFoodSummary();
}

function renderFoodList(q) {
  const list     = document.getElementById('foodList');
  const filtered = FOODS.filter(f => f.name.toLowerCase().includes(q));
  list.innerHTML = filtered.map(food => {
    const gc = getGIColor(food.gi);
    return `
      <div class="card list-item mb10" style="padding:11px 13px">
        <span style="font-size:26px;width:38px;text-align:center">${food.icon}</span>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:3px">
            <span style="font-size:13px;font-weight:700;color:var(--text)">${food.name}</span>
            <span class="badge" style="color:${gc};background:${gc}22">GI: ${food.gi}</span>
          </div>
          <div style="font-size:11px;display:flex;gap:10px;flex-wrap:wrap">
            <span style="color:var(--primary);font-weight:600">${food.carbs}g carbs</span>
            <span style="color:var(--text-light)">${food.calories} kcal</span>
            <span style="color:var(--warning)">${food.sugar}g sugar</span>
          </div>
        </div>
        <button onclick="quickAddFood(${food.id})" style="padding:9px 12px;background:var(--primary);color:#fff;border:none;border-radius:9px;font-weight:700;font-size:12px;cursor:pointer;font-family:'Manrope',sans-serif;min-height:40px">Add</button>
      </div>
    `;
  }).join('') || '<div class="card empty-state">No foods found.</div>';
}

function renderTodayLog() {
  const sec = document.getElementById('todayLogSection');
  const log = document.getElementById('todayLog');
  if (!state.meals.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  log.innerHTML = state.meals.map(m => `
    <div class="card mb8" style="padding:10px 13px">
      <div style="display:flex;align-items:center;gap:10px">
        ${m.photoURL && m.photoURL.startsWith('http')
          ? `<img src="${m.photoURL}" class="meal-thumb" alt="${m.description}"/>`
          : `<span style="font-size:24px;width:42px;text-align:center">${m.photoURL || '🍽️'}</span>`}
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${m.description}</div>
          <div style="font-size:11px;color:var(--text-light)">${m.carbs}g carbs · ${m.calories} kcal · ${m.sugar}g sugar</div>
        </div>
        <button onclick="removeMeal('${m.id}')" style="background:var(--danger-light);color:var(--danger);border:none;border-radius:7px;padding:5px 9px;font-weight:700;font-size:11px;cursor:pointer;font-family:'Manrope',sans-serif;min-height:32px">✕</button>
      </div>
    </div>
  `).join('');
}

function updateFoodSummary() {
  const tc   = state.meals.reduce((s,m) => s + (m.carbs||0),    0);
  const ts   = state.meals.reduce((s,m) => s + (m.sugar||0),    0);
  const tcal = state.meals.reduce((s,m) => s + (m.calories||0), 0);
  document.getElementById('foodCarbs').textContent = fmt(tc)   + 'g';
  document.getElementById('foodSugar').textContent = fmt(ts)   + 'g';
  document.getElementById('foodCal').textContent   = fmt(tcal);
  document.getElementById('foodItems').textContent = state.meals.length;
}

// ================================================================
//  GOALS
// ================================================================
const GOAL_FIELDS = [
  { key:'carbs',        label:'Daily Carbohydrate Goal', unit:'g',     icon:'🌾', min:50,   max:400  },
  { key:'sugar',        label:'Daily Sugar Limit',       unit:'g',     icon:'🍭', min:10,   max:100  },
  { key:'calories',     label:'Daily Calorie Goal',      unit:'kcal',  icon:'🔥', min:1000, max:4000 },
  { key:'targetBGLow',  label:'Target BG Low Threshold', unit:'mg/dL', icon:'📉', min:60,   max:100  },
  { key:'targetBGHigh', label:'Target BG High Threshold',unit:'mg/dL', icon:'📈', min:140,  max:250  },
];

function renderGoals() {
  document.getElementById('goalsForm').innerHTML = GOAL_FIELDS.map(f => `
    <div class="card mb14">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:22px">${f.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${f.label}</div>
          <div style="font-size:11px;color:var(--text-light)">Range: ${f.min}–${f.max} ${f.unit}</div>
        </div>
      </div>
      <div class="slider-row">
        <input type="range" min="${f.min}" max="${f.max}" value="${state.goals[f.key]}"
          oninput="updateGoalSlider('${f.key}','${f.unit}',this.value)" id="slider-${f.key}"/>
        <div class="slider-val" id="sliderVal-${f.key}">${state.goals[f.key]} ${f.unit}</div>
      </div>
    </div>
  `).join('');
}

window.updateGoalSlider = function(key, unit, val) {
  state.goals[key] = +val;
  document.getElementById('sliderVal-' + key).textContent = val + ' ' + unit;
};

window.saveGoals = async function() {
  await saveGoalsToFirestore();
  const banner = document.getElementById('goalsBanner');
  banner.classList.add('show');
  showToast('✅ Goals saved!');
  setTimeout(() => banner.classList.remove('show'), 3000);
};

// ================================================================
//  REMINDERS
// ================================================================
function renderReminders() {
  const pills = document.getElementById('reminderTypePills');
  pills.innerHTML = Object.entries(REMINDER_TYPES).map(([k, ico]) => `
    <button class="type-pill ${state.selectedReminderType === k ? 'selected' : ''}"
      onclick="selectReminderType('${k}')">${ico} ${k}</button>
  `).join('');
  renderRemindersList();
}

window.selectReminderType = function(type) {
  state.selectedReminderType = type;
  document.querySelectorAll('.type-pill').forEach(p => {
    p.classList.toggle('selected', p.textContent.trim().includes(type));
  });
};

window.addReminder = async function() {
  const label = document.getElementById('reminderLabel').value.trim();
  const time  = document.getElementById('reminderTime').value;
  if (!label) { showToast('Please enter a label', 'var(--danger)'); return; }
  await saveReminderToFirestore({ label, time, type: state.selectedReminderType, active: true });
  document.getElementById('reminderLabel').value = '';
  renderRemindersList();
  showToast('🔔 Reminder added!');
};

window.toggleReminderActive = async function(id) {
  const r = state.reminders.find(r => r.id === id);
  if (r) { r.active = !r.active; await updateReminderInFirestore(id, { active: r.active }); }
  renderRemindersList();
};

window.deleteReminder = async function(id) {
  state.reminders = state.reminders.filter(r => r.id !== id);
  await deleteReminderFromFirestore(id);
  renderRemindersList();
  showToast('Reminder deleted', 'var(--text-med)');
};

function renderRemindersList() {
  const list = document.getElementById('remindersList');
  if (!state.reminders.length) {
    list.innerHTML = '<div class="card empty-state">No reminders yet. Add your first above!</div>';
    return;
  }
  list.innerHTML = state.reminders.map(r => `
    <div class="card mb10" style="padding:12px 14px">
      <div style="display:flex;align-items:center;gap:11px">
        <div class="list-icon-box" style="background:color-mix(in srgb,var(--primary) 15%,transparent);width:42px;height:42px;font-size:20px">
          ${REMINDER_TYPES[r.type] || '🔔'}
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${r.label}</div>
          <div style="font-size:11px;color:var(--primary);font-weight:600;font-family:'DM Mono',monospace">${r.time} · ${r.type}</div>
        </div>
        <div class="reminder-actions">
          <button class="toggle-status-btn ${r.active ? 'on' : 'off'}" onclick="toggleReminderActive('${r.id}')">
            ${r.active ? 'ON' : 'OFF'}
          </button>
          <button class="delete-btn" onclick="deleteReminder('${r.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ================================================================
//  REPORT
// ================================================================
function renderReport() {
  document.getElementById('reportDate').textContent  = new Date().toLocaleDateString();
  document.getElementById('rptName').textContent     = currentUser?.displayName || 'Patient';
  document.getElementById('rptEmail').textContent    = currentUser?.email || '—';

  // Device info in report
  const deviceStr = [
    state.devices.bgm.connected ? 'BGM (Bluetooth)' : null,
    state.devices.cgm.connected ? ('CGM: ' + state.devices.cgm.brand) : null,
  ].filter(Boolean).join(', ') || 'Manual Entry';
  document.getElementById('rptDevices').textContent = deviceStr;

  const gs    = state.glucose;
  const total = gs.length;
  const avg   = total ? Math.round(gs.reduce((s,r) => s + r.value, 0) / total) : 0;
  const high  = gs.filter(r => r.value > 180).length;
  const low   = gs.filter(r => r.value < 70).length;
  const inRange = gs.filter(r => r.value >= 70 && r.value <= 180).length;
  const tir   = total ? Math.round(inRange / total * 100) : 0;
  // Estimated HbA1c from average BG (formula: eHbA1c = (avg + 46.7) / 28.7)
  const hba1c = total && avg ? ((avg + 46.7) / 28.7).toFixed(1) + '%' : '—';

  document.getElementById('rptTotal').textContent = total;
  document.getElementById('rptAvg').textContent   = total ? avg + ' mg/dL' : '—';
  document.getElementById('rptHigh').textContent  = high;
  document.getElementById('rptLow').textContent   = low;
  document.getElementById('rptTIR').textContent   = total ? tir + '%' : '—';
  document.getElementById('rptGMI').textContent   = hba1c;

  const tc   = state.meals.reduce((s,m) => s + (m.carbs||0),    0);
  const ts   = state.meals.reduce((s,m) => s + (m.sugar||0),    0);
  const tcal = state.meals.reduce((s,m) => s + (m.calories||0), 0);
  const g    = state.goals;

  document.getElementById('rptCarbs').textContent     = fmt(tc)   + 'g';
  document.getElementById('rptSugar').textContent     = fmt(ts)   + 'g';
  document.getElementById('rptCal').textContent       = fmt(tcal) + ' kcal';
  document.getElementById('rptCarbGoal').textContent  = '/ ' + g.carbs    + 'g';
  document.getElementById('rptSugarGoal').textContent = '/ ' + g.sugar    + 'g';
  document.getElementById('rptCalGoal').textContent   = '/ ' + g.calories + ' kcal';

  const tbody = document.getElementById('rptReadingsBody');
  const card  = document.getElementById('rptReadingsCard');
  if (!gs.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  tbody.innerHTML = gs.map(r => {
    const c   = getBGColor(r.value);
    const lbl = getBGLabel(r.value);
    const src = r.source === 'cgm' ? '📡 CGM' : r.source === 'bgm' ? '🩸 BGM' : '✏️ Manual';
    return `<tr>
      <td style="font-weight:800;color:${c};font-family:'DM Mono',monospace">${r.value}</td>
      <td><span class="badge" style="color:${c};background:${c}22">${lbl}</span></td>
      <td style="color:var(--text-med)">${r.note}</td>
      <td style="font-size:11px;color:var(--text-light)">${src}</td>
      <td style="color:var(--text-light);font-size:11px">${r.time}</td>
    </tr>`;
  }).join('');
}

window.generateReport = function() {
  renderReport();
  const banner = document.getElementById('reportBanner');
  banner.classList.add('show');
  showToast('📄 Report ready!');
  setTimeout(() => { if (window.print) window.print(); }, 500);
  setTimeout(() => banner.classList.remove('show'), 4000);
};

// ================================================================
//  CRITICAL LOW ALERT
// ================================================================
function triggerCriticalLow(val) {
  document.getElementById('criticalLowVal').textContent = val;
  document.getElementById('criticalLowOverlay').classList.add('show');
  if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 500, 1000, 1500].forEach(delay => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 880; g.gain.value = 0.3;
      osc.type = 'square';
      osc.start(ctx.currentTime + delay / 1000);
      osc.stop(ctx.currentTime + delay / 1000 + 0.35);
    });
  } catch(_) {}
}

window.dismissCritical = function() {
  document.getElementById('criticalLowOverlay').classList.remove('show');
};

// ================================================================
//  EMERGENCY
// ================================================================
window.showEmergency = function() {
  document.getElementById('emergencyOverlay').classList.add('show');
  if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
};

window.hideEmergency = function() {
  document.getElementById('emergencyOverlay').classList.remove('show');
};

// ================================================================
//  INIT
// ================================================================
function initApp() {
  renderDashboard();
  renderGlucose();
  renderDevices();
  renderFood();
  renderGoals();
  renderReminders();
  renderReport();
}
