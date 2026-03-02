// ================================================================
//  SugarSmart – app.js v2
//  Updated with: Splash, Connections, Profile, More Sheet
// ================================================================

// ================================================================
//  🔥 FIREBASE CONFIGURATION
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
  console.warn('SugarSmart: Running in DEMO MODE');
}

const DEMO_USER = { uid: 'demo', displayName: 'Sarah Johnson', email: 'sarah@demo.com' };

// ================================================================
//  SPLASH SCREEN
// ================================================================
const SPLASH_MESSAGES = [
  'Initializing...', 'Loading health data...', 'Calibrating sensors...',
  'Syncing readings...', 'Almost ready...', 'Welcome!'
];

function runSplash() {
  const splash    = document.getElementById('splashScreen');
  const bar       = document.getElementById('splashProgress');
  const loadText  = document.getElementById('splashLoadingText');
  const dots      = document.querySelectorAll('.splash-dot');

  let pct = 0;
  let msgIdx = 0;
  let dotIdx = 0;

  const interval = setInterval(() => {
    pct += 1.2;
    bar.style.width = Math.min(pct, 100) + '%';

    if (pct > 20 && msgIdx === 0)  { loadText.textContent = SPLASH_MESSAGES[1]; msgIdx = 1; }
    if (pct > 40 && msgIdx === 1)  { loadText.textContent = SPLASH_MESSAGES[2]; msgIdx = 2; dotIdx = 1; }
    if (pct > 60 && msgIdx === 2)  { loadText.textContent = SPLASH_MESSAGES[3]; msgIdx = 3; dotIdx = 2; }
    if (pct > 80 && msgIdx === 3)  { loadText.textContent = SPLASH_MESSAGES[4]; msgIdx = 4; }
    if (pct > 95 && msgIdx === 4)  { loadText.textContent = SPLASH_MESSAGES[5]; msgIdx = 5; }

    // Update dots
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === Math.min(dotIdx, 2));
    });

    if (pct >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        splash.classList.add('hide');
        setTimeout(() => {
          splash.style.display = 'none';
          // If Firebase: onAuthStateChanged handles it
          // If demo: show auth screen
          if (!FIREBASE_ENABLED) {
            document.getElementById('authScreen').style.display = 'flex';
          }
        }, 600);
      }, 300);
    }
  }, 30);
}

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
    bgm:     { connected: false, signal: 'Strong', battery: '85%', lastSync: null },
    cgm:     { connected: false, brand: 'FreeStyle Libre', sensorLife: '12 days left', liveValue: null, trend: '→' },
    fit:     { connected: false, steps: 0, hr: 0, sleep: 0, activeCal: 0 },
    checker: { connected: false, lastReading: null, battery: '92%', todayCount: 0 },
  },

  profile: {
    name: 'Sarah Johnson', age: '', weight: '', height: '',
    diabetesType: '', doctor: 'Dr. Johnson', doctorPhone: '+1 (555) 0100',
    medication: '', notes: '', avatarUrl: '',
  },

  selectedReminderType: 'Medication',
  selectedPhotoFile: null,
};

// ================================================================
//  HELPERS
// ================================================================
function todayStr() {
  return new Date().toLocaleDateString();
}

function fmt(n) { return Math.round(n); }

function getBGColor(v) {
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
    desc: 'Your glucose is dangerously low. Eat 15–20g of fast-acting carbs immediately.',
    cta: '📞 Call Doctor', ctaFn: "window.location.href='tel:+15550100'",
    color: 'var(--danger)', bg: 'var(--danger-light)',
  };
  if (val < 70) return {
    icon: '🍬', title: 'Eat 15g Carbs Now',
    desc: 'Your glucose is low. Eat 15g of fast carbs: 4 glucose tablets or ½ cup juice.',
    cta: '+ Log Snack', ctaFn: "switchTab('food')",
    color: 'var(--danger)', bg: 'var(--danger-light)',
  };
  if (val <= 130) return {
    icon: '✅', title: 'Excellent Control',
    desc: 'Your glucose is in the ideal range. Maintain your current routine.',
    cta: '+ Log Reading', ctaFn: "showLogForm();switchTab('glucose')",
    color: 'var(--success)', bg: 'var(--success-light)',
  };
  if (val <= 180) return {
    icon: '👍', title: 'In Range — Good',
    desc: 'Your glucose is normal. Avoid high-GI foods for the next few hours.',
    cta: '🍽️ View Meals', ctaFn: "switchTab('food')",
    color: 'var(--success)', bg: 'var(--success-light)',
  };
  if (val <= 250) return {
    icon: '⚠️', title: 'Elevated — Take Insulin',
    desc: 'Consider taking insulin as prescribed. Drink water and avoid carbs.',
    cta: '💉 Log Reading', ctaFn: "showLogForm();switchTab('glucose')",
    color: 'var(--warning)', bg: 'var(--warning-light)',
  };
  return {
    icon: '🚨', title: 'Dangerously High!',
    desc: 'Take insulin immediately and contact your doctor.',
    cta: '📞 Call Doctor', ctaFn: "window.location.href='tel:+15550100'",
    color: 'var(--danger)', bg: 'var(--danger-light)',
  };
}

