/* ═══════════════════════════════════════════════════════════════════════════
   ORPHAN.JS — Varredura e limpeza de registros órfãos no banco de dados
   ─────────────────────────────────────────────────────────────────────────
   Identifica registros sem vínculo válido e permite excluí-los após prévia.

   Checks realizados:
     1.  Usuários comuns sem família (app_users)
     2.  Membros sem usuário válido (family_members)
     3.  Membros sem família válida (family_members)
     4.  Famílias sem membros (families)
     5.  Contas com família inválida (accounts)
     6.  Grupos de conta com família inválida (account_groups)
     7.  Categorias com família inválida (categories)
     8.  Beneficiários com família inválida (payees)
     9.  Transações com conta inválida (transactions)
    10.  Transações com família inválida (transactions)
    11.  Orçamentos com categoria inválida (budgets)
    12.  Orçamentos com família inválida (budgets)
    13.  Transações programadas com conta inválida (scheduled_transactions)
    14.  Ocorrências sem programado pai (scheduled_occurrences)
    15.  Itens de preço com família inválida (price_items)
    16.  Histórico de preço sem item pai (price_history)
    17.  Listas de mercado com família inválida (grocery_lists)
    18.  Itens de lista sem lista pai (grocery_items)
    19.  Backups com família inválida (app_backups)
═══════════════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
let _orphanResults = [];   // [{ checkId, label, table, ids, count, description, danger }]
let _orphanChecked = {};   // checkId → bool (checkbox state)

// ── Check definitions ──────────────────────────────────────────────────────
const _ORPHAN_CHECKS = [
  {
    id: 'users_no_family',
    label: 'Usuários sem família',
    table: 'app_users',
    description: 'Usuários com role diferente de admin/owner que não têm vínculo com nenhuma família.',
    danger: false,
    fetch: async () => {
      // Get all user_ids that have at least one family_members row
      const { data: members } = await sb.from('family_members').select('user_id');
      const memberedIds = new Set((members || []).map(m => m.user_id));
      const { data: users } = await sb.from('app_users')
        .select('id, name, email, role')
        .not('role', 'in', '("admin","owner")');
      return (users || []).filter(u => !memberedIds.has(u.id));
    },
    displayRow: u => `${u.name || '—'} (${u.email}) · role: ${u.role}`,
    delete: async (ids) => sb.from('app_users').delete().in('id', ids),
  },
  {
    id: 'members_invalid_user',
    label: 'Vínculos com usuário inexistente',
    table: 'family_members',
    description: 'Registros em family_members cujo user_id não existe mais em app_users.',
    danger: true,
    fetch: async () => {
      const { data: users } = await sb.from('app_users').select('id');
      const userIds = new Set((users || []).map(u => u.id));
      const { data: members } = await sb.from('family_members').select('id, user_id, family_id, role');
      return (members || []).filter(m => !userIds.has(m.user_id));
    },
    displayRow: m => `family_members.id=${m.id} · user_id=${m.user_id?.slice(0,8)}… · role=${m.role}`,
    delete: async (ids) => sb.from('family_members').delete().in('id', ids),
  },
  {
    id: 'members_invalid_family',
    label: 'Vínculos com família inexistente',
    table: 'family_members',
    description: 'Registros em family_members cujo family_id não existe mais em families.',
    danger: true,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data: members } = await sb.from('family_members').select('id, user_id, family_id, role');
      return (members || []).filter(m => !famIds.has(m.family_id));
    },
    displayRow: m => `family_members.id=${m.id} · family_id=${m.family_id?.slice(0,8)}… · role=${m.role}`,
    delete: async (ids) => sb.from('family_members').delete().in('id', ids),
  },
  {
    id: 'families_no_members',
    label: 'Famílias sem membros',
    table: 'families',
    description: 'Famílias que não possuem nenhum usuário vinculado em family_members.',
    danger: false,
    fetch: async () => {
      const { data: members } = await sb.from('family_members').select('family_id');
      const famWithMembers = new Set((members || []).map(m => m.family_id));
      const { data: families } = await sb.from('families').select('id, name, created_at');
      return (families || []).filter(f => !famWithMembers.has(f.id));
    },
    displayRow: f => `${f.name} · criada em ${f.created_at?.slice(0,10)}`,
    delete: async (ids) => sb.from('families').delete().in('id', ids),
  },
  {
    id: 'accounts_invalid_family',
    label: 'Contas com família inválida',
    table: 'accounts',
    description: 'Contas cujo family_id não existe em families.',
    danger: true,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('accounts').select('id, name, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.name} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('accounts').delete().in('id', ids),
  },
  {
    id: 'account_groups_invalid_family',
    label: 'Grupos de conta com família inválida',
    table: 'account_groups',
    description: 'Grupos de conta cujo family_id não existe em families.',
    danger: false,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('account_groups').select('id, name, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.name} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('account_groups').delete().in('id', ids),
  },
  {
    id: 'categories_invalid_family',
    label: 'Categorias com família inválida',
    table: 'categories',
    description: 'Categorias cujo family_id não existe em families.',
    danger: true,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('categories').select('id, name, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.name} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('categories').delete().in('id', ids),
  },
  {
    id: 'payees_invalid_family',
    label: 'Beneficiários com família inválida',
    table: 'payees',
    description: 'Beneficiários cujo family_id não existe em families.',
    danger: false,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('payees').select('id, name, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.name} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('payees').delete().in('id', ids),
  },
  {
    id: 'transactions_invalid_account',
    label: 'Transações com conta inválida',
    table: 'transactions',
    description: 'Transações cujo account_id não existe em accounts.',
    danger: true,
    fetch: async () => {
      const { data: accounts } = await sb.from('accounts').select('id');
      const accIds = new Set((accounts || []).map(a => a.id));
      const { data } = await sb.from('transactions').select('id, description, account_id, date, amount');
      return (data || []).filter(r => !accIds.has(r.account_id));
    },
    displayRow: r => `${r.description || '—'} · ${r.date} · R$${r.amount} · account_id=${r.account_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('transactions').delete().in('id', ids),
  },
  {
    id: 'transactions_invalid_family',
    label: 'Transações com família inválida',
    table: 'transactions',
    description: 'Transações cujo family_id não existe em families.',
    danger: true,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('transactions').select('id, description, family_id, date, amount');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.description || '—'} · ${r.date} · R$${r.amount} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('transactions').delete().in('id', ids),
  },
  {
    id: 'budgets_invalid_category',
    label: 'Orçamentos com categoria inválida',
    table: 'budgets',
    description: 'Orçamentos cujo category_id não existe em categories.',
    danger: false,
    fetch: async () => {
      const { data: cats } = await sb.from('categories').select('id');
      const catIds = new Set((cats || []).map(c => c.id));
      const { data } = await sb.from('budgets').select('id, category_id, month, amount, family_id');
      return (data || []).filter(r => !catIds.has(r.category_id));
    },
    displayRow: r => `Mês: ${r.month?.slice(0,7)} · R$${r.amount} · category_id=${r.category_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('budgets').delete().in('id', ids),
  },
  {
    id: 'budgets_invalid_family',
    label: 'Orçamentos com família inválida',
    table: 'budgets',
    description: 'Orçamentos cujo family_id não existe em families.',
    danger: false,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('budgets').select('id, category_id, month, amount, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `Mês: ${r.month?.slice(0,7)} · R$${r.amount} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('budgets').delete().in('id', ids),
  },
  {
    id: 'scheduled_invalid_account',
    label: 'Programados com conta inválida',
    table: 'scheduled_transactions',
    description: 'Transações programadas cujo account_id não existe em accounts.',
    danger: false,
    fetch: async () => {
      const { data: accounts } = await sb.from('accounts').select('id');
      const accIds = new Set((accounts || []).map(a => a.id));
      const { data } = await sb.from('scheduled_transactions')
        .select('id, description, account_id').not('account_id', 'is', null);
      return (data || []).filter(r => r.account_id && !accIds.has(r.account_id));
    },
    displayRow: r => `${r.description || '—'} · account_id=${r.account_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('scheduled_transactions').delete().in('id', ids),
  },
  {
    id: 'occurrences_invalid_scheduled',
    label: 'Ocorrências sem programado pai',
    table: 'scheduled_occurrences',
    description: 'Ocorrências em scheduled_occurrences cujo scheduled_id não existe.',
    danger: false,
    fetch: async () => {
      const { data: scheds } = await sb.from('scheduled_transactions').select('id');
      const schedIds = new Set((scheds || []).map(s => s.id));
      const { data } = await sb.from('scheduled_occurrences')
        .select('id, scheduled_id, scheduled_date, execution_status');
      return (data || []).filter(r => !schedIds.has(r.scheduled_id));
    },
    displayRow: r => `Data: ${r.scheduled_date} · status: ${r.execution_status} · scheduled_id=${r.scheduled_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('scheduled_occurrences').delete().in('id', ids),
  },
  {
    id: 'price_items_invalid_family',
    label: 'Itens de preço com família inválida',
    table: 'price_items',
    description: 'Itens de preço cujo family_id não existe em families.',
    danger: false,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('price_items').select('id, name, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.name} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('price_items').delete().in('id', ids),
  },
  {
    id: 'price_history_invalid_item',
    label: 'Histórico de preço sem item pai',
    table: 'price_history',
    description: 'Registros em price_history cujo item_id não existe em price_items.',
    danger: false,
    fetch: async () => {
      const { data: items } = await sb.from('price_items').select('id');
      const itemIds = new Set((items || []).map(i => i.id));
      const { data } = await sb.from('price_history')
        .select('id, item_id, purchased_at, unit_price');
      return (data || []).filter(r => !itemIds.has(r.item_id));
    },
    displayRow: r => `Data: ${r.purchased_at} · R$${r.unit_price} · item_id=${r.item_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('price_history').delete().in('id', ids),
  },
  {
    id: 'grocery_lists_invalid_family',
    label: 'Listas de mercado com família inválida',
    table: 'grocery_lists',
    description: 'Listas de mercado cujo family_id não existe em families.',
    danger: false,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('grocery_lists').select('id, name, family_id');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.name} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('grocery_lists').delete().in('id', ids),
  },
  {
    id: 'grocery_items_invalid_list',
    label: 'Itens de lista sem lista pai',
    table: 'grocery_items',
    description: 'Itens de lista cujo list_id não existe em grocery_lists.',
    danger: false,
    fetch: async () => {
      const { data: lists } = await sb.from('grocery_lists').select('id');
      const listIds = new Set((lists || []).map(l => l.id));
      const { data } = await sb.from('grocery_items').select('id, name, list_id');
      return (data || []).filter(r => !listIds.has(r.list_id));
    },
    displayRow: r => `${r.name} · list_id=${r.list_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('grocery_items').delete().in('id', ids),
  },
  {
    id: 'backups_invalid_family',
    label: 'Backups com família inválida',
    table: 'app_backups',
    description: 'Backups cujo family_id não existe em families.',
    danger: false,
    fetch: async () => {
      const { data: families } = await sb.from('families').select('id');
      const famIds = new Set((families || []).map(f => f.id));
      const { data } = await sb.from('app_backups')
        .select('id, label, family_id, created_at');
      return (data || []).filter(r => !famIds.has(r.family_id));
    },
    displayRow: r => `${r.label} · ${r.created_at?.slice(0,10)} · family_id=${r.family_id?.slice(0,8)}…`,
    delete: async (ids) => sb.from('app_backups').delete().in('id', ids),
  },
];

// ── Run scan ───────────────────────────────────────────────────────────────
async function runOrphanScan() {
  if (!currentUser?.can_admin) { toast('Acesso restrito a administradores', 'error'); return; }
  if (!sb) { toast('Sem conexão com o banco', 'error'); return; }

  const btn = document.getElementById('orphanScanBtn');
  const resultsEl = document.getElementById('orphanScanResults');
  const deleteBtn = document.getElementById('orphanDeleteBtn');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Varrendo…'; }
  if (deleteBtn) deleteBtn.style.display = 'none';
  if (resultsEl) resultsEl.innerHTML = _orphanProgress(0, _ORPHAN_CHECKS.length);

  _orphanResults = [];
  _orphanChecked = {};

  let done = 0;
  for (const check of _ORPHAN_CHECKS) {
    try {
      const records = await check.fetch();
      if (records.length > 0) {
        const ids = records.map(r => r.id);
        _orphanResults.push({ ...check, records, ids, count: records.length });
        _orphanChecked[check.id] = true; // default: selected
      }
    } catch (e) {
      // Table may not exist (e.g. price_items if module not enabled) — skip silently
      console.warn(`[orphan] ${check.id}:`, e?.message || e);
    }
    done++;
    if (resultsEl) resultsEl.innerHTML = _orphanProgress(done, _ORPHAN_CHECKS.length);
  }

  if (btn) { btn.disabled = false; btn.textContent = '🔍 Re-executar Varredura'; }
  _renderOrphanResults();
}

function _orphanProgress(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  return `<div style="padding:16px 0">
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:8px">
      Verificando ${done} de ${total} checks…
    </div>
    <div style="height:6px;background:var(--border);border-radius:100px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:100px;transition:width .2s"></div>
    </div>
  </div>`;
}

// ── Render results ──────────────────────────────────────────────────────────
function _renderOrphanResults() {
  const el = document.getElementById('orphanScanResults');
  const deleteBtn = document.getElementById('orphanDeleteBtn');
  if (!el) return;

  const total = _orphanResults.reduce((s, r) => s + r.count, 0);

  if (!_orphanResults.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:28px 0">
        <div style="font-size:2.5rem;margin-bottom:10px">✅</div>
        <div style="font-weight:700;font-size:.92rem;color:var(--text)">Nenhum registro órfão encontrado</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:4px">O banco de dados está íntegro.</div>
      </div>`;
    if (deleteBtn) deleteBtn.style.display = 'none';
    return;
  }

  if (deleteBtn) deleteBtn.style.display = '';

  const summaryColor = total > 0 ? '#dc2626' : 'var(--green)';
  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;
        padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;
        border-radius:var(--r-sm);margin-bottom:12px">
      <span style="font-size:.85rem;font-weight:700;color:#991b1b">
        ⚠️ ${total} registro${total !== 1 ? 's' : ''} órfão${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''} em ${_orphanResults.length} tabela${_orphanResults.length !== 1 ? 's' : ''}
      </span>
      <label style="font-size:.78rem;cursor:pointer;display:flex;align-items:center;gap:5px;color:#991b1b">
        <input type="checkbox" id="orphanSelectAll" onchange="_orphanToggleAll(this.checked)"
          ${Object.values(_orphanChecked).every(Boolean) ? 'checked' : ''}>
        Selecionar todos
      </label>
    </div>`;

  for (const result of _orphanResults) {
    const isChecked = _orphanChecked[result.id];
    const dangerBg  = result.danger ? '#fef2f2' : '#fffbeb';
    const dangerBdr = result.danger ? '#fecaca' : '#fde68a';
    const dangerTxt = result.danger ? '#991b1b' : '#92400e';
    const dangerBadge = result.danger
      ? `<span style="font-size:.65rem;font-weight:700;padding:2px 6px;border-radius:4px;background:#fecaca;color:#991b1b;margin-left:6px">ALTO RISCO</span>`
      : '';

    // Show first 5 records, collapse the rest
    const visibleRows = result.records.slice(0, 5);
    const hiddenCount = result.records.length - 5;
    const rowsHtml = visibleRows.map(r => `
      <div style="font-size:.76rem;color:var(--text2);padding:4px 0;border-bottom:1px solid var(--border);
           font-family:var(--font-mono,'Courier New'),monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${esc(result.displayRow(r))}
      </div>`).join('');
    const moreHtml = hiddenCount > 0
      ? `<div style="font-size:.74rem;color:var(--muted);padding:4px 0;font-style:italic">
           … e mais ${hiddenCount} registro${hiddenCount !== 1 ? 's' : ''}
         </div>`
      : '';

    html += `
      <div style="border:1px solid ${dangerBdr};border-radius:var(--r-sm);margin-bottom:10px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${dangerBg}">
          <input type="checkbox" id="orphanChk_${result.id}"
            ${isChecked ? 'checked' : ''}
            onchange="_orphanToggleCheck('${result.id}', this.checked)"
            style="flex-shrink:0;width:16px;height:16px;cursor:pointer">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <span style="font-size:.84rem;font-weight:700;color:${dangerTxt}">${esc(result.label)}</span>
              ${dangerBadge}
            </div>
            <div style="font-size:.74rem;color:var(--muted);margin-top:2px">${esc(result.description)}</div>
          </div>
          <span style="font-size:.78rem;font-weight:700;color:${dangerTxt};flex-shrink:0;
               padding:3px 10px;border-radius:100px;background:rgba(0,0,0,.05)">
            ${result.count}
          </span>
        </div>
        <div style="padding:8px 14px;background:var(--surface2)">
          <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;
               color:var(--muted);margin-bottom:4px">tabela: ${result.table}</div>
          ${rowsHtml}${moreHtml}
        </div>
      </div>`;
  }

  el.innerHTML = html;
}

// ── Checkbox helpers ────────────────────────────────────────────────────────
function _orphanToggleCheck(checkId, checked) {
  _orphanChecked[checkId] = checked;
  // Update "select all" state
  const all = document.getElementById('orphanSelectAll');
  if (all) all.checked = Object.values(_orphanChecked).every(Boolean);
}

function _orphanToggleAll(checked) {
  for (const k of Object.keys(_orphanChecked)) _orphanChecked[k] = checked;
  // Sync all individual checkboxes
  for (const r of _orphanResults) {
    const el = document.getElementById(`orphanChk_${r.id}`);
    if (el) el.checked = checked;
  }
}

// ── Delete flow ────────────────────────────────────────────────────────────
async function confirmOrphanDelete() {
  const toDelete = _orphanResults.filter(r => _orphanChecked[r.id]);
  if (!toDelete.length) { toast('Nenhum grupo selecionado para exclusão', 'warning'); return; }

  const totalRecords = toDelete.reduce((s, r) => s + r.count, 0);
  const hasDanger = toDelete.some(r => r.danger);

  // Build confirmation message
  const summary = toDelete.map(r => `  • ${r.label}: ${r.count} registro${r.count !== 1 ? 's' : ''}`).join('\n');
  const dangerWarning = hasDanger ? '\n\n⚠️ ATENÇÃO: Alguns grupos marcados como ALTO RISCO incluem transações ou dados críticos.' : '';

  const confirmed = confirm(
    `Confirmar exclusão de ${totalRecords} registro${totalRecords !== 1 ? 's' : ''} órfão${totalRecords !== 1 ? 's' : ''}?\n\n` +
    `Grupos selecionados:\n${summary}${dangerWarning}\n\n` +
    `Esta ação é IRREVERSÍVEL. Faça um backup antes de continuar.`
  );
  if (!confirmed) return;

  // Double-confirm for dangerous checks
  if (hasDanger) {
    const confirmed2 = confirm(
      `⛔ CONFIRMAÇÃO FINAL\n\n` +
      `Você está prestes a excluir dados críticos (transações, contas ou categorias).\n` +
      `Digite "CONFIRMAR" na próxima caixa para prosseguir.`
    );
    if (!confirmed2) return;
    const typed = prompt('Digite CONFIRMAR para executar a exclusão:');
    if (typed !== 'CONFIRMAR') { toast('Exclusão cancelada — texto incorreto', 'warning'); return; }
  }

  await _doOrphanDelete(toDelete);
}

async function _doOrphanDelete(groups) {
  const btn = document.getElementById('orphanDeleteBtn');
  const scanBtn = document.getElementById('orphanScanBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Excluindo…'; }
  if (scanBtn) scanBtn.disabled = true;

  let totalDeleted = 0;
  const errors = [];

  for (const group of groups) {
    try {
      const { error } = await group.delete(group.ids);
      if (error) throw error;
      totalDeleted += group.count;
      toast(`✓ ${group.label}: ${group.count} excluído${group.count !== 1 ? 's' : ''}`, 'success');
    } catch (e) {
      errors.push(`${group.label}: ${e?.message || e}`);
    }
  }

  if (errors.length) {
    toast(`${errors.length} grupo(s) com erro. Verifique o console.`, 'error');
    errors.forEach(e => console.error('[orphan delete]', e));
  }

  if (totalDeleted > 0) {
    toast(`✓ ${totalDeleted} registro${totalDeleted !== 1 ? 's' : ''} excluído${totalDeleted !== 1 ? 's' : ''} com sucesso`, 'success');
    // Bust caches that may have orphan data
    if (typeof DB !== 'undefined') DB.bustAll();
  }

  if (btn) { btn.disabled = false; btn.textContent = '🗑 Excluir Selecionados'; }
  if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = '🔍 Re-executar Varredura'; }

  // Re-run scan to show updated state
  await runOrphanScan();
}
