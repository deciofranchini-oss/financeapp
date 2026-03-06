// ── backup.js — Backup local (JSON) + Backup no banco (Supabase) ───────────

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 1 — BACKUP LOCAL (JSON download)
// ══════════════════════════════════════════════════════════════════════════

async function exportBackup() {
  const btn = event?.target;
  const origText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exportando...'; }
  const status = document.getElementById('backupStatus');
  try {
    const fid = famId();
    const q = q => famQ(sb.from(q).select('*'));
    const [a, c, p, t, b, s, grp] = await Promise.all([
      q('accounts'),
      q('categories'),
      q('payees'),
      q('transactions'),
      q('budgets'),
      famQ(sb.from('scheduled_transactions').select('*')),
      famQ(sb.from('account_groups').select('*')),
    ]);
    const backup = {
      version:     '3.0',
      app:         'JF Family FinTrack',
      family_id:   fid,
      exported_at: new Date().toISOString(),
      counts: {
        accounts:     a.data?.length || 0,
        categories:   c.data?.length || 0,
        transactions: t.data?.length || 0,
        budgets:      b.data?.length || 0,
        scheduled:    s.data?.length || 0,
      },
      data: {
        accounts:             a.data  || [],
        account_groups:       grp.data|| [],
        categories:           c.data  || [],
        payees:               p.data  || [],
        transactions:         t.data  || [],
        budgets:              b.data  || [],
        scheduled_transactions: s.data || [],
      },
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a2   = document.createElement('a');
    a2.href = url;
    a2.download = `FinTrack_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a2.click();
    URL.revokeObjectURL(url);
    if (status) {
      status.textContent = `✓ ${backup.counts.transactions} transações · ${(json.length / 1024).toFixed(0)} KB`;
      status.style.color = 'var(--green)';
    }
    toast('Backup exportado!', 'success');
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--red)'; }
    toast('Erro ao exportar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
}

async function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const status = document.getElementById('restoreStatus');
  if (status) status.textContent = '⏳ Lendo arquivo...';
  try {
    const backup = JSON.parse(await file.text());
    if (!backup.version || !backup.data) throw new Error('Arquivo de backup inválido');
    const ok = confirm(
      `Restaurar backup de ${backup.exported_at?.slice(0, 10) || '?'}?\n\n` +
      `${backup.counts?.transactions || 0} transações · ${backup.counts?.accounts || 0} contas\n\n` +
      `Dados existentes serão mantidos (upsert).`
    );
    if (!ok) { if (status) status.textContent = ''; return; }
    if (status) status.textContent = '⏳ Restaurando...';
    const d = backup.data;
    for (const [table, rows] of [
      ['account_groups',        d.account_groups        || []],
      ['accounts',              d.accounts              || []],
      ['categories',            d.categories            || []],
      ['payees',                d.payees                || []],
      ['transactions',          d.transactions          || []],
      ['budgets',               d.budgets               || []],
      ['scheduled_transactions', d.scheduled_transactions || d.scheduled || []],
    ]) {
      if (!rows.length) continue;
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), { ignoreDuplicates: false });
        if (error) { if (status) status.textContent = `✗ ${table}: ${error.message}`; return; }
      }
      if (status) status.textContent = `✓ ${table} ok...`;
    }
    await Promise.all([loadAccounts(), loadCategories(), loadPayees()]);
    populateSelects();
    if (status) { status.textContent = '✓ Restaurado com sucesso!'; status.style.color = 'var(--green)'; }
    toast('Backup restaurado!', 'success');
  } catch (e) {
    if (status) { status.textContent = '✗ ' + e.message; status.style.color = 'var(--red)'; }
    toast('Erro: ' + e.message, 'error');
  }
  event.target.value = '';
}

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 2 — BACKUP NO BANCO (app_backups)
// ══════════════════════════════════════════════════════════════════════════

let _dbBackupList = [];

// ── Verificar se tabela app_backups existe ────────────────────────────────
async function _checkBackupTable() {
  const { error } = await sb.from('app_backups').select('id').limit(1);
  return !error || !error.message?.includes('does not exist');
}

// ── Criar snapshot no banco ───────────────────────────────────────────────
async function createDbBackup(label = '') {
  const btn = document.getElementById('dbBackupCreateBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Criando...'; }
  try {
    const hasTable = await _checkBackupTable();
    if (!hasTable) {
      toast('Tabela app_backups não existe. Execute a migration primeiro.', 'error');
      _showDbBackupMigrationHint();
      return;
    }

    const fid = famId();
    const q   = t => famQ(sb.from(t).select('*'));
    const [a, c, p, t2, b, s, grp] = await Promise.all([
      q('accounts'), q('categories'), q('payees'), q('transactions'),
      q('budgets'), famQ(sb.from('scheduled_transactions').select('*')),
      famQ(sb.from('account_groups').select('*')),
    ]);

    const payload = {
      account_groups:         grp.data || [],
      accounts:               a.data   || [],
      categories:             c.data   || [],
      payees:                 p.data   || [],
      transactions:           t2.data  || [],
      budgets:                b.data   || [],
      scheduled_transactions: s.data   || [],
    };
    const counts = {
      accounts:     a.data?.length  || 0,
      categories:   c.data?.length  || 0,
      transactions: t2.data?.length || 0,
      budgets:      b.data?.length  || 0,
      scheduled:    s.data?.length  || 0,
    };

    const row = {
      family_id:   fid,
      label:       label || `Backup manual — ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      created_by:  currentUser?.name || currentUser?.email || 'sistema',
      payload,
      counts,
      size_kb:     Math.round(JSON.stringify(payload).length / 1024),
      backup_type: label ? 'manual' : 'manual',
    };

    const { error } = await sb.from('app_backups').insert(row);
    if (error) throw error;

    toast('✅ Backup criado no banco!', 'success');
    await loadDbBackups();
  } catch (e) {
    toast('Erro ao criar backup: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📸 Criar Snapshot'; }
  }
}