function getTrendData(readings) {
  if (readings.length < 2) return { arrow: '→', label: 'Stable', color: 'var(--text-med)' };
  const diff = readings[0].value - readings[1].value;
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

function updateConnCountBadge() {
  const count = [
    state.devices.fit.connected,
    state.devices.checker.connected,
    state.devices.bgm.connected,
    state.devices.cgm.connected,
  ].filter(Boolean).length;
  const badge = document.getElementById('connCountBadge');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
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
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/email-already-in-use': 'Email already registered.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
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
  closeMoreSheet();
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

  // Load profile from localStorage (demo fallback)
  const savedProfile = localStorage.getItem('ss_profile');
  if (savedProfile) {
    try { Object.assign(state.profile, JSON.parse(savedProfile)); } catch(_) {}
  } else {
    state.profile.name  = user.displayName || 'User';
    state.profile.email = user.email || '';
  }

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
  });
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
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'meals', id)); } catch(e) {}
}

// ================================================================
//  FIRESTORE: GOALS
// ================================================================
async function loadGoals() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'settings', 'goals'));
    if (snap.exists()) Object.assign(state.goals, snap.data());
  } catch(e) {}
}

async function saveGoalsToFirestore() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'goals'), state.goals); } catch(e) {}
}

// ================================================================
//  FIRESTORE: REMINDERS
// ================================================================
async function loadReminders() {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'reminders'));
    if (!snap.empty) state.reminders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}
}

async function saveReminderToFirestore(r) {
  if (!FIREBASE_ENABLED || !db || !currentUser) {
    state.reminders.push({ id: 'r' + Date.now(), ...r });
    return;
  }
  const ref2 = await addDoc(collection(db, 'users', currentUser.uid, 'reminders'), r);
  state.reminders.push({ id: ref2.id, ...r });
}

async function updateReminderInFirestore(id, data) {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await updateDoc(doc(db, 'users', currentUser.uid, 'reminders', id), data); } catch(e) {}
}

async function deleteReminderFromFirestore(id) {
  if (!FIREBASE_ENABLED || !db || !currentUser) return;
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'reminders', id)); } catch(e) {}
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
    if (user) {
      // Wait for splash to finish
      if (document.getElementById('splashScreen').style.display === 'none') {
        onUserSignedIn(user);
      } else {
        // Queue it
        document.addEventListener('splashDone', () => onUserSignedIn(user), { once: true });
      }
    } else {
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('mainApp').classList.remove('show');
    }
  });
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
  // "more" is handled by sheet, not a page
  if (tab === 'more') { openMoreSheet(); return; }

  state.currentTab = tab;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + tab);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('mainContent').scrollTop = 0;
  closeMoreSheet();
  renderCurrentTab(tab);
};

function renderCurrentTab(tab) {
  if (tab === 'dashboard')   renderDashboard();
  else if (tab === 'glucose')     renderGlucose();
  else if (tab === 'connections') renderConnections();
  else if (tab === 'food')        renderFood();
  else if (tab === 'goals')       renderGoals();
  else if (tab === 'reminders')   renderReminders();
  else if (tab === 'report')      renderReport();
  else if (tab === 'profile')     renderProfile();
}

// ================================================================
//  MORE SHEET
// ================================================================
window.openMoreSheet = function(target) {
  const overlay = document.getElementById('moreSheetOverlay');
  const sheet   = document.getElementById('moreSheet');
  overlay.classList.add('show');
  sheet.classList.add('show');

  // Update active reminder count
  const active = state.reminders.filter(r => r.active).length;
  document.getElementById('moreReminderCount').textContent = active + ' active';

  // If target page specified, navigate there and close sheet
  if (target) {
    closeMoreSheet();
    // Brief delay for smooth UX
    setTimeout(() => {
      state.currentTab = target;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const pg = document.getElementById('page-' + target);
      if (pg) pg.classList.add('active');
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('mainContent').scrollTop = 0;
      renderCurrentTab(target);
    }, 150);
  }
};

window.closeMoreSheet = function() {
  document.getElementById('moreSheetOverlay').classList.remove('show');
  document.getElementById('moreSheet').classList.remove('show');
};

