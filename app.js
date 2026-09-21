/* ==========================================================
   IronLog · app.js
   ========================================================== */

/* ---- 1. SETTINGS -------------------------------------------------
   Paste your Google Apps Script "Web app" URL between the quotes.
   Leave it empty to try the site in demo mode (ID: GYM-1234).      */
const CONFIG = {
  SHEET_URL: "https://script.google.com/macros/s/AKfycbzO_Ln0gxPeQpDyCnj5UAE7CYt7rIaRY2RNRVTYqKOWy6ETLuVhZwEQ2QckaIn7-hKN/exec",
  DEMO_ID: "GYM-1234",
  DEMO_NAME: "Demo Member"
};

/* ---- 2. HELPERS ------------------------------------------------ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const demoMode = !CONFIG.SHEET_URL;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem("ironlog_user")); } catch { return null; } },
  set(u) { sessionStorage.setItem("ironlog_user", JSON.stringify(u)); },
  clear() { sessionStorage.removeItem("ironlog_user"); }
};

async function api(params) {
  const url = CONFIG.SHEET_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url);
  return res.json();
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const prettyDate = s => fromYmd(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

// soft press ripple on primary buttons
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".btn.primary");
  if (!b) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
  const el = document.createElement("i");
  el.className = "ripple";
  el.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  b.appendChild(el);
  setTimeout(() => el.remove(), 650);
});

/* ---- 3. CAPTCHA ------------------------------------------------ */
let captchaCode = "";
function drawCaptcha() {
  const c = $("#captcha"), ctx = c.getContext("2d");
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O/1/I confusion
  captchaCode = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#faf7f2"; ctx.fillRect(0, 0, c.width, c.height);

  // light noise lines
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = i % 2 ? "rgba(201,64,58,.35)" : "rgba(240,185,59,.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * c.width, Math.random() * c.height);
    ctx.bezierCurveTo(Math.random() * c.width, Math.random() * c.height, Math.random() * c.width, Math.random() * c.height, Math.random() * c.width, Math.random() * c.height);
    ctx.stroke();
  }
  // characters
  ctx.font = "800 32px Barlow Condensed, Arial Narrow, sans-serif";
  ctx.textBaseline = "middle";
  [...captchaCode].forEach((ch, i) => {
    ctx.save();
    ctx.translate(18 + i * 30, c.height / 2 + (Math.random() * 8 - 4));
    ctx.rotate((Math.random() - .5) * .5);
    ctx.fillStyle = i % 2 ? "#c9403a" : "#2a2523";
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  // dots
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = "rgba(42,37,35,.25)";
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
}
$("#captchaRefresh").addEventListener("click", e => {
  e.currentTarget.classList.add("spin");
  setTimeout(() => e.currentTarget.classList.remove("spin"), 450);
  drawCaptcha();
  $("#captchaInput").value = "";
});

/* ---- 4. LOGIN --------------------------------------------------- */
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#loginError"), btn = $("#loginBtn"), card = $("#loginForm");
  const id = $("#memberId").value.trim().toUpperCase();
  const cap = $("#captchaInput").value.trim().toUpperCase();
  const fail = msg => {
    err.textContent = msg;
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  };
  err.textContent = "";

  if (!id) return fail("Enter your member ID.");
  if (cap !== captchaCode) {
    drawCaptcha(); $("#captchaInput").value = "";
    return fail("Captcha did not match. Try the new one.");
  }

  btn.classList.add("loading"); btn.disabled = true;
  try {
    let user;
    if (demoMode) {
      await new Promise(r => setTimeout(r, 600));
      if (id !== CONFIG.DEMO_ID) throw new Error("ID not found.");
      user = { id, name: CONFIG.DEMO_NAME };
    } else {
      // the Apps Script checks the ID AND writes the login time into the sheet
      const res = await api({ action: "login", id });
      if (!res.ok) throw new Error(res.error || "ID not found.");
      user = { id, name: res.name };
    }
    session.set(user);
    $("#loginForm").reset();
    go("day");
  } catch (ex) {
    drawCaptcha();
    $("#captchaInput").value = "";
    fail(ex.message === "Failed to fetch" ? "Could not reach Google Sheets. Check your connection and URL." : ex.message);
  } finally {
    btn.classList.remove("loading"); btn.disabled = false;
  }
});

/* ---- 5. ROUTER -------------------------------------------------- */
const VIEWS = ["login", "day", "week", "diet", "logout"];
function go(name) { location.hash = "#" + name; }