// ── Listar backups do banco ────────────────────────────────────────────────
async function loadDbBackups() {
  const container = document.getElementById('dbBackupList');
  if (!container) return;

  container.innerHTML = '<div style="color:var(--muted);font-size:.83rem;padding:12px 0">⏳ Carregando...</div>';

  try {
    const hasTable = await _checkBackupTable();
    if (!hasTable) {
      _showDbBackupMigrationHint();
      container.innerHTML = '';
      return;
    }

    const { data, error } = await famQ(
      sb.from('app_backups')
        .select('id, label, created_at, created_by, counts, size_kb, backup_type')
        .order('created_at', { ascending: false })
        .limit(20)
    );
    if (error) throw error;

    _dbBackupList = data || [];
    document.getElementById('dbBackupMigrationHint')?.style && (document.getElementById('dbBackupMigrationHint').style.display = 'none');

    if (!_dbBackupList.length) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.83rem">
        <div style="font-size:1.8rem;margin-bottom:8px;opacity:.4">🗄️</div>
        Nenhum backup no banco ainda.<br>Clique em "Criar Snapshot" para começar.
      </div>`;
      return;
    }

    container.innerHTML = _dbBackupList.map(b => {
      const dt  = new Date(b.created_at);
      const ago = _timeAgo(dt);
      const typeIcon = b.backup_type === 'auto' ? '🤖' : '👤';
      return `<div class="db-backup-row">
        <div class="db-backup-row-info">
          <div class="db-backup-row-label">${typeIcon} ${esc(b.label || 'Backup')}</div>
          <div class="db-backup-row-meta">
            ${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            · <span title="${ago}">${ago}</span>
            · por ${esc(b.created_by || '—')}
            · ${b.size_kb || '?'} KB
          </div>
          <div class="db-backup-row-counts">
            ${b.counts?.transactions || 0} txs
            · ${b.counts?.accounts || 0} contas
            · ${b.counts?.categories || 0} categorias
          </div>
        </div>
        <div class="db-backup-row-actions">
          <button class="btn btn-ghost btn-sm" onclick="downloadDbBackup('${b.id}')" title="Baixar JSON">⬇️</button>
          <button class="btn btn-ghost btn-sm" onclick="restoreDbBackup('${b.id}')" title="Restaurar este snapshot">↩️ Restaurar</button>
          <button class="btn-icon" onclick="deleteDbBackup('${b.id}')" title="Excluir backup" style="color:var(--red)">🗑️</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div style="color:var(--red);font-size:.83rem;padding:12px">${esc(e.message)}</div>`;
  }
}

// ── Download de backup específico ─────────────────────────────────────────
async function downloadDbBackup(id) {
  try {
    const { data, error } = await sb.from('app_backups').select('*').eq('id', id).single();
    if (error) throw error;
    const exportObj = {
      version:     '3.0',
      app:         'JF Family FinTrack',
      family_id:   famId(),
      exported_at: data.created_at,
      source:      'db_backup',
      label:       data.label,
      counts:      data.counts,
      data:        data.payload,
    };
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `FinTrack_Backup_${data.created_at.slice(0, 10)}_${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup baixado!', 'success');
  } catch (e) {
    toast('Erro ao baixar backup: ' + e.message, 'error');
  }
}

// ── Restaurar snapshot do banco ────────────────────────────────────────────
async function restoreDbBackup(id) {
  const backup = _dbBackupList.find(b => b.id === id);
  const label  = backup?.label || 'este backup';
  if (!confirm(`⚠️ Restaurar "${label}"?\n\nOs dados atuais serão sobrescritos (upsert). Esta ação não pode ser desfeita.\n\nDeseja continuar?`)) return;

  const btn = document.querySelector(`[onclick="restoreDbBackup('${id}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  try {
    const { data, error } = await sb.from('app_backups').select('payload').eq('id', id).single();
    if (error) throw error;

    const d = data.payload;
    for (const [table, rows] of [
      ['account_groups',        d.account_groups        || []],
      ['accounts',              d.accounts              || []],
      ['categories',            d.categories            || []],
      ['payees',                d.payees                || []],
      ['transactions',          d.transactions          || []],
      ['budgets',               d.budgets               || []],
      ['scheduled_transactions', d.scheduled_transactions || []],
    ]) {
      if (!rows.length) continue;
      for (let i = 0; i < rows.length; i += 200) {
        const { error: uErr } = await sb.from(table).upsert(rows.slice(i, i + 200), { ignoreDuplicates: false });
        if (uErr) throw new Error(`${table}: ${uErr.message}`);
      }
    }

    await Promise.all([loadAccounts(), loadCategories(), loadPayees()]);
    populateSelects();
    toast('✅ Snapshot restaurado com sucesso!', 'success');
  } catch (e) {
    toast('Erro ao restaurar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↩️ Restaurar'; }
  }
}

// ── Excluir backup ────────────────────────────────────────────────────────
async function deleteDbBackup(id) {
  if (!confirm('Excluir este backup?')) return;
  const { error } = await sb.from('app_backups').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Backup excluído', 'success');
  await loadDbBackups();
}

// ── Label personalizado ────────────────────────────────────────────────────
function openDbBackupCreate() {
  const label = prompt('Nome/etiqueta para este backup (opcional):', `Backup — ${new Date().toLocaleDateString('pt-BR')}`);
  if (label === null) return; // cancelou
  createDbBackup(label || '');
}

// ── Hint de migration ─────────────────────────────────────────────────────
function _showDbBackupMigrationHint() {
  const hint = document.getElementById('dbBackupMigrationHint');
  if (hint) hint.style.display = '';
}

// ── Formatação de tempo relativo ──────────────────────────────────────────
function _timeAgo(dt) {
  const diff = (Date.now() - dt.getTime()) / 1000;
  if (diff < 60)     return 'agora mesmo';
  if (diff < 3600)   return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} dias atrás`;
  return dt.toLocaleDateString('pt-BR');
}

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 3 — CLEAR DATABASE
// ══════════════════════════════════════════════════════════════════════════

function confirmClearDatabase() {
  if (!confirm(
    '⚠️ ATENÇÃO: Esta ação irá apagar TODOS os dados!\n\n' +
    '• Todas as transações\n• Todas as contas\n• Todas as categorias\n' +
    '• Todos os beneficiários\n• Todos os orçamentos\n\n' +
    'Esta ação é IRREVERSÍVEL. Deseja continuar?'
  )) return;
  if (!confirm('⛔ SEGUNDA CONFIRMAÇÃO\n\nTODOS os dados serão permanentemente apagados.\nTem ABSOLUTA certeza?')) return;
  showClearDatabasePinConfirm();
}

function showClearDatabasePinConfirm() {
  const pin = prompt('🔐 Digite seu Masterpin para confirmar a limpeza:');
  if (pin === null) return;
  if (pin !== getMasterPin()) { alert('❌ PIN incorreto. Operação cancelada.'); return; }
  executeClearDatabase();
}

async function executeClearDatabase() {
  const btn = document.querySelector('[onclick="confirmClearDatabase()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Limpando...'; }
  try {
    if (!sb || typeof sb.from !== 'function') throw new Error('Supabase não conectado.');
    const tables = [
      'scheduled_occurrences', 'scheduled_transactions', 'transactions',
      'budgets', 'payees', 'categories', 'accounts',
    ];
    const cleared = [], failed = [], skipped = [];
    for (const t of tables) {
      try {
        if (t === 'categories') {
          try { await sb.from('categories').update({ parent_id: null }).not('id', 'is', null); } catch {}
        }
        const { error } = await famQ(sb.from(t).delete()).not('id', 'is', null);
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('does not exist')) { skipped.push(t); continue; }
          failed.push(t + ': ' + error.message); continue;
        }
        cleared.push(t);
      } catch (e) { failed.push(t + ': ' + e.message); }
    }
    state.accounts = []; state.categories = []; state.payees = [];
    state.transactions = []; state.budgets = [];
    if (state.scheduled) state.scheduled = [];
    state.txTotal = 0; state.txPage = 0;
    populateSelects();
    if (failed.length > 0) {
      alert('⚠️ Limpeza parcial:\n\n• ' + failed.join('\n• '));
      toast('Limpeza parcial — veja detalhes', 'error');
    } else {
      toast('✓ Base de dados limpa! (' + cleared.length + ' tabelas)', 'success');
    }
    document.getElementById('loginScreen').style.display = 'flex';
  } catch (e) {
    toast('Erro ao limpar: ' + (e?.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚠️ Limpar Tudo'; }
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  SEÇÃO 4 — PIN / LOCK SCREEN (preservado do original)
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_MASTER_PIN = '191291';
function getMasterPin() {
  const v = localStorage.getItem('masterPin') || localStorage.getItem('masterpin');
  return (v && String(v).trim()) ? String(v).trim() : DEFAULT_MASTER_PIN;
}

function ensureSupabaseClient() {
  if (sb) return sb;
  const url = (window.SUPABASE_URL || '').trim() || localStorage.getItem('sb_url');
  const key = (window.SUPABASE_ANON_KEY || '').trim() || localStorage.getItem('sb_key');
  if (!url || !key) return null;
  try {
    if (localStorage.getItem('sb_url') !== url) localStorage.setItem('sb_url', url);
    if (localStorage.getItem('sb_key') !== key) localStorage.setItem('sb_key', key);
  } catch {}
  try { sb = supabase.createClient(url, key); return sb; } catch { return null; }
}

function initPinScreen() {
  try { const ps = document.getElementById('pinScreen'); if (ps) ps.style.display = 'none'; } catch {}
  _pinUnlocked = true;
  clearAutoLockTimer();
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) { ensureSupabaseClient(); bootApp(); }
  else { const s = document.getElementById('setupScreen'); if (s) s.style.display = 'flex'; }
}
function onPinKeyboard(e) {
  if (_pinUnlocked) { document.removeEventListener('keydown', onPinKeyboard); return; }
  if (e.key >= '0' && e.key <= '9') pinKey(parseInt(e.key));
  if (e.key === 'Backspace') pinDel();
}
function pinKey(digit) {
  if (_pinUnlocked) return;
  if (_pinBuffer.length >= 6) return;
  _pinBuffer += digit;
  renderPinDots();
  if (navigator.vibrate) navigator.vibrate(20);
  if (_pinBuffer.length === 6) setTimeout(checkPin, 120);
}
function pinDel() { if (_pinBuffer.length > 0) { _pinBuffer = _pinBuffer.slice(0, -1); renderPinDots(); } }
function renderPinDots() {
  for (let i = 0; i < 6; i++) {
    const dot = document.getElementById('pd' + i);
    if (dot) { dot.classList.toggle('filled', i < _pinBuffer.length); dot.classList.remove('error'); }
  }
}
function checkPin() {
  if (_pinBuffer === getMasterPin()) {
    for (let i = 0; i < 6; i++) { const d = document.getElementById('pd' + i); if (d) { d.classList.add('filled'); d.style.background = '#7ddc9e'; } }
    setTimeout(unlockApp, 380);
  } else {
    for (let i = 0; i < 6; i++) { const d = document.getElementById('pd' + i); if (d) { d.classList.remove('filled'); d.classList.add('error'); } }
    const card = document.querySelector('.pin-card');
    if (card) { card.classList.add('pin-shake'); setTimeout(() => card.classList.remove('pin-shake'), 400); }
    const msg = document.getElementById('pinErrorMsg');
    if (msg) { msg.textContent = 'PIN incorreto.'; setTimeout(() => msg.textContent = '', 2500); }
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    _pinBuffer = '';
    setTimeout(renderPinDots, 300);
  }
}
async function unlockApp() {
  _pinUnlocked = true;
  document.removeEventListener('keydown', onPinKeyboard);
  const ps = document.getElementById('pinScreen');
  ps.style.opacity = '0'; ps.style.transition = 'opacity .35s ease';
  setTimeout(() => { ps.style.display = 'none'; ps.style.opacity = ''; }, 350);
  const client = ensureSupabaseClient();
  if (client) await bootApp();
  else setTimeout(() => { document.getElementById('setupScreen').style.display = 'flex'; }, 400);
  resetAutoLockTimer();
  document.addEventListener('click', resetAutoLockTimer, { passive: true });
  document.addEventListener('touchstart', resetAutoLockTimer, { passive: true });
  document.addEventListener('keydown', resetAutoLockTimer, { passive: true });
}

let _pinModalStep = 1, _pinModalNew = '';
function openChangePinModal() {
  _pinModalStep = 1; _pinModalNew = '';
  for (let s = 1; s <= 3; s++) for (let i = 0; i < 6; i++) { const el = document.getElementById(`cp${s}_${i}`); if (el) el.value = ''; }
  ['pinStep1Error', 'pinStep3Error'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  for (let s = 1; s <= 3; s++) { const el = document.getElementById('pinStep' + s); if (el) el.classList.toggle('active', s === 1); }
  document.getElementById('pinStepBtn').textContent = 'Próximo';
  openModal('changePinModal');
  setTimeout(() => document.getElementById('cp1_0')?.focus(), 200);
}
function pinModalInput(step, idx) {
  const el = document.getElementById(`cp${step}_${idx}`);
  if (!el) return;
  el.value = el.value.replace(/\D/g, '').slice(-1);
  if (el.value && idx < 5) { const next = document.getElementById(`cp${step}_${idx + 1}`); if (next) next.focus(); }
  if (idx === 5 && el.value) {
    const full = Array.from({ length: 6 }, (_, i) => document.getElementById(`cp${step}_${i}`)?.value || '').join('');
    if (full.length === 6) setTimeout(() => advancePinStep(), 150);
  }
}
function advancePinStep() {
  const getV = s => Array.from({ length: 6 }, (_, i) => document.getElementById(`cp${s}_${i}`)?.value || '').join('');
  if (_pinModalStep === 1) {
    if (getV(1).length < 6) { toast('Digite os 6 dígitos', 'error'); return; }
    if (getV(1) !== getMasterPin()) { document.getElementById('pinStep1Error').textContent = 'PIN atual incorreto.'; for (let i = 0; i < 6; i++) { const el = document.getElementById(`cp1_${i}`); if (el) el.value = ''; } document.getElementById('cp1_0')?.focus(); return; }
    _pinModalStep = 2; document.getElementById('pinStep1').classList.remove('active'); document.getElementById('pinStep2').classList.add('active'); document.getElementById('cp2_0')?.focus();
  } else if (_pinModalStep === 2) {
    if (getV(2).length < 6) { toast('Digite os 6 dígitos', 'error'); return; }
    _pinModalNew = getV(2); _pinModalStep = 3; document.getElementById('pinStep2').classList.remove('active'); document.getElementById('pinStep3').classList.add('active'); document.getElementById('pinStepBtn').textContent = 'Salvar PIN'; document.getElementById('cp3_0')?.focus();
  } else if (_pinModalStep === 3) {
    if (getV(3).length < 6) { toast('Digite os 6 dígitos', 'error'); return; }
    if (getV(3) !== _pinModalNew) { document.getElementById('pinStep3Error').textContent = 'PINs não coincidem.'; for (let i = 0; i < 6; i++) { const el = document.getElementById(`cp3_${i}`); if (el) el.value = ''; } document.getElementById('cp3_0')?.focus(); return; }
    localStorage.setItem('masterPin', _pinModalNew); localStorage.removeItem('masterpin');
    saveAppSetting('masterPin', _pinModalNew);
    toast('Masterpin alterado! 🔐', 'success'); closeModal('changePinModal');
  }
}