// ================================================================
//  DASHBOARD
// ================================================================
function renderDashboard() {
  const now = new Date();
  const h   = now.getHours();
  const name = currentUser?.displayName?.split(' ')[0] || state.profile.name.split(' ')[0] || 'there';
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  document.getElementById('heroDate').textContent =
    now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  document.getElementById('heroGreeting').textContent = greeting + ', ' + name + ' 👋';

  const latest = state.glucose[0];
  const trend  = getTrendData(state.glucose);

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

    const trendEl = document.getElementById('trendChip');
    trendEl.textContent = trend.arrow + ' ' + trend.label;
    trendEl.style.color = trend.color;

    const rec  = getActionRecommendation(val);
    const box  = document.getElementById('actionBox');
    box.style.background   = rec.bg;
    box.style.borderColor  = rec.color;
    document.getElementById('actionIcon').textContent  = rec.icon;
    document.getElementById('actionTitle').textContent = rec.title;
    document.getElementById('actionDesc').textContent  = rec.desc;
    const ctaBtn = document.getElementById('actionCta');
    ctaBtn.textContent = rec.cta;
    ctaBtn.style.background = rec.color;
    ctaBtn.onclick = () => eval(rec.ctaFn);
  }

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
  setBar('carbsVal','carbsFill', tc,   g.carbs,    'g',    'var(--primary)');
  setBar('sugarVal','sugarFill', ts,   g.sugar,    'g',    'var(--warning)');
  setBar('calVal',  'calFill',   tcal, g.calories, 'kcal', 'var(--success)');

  document.getElementById('statMeals').textContent    = state.meals.length;
  document.getElementById('statReadings').textContent = state.glucose.length;

  renderMiniChart();

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
//  MINI TREND CHART
// ================================================================
function renderMiniChart() {
  const container = document.getElementById('miniTrendChart');
  const readings  = [...state.glucose].slice(0, 8).reverse();
  if (readings.length < 2) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-light);font-size:12px;padding:20px 0">Log 2+ readings to see trend</div>';
    return;
  }
  const W = 340, H = 70, PAD = 8;
  const values  = readings.map(r => r.value);
  const minV    = Math.min(...values, 70);
  const maxV    = Math.max(...values, 180);
  const range   = maxV - minV || 1;

  const pts = values.map((v, i) => ({
    x: PAD + (i / (values.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((v - minV) / range) * (H - PAD * 2),
    v,
  }));

  const pathD = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const normalLowY  = H - PAD - ((70  - minV) / range) * (H - PAD * 2);
  const normalHighY = H - PAD - ((180 - minV) / range) * (H - PAD * 2);

  const dots = pts.map(p => {
    const col = p.v < 70 ? '#EF4444' : p.v <= 180 ? '#10B981' : '#F59E0B';
    return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${col}" stroke="var(--card)" stroke-width="2"/>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px;overflow:visible">
      <rect x="${PAD}" y="${Math.max(normalHighY,PAD)}" width="${W-PAD*2}" height="${normalLowY-normalHighY}" fill="#10B98111" rx="2"/>
      ${minV<=70  ? `<line x1="${PAD}" x2="${W-PAD}" y1="${normalLowY}"  y2="${normalLowY}"  stroke="#EF444444" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
      ${maxV>=180 ? `<line x1="${PAD}" x2="${W-PAD}" y1="${normalHighY}" y2="${normalHighY}" stroke="#F59E0B44" stroke-width="1" stroke-dasharray="4 4"/>` : ''}
      <path d="${pathD}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
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
    date: now.toLocaleDateString(), ts: now.getTime(),
  };
  try {
    await saveReadingToFirestore(reading);
    hideLogForm();
    renderGlucose(); renderDashboard();
    showToast('✅ Reading saved!');
    if (val < 55) triggerCriticalLow(val);
    else if (val < 70) showToast('⚠️ Low glucose! Eat 15g carbs now.', 'var(--danger)');
    else if (val > 250) showToast('⚠️ High glucose! Check with doctor.', 'var(--warning)');
  } catch(e) {
    showToast('Error: ' + e.message, 'var(--danger)');
  } finally {
    btn.innerHTML = 'Save'; btn.disabled = false;
  }
};

function renderGlucose() {
  const hist = document.getElementById('glucoseHistory');
  if (!state.glucose.length) {
    hist.innerHTML = '<div class="card empty-state">No readings yet. Log your first reading above!</div>';
    return;
  }
  hist.innerHTML = state.glucose.map(r => {
    const c   = getBGColor(r.value);
    const lbl = getBGLabel(r.value);
    const src = r.source === 'cgm' ? '📡' : r.source === 'bgm' ? '🩸' : '✏️';
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
      </div>`;
  }).join('');
}

// ================================================================
//  CONNECTIONS PAGE
// ================================================================
function renderConnections() {
  updateConnectionsUI();
  updateConnCountBadge();
}

function updateConnectionsUI() {
  const d = state.devices;

  // Update summary dots
  function setDot(id, active) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', active);
  }
  setDot('sumDotFit',     d.fit.connected);
  setDot('sumDotChecker', d.checker.connected);
  setDot('sumDotBGM',     d.bgm.connected);
  setDot('sumDotCGM',     d.cgm.connected);

  // Google Fit
  const fitBadge   = document.getElementById('fitBadge');
  const fitBody    = document.getElementById('fitBody');
  const fitConnected = document.getElementById('fitConnected');
  if (d.fit.connected) {
    fitBadge.textContent = 'Connected ✓';
    fitBadge.className   = 'conn-badge connected';
    fitBody.style.display = 'none';
    fitConnected.style.display = 'block';
    document.getElementById('fitSteps').textContent = d.fit.steps.toLocaleString();
    document.getElementById('fitHR').textContent    = d.fit.hr;
    document.getElementById('fitSleep').textContent  = d.fit.sleep + 'h';
    document.getElementById('fitCal').textContent    = d.fit.activeCal;
    document.getElementById('fitLastSync').textContent = d.fit.lastSync || 'Just now';
  } else {
    fitBadge.textContent = 'Not Connected';
    fitBadge.className   = 'conn-badge';
    fitBody.style.display = 'block';
    fitConnected.style.display = 'none';
  }

  // Checker Instant
  const checkerBadge     = document.getElementById('checkerBadge');
  const checkerBody      = document.getElementById('checkerBody');
  const checkerConnected = document.getElementById('checkerConnected');
  if (d.checker.connected) {
    checkerBadge.textContent = 'Connected ✓';
    checkerBadge.className   = 'conn-badge connected';
    checkerBody.style.display = 'none';
    checkerConnected.style.display = 'block';
    document.getElementById('checkerLiveVal').textContent  = d.checker.lastReading || '—';
    document.getElementById('checkerLastRead').textContent = d.checker.lastRead || 'Just now';
    document.getElementById('checkerTodayCount').textContent = d.checker.todayCount;
  } else {
    checkerBadge.textContent = 'Not Connected';
    checkerBadge.className   = 'conn-badge';
    checkerBody.style.display = 'block';
    checkerConnected.style.display = 'none';
  }

  // BGM
  const bgmBadge = document.getElementById('bgmBadge');
  const bgmBody  = document.getElementById('bgmBody');
  const bgmInfo  = document.getElementById('bgmConnectedInfo');
  if (d.bgm.connected) {
    bgmBadge.textContent = 'Connected ✓';
    bgmBadge.className   = 'conn-badge connected';
    bgmBody.style.display = 'none';
    bgmInfo.style.display = 'block';
    document.getElementById('bgmLastSync').textContent = d.bgm.lastSync || 'Just now';
  } else {
    bgmBadge.textContent  = 'Disconnected';
    bgmBadge.className    = 'conn-badge';
    bgmBody.style.display = 'block';
    bgmInfo.style.display = 'none';
  }

  // CGM
  const cgmBadge = document.getElementById('cgmBadge');
  const cgmBody  = document.getElementById('cgmBody');
  const cgmInfo  = document.getElementById('cgmConnectedInfo');
  if (d.cgm.connected) {
    cgmBadge.textContent = 'Streaming Live ✓';
    cgmBadge.className   = 'conn-badge connected';
    cgmBody.style.display = 'none';
    cgmInfo.style.display = 'block';
    document.getElementById('cgmLiveVal').textContent   = d.cgm.liveValue || '—';
    document.getElementById('cgmLiveTrend').textContent = d.cgm.trend + ' ' + (d.cgm.trendLabel || 'Stable');
    document.getElementById('cgmBrand').textContent     = d.cgm.brand;
  } else {
    cgmBadge.textContent  = 'Disconnected';
    cgmBadge.className    = 'conn-badge';
    cgmBody.style.display = 'block';
    cgmInfo.style.display = 'none';
  }
}

// ================================================================
//  GOOGLE FIT
// ================================================================
window.connectGoogleFit = async function() {
  showToast('🔄 Connecting to Google Fit...', 'var(--primary)');
  await new Promise(r => setTimeout(r, 2000));
  state.devices.fit.connected  = true;
  state.devices.fit.steps      = Math.round(5000 + Math.random() * 5000);
  state.devices.fit.hr         = Math.round(65 + Math.random() * 20);
  state.devices.fit.sleep      = +(6 + Math.random() * 2).toFixed(1);
  state.devices.fit.activeCal  = Math.round(300 + Math.random() * 300);
  state.devices.fit.lastSync   = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  updateConnectionsUI();
  updateConnCountBadge();
  showToast('✅ Google Fit connected!', 'var(--success)');
};

window.disconnectGoogleFit = function() {
  state.devices.fit.connected = false;
  updateConnectionsUI();
  updateConnCountBadge();
  showToast('Google Fit disconnected', 'var(--text-med)');
};

// ================================================================
//  CHECKER INSTANT
// ================================================================
window.connectChecker = async function() {
  showToast('⚡ Pairing Checker Instant...', '#7C3AED');
  await new Promise(r => setTimeout(r, 1800));
  state.devices.checker.connected = true;
  state.devices.checker.todayCount = 0;
  updateConnectionsUI();
  updateConnCountBadge();
  showToast('✅ Checker Instant connected!', 'var(--success)');
};

window.disconnectChecker = function() {
  state.devices.checker.connected = false;
  updateConnectionsUI();
  updateConnCountBadge();
  showToast('Checker disconnected', 'var(--text-med)');
};

window.logCheckerReading = async function() {
  const input = document.getElementById('checkerInput');
  const val   = parseFloat(input.value);
  if (!val || val < 20 || val > 600) { showToast('Enter valid reading', 'var(--danger)'); return; }
  const color = getBGColor(val);
  const label = getBGLabel(val);
  document.getElementById('checkerResult').style.display = 'block';
  document.getElementById('checkerResult').innerHTML = `
    <div style="font-size:28px;font-weight:900;color:${color};font-family:'Syne',sans-serif">${val} mg/dL</div>
    <div style="font-size:13px;font-weight:700;color:${color};margin:4px 0">${label}</div>
    <div style="font-size:11px;color:var(--text-med)">Logged at ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
  `;
  document.getElementById('checkerResult').style.background = color + '22';
  document.getElementById('checkerResult').style.border = `1px solid ${color}`;
  input.value = '';
  await saveReadingToFirestore({
    value: val, note: 'Random', source: 'checker', noteExtra: 'Checker Instant',
    time: new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    date: new Date().toLocaleDateString(), ts: Date.now(),
  });
  renderDashboard(); renderGlucose();
  if (val < 55) triggerCriticalLow(val);
  showToast('⚡ Reading logged!');
};

window.logCheckerReadingConnected = async function() {
  const input = document.getElementById('checkerInputConnected');
  const val   = parseFloat(input.value);
  if (!val || val < 20 || val > 600) { showToast('Enter valid reading', 'var(--danger)'); return; }
  state.devices.checker.lastReading = val;
  state.devices.checker.lastRead    = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  state.devices.checker.todayCount  = (state.devices.checker.todayCount || 0) + 1;
  input.value = '';
  await saveReadingToFirestore({
    value: val, note: 'Random', source: 'checker', noteExtra: 'Checker Instant',
    time: state.devices.checker.lastRead,
    date: new Date().toLocaleDateString(), ts: Date.now(),
  });
  updateConnectionsUI();
  renderDashboard(); renderGlucose();
  if (val < 55) triggerCriticalLow(val);
  else if (val < 70) showToast('⚠️ Low! Eat 15g carbs.', 'var(--danger)');
  else showToast('⚡ Reading saved!');
};

// ================================================================
//  BGM / CGM DEVICE CONNECT
// ================================================================
window.connectDevice = async function(type) {
  const scanCard = document.getElementById('btScanCard');
  scanCard.style.display = 'block';
  document.getElementById(type === 'bgm' ? 'bgmBody' : 'cgmBody').style.display = 'none';
  showToast('🔵 Scanning for ' + type.toUpperCase() + '...', 'var(--primary)');
  await new Promise(resolve => setTimeout(resolve, 2500));
  scanCard.style.display = 'none';

  if (type === 'bgm') {
    state.devices.bgm.connected = true;
    state.devices.bgm.lastSync  = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    showToast('✅ BGM Connected!', 'var(--success)');
    const syncedVal = Math.round(100 + Math.random() * 80);
    const now = new Date();
    await saveReadingToFirestore({
      value: syncedVal, note: 'Random', source: 'bgm', noteExtra: 'Auto-synced via Bluetooth',
      time: now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
      date: now.toLocaleDateString(), ts: now.getTime(),
    });
    renderDashboard(); renderGlucose();
  } else {
    const brand = document.getElementById('cgmBrandSelect').value;
    const brandName = { freestyle:'FreeStyle Libre', dexcom:'Dexcom G7', medtronic:'Medtronic Guardian' }[brand];
    state.devices.cgm.connected = true;
    state.devices.cgm.brand     = brandName;
    state.devices.cgm.liveValue = Math.round(110 + Math.random() * 60);
    startCGMSimulation();
    showToast('📡 ' + brandName + ' Connected!', 'var(--success)');
  }
  updateConnectionsUI();
  updateConnCountBadge();
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
  updateConnectionsUI();
  updateConnCountBadge();
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
    const now = new Date();
    await saveReadingToFirestore({
      value: newVal, note: 'CGM Auto', source: 'cgm', noteExtra: state.devices.cgm.brand,
      time: now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
      date: now.toLocaleDateString(), ts: now.getTime(),
    });
    renderDashboard(); renderGlucose();
    if (state.currentTab === 'connections') updateConnectionsUI();
    if (newVal < 55) triggerCriticalLow(newVal);
    else if (newVal < 70) showToast('⚠️ CGM: Low glucose!', 'var(--danger)');
    else if (newVal > 280) showToast('⚠️ CGM: High glucose!', 'var(--warning)');
  }, 30000);
}