function route() {
  const user = session.get();
  let name = (location.hash || "").replace("#", "");
  if (!VIEWS.includes(name)) name = user ? "day" : "login";
  if (!user && name !== "login") name = "login";
  if (user && name === "login") name = "day";

  VIEWS.forEach(v => { $("#view-" + v).hidden = v !== name; });
  $("#topbar").hidden = !user;
  $("#who").textContent = user ? `${user.name} · ${user.id}` : "";
  $$("#tabs a").forEach(a => a.classList.toggle("active", a.dataset.nav === name));

  // re-trigger the entrance animation
  const el = $("#view-" + name);
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  window.scrollTo(0, 0);

  if (name === "login") drawCaptcha();
  if (name === "day") renderDay();
  if (name === "week") renderWeek();
  if (name === "diet") renderDiet();
  if (name === "logout") { $("#logoutCard").hidden = false; $("#bye").hidden = true; }
}
window.addEventListener("hashchange", route);

/* ---- 6. DAY MARKER --------------------------------------------- */
const daysKey = () => "ironlog_days_" + session.get().id;
const getDays = () => store.get(daysKey(), []);           // [{date, day}]

function renderDay() {
  const days = getDays();
  const set = new Set(days.map(d => d.date));
  const today = new Date();

  $("#dayDate").value = ymd(today);
  $("#dayNumber").value = days.length ? Math.max(...days.map(d => d.day)) + 1 : 1;
  $("#dayError").textContent = "";

  // stats
  $("#statTotal").textContent = days.length;
  $("#statMonth").textContent = days.filter(d => {
    const x = fromYmd(d.date); return x.getMonth() === today.getMonth() && x.getFullYear() === today.getFullYear();
  }).length;
  let streak = 0, cur = new Date(today);
  if (!set.has(ymd(cur))) cur.setDate(cur.getDate() - 1);   // today not marked yet? count from yesterday
  while (set.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  $("#statStreak").textContent = streak;

  // 28-day strip
  const strip = $("#strip"); strip.innerHTML = "";
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const cell = document.createElement("div");
    cell.className = "cell" + (set.has(ymd(d)) ? " done" : "") + (i === 0 ? " today" : "");
    cell.textContent = set.has(ymd(d)) ? "✓" : d.getDate();
    cell.title = prettyDate(ymd(d));
    strip.appendChild(cell);
  }

  // history
  const ul = $("#history"); ul.innerHTML = "";
  const recent = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  if (!recent.length) ul.innerHTML = '<li class="empty">No check-ins yet. Mark your first day above.</li>';
  recent.forEach((d, i) => {
    const li = document.createElement("li");
    if (d._fresh) li.className = "fresh";
    li.innerHTML = `<span class="n">Day ${d.day}</span><span>✅</span><span class="d">${prettyDate(d.date)}</span>`;
    ul.appendChild(li);
  });
}

$("#markBtn").addEventListener("click", async () => {
  const date = $("#dayDate").value, day = parseInt($("#dayNumber").value, 10);
  const err = $("#dayError");
  err.textContent = "";
  if (!date) return (err.textContent = "Pick a date.");
  if (!day || day < 1) return (err.textContent = "Enter a valid day number.");
  if (fromYmd(date) > new Date()) return (err.textContent = "You can't mark a future date.");

  const days = getDays();
  if (days.some(d => d.date === date)) return (err.textContent = `${prettyDate(date)} is already marked.`);
  if (days.some(d => d.day === day)) return (err.textContent = `Day ${day} is already used.`);

  days.push({ date, day });
  store.set(daysKey(), days);
  renderDay();
  showTick(day, date);

  if (!demoMode) {
    const u = session.get();
    api({ action: "mark", id: u.id, date, day }).catch(() => toast("Saved on this device. Sheet sync failed."));
  }
});

