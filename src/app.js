import { PLANS, PEOPLE, KB, STATS } from "./data.js";
import { search } from "./search.js";

const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  }
};

const state = {
  view: LS.get("novichok.view", "newcomer"),
  personId: LS.get("novichok.person", "artem"),
  showAll: false
};

const dayOf = (p) => p.daysAgo + 1;

function getDone(person) {
  const saved = LS.get("novichok.done." + person.id, null);
  return Array.isArray(saved) ? saved : person.done.slice();
}

function setDone(person, done) {
  LS.set("novichok.done." + person.id, done);
}

// доля выполненных пунктов среди тех, что уже должны быть закрыты
function progress(person) {
  const items = PLANS[person.plan].items;
  const day = dayOf(person);
  const done = getDone(person);
  const dueIdx = items.map((it, i) => (it.d <= day ? i : -1)).filter((i) => i >= 0);
  const doneDue = dueIdx.filter((i) => done.includes(i)).length;
  const ratio = dueIdx.length === 0 ? 1 : doneDue / dueIdx.length;
  return { due: dueIdx.length, doneDue, ratio, total: items.length, doneTotal: done.length };
}

function statusOf(person) {
  const { ratio } = progress(person);
  if (ratio >= 0.85) return { key: "ok", label: "в графике" };
  if (ratio >= 0.5) return { key: "warn", label: "внимание" };
  return { key: "risk", label: "риск" };
}

/* ---------- отрисовка ---------- */

const $ = (sel) => document.querySelector(sel);

function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase();
}

function renderStats() {
  $(".stats").innerHTML = STATS.map(
    (s) => `<div class="stat"><b>${s.value}</b><span>${s.label}</span></div>`
  ).join("");
}