// ================================================================
//  BARCODE SCANNER
// ================================================================
const FOODS = [
  {id:1,name:'Oatmeal',carbs:27,calories:150,sugar:1,gi:'Low',icon:'🥣'},
  {id:2,name:'Apple',carbs:25,calories:95,sugar:19,gi:'Low',icon:'🍎'},
  {id:3,name:'White Rice',carbs:45,calories:200,sugar:0,gi:'High',icon:'🍚'},
  {id:4,name:'Grilled Chicken',carbs:0,calories:165,sugar:0,gi:'None',icon:'🍗'},
  {id:5,name:'Orange Juice',carbs:26,calories:112,sugar:21,gi:'High',icon:'🍊'},
  {id:6,name:'Whole Wheat Bread',carbs:24,calories:120,sugar:3,gi:'Med',icon:'🍞'},
  {id:7,name:'Banana',carbs:27,calories:105,sugar:14,gi:'Med',icon:'🍌'},
  {id:8,name:'Boiled Egg',carbs:0.6,calories:78,sugar:0.6,gi:'None',icon:'🥚'},
  {id:9,name:'Greek Yogurt',carbs:9,calories:100,sugar:7,gi:'Low',icon:'🥛'},
  {id:10,name:'Brown Rice',carbs:46,calories:215,sugar:0.7,gi:'Med',icon:'🍚'},
  {id:11,name:'Sweet Potato',carbs:26,calories:112,sugar:5.4,gi:'Low',icon:'🍠'},
  {id:12,name:'Salmon',carbs:0,calories:208,sugar:0,gi:'None',icon:'🐟'},
  {id:13,name:'Broccoli',carbs:6,calories:31,sugar:1.5,gi:'Low',icon:'🥦'},
  {id:14,name:'Avocado',carbs:9,calories:160,sugar:0.7,gi:'Low',icon:'🥑'},
  {id:15,name:'Strawberries (1 cup)',carbs:11,calories:49,sugar:7,gi:'Low',icon:'🍓'},
];