const EMOJIS = ["💪", "🔥", "🏋️", "😎", "🥇", "⚡"];
const MESSAGES = ["Another one done.", "Consistency wins.", "Strong work today.", "The bar felt lighter, right?", "Keep the streak alive."];
let tickTimer;
function showTick(day, date) {
  const ov = $("#tick"), emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  $("#tickEmoji").textContent = emoji;
  $("#tickTitle").textContent = `Day ${day} marked!`;
  $("#tickMsg").textContent = `${prettyDate(date)} · ${MESSAGES[Math.floor(Math.random() * MESSAGES.length)]}`;

  // emoji burst
  const burst = $("#burst"); burst.innerHTML = "";
  for (let i = 0; i < 14; i++) {
    const s = document.createElement("span");
    const a = (Math.PI * 2 * i) / 14, dist = 140 + Math.random() * 120;
    s.textContent = i % 3 === 0 ? emoji : i % 3 === 1 ? "✨" : "🟡";
    s.style.cssText = `--x:${Math.cos(a) * dist}px;--y:${Math.sin(a) * dist}px;--r:${(Math.random() - .5) * 90}deg;animation-delay:${1 + Math.random() * .2}s`;
    burst.appendChild(s);
  }
  // restart svg animation
  const card = $(".tick-card"); card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
  $$(".tick-circle,.tick-check,.tick-emoji").forEach(n => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });

  ov.hidden = false;
  clearTimeout(tickTimer);
  tickTimer = setTimeout(hideTick, 3200);
}
function hideTick() { $("#tick").hidden = true; }
$("#tick").addEventListener("click", hideTick);

/* ---- 7. WEEKLY PLAN -------------------------------------------- */
const PLAN = [
  { day: "Monday", short: "Mon", emoji: "💪", focus: "Chest & Triceps", tip: "Warm up with 2 light sets of push-ups. Keep your shoulder blades pinched on every press.",
    ex: [["Barbell / dumbbell bench press", "4 × 8–10", "Rest 90s", "Lower slowly, press up hard."],
         ["Incline dumbbell press", "3 × 10", "Rest 75s", "Bench at 30°, not steeper."],
         ["Cable or pec-deck fly", "3 × 12", "Rest 60s", "Squeeze for a second at the centre."],
         ["Triceps rope pushdown", "3 × 12", "Rest 60s", "Elbows stay glued to your sides."],
         ["Bench dips", "3 × to failure", "Rest 60s", "Go only as deep as your shoulders allow."]] },
  { day: "Tuesday", short: "Tue", emoji: "🔙", focus: "Back & Biceps", tip: "Pull with your elbows, not your hands. No swinging on curls.",
    ex: [["Lat pulldown", "4 × 10", "Rest 90s", "Chest up, pull to upper chest."],
         ["Seated cable row", "4 × 10", "Rest 75s", "Pause when the handle touches your belly."],
         ["One-arm dumbbell row", "3 × 10 each", "Rest 60s", "Keep your back flat like a table."],
         ["Barbell / dumbbell curl", "3 × 12", "Rest 60s", "Full stretch at the bottom."],
         ["Hammer curl", "3 × 12", "Rest 60s", "Great for forearms too."]] },
  { day: "Wednesday", short: "Wed", emoji: "🦵", focus: "Legs", tip: "Never skip leg day. Eat a proper meal 90 minutes before this session.",
    ex: [["Barbell squat", "4 × 8", "Rest 2 min", "Knees track over toes, hips below knees."],
         ["Leg press", "3 × 12", "Rest 90s", "Don't lock your knees at the top."],
         ["Romanian deadlift", "3 × 10", "Rest 90s", "Push hips back, feel the hamstrings."],
         ["Walking lunges", "3 × 12 each", "Rest 60s", "Take long steps."],
         ["Standing calf raise", "4 × 15", "Rest 45s", "Pause at the top."]] },
  { day: "Thursday", short: "Thu", emoji: "🏔️", focus: "Shoulders & Abs", tip: "Go lighter than your ego wants on lateral raises. Control wins.",
    ex: [["Overhead dumbbell press", "4 × 10", "Rest 90s", "Ribs down, don't arch your back."],
         ["Lateral raise", "4 × 15", "Rest 45s", "Lead with elbows, stop at shoulder height."],
         ["Rear-delt fly", "3 × 15", "Rest 45s", "Slight bend in the elbows."],
         ["Hanging knee raise", "3 × 12", "Rest 60s", "Curl your pelvis up, don't just swing."],
         ["Plank", "3 × 45 sec", "Rest 45s", "Squeeze glutes and abs together."]] },
  { day: "Friday", short: "Fri", emoji: "🔥", focus: "Full body & HIIT", tip: "Keep the weights moderate. The goal is a high heart rate, not a max lift.",
    ex: [["Deadlift", "3 × 6", "Rest 2 min", "Bar close to shins, neutral spine."],
         ["Push-ups", "3 × max", "Rest 60s", "Chest touches a fist-sized gap above floor."],
         ["Goblet squat", "3 × 15", "Rest 60s", "Hold the dumbbell at your chest."],
         ["Battle rope / burpees", "5 × 30 sec", "Rest 30s", "All-out effort each round."],
         ["Farmer's walk", "3 × 40 m", "Rest 60s", "Stand tall, grip hard."]] },
  { day: "Saturday", short: "Sat", emoji: "🚴", focus: "Cardio & mobility", tip: "Easy pace. You should be able to talk while doing this.",
    ex: [["Brisk walk / light jog", "30 min", "Steady", "Zone 2 pace, nose-breathing if you can."],
         ["Skipping rope", "5 × 2 min", "Rest 45s", "Small hops, wrists do the work."],
         ["Hip & shoulder mobility", "10 min", "Flow", "Cat-cow, world's greatest stretch."],
         ["Foam roll / stretch", "10 min", "Slow", "Hold each stretch 30 seconds."]] },
  { day: "Sunday", short: "Sun", emoji: "😴", focus: "Rest day", rest: true, tip: "Muscles grow while you rest. Sleep 7–8 hours and eat well today too.",
    ex: [["Light walk (optional)", "20 min", "Easy", "Fresh air helps recovery."],
         ["Meal prep for the week", "1 hour", "-", "Boil chana, soak soya, cut veggies."],
         ["Sleep early", "7–8 hours", "-", "The most underrated supplement."]] }
];

