import { supabase, configured } from "./supabase.js";
import { parseCSV, toCSV } from "./csv.js";

/* ---------- constants ---------- */
const STAGES = [
  { id: "target", name: "Target", p: 0.02 },
  { id: "contacted", name: "Contacted", p: 0.05 },
  { id: "meeting", name: "First meeting", p: 0.1 },
  { id: "diligence", name: "Diligence", p: 0.25 },
  { id: "ic", name: "Partner / IC", p: 0.45 },
  { id: "termsheet", name: "Term sheet", p: 0.75 },
  { id: "committed", name: "Committed", p: 0.95 },
  { id: "closed", name: "Closed", p: 1 },
  { id: "passed", name: "Passed", p: 0 },
];
const SBY = Object.fromEntries(STAGES.map((s) => [s.id, s]));
const TYPES = ["VC", "Defense VC", "CVC / Strategic", "Angel", "Family office", "Gov / Grant", "Accelerator"];
const MANDATE = { yes: "Defense OK", open: "Case by case", no: "Excluded", unknown: "Unverified" };
const EXPORT_COLS = ["name", "partner", "email", "type", "stage", "priority", "mandate", "check_min", "check_max", "amount", "can_lead", "via", "geo", "next_step", "next_date", "last_contact", "notes"];

/* ---------- state ---------- */
let session = null, role = null;
let rows = [], round = {}, members = [];
let view = "board", sort = { k: "stage", d: 1 }, openId = null, loaded = false;
let channel = null, refetchTimer = null;
try { view = localStorage.getItem("prp.view") || "board"; } catch {}
const canWrite = () => role === "owner" || role === "editor";

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => Number(v) || 0;
const money = (n) => {
  n = num(n); if (!n) return "$0";
  const a = Math.abs(n);
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e3) return "$" + Math.round(n / 1e3) + "K";
  return "$" + n;
};
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const dayDiff = (s) => s ? Math.round((new Date(s + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 864e5) : null;
const fmtDate = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
const parseMoney = (v) => {
  if (v == null || v === "") return 0;
  let s = String(v).trim().toLowerCase().replace(/[$,\s€]/g, ""), m = 1;
  if (s.endsWith("m")) { m = 1e6; s = s.slice(0, -1); } else if (s.endsWith("k")) { m = 1e3; s = s.slice(0, -1); }
  const n = parseFloat(s); return isFinite(n) && n > 0 ? Math.round(n * m) : 0;
};
const dateOrNull = (v) => (v ? v : null);
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2800); }
function errMsg(e) {
  const m = e?.message || "";
  if (e?.code === "42501" || /row-level security/i.test(m)) return "You have view access only, so changes can't be saved.";
  if (/JWT|session/i.test(m)) return "Your session expired. Sign in again.";
  return m ? "Couldn't save: " + m : "Couldn't save. Check your connection and try again.";
}
function show(id) { for (const v of ["authView", "noAccessView", "configView", "appView"]) $("#" + v).hidden = v !== id; }

/* ---------- data ---------- */
async function loadAll() {
  const [inv, rd] = await Promise.all([
    supabase.from("investors").select("*").order("created_at"),
    supabase.from("fund_round").select("*").maybeSingle(),
  ]);
  if (inv.error) { toast("Couldn't load investors: " + inv.error.message); return; }
  rows = inv.data; round = rd.data || {}; loaded = true; render();
}
function scheduleRefetch() { clearTimeout(refetchTimer); refetchTimer = setTimeout(loadAll, 150); }
function subscribe() {
  if (channel) return;
  channel = supabase
    .channel("pipeline")
    .on("postgres_changes", { event: "*", schema: "public", table: "investors" }, scheduleRefetch)
    .on("postgres_changes", { event: "*", schema: "public", table: "fund_round" }, scheduleRefetch)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "investor_activity" }, (p) => {
      if (openId && p.new?.investor_id === openId) loadActivity(openId);
    })
    .subscribe();
}