const BARCODE_DB = {
  '012345678901': {name:'Nature Valley Granola Bar',carbs:29,calories:190,sugar:12,icon:'🍫'},
  '023000006948': {name:'Tropicana Orange Juice',carbs:26,calories:110,sugar:22,icon:'🍊'},
  '038000138416': {name:'Special K Cereal',carbs:23,calories:120,sugar:4,icon:'🥣'},
  '016000275010': {name:'Cheerios',carbs:29,calories:140,sugar:1,icon:'🥣'},
  '040000494157': {name:'Snickers Bar',carbs:35,calories:280,sugar:27,icon:'🍬'},
};

window.startBarcodeScanner = async function() {
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('scannerVideo').srcObject = scannerStream;
    document.getElementById('barcodePlaceholder').style.display = 'none';
    document.getElementById('barcodeScanner').style.display = 'block';
    showToast('📷 Scanning...', 'var(--primary)');
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','qr_code','upc_a','upc_e'] });
      const scanLoop = async () => {
        if (!scannerStream) return;
        try {
          const codes = await detector.detect(document.getElementById('scannerVideo'));
          if (codes.length > 0) { handleBarcodeResult(codes[0].rawValue); return; }
        } catch(_) {}
        if (scannerStream) requestAnimationFrame(scanLoop);
      };
      requestAnimationFrame(scanLoop);
    } else {
      setTimeout(() => {
        if (scannerStream) {
          const demoCodes = Object.keys(BARCODE_DB);
          handleBarcodeResult(demoCodes[Math.floor(Math.random() * demoCodes.length)]);
        }
      }, 3000);
    }
  } catch(e) {
    document.getElementById('barcodePlaceholder').style.display = 'block';
    document.getElementById('barcodeScanner').style.display = 'none';
    showToast('Camera not available.', 'var(--warning)');
  }
};