function weekStartKey() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7;  // Mon = 0
  d.setDate(d.getDate() - dow);
  return ymd(d);
}
const checksKey = () => `ironlog_checks_${session.get().id}_${weekStartKey()}`;

function dayProgress(di) {
  const c = store.get(checksKey(), {});
  const total = PLAN[di].ex.length;
  return { done: PLAN[di].ex.filter((_, i) => c[`${di}-${i}`]).length, total };
}

function renderWeek() {
  const wrap = $("#days"); wrap.innerHTML = "";
  const todayIdx = (new Date().getDay() + 6) % 7;
  PLAN.forEach((p, i) => {
    const pr = dayProgress(i);
    const b = document.createElement("button");
    b.className = "day" + (i === todayIdx ? " today" : "") + (p.rest ? " rest" : "");
    b.style.setProperty("--i", i);
    b.innerHTML = `<span class="emoji">${p.emoji}</span><h3>${p.day}</h3><span class="focus">${p.focus}</span>
      <span class="foot">${pr.done === pr.total ? "All done ✓" : `${pr.done}/${pr.total} exercises done`}</span>
      ${i === todayIdx ? '<span class="badge">Today</span>' : ""}`;
    b.addEventListener("click", () => openModal(i));
    wrap.appendChild(b);
  });
}

let openDay = null;
function openModal(di) {
  openDay = di;
  const p = PLAN[di];
  $("#mEmoji").textContent = p.emoji;
  $("#mTitle").textContent = p.day;
  $("#mFocus").textContent = p.focus;
  $("#mTip").textContent = "💡 " + p.tip;
  renderModalList();
  const m = $("#modal"); m.classList.remove("closing"); m.hidden = false;
  document.body.style.overflow = "hidden";
}
function renderModalList() {
  const p = PLAN[openDay], checks = store.get(checksKey(), {});
  const ul = $("#mList"); ul.innerHTML = "";
  p.ex.forEach(([name, sets, rest, note], i) => {
    const li = document.createElement("li");
    li.className = "ex" + (checks[`${openDay}-${i}`] ? " done" : "");
    li.innerHTML = `<span class="box">✓</span><div><div class="name">${name}</div><div class="meta">${rest} · ${note}</div></div><span class="sets">${sets}</span>`;
    li.addEventListener("click", () => {
      const c = store.get(checksKey(), {}); c[`${openDay}-${i}`] = !c[`${openDay}-${i}`];
      store.set(checksKey(), c); renderModalList(); renderWeek();
    });
    ul.appendChild(li);
  });
  const { done, total } = dayProgress(openDay);
  $("#mBar").style.width = (done / total * 100) + "%";
  $(".progress").classList.toggle("full", done === total);
  $("#mProgress").textContent = done === total ? "Session complete. Great work!" : `${done} of ${total} done`;
}
function closeModal() {
  const m = $("#modal"); if (m.hidden) return;
  m.classList.add("closing");
  setTimeout(() => { m.hidden = true; m.classList.remove("closing"); document.body.style.overflow = ""; }, 200);
}
$("#mClose").addEventListener("click", closeModal);
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); hideTick(); } });

