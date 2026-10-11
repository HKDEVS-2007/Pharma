const user = requireAuth();
if (user) {
  loadTopBar();
}

const dateFilter  = document.getElementById('dateFilter');
const noteContent = document.getElementById('noteContent');
const notesList   = document.getElementById('notesList');
const postBtn     = document.getElementById('postBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

let editingNoteId = null;

// ── Local date (no UTC offset bug) ──────────────────────────────
function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
dateFilter.value = todayLocal();

// ── Toast notification (replaces broken showToast from common.js) ─
function toast(msg, type = 'success') {
  let container = document.getElementById('dn-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'dn-toast-container';
    container.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:99999;
      display:flex; flex-direction:column; gap:10px; pointer-events:none;
    `;
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1';
  t.style.cssText = `
    background:${bg}; color:#fff; padding:14px 20px; border-radius:12px;
    font-weight:600; font-size:14px; box-shadow:0 8px 24px rgba(0,0,0,0.3);
    transform:translateX(120px); opacity:0;
    transition:transform 0.3s ease, opacity 0.3s ease;
    pointer-events:none; max-width:300px;
  `;
  t.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ') + msg;
  container.appendChild(t);
  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      t.style.transform = 'translateX(0)';
      t.style.opacity = '1';
    });
  });
  // Animate out after 2.8s
  setTimeout(() => {
    t.style.transform = 'translateX(120px)';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 350);
  }, 2800);
}

// ── Custom confirm dialog (replaces broken window.confirm) ────────
function confirmDialog(msg) {
  return new Promise(resolve => {
    // Remove any existing
    const old = document.getElementById('dn-confirm-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dn-confirm-overlay';
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.6);
      display:flex; align-items:center; justify-content:center;
      z-index:99998; backdrop-filter:blur(4px);
      animation: fadeIn 0.15s ease;
    `;
    overlay.innerHTML = `
      <div style="
        background:var(--bg-sidebar, #0f172a);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:16px; padding:32px 36px;
        max-width:380px; width:90%;
        box-shadow:0 20px 60px rgba(0,0,0,0.5);
        text-align:center;
        animation: slideUp 0.2s ease;
      ">
        <div style="font-size:32px; margin-bottom:12px;">🗑️</div>
        <div style="font-size:16px; font-weight:600; color:var(--text-main,#f8fafc); margin-bottom:8px;">Confirm Delete</div>
        <div style="font-size:14px; color:var(--text-muted,#94a3b8); margin-bottom:28px; line-height:1.5;">${msg}</div>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button id="dn-confirm-no" style="
            padding:10px 28px; border-radius:10px; border:1px solid rgba(255,255,255,0.15);
            background:transparent; color:var(--text-muted,#94a3b8); font-weight:600;
            cursor:pointer; font-size:14px; transition:all 0.2s;
          ">Cancel</button>
          <button id="dn-confirm-yes" style="
            padding:10px 28px; border-radius:10px; border:none;
            background:#ef4444; color:#fff; font-weight:700;
            cursor:pointer; font-size:14px; transition:all 0.2s;
          ">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('dn-confirm-yes').onclick = () => { overlay.remove(); resolve(true);  };
    document.getElementById('dn-confirm-no').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ── Load notes for selected date ─────────────────────────────────
async function loadNotes() {
  notesList.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted,#94a3b8);">Loading...</div>';
  const dateStr = dateFilter.value;
  try {
    const notes = await window.api.getDailyNotes(dateStr);
    renderNotes(notes);
  } catch (err) {
    notesList.innerHTML = `<div style="color:#ef4444;padding:20px;">Error: ${err.message}</div>`;
  }
}

// ── Render note cards ─────────────────────────────────────────────
function renderNotes(notes) {
  notesList.innerHTML = '';
  document.getElementById('notesCount').textContent =
    notes ? `${notes.length} Note${notes.length !== 1 ? 's' : ''}` : '0 Notes';

  if (!notes || notes.length === 0) {
    notesList.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted,#94a3b8);">📭 No notes logged for this date.</div>';
    return;
  }

  // Store for edit lookup
  notesList._notes = notes;

  notes.forEach(note => {
    const canEdit = user.usertype === 'admin' || user.username === note.author;
    const initial = note.author ? note.author.charAt(0).toUpperCase() : '?';

    const card = document.createElement('div');
    card.className = 'note-bubble';
    card.dataset.id = note.id;

  card.innerHTML = `
      <div class="note-avatar">${escapeHTML(initial)}</div>
      <div class="note-body">
        <div class="note-meta">
          <div class="note-author-name">${escapeHTML(note.author)}</div>
          <div class="note-timestamp">🕒 ${note.time}</div>
        </div>
        <div class="note-text">${escapeHTML(note.note)}</div>
        ${canEdit ? `
          <div class="note-actions">
            <button class="note-action-btn edit-btn" data-action="edit" data-id="${note.id}" title="Edit Note">✎ Edit</button>
            <button class="note-action-btn delete-btn" data-action="delete" data-id="${note.id}" title="Delete Note">✕ Delete</button>
          </div>
        ` : ''}
      </div>
    `;
    notesList.appendChild(card);
  });
}

// ── Event delegation — all button clicks in feed ──────────────────
notesList.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id     = parseInt(btn.dataset.id, 10);
  const action = btn.dataset.action;
  if (action === 'delete') deleteNote(id);
  else if (action === 'edit') {
    const note = (notesList._notes || []).find(n => n.id === id);
    if (note) startEdit(id, note.note);
  }
});

// ── Save (new) or Update (edit) ───────────────────────────────────
async function saveNote() {
  const content = noteContent.value.trim();
  if (!content) {
    toast('Please write something first.', 'error');
    return;
  }

  postBtn.disabled = true;
  postBtn.textContent = editingNoteId ? 'Updating...' : 'Posting...';

  try {
    if (editingNoteId) {
      await window.api.editDailyNote({ id: editingNoteId, note: content });
      toast('Note updated!', 'success');
      clearEditMode();
    } else {
      const now     = new Date();
      const dateStr = todayLocal();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      await window.api.addDailyNote({ date: dateStr, time: timeStr, note: content, author: user.username });
      toast('Note saved!', 'success');
      // Sync the date filter so the note appears immediately
      dateFilter.value = dateStr;
    }
    noteContent.value = '';
    await loadNotes();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    postBtn.disabled = false;
    postBtn.textContent = editingNoteId ? 'Update Note' : 'Post Note';
  }
}

// ── Enter edit mode ───────────────────────────────────────────────
function startEdit(id, content) {
  editingNoteId = id;
  noteContent.value = content;
  postBtn.textContent = 'Update Note';
  cancelEditBtn.style.display = 'block';
  noteContent.focus();
  noteContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Clear edit mode ───────────────────────────────────────────────
function clearEditMode() {
  editingNoteId = null;
  noteContent.value = '';
  postBtn.textContent = 'Post Note';
  cancelEditBtn.style.display = 'none';
}
cancelEditBtn.addEventListener('click', clearEditMode);

// ── Delete note ───────────────────────────────────────────────────
async function deleteNote(id) {
  const confirmed = await confirmDialog('This note will be permanently deleted. Are you sure?');
  if (!confirmed) return;
  try {
    await window.api.deleteDailyNote(id);
    toast('Note deleted.', 'success');
    if (editingNoteId === id) clearEditMode();
    await loadNotes();
  } catch (err) {
    toast('Failed to delete: ' + err.message, 'error');
  }
}

// ── HTML escape ───────────────────────────────────────────────────
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, tag =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ── Initial load ──────────────────────────────────────────────────
loadNotes();