/* ---------- metrics + deck ---------- */
function metrics() {
  const live = rows.filter((r) => r.stage !== "passed");
  const sum = (f) => live.filter(f).reduce((a, r) => a + num(r.amount), 0);
  const closed = sum((r) => r.stage === "closed" || r.stage === "committed");
  const ts = sum((r) => r.stage === "termsheet");
  const weighted = live.reduce((a, r) => a + num(r.amount) * (SBY[r.stage]?.p ?? 0), 0);
  const early = live.filter((r) => !["closed", "committed", "termsheet"].includes(r.stage)).reduce((a, r) => a + num(r.amount) * (SBY[r.stage]?.p ?? 0), 0);
  return { closed, ts, weighted, early, target: num(round.target) };
}
function renderDeck() {
  const m = metrics();
  $("#gBig").innerHTML = money(m.closed) + ` <small>of ${m.target ? money(m.target) : "— (set a target)"}</small>`;
  $("#gWeighted").textContent = money(m.weighted);
  const scale = Math.max(m.target, m.closed + m.ts + m.early, 1);
  const pc = (v) => ((v / scale) * 100).toFixed(2) + "%";
  $("#gBar").innerHTML = `<span class="b-closed" style="width:${pc(m.closed)}"></span><span class="b-ts" style="width:${pc(m.ts)}"></span><span class="b-weighted" style="width:${pc(m.early)}"></span>`;
  $("#gBar").setAttribute("aria-label", `Committed ${money(m.closed)}, term sheets ${money(m.ts)}, weighted earlier stages ${money(m.early)}, target ${money(m.target)}`);
  const gap = m.target ? Math.max(0, m.target - m.closed) : 0;
  $("#gLegend").innerHTML = `<span><i style="background:var(--ok)"></i>Committed / closed <b>${money(m.closed)}</b></span><span><i style="background:color-mix(in srgb,var(--ok) 50%,var(--accent))"></i>Term sheets <b>${money(m.ts)}</b></span><span><i style="background:var(--accent)"></i>Earlier stages, weighted <b>${money(m.early)}</b></span>${m.target ? `<span>Still to close <b>${money(gap)}</b></span>` : ""}`;
  const counts = STAGES.filter((s) => s.id !== "passed").map((s) => ({ s, n: rows.filter((r) => r.stage === s.id).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  $("#funnel").innerHTML = counts.map((c) => `<div title="${esc(c.s.name)}"><div class="fb"><span style="height:${(c.n / max) * 100}%"></span></div><span class="fn">${c.n}</span><span class="fl">${esc(c.s.name)}</span></div>`).join("");
  const due = rows.filter((r) => r.next_date && !["passed", "closed"].includes(r.stage)).map((r) => ({ r, d: dayDiff(r.next_date) })).filter((x) => x.d <= 7).sort((a, b) => a.d - b.d);
  $("#dueCount").textContent = due.length ? `${due.filter((x) => x.d < 0).length} overdue · ${due.length} this week` : "";
  $("#dueList").innerHTML = due.length
    ? due.map(({ r, d }) => `<li><button type="button" data-open="${esc(r.id)}"><span class="when ${d < 0 ? "late" : d === 0 ? "today" : ""}">${d < 0 ? d + "d" : d === 0 ? "Today" : fmtDate(r.next_date)}</span><span class="what"><b>${esc(r.name)}</b><div>${esc(r.next_step || "Follow up")}</div></span></button></li>`).join("")
    : `<li class="empty-note">${loaded ? "No follow-ups due in the next 7 days. Set a next step and date on an investor to see it here." : "Loading…"}</li>`;
}

/* ---------- filtering + cards ---------- */
function filtered() {
  const q = $("#q").value.trim().toLowerCase(), p = $("#fPri").value, t = $("#fType").value, sp = $("#fPassed").checked;
  return rows.filter((r) => (sp || r.stage !== "passed") && (!p || r.priority === p) && (!t || r.type === t) &&
    (!q || [r.name, r.partner, r.via, r.notes, r.next_step, r.geo].join(" ").toLowerCase().includes(q)));
}
function nextChip(r) {
  if (!r.next_date || ["closed", "passed"].includes(r.stage)) return "";
  const d = dayDiff(r.next_date);
  return `<span class="chip ${d < 0 ? "late" : d <= 2 ? "soon" : ""}">${d < 0 ? "Overdue " + -d + "d" : "Next " + fmtDate(r.next_date)}</span>`;
}
function checkStr(r) {
  const a = num(r.check_min), b = num(r.check_max);
  return a && b ? money(a) + "–" + money(b) : a ? money(a) + "+" : b ? "≤" + money(b) : "";
}
function card(r) {
  const nc = nextChip(r);
  return `<button type="button" class="card" draggable="${canWrite()}" data-open="${esc(r.id)}" data-id="${esc(r.id)}">
    <div class="card-top"><span class="card-name">${esc(r.name || "Untitled")}</span>${r.priority ? `<span class="chip p${esc(r.priority)}">${esc(r.priority)}</span>` : ""}</div>
    ${r.partner || r.type ? `<div class="card-sub">${esc([r.partner, r.type].filter(Boolean).join(" · "))}</div>` : ""}
    <div class="card-foot"><span class="num">${num(r.amount) ? money(r.amount) : checkStr(r) || "<span class='hint'>No amount</span>"}</span><span class="mandate ${esc(r.mandate)}" title="Defense mandate"><i></i>${esc(MANDATE[r.mandate] || MANDATE.unknown)}</span></div>
    ${nc ? `<div class="card-foot">${nc}</div>` : ""}
  </button>`;
}
function renderBoard(list) {
  const stages = STAGES.filter((s) => s.id !== "passed" || $("#fPassed").checked);
  return `<div class="board-scroll"><div class="board">${stages.map((s) => {
    const items = list.filter((r) => r.stage === s.id).sort((a, b) => (a.priority || "Z").localeCompare(b.priority || "Z") || num(b.amount) - num(a.amount));
    const tot = items.reduce((a, r) => a + num(r.amount), 0);
    return `<section class="col" data-stage="${s.id}" aria-label="${esc(s.name)}"><div class="col-head"><h2>${esc(s.name)}</h2><span class="num">${items.length}${tot ? " · " + money(tot) : ""}</span></div>${items.length ? items.map(card).join("") : `<div class="col-empty">${canWrite() ? "Drop an investor here" : "None"}</div>`}</section>`;
  }).join("")}</div></div>`;
}

/* ---------- table ---------- */
const COLS = [
  { k: "name", l: "Investor" }, { k: "stage", l: "Stage" }, { k: "priority", l: "Pri" }, { k: "type", l: "Type" },
  { k: "amount", l: "Expected", r: 1 }, { k: "check", l: "Check range", r: 1 }, { k: "mandate", l: "Defense mandate" },
  { k: "via", l: "Intro via" }, { k: "next_date", l: "Next step" }, { k: "last_contact", l: "Last touch" },
];
function sortVal(r, k) {
  if (k === "stage") return STAGES.findIndex((s) => s.id === r.stage);
  if (k === "amount") return num(r.amount);
  if (k === "check") return num(r.check_max) || num(r.check_min);
  return String(r[k] || "").toLowerCase() || "￿";
}
function renderTable(list) {
  const s = [...list].sort((a, b) => { const x = sortVal(a, sort.k), y = sortVal(b, sort.k); return (x < y ? -1 : x > y ? 1 : 0) * sort.d; });
  return `<div class="table-wrap"><table><thead><tr>${COLS.map((c) => `<th class="${c.r ? "r" : ""}"><button type="button" class="lbl" data-sort="${c.k}">${c.l}${sort.k === c.k ? (sort.d > 0 ? " ↑" : " ↓") : ""}</button></th>`).join("")}</tr></thead><tbody>${s.map((r) => `<tr data-open="${esc(r.id)}" tabindex="0">
    <td><b>${esc(r.name)}</b><div class="hint">${esc(r.partner || "")}</div></td>
    <td><span class="stage-pill ${esc(r.stage)}">${esc(SBY[r.stage]?.name || r.stage)}</span></td>
    <td>${r.priority ? `<span class="chip p${esc(r.priority)}">${esc(r.priority)}</span>` : ""}</td>
    <td>${esc(r.type || "")}</td>
    <td class="r num">${num(r.amount) ? money(r.amount) : ""}</td>
    <td class="r num">${checkStr(r)}</td>
    <td><span class="mandate ${esc(r.mandate)}"><i></i>${esc(MANDATE[r.mandate] || MANDATE.unknown)}</span></td>
    <td>${esc(r.via || "")}</td>
    <td>${esc(r.next_step || "")}${r.next_date ? `<div>${nextChip(r)}</div>` : ""}</td>
    <td class="num">${r.last_contact ? fmtDate(r.last_contact) : ""}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------- render ---------- */
function render() {
  renderDeck();
  $("#vBoard").setAttribute("aria-pressed", view === "board");
  $("#vTable").setAttribute("aria-pressed", view === "table");
  const r = round;
  const bits = [r.name, r.instrument, num(r.cap) ? "cap " + money(r.cap) : "", r.close_date ? "target close " + fmtDate(r.close_date) : ""].filter(Boolean);
  $("#roundLine").textContent = bits.length ? bits.join(" · ") : "Round details not set";
  $("#exportBtn").hidden = !rows.length;
  if (!loaded) { $("#main").innerHTML = `<div class="empty"><h2>Loading the pipeline…</h2></div>`; return; }
  if (!rows.length) {
    $("#main").innerHTML = `<div class="empty"><h2>No investors in the pipeline yet</h2><p>Add the funds you plan to approach, or import a CSV with columns like Fund, Partner, Stage, Type, Check min, Check max, Amount, Intro via, Next step, Next date, Notes.</p>${canWrite() ? `<div class="actions"><button class="btn primary" type="button" data-act="add">Add the first investor</button></div>` : ""}</div>`;
    return;
  }
  const list = filtered();
  $("#main").innerHTML = view === "board" ? renderBoard(list) : renderTable(list);
}

/* ---------- investor drawer ---------- */
function opt(list, val) {
  return list.map((o) => { const v = typeof o === "string" ? o : o[0], t = typeof o === "string" ? o : o[1]; return `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(t)}</option>`; }).join("");
}
function openDrawer(id) {
  const isNew = !id;
  const r = isNew ? { stage: "target", priority: "B", mandate: "unknown", type: "VC" } : rows.find((x) => x.id === id);
  if (!r) return;
  openId = id || null;
  const dis = canWrite() ? "" : "disabled";
  $("#drawerHost").innerHTML = `<div class="scrim" data-close></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drTitle">
    <div class="dr-head"><h2 id="drTitle">${isNew ? "Add investor" : esc(r.name)}</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>
    <form class="dr-body" id="drForm">
      <fieldset ${dis}><legend class="lbl">Who</legend><div class="grid2">
        <label class="f full"><span class="lbl">Fund / investor</span><input id="f_name" required value="${esc(r.name || "")}" placeholder="e.g. Fund name"></label>
        <label class="f"><span class="lbl">Partner / contact</span><input id="f_partner" value="${esc(r.partner || "")}"></label>
        <label class="f"><span class="lbl">Email</span><input id="f_email" type="email" value="${esc(r.email || "")}"></label>
        <label class="f"><span class="lbl">Type</span><select id="f_type">${opt(TYPES.includes(r.type) ? TYPES : [...TYPES, r.type], r.type)}</select></label>
        <label class="f"><span class="lbl">Geography</span><input id="f_geo" value="${esc(r.geo || "")}" placeholder="US, EU, UA…"></label>
        <label class="f"><span class="lbl">Defense mandate</span><select id="f_mandate">${opt(Object.entries(MANDATE), r.mandate || "unknown")}</select><span class="hint">Can their LPs back weapons / strike platforms?</span></label>
        <label class="f"><span class="lbl">Intro via</span><input id="f_via" value="${esc(r.via || "")}" placeholder="Warm intro source"></label>
      </div></fieldset>
      <fieldset ${dis}><legend class="lbl">Deal</legend><div class="grid2">
        <label class="f"><span class="lbl">Stage</span><select id="f_stage">${opt(STAGES.map((s) => [s.id, s.name]), r.stage)}</select></label>
        <label class="f"><span class="lbl">Priority</span><select id="f_priority">${opt([["A", "A · must win"], ["B", "B · strong fit"], ["C", "C · long shot"]], r.priority)}</select></label>
        <label class="f"><span class="lbl">Check min (USD)</span><input id="f_check_min" inputmode="decimal" value="${num(r.check_min) ? money(r.check_min) : ""}" placeholder="250K"></label>
        <label class="f"><span class="lbl">Check max (USD)</span><input id="f_check_max" inputmode="decimal" value="${num(r.check_max) ? money(r.check_max) : ""}" placeholder="2M"></label>
        <label class="f"><span class="lbl">Expected / committed</span><input id="f_amount" inputmode="decimal" value="${num(r.amount) ? money(r.amount) : ""}" placeholder="1.5M"><span class="hint">Counts toward the raise gauge</span></label>
        <label class="f" style="justify-content:flex-end"><span class="chk"><input type="checkbox" id="f_can_lead" ${r.can_lead ? "checked" : ""}> Can lead the round</span></label>
      </div></fieldset>
      <fieldset ${dis}><legend class="lbl">Next</legend><div class="grid2">
        <label class="f full"><span class="lbl">Next step</span><input id="f_next_step" value="${esc(r.next_step || "")}" placeholder="Send data room access"></label>
        <label class="f"><span class="lbl">Due</span><input id="f_next_date" type="date" value="${esc(r.next_date || "")}"></label>
        <label class="f"><span class="lbl">Last touch</span><input id="f_last_contact" type="date" value="${esc(r.last_contact || "")}"></label>
        <label class="f full"><span class="lbl">Notes</span><textarea id="f_notes">${esc(r.notes || "")}</textarea></label>
      </div></fieldset>
      ${isNew ? "" : `<section class="log"><div class="lbl">Activity</div>
        ${canWrite() ? `<div class="log-add"><input id="logIn" placeholder="Log a call, meeting, email…"><button class="btn" type="button" data-act="log">Log</button></div>` : ""}
        <ol id="logList"><li class="hint">Loading…</li></ol></section>`}
    </form>
    <div class="dr-foot">
      <div id="delZone">${!isNew && canWrite() ? `<button class="btn danger" type="button" data-act="askdel">Delete</button>` : ""}</div>
      ${canWrite() ? `<div class="actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-act="save">${isNew ? "Add investor" : "Save changes"}</button></div>` : `<span class="ro">View only</span>`}
    </div>
  </aside>`;
  if (!isNew) loadActivity(id);
  setTimeout(() => $("#f_name")?.focus(), 30);
}
async function loadActivity(id) {
  const { data, error } = await supabase.from("investor_activity").select("body,occurred_on,kind").eq("investor_id", id).order("created_at", { ascending: false }).limit(200);
  const ol = $("#logList"); if (!ol || openId !== id) return;
  if (error) { ol.innerHTML = `<li class="hint">Couldn't load activity.</li>`; return; }
  ol.innerHTML = data.length ? data.map((l) => `<li><span class="num">${esc(fmtDate(l.occurred_on))}</span>${esc(l.body)}</li>`).join("") : `<li class="hint">No activity logged yet.</li>`;
}
function closeDrawer() { $("#drawerHost").innerHTML = ""; openId = null; }
function readForm() {
  const g = (k) => $("#f_" + k);
  return {
    name: g("name").value.trim(), partner: g("partner").value.trim(), email: g("email").value.trim(), type: g("type").value,
    geo: g("geo").value.trim(), mandate: g("mandate").value, via: g("via").value.trim(), stage: g("stage").value, priority: g("priority").value,
    check_min: parseMoney(g("check_min").value), check_max: parseMoney(g("check_max").value), amount: parseMoney(g("amount").value),
    can_lead: g("can_lead").checked, next_step: g("next_step").value.trim(), next_date: dateOrNull(g("next_date").value),
    last_contact: dateOrNull(g("last_contact").value), notes: g("notes").value,
  };
}
async function save() {
  const d = readForm();
  if (!d.name) { $("#f_name").focus(); toast("Add the fund or investor name."); return; }
  const res = openId ? await supabase.from("investors").update(d).eq("id", openId) : await supabase.from("investors").insert(d);
  if (res.error) { toast(errMsg(res.error)); return; }
  toast(openId ? "Saved" : "Investor added"); closeDrawer(); loadAll();
}
async function addLog() {
  const inp = $("#logIn"); const body = inp?.value.trim(); if (!body || !openId) return;
  const id = openId;
  const { error } = await supabase.from("investor_activity").insert({ investor_id: id, body });
  if (error) { toast(errMsg(error)); return; }
  inp.value = "";
  await supabase.from("investors").update({ last_contact: todayStr() }).eq("id", id);
  const lc = $("#f_last_contact"); if (lc) lc.value = todayStr();
  loadActivity(id); toast("Logged");
}
async function moveStage(id, stage) {
  const r = rows.find((x) => x.id === id); if (!r || r.stage === stage) return;
  const prev = r.stage; r.stage = stage; render(); // optimistic
  const { error } = await supabase.from("investors").update({ stage }).eq("id", id);
  if (error) { r.stage = prev; render(); toast(errMsg(error)); return; }
  toast(`${r.name} → ${SBY[stage].name}`);
}
async function removeInvestor() {
  const { error } = await supabase.from("investors").delete().eq("id", openId);
  if (error) { toast(errMsg(error)); return; }
  closeDrawer(); toast("Deleted"); loadAll();
}

/* ---------- round drawer ---------- */
function openRound() {
  const r = round; const dis = canWrite() ? "" : "disabled";
  $("#drawerHost").innerHTML = `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="rdT">
  <div class="dr-head"><h2 id="rdT">Round details</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>
  <form class="dr-body"><fieldset ${dis}><div class="grid2">
    <label class="f full"><span class="lbl">Round name</span><input id="r_name" value="${esc(r.name || "")}" placeholder="Seed, Seed+, Series A…"></label>
    <label class="f"><span class="lbl">Target raise (USD)</span><input id="r_target" inputmode="decimal" value="${num(r.target) ? money(r.target) : ""}" placeholder="5M"></label>
    <label class="f"><span class="lbl">Instrument</span><input id="r_instrument" value="${esc(r.instrument || "")}" placeholder="Priced equity, SAFE…"></label>
    <label class="f"><span class="lbl">Valuation / cap (USD)</span><input id="r_cap" inputmode="decimal" value="${num(r.cap) ? money(r.cap) : ""}"></label>
    <label class="f"><span class="lbl">Target close</span><input id="r_close_date" type="date" value="${esc(r.close_date || "")}"></label>
  </div></fieldset><p class="hint">Stage weights for the weighted pipeline: ${STAGES.filter((s) => s.p && s.p < 1).map((s) => `${s.name} ${Math.round(s.p * 100)}%`).join(", ")}.</p></form>
  <div class="dr-foot"><span></span>${canWrite() ? `<div class="actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-act="saveRound">Save round</button></div>` : ""}</div></aside>`;
}
async function saveRound() {
  const d = { name: $("#r_name").value.trim(), target: parseMoney($("#r_target").value), instrument: $("#r_instrument").value.trim(), cap: parseMoney($("#r_cap").value), close_date: dateOrNull($("#r_close_date").value) };
  const { error } = await supabase.from("fund_round").update(d).eq("id", true);
  if (error) { toast(errMsg(error)); return; }
  closeDrawer(); toast("Round saved"); loadAll();
}

/* ---------- team drawer (owner) ---------- */
async function openTeam() {
  const { data, error } = await supabase.from("members").select("*").order("added_at");
  if (error) { toast(errMsg(error)); return; }
  members = data;
  const me = session.user.email.toLowerCase();
  $("#drawerHost").innerHTML = `<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="tmT">
  <div class="dr-head"><h2 id="tmT">Team access</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>
  <div class="dr-body">
    <p class="hint">Only emails on this list can see the pipeline. Editors can change data; viewers can only read. New people sign in with the same email you add here.</p>
    <form class="team-add" id="teamAdd"><input id="t_email" type="email" required placeholder="name@company.com" aria-label="Email"><select id="t_role" aria-label="Role"><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select><button class="btn primary" type="submit">Add</button></form>
    <ul class="team-list">${members.map((m) => `<li><span>${esc(m.email)}${m.email === me ? " <span class='hint'>(you)</span>" : ""}</span>
      ${m.email === me ? `<span class="role">${esc(m.role)}</span>` : `<span class="actions"><select data-role="${esc(m.email)}" aria-label="Role for ${esc(m.email)}">${opt([["owner", "Owner"], ["editor", "Editor"], ["viewer", "Viewer"]], m.role)}</select><button class="btn danger" type="button" data-remove="${esc(m.email)}">Remove</button></span>`}</li>`).join("")}</ul>
  </div></aside>`;
}

/* ---------- CSV ---------- */
const HDR = {
  name: ["name", "fund", "investor", "firm", "fund name"], partner: ["partner", "contact", "person"], email: ["email", "e-mail"],
  type: ["type", "investor type"], stage: ["stage", "status"], priority: ["priority", "pri", "tier"], mandate: ["mandate", "defense mandate", "defense"],
  check_min: ["check min", "min check", "check_min"], check_max: ["check max", "max check", "check_max"], amount: ["amount", "expected", "committed", "ask"],
  via: ["via", "intro", "intro via", "source", "referral"], geo: ["geo", "geography", "location", "country"], next_step: ["next step", "next action", "next", "next_step"],
  next_date: ["next date", "due", "follow up", "follow-up date", "next_date"], last_contact: ["last contact", "last touch", "last touched", "last_contact"], notes: ["notes", "comments"],
};
function mapStage(v) {
  v = String(v || "").toLowerCase().trim();
  const s = STAGES.find((s) => s.id === v || s.name.toLowerCase() === v); if (s) return s.id;
  if (/pass|declin/.test(v)) return "passed"; if (/term/.test(v)) return "termsheet"; if (/commit/.test(v)) return "committed";
  if (/close|wired|signed/.test(v)) return "closed"; if (/\bic\b|partner/.test(v)) return "ic"; if (/dilig|\bdd\b/.test(v)) return "diligence";
  if (/meet|call/.test(v)) return "meeting"; if (/contact|reach|email/.test(v)) return "contacted"; return "target";
}
function normDate(v) { v = String(v || "").trim(); if (!v) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
async function importCSV(file) {
  const t = parseCSV(await file.text()); if (t.length < 2) { toast("That file has no data rows."); return; }
  const head = t[0].map((h) => h.trim().toLowerCase());
  const idx = {}; for (const [k, al] of Object.entries(HDR)) { const i = head.findIndex((h) => al.includes(h)); if (i >= 0) idx[k] = i; }
  if (idx.name == null) { toast("Add a column named Fund or Name, then import again."); return; }
  const recs = [];
  for (const line of t.slice(1)) {
    const g = (k) => (idx[k] != null ? (line[idx[k]] || "").trim() : "");
    if (!g("name")) continue;
    const pr = g("priority").toUpperCase(), md = g("mandate").toLowerCase();
    recs.push({
      name: g("name"), partner: g("partner"), email: g("email"),
      type: TYPES.find((x) => x.toLowerCase() === g("type").toLowerCase()) || g("type") || "VC",
      stage: mapStage(g("stage")), priority: ["A", "B", "C"].includes(pr) ? pr : "B",
      mandate: MANDATE[md] ? md : /yes|ok/.test(md) ? "yes" : /no|excl/.test(md) ? "no" : "unknown",
      check_min: parseMoney(g("check_min")), check_max: parseMoney(g("check_max")), amount: parseMoney(g("amount")),
      via: g("via"), geo: g("geo"), next_step: g("next_step"), next_date: normDate(g("next_date")), last_contact: normDate(g("last_contact")), notes: g("notes"),
    });
  }
  if (!recs.length) { toast("No rows with a fund name were found."); return; }
  const { error } = await supabase.from("investors").insert(recs);
  if (error) { toast(errMsg(error)); return; }
  toast(`Imported ${recs.length} investor${recs.length === 1 ? "" : "s"}`); loadAll();
}
function exportCSV() {
  const csv = toCSV(EXPORT_COLS, rows.map((r) => EXPORT_COLS.map((c) => (c === "stage" ? SBY[r.stage]?.name : r[c]))));
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `mars-rovers-pipeline-${todayStr()}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- events ---------- */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-open],[data-close],[data-act],[data-sort],[data-remove]"); if (!t) return;
  if (t.dataset.close !== undefined) return closeDrawer();
  if (t.dataset.open) return openDrawer(t.dataset.open);
  if (t.dataset.sort) { const k = t.dataset.sort; sort = sort.k === k ? { k, d: -sort.d } : { k, d: 1 }; return render(); }
  if (t.dataset.remove) {
    const { error } = await supabase.from("members").delete().eq("email", t.dataset.remove);
    if (error) return toast(errMsg(error));
    toast("Removed " + t.dataset.remove); return openTeam();
  }
  const a = t.dataset.act;
  if (a === "add") openDrawer(null);
  else if (a === "save") save();
  else if (a === "log") addLog();
  else if (a === "saveRound") saveRound();
  else if (a === "signout") { await supabase.auth.signOut(); location.reload(); }
  else if (a === "askdel") $("#delZone").innerHTML = `<span class="confirm">Delete for good? <button class="btn danger" type="button" data-act="del">Delete</button><button class="btn" type="button" data-act="nodel">Keep</button></span>`;
  else if (a === "nodel") $("#delZone").innerHTML = `<button class="btn danger" type="button" data-act="askdel">Delete</button>`;
  else if (a === "del") removeInvestor();
});
document.addEventListener("change", async (e) => {
  const sel = e.target.closest("[data-role]"); if (!sel) return;
  const { error } = await supabase.from("members").update({ role: sel.value }).eq("email", sel.dataset.role);
  toast(error ? errMsg(error) : "Role updated");
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "teamAdd") {
    const email = $("#t_email").value.trim().toLowerCase();
    const { error } = await supabase.from("members").insert({ email, role: $("#t_role").value });
    if (error) return toast(error.code === "23505" ? "That email is already on the list." : errMsg(error));
    toast("Added " + email); openTeam();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#drawerHost").innerHTML) closeDrawer();
  if (e.key === "Enter" && e.target.id === "logIn") { e.preventDefault(); addLog(); }
  if (e.key === "Enter" && e.target.matches?.("tr[data-open]")) openDrawer(e.target.dataset.open);
  if ((e.key === "Enter" || e.key === " ") && e.target.id === "importLbl") { e.preventDefault(); $("#csvIn").click(); }
});
document.addEventListener("dragstart", (e) => { const c = e.target.closest?.(".card"); if (!c || !canWrite()) return; c.classList.add("dragging"); e.dataTransfer.setData("text/plain", c.dataset.id); e.dataTransfer.effectAllowed = "move"; });
document.addEventListener("dragend", () => document.querySelectorAll(".dragging,.over").forEach((x) => x.classList.remove("dragging", "over")));
document.addEventListener("dragover", (e) => { const col = e.target.closest?.(".col"); if (!col || !canWrite()) return; e.preventDefault(); document.querySelectorAll(".col.over").forEach((x) => x !== col && x.classList.remove("over")); col.classList.add("over"); });
document.addEventListener("drop", (e) => { const col = e.target.closest?.(".col"); if (!col) return; e.preventDefault(); col.classList.remove("over"); const id = e.dataTransfer.getData("text/plain"); if (id) moveStage(id, col.dataset.stage); });

$("#addBtn").onclick = () => openDrawer(null);
$("#roundBtn").onclick = openRound;
$("#teamBtn").onclick = openTeam;
$("#exportBtn").onclick = exportCSV;
$("#vBoard").onclick = () => { view = "board"; try { localStorage.setItem("prp.view", view); } catch {} render(); };
$("#vTable").onclick = () => { view = "table"; try { localStorage.setItem("prp.view", view); } catch {} render(); };
["q", "fPri", "fType", "fPassed"].forEach((id) => $("#" + id).addEventListener("input", render));
$("#fType").insertAdjacentHTML("beforeend", TYPES.map((t) => `<option>${esc(t)}</option>`).join(""));
$("#csvIn").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importCSV(f); e.target.value = ""; });

/* ---------- auth ---------- */
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim(); const msg = $("#authMsg"); const btn = $("#authBtn");
  btn.disabled = true;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  btn.disabled = false; msg.hidden = false;
  msg.className = "auth-msg " + (error ? "err" : "ok");
  msg.textContent = error ? (/rate/i.test(error.message) ? "Too many requests. Wait a minute and try again." : error.message) : `Check ${email} for a sign-in link. You can close this tab.`;
});

async function enter(s) {
  session = s;
  if (!session) { role = null; show("authView"); return; }
  const { data, error } = await supabase.rpc("member_role");
  if (error) { show("authView"); toast("Couldn't check access: " + error.message); return; }
  role = data;
  if (!role) { $("#noAccessEmail").textContent = session.user.email; show("noAccessView"); return; }
  $("#whoEmail").textContent = session.user.email;
  $("#whoRole").textContent = role;
  $("#teamBtn").hidden = role !== "owner";
  $("#addBtn").hidden = $("#importLbl").hidden = !canWrite();
  $("#roundBtn").textContent = canWrite() ? "Edit round" : "Round details";
  show("appView"); render(); await loadAll(); subscribe();
}

if (!configured) show("configView");
else {
  let entered; // undefined until the first auth event, so a signed-out start still renders
  supabase.auth.onAuthStateChange((event, s) => {
    const uid = s?.user?.id ?? null;
    if (uid === entered && event !== "SIGNED_OUT") return; // token refreshes etc.
    entered = uid;
    setTimeout(() => enter(s), 0); // avoid calling supabase inside the auth callback
  });
}