window.stopBarcodeScanner = function() {
  if (scannerStream) { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }
  document.getElementById('barcodePlaceholder').style.display = 'block';
  document.getElementById('barcodeScanner').style.display = 'none';
};

function handleBarcodeResult(barcode) {
  stopBarcodeScanner();
  const food   = BARCODE_DB[barcode];
  const result = document.getElementById('barcodeResult');
  result.style.display = 'block';
  if (food) {
    result.innerHTML = `
      <div style="font-size:22px;margin-bottom:6px">${food.icon}</div>
      <div style="font-weight:700;color:var(--success);font-size:14px;margin-bottom:8px">✅ ${food.name}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;font-size:12px;text-align:center">
        <div><div style="font-weight:800;color:var(--primary);font-size:16px">${food.carbs}g</div><div style="color:var(--text-light)">Carbs</div></div>
        <div><div style="font-weight:800;color:var(--success);font-size:16px">${food.calories}</div><div style="color:var(--text-light)">Calories</div></div>
        <div><div style="font-weight:800;color:var(--warning);font-size:16px">${food.sugar}g</div><div style="color:var(--text-light)">Sugar</div></div>
      </div>
      <button class="btn-primary" onclick="addScannedFood('${food.name}',${food.carbs},${food.calories},${food.sugar})">+ Add to Meals</button>`;
    showToast('🎯 Scanned!', 'var(--success)');
  } else {
    result.innerHTML = `<div style="color:var(--text-med);font-size:13px;margin-bottom:8px">Barcode: <code>${barcode}</code></div><button class="btn-secondary" onclick="document.getElementById('barcodeResult').style.display='none'">Dismiss</button>`;
  }
}

window.addScannedFood = async function(name, carbs, calories, sugar) {
  await saveMealToFirestore({ description: name, carbs, calories, sugar, photoURL: '', ts: Date.now() });
  renderTodayLog(); updateFoodSummary(); renderDashboard();
  document.getElementById('barcodeResult').style.display = 'none';
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
    preview.src = ev.target.result;
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
    document.getElementById('mealCarbs').value = '';
    document.getElementById('mealCal').value = '';
    document.getElementById('mealSugar').value = '';
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreview').classList.remove('show');
    document.getElementById('photoPlaceholder').style.display = 'block';
    state.selectedPhotoFile = null;
    renderFood(); renderDashboard();
    showToast('🍽️ Meal logged!');
  } catch(e) {
    showToast('Error: ' + e.message, 'var(--danger)');
  } finally {
    btn.innerHTML = '🍽️ Log Meal'; btn.disabled = false;
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
  await saveMealToFirestore({ description: food.name, carbs: food.carbs, calories: food.calories, sugar: food.sugar, photoURL: food.icon, ts: Date.now() });
  renderTodayLog(); updateFoodSummary(); renderDashboard();
  showToast('🍽️ ' + food.name + ' added!');
};