/* ---- 8. DIET (INR) ---------------------------------------------- */
// [time, name, items[], price ₹, protein g, kcal]
const DIET = {
  veg: [
    ["7:30 AM", "Besan chilla + curd", ["3 besan chillas with onion & tomato", "1 small bowl curd"], 35, 20, 380],
    ["10:30 AM", "Banana + roasted chana", ["1 banana", "1 handful roasted chana"], 20, 9, 230],
    ["1:30 PM", "Roti, dal & sabzi", ["3 rotis", "1 bowl dal", "Seasonal sabzi + salad"], 50, 24, 620],
    ["5:00 PM", "Soya chunk stir-fry", ["50 g soya chunks with onion & masala", "Green chutney"], 25, 26, 240],
    ["8:30 PM", "Paneer bhurji + roti", ["100 g paneer bhurji", "2 rotis", "Cucumber"], 75, 30, 560],
    ["10:30 PM", "Warm milk", ["1 glass milk (250 ml)"], 15, 8, 150]
  ],
  nonveg: [
    ["7:30 AM", "Egg omelette + bread", ["3 whole eggs + 1 egg white", "2 brown bread slices"], 40, 26, 400],
    ["10:30 AM", "Banana + peanuts", ["1 banana", "1 handful roasted peanuts"], 20, 9, 260],
    ["1:30 PM", "Rice, dal & chicken curry", ["1 bowl rice", "1 bowl dal", "150 g chicken curry"], 95, 46, 700],
    ["5:00 PM", "Boiled eggs + sprouts", ["2 boiled eggs", "1 bowl moong sprouts chaat"], 25, 20, 250],
    ["8:30 PM", "Egg curry + roti", ["2 eggs in curry", "3 rotis", "Salad"], 50, 24, 560],
    ["10:30 PM", "Warm milk", ["1 glass milk (250 ml)"], 15, 8, 150]
  ]
};
const PROTEIN = [
  ["Soya chunks (100 g dry)", "₹12–15", "≈ 52 g", "Cheapest protein in India"],
  ["Eggs (per egg)", "₹6–7", "≈ 6 g", "Complete protein"],
  ["Roasted chana (100 g)", "₹10–12", "≈ 19 g", "Snack on the go"],
  ["Curd (400 g)", "₹25–30", "≈ 14 g", "Good for digestion"],
  ["Paneer (100 g)", "₹30–35", "≈ 18 g", "Best for dinner"],
  ["Chicken (150 g)", "₹35–40", "≈ 40 g", "Lean protein"]
];
let dietType = "veg";

function renderDiet() {
  const meals = DIET[dietType];
  const wrap = $("#meals"); wrap.innerHTML = "";
  meals.forEach(([time, name, items, price, prot, kcal], i) => {
    const d = document.createElement("div");
    d.className = "meal"; d.style.setProperty("--i", i);
    d.innerHTML = `<div class="top"><span class="time">${time}</span><span class="chip">₹${price}</span></div>
      <h3>${name}</h3><ul>${items.map(x => `<li>${x}</li>`).join("")}</ul>
      <div class="chips"><span class="chip red">${prot} g protein</span><span class="chip">${kcal} kcal</span></div>`;
    wrap.appendChild(d);
  });
  const sum = i => meals.reduce((a, m) => a + m[i], 0);
  countUp($("#dTotal"), sum(3), v => "₹" + v);
  countUp($("#dProtein"), sum(4), v => v + " g");
  countUp($("#dKcal"), sum(5), v => v.toLocaleString("en-IN"));
  countUp($("#dMonth"), sum(3) * 30, v => "₹" + v.toLocaleString("en-IN"));

  $("#proteinTable").innerHTML = `<tr><th>Food</th><th>Price</th><th>Protein</th><th>Why</th></tr>` +
    PROTEIN.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
}
function countUp(el, to, fmt) {
  const start = performance.now(), dur = 700;
  (function step(t) {
    const p = Math.min((t - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(to * e));
    if (p < 1) requestAnimationFrame(step);
  })(start);
}
$("#dietSwitch").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  dietType = b.dataset.diet;
  $$("#dietSwitch button").forEach(x => x.classList.toggle("on", x === b));
  $("#dietSwitch").classList.toggle("nonveg", dietType === "nonveg");
  renderDiet();
});

/* ---- 9. LOGOUT --------------------------------------------------- */
$("#stayBtn").addEventListener("click", () => go("day"));
$("#logoutBtn").addEventListener("click", () => {
  $("#logoutCard").hidden = true;
  $("#bye").hidden = false;
  session.clear();
  $("#topbar").hidden = true;
  setTimeout(() => { $("#bye").hidden = true; go("login"); route(); }, 2200);
});

/* ---- 10. START ---------------------------------------------------- */
$("#demoHint").hidden = !demoMode;
route();
