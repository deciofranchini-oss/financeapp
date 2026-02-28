import { supabase } from "./supabase.js";
import { el, showTab, setOptions, moneyBRL, yyyyMmDd } from "./ui.js";

let session = null;

const state = {
  accounts: [],
  payees: [],
  categories: [],
  transactions: []
};

function todayStr(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

async function refreshSession(){
  const { data, error } = await supabase.auth.getSession();
  if(error){
    console.error(error);
    alert(error.message);
    return;
  }
  session = data.session;
  const logged = !!session?.user;

  el("authCard").classList.toggle("hidden", logged);
  el("appShell").classList.toggle("hidden", !logged);
  el("btnLogout").classList.toggle("hidden", !logged);
  el("userLabel").textContent = logged ? session.user.email : "";

  if(logged){
    await loadAll();
    await renderAll();
  }
}

async function signUp(){
  const email = el("email").value.trim();
  const password = el("password").value;
  if(!email || !password) return alert("Preencha email e senha.");
  const { error } = await supabase.auth.signUp({ email, password });
  if(error) return alert(error.message);
  alert("Conta criada. Se o Supabase exigir confirmação por email, confirme e depois faça login.");
  await refreshSession();
}

async function signIn(){
  const email = el("email").value.trim();
  const password = el("password").value;
  if(!email || !password) return alert("Preencha email e senha.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error) return alert(error.message);
  await refreshSession();
}

async function signOut(){
  const { error } = await supabase.auth.signOut();
  if(error) return alert(error.message);
  await refreshSession();
}

async function loadAll(){
  await Promise.all([loadAccounts(), loadPayees(), loadCategories(), loadTransactions()]);
}

async function loadAccounts(){
  const { data, error } = await supabase.from("accounts").select("*").order("created_at");
  if(error) return alert(error.message);
  state.accounts = data ?? [];
}
async function loadPayees(){
  const { data, error } = await supabase.from("payees").select("*").order("created_at");
  if(error) return alert(error.message);
  state.payees = data ?? [];
}
async function loadCategories(){
  const { data, error } = await supabase.from("categories").select("*").order("created_at");
  if(error) return alert(error.message);
  state.categories = data ?? [];
}
async function loadTransactions(){
  const { data, error } = await supabase
    .from("transactions")
    .select("*, accounts(name), payees(name), categories(name)")
    .order("expected_date", { ascending:false })
    .limit(50);
  if(error) return alert(error.message);
  state.transactions = data ?? [];
}

function catLabel(cat){
  if(!cat) return "";
  const parent = state.categories.find(c => c.id === cat.parent_id);
  return parent ? `${parent.name} / ${cat.name}` : cat.name;
}

async function renderAll(){
  setOptions(el("txAccount"), state.accounts, { includeBlank:true });
  setOptions(el("txPayee"), state.payees, { includeBlank:true });

  const cats = state.categories.map(c => ({ ...c, label: catLabel(c) }));
  setOptions(el("txCategory"), cats, { label:"label", includeBlank:true });

  const parentSelect = el("catParent");
  const type = el("catType").value;
  const possibleParents = state.categories.filter(c => c.type === type);
  const possibleParentsLabeled = possibleParents.map(c => ({...c, label: catLabel(c)}));
  setOptions(parentSelect, possibleParentsLabeled, { label:"label", includeBlank:true, blankLabel:"(sem pai)" });

  renderLists();
  renderForecast();
}

function renderLists(){
  el("accountsList").innerHTML = state.accounts.map(a => `
    <div class="item">
      <div><b>${a.name}</b><div class="muted">${a.institution ?? ""} ${a.currency ?? ""}</div></div>
      <button class="btn secondary" data-del="account" data-id="${a.id}">Excluir</button>
    </div>
  `).join("") || `<div class="muted">Nenhuma conta ainda.</div>`;

  el("payeesList").innerHTML = state.payees.map(p => `
    <div class="item">
      <div><b>${p.name}</b><div class="muted">${p.kind}</div></div>
      <button class="btn secondary" data-del="payee" data-id="${p.id}">Excluir</button>
    </div>
  `).join("") || `<div class="muted">Nenhum registro ainda.</div>`;

  const cats = state.categories.map(c => ({...c, label: `${c.type === "income" ? "Rendimento" : "Despesa"} · ${catLabel(c)}`}));
  el("categoriesList").innerHTML = cats.map(c => `
    <div class="item">
      <div><b>${c.label}</b><div class="muted">${c.parent_id ? "Subcategoria" : "Categoria"}</div></div>
      <button class="btn secondary" data-del="category" data-id="${c.id}">Excluir</button>
    </div>
  `).join("") || `<div class="muted">Nenhuma categoria ainda.</div>`;

  el("txList").innerHTML = state.transactions.map(t => {
    const who = t.payees?.name ?? "";
    const cat = t.categories?.name ?? "";
    const acc = t.accounts?.name ?? "";
    const badge = t.status === "cleared" ? "✅" : "🕒";
    const when = t.status === "cleared" ? `Efetiva: ${yyyyMmDd(t.cleared_date)}` : "Prevista";
    return `
      <div class="item">
        <div>
          <b>${badge} ${t.type === "income" ? "Rendimento" : "Despesa"} · ${moneyBRL(t.amount)}</b>
          <div class="muted">${when}: ${yyyyMmDd(t.expected_date)} · Conta: ${acc}</div>
          <div class="muted">${who ? `• ${who}` : ""} ${cat ? `• ${cat}` : ""}</div>
          <div>${t.description ?? ""}</div>
        </div>
        <button class="btn secondary" data-del="tx" data-id="${t.id}">Excluir</button>
      </div>
    `;
  }).join("") || `<div class="muted">Sem lançamentos ainda.</div>`;
}

function renderForecast(){
  const now = todayStr();
  const future = state.transactions
    .filter(t => t.status === "planned" && String(t.expected_date) >= now)
    .sort((a,b) => String(a.expected_date).localeCompare(String(b.expected_date)));

  if(!future.length){
    el("forecastOut").innerHTML = `<div class="muted">Nenhuma previsão futura por enquanto.</div>`;
    return;
  }

  const byMonth = new Map();
  for(const t of future){
    const ym = String(t.expected_date).slice(0,7);
    if(!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(t);
  }

  let html = "";
  for(const [ym, items] of byMonth.entries()){
    const incomes = items.filter(i=>i.type==="income").reduce((s,i)=>s+Number(i.amount),0);
    const expenses = items.filter(i=>i.type==="expense").reduce((s,i)=>s+Number(i.amount),0);
    const net = incomes - expenses;

    html += `
      <div class="item">
        <div>
          <b>${ym} · Saldo previsto: ${moneyBRL(net)}</b>
          <div class="muted">Entradas: ${moneyBRL(incomes)} · Saídas: ${moneyBRL(expenses)}</div>
          <div class="muted">${items.length} lançamentos planejados</div>
        </div>
      </div>
    `;
  }
  el("forecastOut").innerHTML = html;
}

async function addAccount(){
  const name = el("accName").value.trim();
  if(!name) return alert("Informe o nome da conta.");
  const { error } = await supabase.from("accounts").insert({ name });
  if(error) return alert(error.message);
  el("accName").value = "";
  await loadAccounts(); await renderAll();
}

async function addPayee(){
  const name = el("payeeName").value.trim();
  if(!name) return alert("Informe o nome.");
  const { error } = await supabase.from("payees").insert({ name, kind:"generic" });
  if(error) return alert(error.message);
  el("payeeName").value = "";
  await loadPayees(); await renderAll();
}

async function addCategory(){
  const name = el("catName").value.trim();
  const type = el("catType").value;
  const parent_id = el("catParent").value || null;
  if(!name) return alert("Informe o nome.");
  const { error } = await supabase.from("categories").insert({ name, type, parent_id });
  if(error) return alert(error.message);
  el("catName").value = "";
  await loadCategories(); await renderAll();
}

async function addTx(){
  const type = el("txType").value;
  const amount = Number(el("txAmount").value);
  const expected_date = el("txExpected").value;
  const account_id = el("txAccount").value;
  const payee_id = el("txPayee").value || null;
  const category_id = el("txCategory").value || null;
  const description = el("txDesc").value.trim() || null;

  if(!account_id) return alert("Selecione a conta.");
  if(!expected_date) return alert("Informe a data prevista.");
  if(!amount || amount <= 0) return alert("Informe um valor válido.");

  const { error } = await supabase.from("transactions").insert({
    type, amount, expected_date, account_id, payee_id, category_id, description,
    status: "planned"
  });
  if(error) return alert(error.message);

  el("txAmount").value = "";
  el("txDesc").value = "";
  el("txExpected").value = todayStr();

  await loadTransactions(); await renderAll();
}

async function deleteEntity(kind, id){
  const map = { account:"accounts", payee:"payees", category:"categories", tx:"transactions" };
  const table = map[kind];
  const { error } = await supabase.from(table).delete().eq("id", id);
  if(error) return alert(error.message);
  await loadAll(); await renderAll();
}

async function runReport(){
  const year = Number(el("repYear").value);
  const month = el("repMonth").value ? Number(el("repMonth").value) : null;
  if(!year) return alert("Informe um ano.");

  let q = supabase.from("transactions")
    .select("type, amount, expected_date, status")
    .gte("expected_date", `${year}-01-01`)
    .lte("expected_date", `${year}-12-31`);

  if(month){
    const mm = String(month).padStart(2,"0");
    q = q.gte("expected_date", `${year}-${mm}-01`).lte("expected_date", `${year}-${mm}-31`);
  }

  const { data, error } = await q;
  if(error) return alert(error.message);

  const byMonth = new Map();
  for(const t of (data ?? [])){
    const ym = String(t.expected_date).slice(0,7);
    if(!byMonth.has(ym)) byMonth.set(ym, { income:0, expense:0, planned:0, cleared:0 });
    const b = byMonth.get(ym);
    b[t.type] += Number(t.amount);
    b[t.status] += Number(t.amount);
  }

  const rows = [];
  for(let m=1;m<=12;m++){
    const mm = String(m).padStart(2,"0");
    const ym = `${year}-${mm}`;
    const b = byMonth.get(ym) ?? { income:0, expense:0, planned:0, cleared:0 };
    rows.push({ ym, ...b, net: b.income - b.expense });
  }

  el("reportOut").innerHTML = rows.map(r => `
    <div class="item">
      <div>
        <b>${r.ym} · Saldo: ${moneyBRL(r.net)}</b>
        <div class="muted">Entradas: ${moneyBRL(r.income)} · Saídas: ${moneyBRL(r.expense)}</div>
        <div class="muted">Planejado: ${moneyBRL(r.planned)} · Efetivado: ${moneyBRL(r.cleared)}</div>
      </div>
    </div>
  `).join("");
}

function wireUI(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  el("btnSignUp").addEventListener("click", signUp);
  el("btnSignIn").addEventListener("click", signIn);
  el("btnLogout").addEventListener("click", signOut);

  el("btnAddAccount").addEventListener("click", addAccount);
  el("btnAddPayee").addEventListener("click", addPayee);
  el("btnAddCategory").addEventListener("click", addCategory);

  el("btnAddTx").addEventListener("click", addTx);
  el("btnReload").addEventListener("click", async()=>{ await loadAll(); await renderAll(); });

  el("catType").addEventListener("change", renderAll);
  el("btnRunReport").addEventListener("click", runReport);

  document.body.addEventListener("click", async (e)=>{
    const btn = e.target.closest("[data-del]");
    if(!btn) return;
    const kind = btn.dataset.del;
    const id = btn.dataset.id;
    if(confirm("Excluir?")) await deleteEntity(kind, id);
  });

  el("txExpected").value = todayStr();
  el("repYear").value = new Date().getFullYear();
}

async function main(){
  wireUI();
  supabase.auth.onAuthStateChange(async () => { await refreshSession(); });
  await refreshSession();
}

main();