function renderFood() {
  renderFoodList(''); renderTodayLog(); updateFoodSummary();
}

function renderFoodList(q) {
  const list = document.getElementById('foodList');
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
      </div>`;
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
    </div>`).join('');
}

function updateFoodSummary() {
  const tc   = state.meals.reduce((s,m) => s + (m.carbs||0), 0);
  const ts   = state.meals.reduce((s,m) => s + (m.sugar||0), 0);
  const tcal = state.meals.reduce((s,m) => s + (m.calories||0), 0);
  document.getElementById('foodCarbs').textContent = fmt(tc) + 'g';
  document.getElementById('foodSugar').textContent = fmt(ts) + 'g';
  document.getElementById('foodCal').textContent   = fmt(tcal);
  document.getElementById('foodItems').textContent = state.meals.length;
}

// ================================================================
//  GOALS
// ================================================================
const GOAL_FIELDS = [
  {key:'carbs',        label:'Daily Carbohydrate Goal',  unit:'g',     icon:'🌾',min:50,  max:400 },
  {key:'sugar',        label:'Daily Sugar Limit',         unit:'g',     icon:'🍭',min:10,  max:100 },
  {key:'calories',     label:'Daily Calorie Goal',        unit:'kcal',  icon:'🔥',min:1000,max:4000},
  {key:'targetBGLow',  label:'Target BG Low Threshold',  unit:'mg/dL', icon:'📉',min:60,  max:100 },
  {key:'targetBGHigh', label:'Target BG High Threshold', unit:'mg/dL', icon:'📈',min:140, max:250 },
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
    </div>`).join('');
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
const REMINDER_TYPES = {
  Medication:'💊', Blood:'💉', Meal:'🍽️', Exercise:'🏃', Water:'💧', Other:'🔔',
};

function renderReminders() {
  const pills = document.getElementById('reminderTypePills');
  pills.innerHTML = Object.entries(REMINDER_TYPES).map(([k, ico]) => `
    <button class="type-pill ${state.selectedReminderType === k ? 'selected' : ''}"
      onclick="selectReminderType('${k}')">${ico} ${k}</button>`).join('');
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
    </div>`).join('');
}