function renderPersona() {
  const p = PEOPLE.find((x) => x.id === state.personId) || PEOPLE[0];
  const pr = progress(p);
  const st = statusOf(p);
  const pct = Math.round((pr.doneTotal / pr.total) * 100);
  $("#personaCard").innerHTML = `
    <div class="avatar" aria-hidden="true">${initials(p.name)}</div>
    <div class="persona-main">
      <label for="personSelect" class="meta">Я здесь как</label>
      <div>
        <select id="personSelect">
          ${PEOPLE.map((x) => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${x.name}, ${x.role.toLowerCase()}</option>`).join("")}
        </select>
      </div>
      <div class="meta">${p.dept} · наставник: ${p.mentor} · <span class="badge ${st.key}">${st.label}</span></div>
    </div>
    <div class="daybar">
      <div class="daynum">день ${dayOf(p)} <small>из 90</small></div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="caption">выполнено ${pr.doneTotal} из ${pr.total} пунктов плана</div>
    </div>`;
  $("#personSelect").addEventListener("change", (e) => {
    state.personId = e.target.value;
    LS.set("novichok.person", state.personId);
    renderAll();
  });
}

const MILESTONES = [
  { d: 1, label: "День 1" },
  { d: 7, label: "Неделя 1" },
  { d: 14, label: "День 14" },
  { d: 30, label: "День 30" },
  { d: 60, label: "День 60" },
  { d: 90, label: "День 90" }
];

function renderPlan() {
  const p = PEOPLE.find((x) => x.id === state.personId) || PEOPLE[0];
  const items = PLANS[p.plan].items;
  const done = getDone(p);
  const day = dayOf(p);

  $("#planList").innerHTML = MILESTONES.map((m) => {
    const group = items.map((it, i) => ({ ...it, i })).filter((it) => it.d === m.d);
    if (group.length === 0) return "";
    const groupDone = group.filter((it) => done.includes(it.i)).length;
    const tasks = group.map((it) => {
      const checked = done.includes(it.i) ? "checked" : "";
      const future = it.d > day ? " future" : "";
      return `
        <label class="task${future}">
          <input type="checkbox" data-idx="${it.i}" ${checked}>
          <span class="box" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 6.2 4.8 9 10 3.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="txt">${it.t}</span>
        </label>`;
    }).join("");
    return `
      <div class="milestone">
        <div class="milestone-head"><h4>${m.label}</h4><span>${groupDone} из ${group.length}</span></div>
        ${tasks}
      </div>`;
  }).join("");

  $("#planList").querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const idx = Number(cb.dataset.idx);
      const cur = getDone(p);
      const next = cb.checked ? [...new Set([...cur, idx])] : cur.filter((i) => i !== idx);
      setDone(p, next);
      renderPersona();
      renderPlan();
      if (state.view === "hr") renderHr();
    });
  });
}

const CHIPS = ["Когда зарплата?", "Как получить пропуск?", "К кому идти с вопросом?", "Как оформить больничный?"];

function renderChips() {
  $("#chips").innerHTML = CHIPS.map((c) => `<button type="button" data-q="${c}">${c}</button>`).join("");
  $("#chips").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      $("#askInput").value = b.dataset.q;
      runSearch(b.dataset.q);
    });
  });
}

function answerHtml(entry, best) {
  return `
    <div class="answer${best ? " best" : ""}">
      <h5>${entry.title}</h5>
      <p>${entry.answer}</p>
      <div class="src">Источник: <b>${entry.source}</b></div>
    </div>`;
}

function runSearch(query) {
  const box = $("#results");
  const hits = search(query);
  state.showAll = false;
  $("#showAll").textContent = "Показать всю базу инструкций";
  if (hits.length === 0) {
    box.innerHTML = `
      <div class="empty">
        Точного ответа в инструкциях не нашлось. Спросите наставника, его контакт есть в вашей карточке выше, или загляните в полную базу по кнопке ниже.
      </div>`;
    return;
  }
  box.innerHTML = hits.map((h, i) => answerHtml(h.entry, i === 0)).join("");
}

function renderAllKb() {
  const box = $("#results");
  if (state.showAll) {
    box.innerHTML = KB.map((e) => answerHtml(e, false)).join("");
    $("#showAll").textContent = "Скрыть базу инструкций";
  } else {
    box.innerHTML = "";
    $("#showAll").textContent = "Показать всю базу инструкций";
  }
}

function renderHr() {
  const order = { risk: 0, warn: 1, ok: 2 };
  const rows = PEOPLE.map((p) => {
    const pr = progress(p);
    const st = statusOf(p);
    return { p, pr, st };
  }).sort((a, b) => order[a.st.key] - order[b.st.key] || dayOf(b.p) - dayOf(a.p));

  $("#hrRows").innerHTML = rows.map(({ p, pr, st }) => {
    const pct = pr.due === 0 ? 100 : Math.round((pr.doneDue / pr.due) * 100);
    return `
      <tr data-id="${p.id}" tabindex="0">
        <td class="who"><b>${p.name}</b><span>${p.role}, ${p.dept}</span></td>
        <td>${dayOf(p)} из 90</td>
        <td>${pr.doneDue} из ${pr.due} к сроку<div class="minibar"><i style="width:${pct}%"></i></div></td>
        <td>${p.mentor}</td>
        <td><span class="badge ${st.key}">${st.label}</span></td>
      </tr>`;
  }).join("");

  $("#hrRows").querySelectorAll("tr").forEach((tr) => {
    const open = () => {
      state.personId = tr.dataset.id;
      LS.set("novichok.person", state.personId);
      setView("newcomer");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function setView(view) {
  state.view = view;
  LS.set("novichok.view", view);
  const isNew = view === "newcomer";
  $("#screenNewcomer").hidden = !isNew;
  $("#screenHr").hidden = isNew;
  $("#viewNewcomer").setAttribute("aria-pressed", String(isNew));
  $("#viewHr").setAttribute("aria-pressed", String(!isNew));
  if (!isNew) {
    renderHr();
  } else {
    renderPersona();
    renderPlan();
  }
}

function renderAll() {
  renderPersona();
  renderPlan();
  if (state.view === "hr") renderHr();
}

/* ---------- события ---------- */

$("#viewNewcomer").addEventListener("click", () => setView("newcomer"));
$("#viewHr").addEventListener("click", () => setView("hr"));

$("#askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#askInput").value.trim();
  if (q) runSearch(q);
});

$("#showAll").addEventListener("click", () => {
  state.showAll = !state.showAll;
  renderAllKb();
});

$("#resetDemo").addEventListener("click", () => {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("novichok."))
    .forEach((k) => localStorage.removeItem(k));
  state.personId = "artem";
  state.view = "newcomer";
  state.showAll = false;
  $("#askInput").value = "";
  $("#results").innerHTML = "";
  $("#showAll").textContent = "Показать всю базу инструкций";
  setView("newcomer");
  renderAll();
});

/* ---------- старт ---------- */

renderStats();
renderChips();
setView(state.view);
renderAll();