// ================================================================
//  REPORT
// ================================================================
function renderReport() {
  document.getElementById('reportDate').textContent = new Date().toLocaleDateString();
  document.getElementById('rptName').textContent    = state.profile.name || currentUser?.displayName || 'Patient';
  document.getElementById('rptEmail').textContent   = currentUser?.email || '—';

  const deviceStr = [
    state.devices.bgm.connected     ? 'BGM'                      : null,
    state.devices.cgm.connected     ? 'CGM: ' + state.devices.cgm.brand : null,
    state.devices.fit.connected     ? 'Google Fit'               : null,
    state.devices.checker.connected ? 'Checker Instant'          : null,
  ].filter(Boolean).join(', ') || 'Manual Entry';
  document.getElementById('rptDevices').textContent = deviceStr;

  const gs    = state.glucose;
  const total = gs.length;
  const avg   = total ? Math.round(gs.reduce((s,r) => s + r.value, 0) / total) : 0;
  const high  = gs.filter(r => r.value > 180).length;
  const low   = gs.filter(r => r.value < 70).length;
  const inRange = gs.filter(r => r.value >= 70 && r.value <= 180).length;
  const tir   = total ? Math.round(inRange / total * 100) : 0;
  const hba1c = total && avg ? ((avg + 46.7) / 28.7).toFixed(1) + '%' : '—';

  document.getElementById('rptTotal').textContent = total;
  document.getElementById('rptAvg').textContent   = total ? avg + ' mg/dL' : '—';
  document.getElementById('rptHigh').textContent  = high;
  document.getElementById('rptLow').textContent   = low;
  document.getElementById('rptTIR').textContent   = total ? tir + '%' : '—';
  document.getElementById('rptGMI').textContent   = hba1c;

  const tc   = state.meals.reduce((s,m) => s + (m.carbs||0), 0);
  const ts   = state.meals.reduce((s,m) => s + (m.sugar||0), 0);
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
    const src = r.source === 'cgm' ? '📡 CGM' : r.source === 'bgm' ? '🩸 BGM' : r.source === 'checker' ? '⚡ Checker' : '✏️ Manual';
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
//  PROFILE
// ================================================================
function renderProfile() {
  const p = state.profile;
  document.getElementById('profileName').value          = p.name || '';
  document.getElementById('profileAge').value           = p.age || '';
  document.getElementById('profileWeight').value        = p.weight || '';
  document.getElementById('profileHeight').value        = p.height || '';
  document.getElementById('profileDoctor').value        = p.doctor || '';
  document.getElementById('profileDoctorPhone').value   = p.doctorPhone || '';
  document.getElementById('profileMedication').value    = p.medication || '';
  document.getElementById('profileNotes').value         = p.notes || '';
  document.getElementById('profileDisplayName').textContent = p.name || currentUser?.displayName || 'User';
  document.getElementById('profileEmail').textContent   = currentUser?.email || '';

  // Set diabetes type
  const dtSelect = document.getElementById('profileDiabetesType');
  if (dtSelect) dtSelect.value = p.diabetesType || '';

  // Avatar
  updateProfileAvatarUI();
}

function updateProfileAvatarUI() {
  const p = state.profile;
  const initial = (p.name || 'S').charAt(0).toUpperCase();

  // Topbar avatar
  document.getElementById('topbarAvatarInitial').textContent = initial;
  if (p.avatarUrl) {
    document.getElementById('topbarAvatarImg').src = p.avatarUrl;
    document.getElementById('topbarAvatarImg').style.display = 'block';
    document.getElementById('topbarAvatarInitial').style.display = 'none';
  } else {
    document.getElementById('topbarAvatarImg').style.display = 'none';
    document.getElementById('topbarAvatarInitial').style.display = 'block';
  }

  // Profile page avatar
  const profileImg = document.getElementById('profileAvatarImg');
  const profileInitial = document.getElementById('profileAvatarInitial');
  if (profileImg && profileInitial) {
    profileInitial.textContent = initial;
    if (p.avatarUrl) {
      profileImg.src = p.avatarUrl;
      profileImg.style.display = 'block';
      profileInitial.style.display = 'none';
    } else {
      profileImg.style.display = 'none';
      profileInitial.style.display = 'block';
    }
  }

  // More sheet avatar
  const moreImg      = document.getElementById('moreProfileImg');
  const moreInitial  = document.getElementById('moreProfileInitial');
  if (moreImg && moreInitial) {
    if (p.avatarUrl) {
      moreImg.src = p.avatarUrl;
      moreImg.style.display = 'block';
      moreInitial.style.display = 'none';
    } else {
      moreImg.style.display = 'none';
      moreInitial.style.display = 'block';
    }
  }
}

window.triggerAvatarUpload = function() {
  document.getElementById('avatarUploadInput').click();
};

window.handleAvatarUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    state.profile.avatarUrl = ev.target.result;
    updateProfileAvatarUI();
    showToast('📷 Photo updated!');
  };
  reader.readAsDataURL(file);
};

window.saveProfile = function() {
  state.profile.name         = document.getElementById('profileName').value.trim() || state.profile.name;
  state.profile.age          = document.getElementById('profileAge').value;
  state.profile.weight       = document.getElementById('profileWeight').value;
  state.profile.height       = document.getElementById('profileHeight').value;
  state.profile.diabetesType = document.getElementById('profileDiabetesType').value;
  state.profile.doctor       = document.getElementById('profileDoctor').value.trim();
  state.profile.doctorPhone  = document.getElementById('profileDoctorPhone').value.trim();
  state.profile.medication   = document.getElementById('profileMedication').value.trim();
  state.profile.notes        = document.getElementById('profileNotes').value.trim();

  // Update emergency contact with doctor
  const emgContact = document.getElementById('emgDoctorContact');
  if (emgContact && state.profile.doctor) {
    emgContact.textContent = state.profile.doctor + ': ' + (state.profile.doctorPhone || 'N/A');
  }

  // Save to localStorage (demo)
  try { localStorage.setItem('ss_profile', JSON.stringify(state.profile)); } catch(_) {}

  document.getElementById('profileDisplayName').textContent = state.profile.name;
  updateProfileAvatarUI();

  const banner = document.getElementById('profileBanner');
  banner.classList.add('show');
  showToast('✅ Profile saved!');
  setTimeout(() => banner.classList.remove('show'), 3000);
};

// ================================================================
//  CRITICAL LOW ALERT
// ================================================================
function triggerCriticalLow(val) {
  document.getElementById('criticalLowVal').textContent = val;
  document.getElementById('criticalLowOverlay').classList.add('show');
  if (navigator.vibrate) navigator.vibrate([500,200,500,200,500,200,500]);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0,500,1000,1500].forEach(delay => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 880; g.gain.value = 0.3; osc.type = 'square';
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
  closeMoreSheet();
  document.getElementById('emergencyOverlay').classList.add('show');
  if (navigator.vibrate) navigator.vibrate([300,100,300]);
};
window.hideEmergency = function() {
  document.getElementById('emergencyOverlay').classList.remove('show');
};

// ================================================================
//  INIT
// ================================================================
function initApp() {
  // Update profile avatar from saved data
  updateProfileAvatarUI();

  // Render all pages
  renderDashboard();
  renderGlucose();
  renderConnections();
  renderFood();
  renderGoals();
  renderReminders();
  renderReport();
  renderProfile();
  updateConnCountBadge();
}

// ================================================================
//  BOOT: Run splash on load
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  runSplash();
});
