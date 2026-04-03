/**
 * TaskFlow — script.js
 * Handles all frontend interactions and communicates
 * with the Flask backend via the Fetch API.
 */

'use strict';

// ─────────────────────────────────────────
// Constants & State
// ─────────────────────────────────────────

const API = '/tasks';

let state = {
  tasks:       [],     // all tasks fetched from backend
  filter:      'all',  // 'all' | 'pending' | 'completed'
  search:      '',     // search term
  deleteTarget: null,  // task id awaiting delete confirm
};

// ─────────────────────────────────────────
// DOM Refs
// ─────────────────────────────────────────

const taskList     = document.getElementById('task-list');
const emptyState   = document.getElementById('empty-state');
const modalOverlay = document.getElementById('modal-overlay');
const confirmOverlay = document.getElementById('confirm-overlay');
const taskForm     = document.getElementById('task-form');
const modalTitle   = document.getElementById('modal-title');
const btnSubmit    = document.getElementById('btn-submit');
const pageTitle    = document.getElementById('page-title');
const searchInput  = document.getElementById('search-input');
const toast        = document.getElementById('toast');

// Form fields
const fId       = document.getElementById('task-id');
const fTitle    = document.getElementById('task-title');
const fDesc     = document.getElementById('task-desc');
const fPriority = document.getElementById('task-priority');
const fDue      = document.getElementById('task-due');
const errTitle  = document.getElementById('error-title');

// ─────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────

/**
 * Wrapper around fetch that handles JSON and errors.
 */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─────────────────────────────────────────
// Data layer
// ─────────────────────────────────────────

/** Fetch all tasks (with optional filters) from backend. */
async function loadTasks() {
  const params = new URLSearchParams();
  if (state.filter !== 'all') params.set('status', state.filter);
  if (state.search)           params.set('search', state.search);

  const url = `${API}?${params.toString()}`;
  state.tasks = await apiFetch(url);
}

/** Create a new task. */
async function createTask(payload) {
  return apiFetch(API, { method: 'POST', body: JSON.stringify(payload) });
}

/** Update an existing task by id. */
async function updateTask(id, payload) {
  return apiFetch(`${API}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

/** Toggle completion status of a task. */
async function toggleTask(id) {
  return apiFetch(`${API}/${id}/toggle`, { method: 'PATCH' });
}

/** Delete a task by id. */
async function deleteTask(id) {
  return apiFetch(`${API}/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────

/** Render task cards from state.tasks. */
function renderTasks() {
  taskList.innerHTML = '';

  if (state.tasks.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  state.tasks.forEach(task => {
    fragment.appendChild(buildTaskCard(task));
  });
  taskList.appendChild(fragment);

  updateCounts();
}

/** Build a single task card DOM element. */
function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card${task.status ? ' completed' : ''}`;
  card.dataset.id       = task.id;
  card.dataset.priority = task.priority;

  // Due date display
  let dueMeta = '';
  if (task.due_date) {
    const overdue = !task.status && new Date(task.due_date) < new Date();
    dueMeta = `<span class="task-date${overdue ? ' overdue' : ''}">${overdue ? '⚠ ' : '📅 '}${formatDate(task.due_date)}</span>`;
  }

  card.innerHTML = `
    <button class="task-check${task.status ? ' checked' : ''}" title="${task.status ? 'Mark pending' : 'Mark complete'}" data-action="toggle">
      ${task.status ? '✓' : ''}
    </button>
    <div class="task-body">
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="badge badge-${task.priority}">${task.priority}</span>
        ${dueMeta}
      </div>
    </div>
    <div class="task-actions">
      <button class="icon-btn edit" title="Edit" data-action="edit">✎</button>
      <button class="icon-btn delete" title="Delete" data-action="delete">✕</button>
    </div>
  `;
  return card;
}

/** Update sidebar badge counts using the FULL task set. */
async function updateCounts() {
  // We need counts for all tasks regardless of current filter
  try {
    const all       = await apiFetch(API);
    const pending   = all.filter(t => !t.status).length;
    const completed = all.filter(t =>  t.status).length;
    document.getElementById('count-all').textContent       = all.length;
    document.getElementById('count-pending').textContent   = pending;
    document.getElementById('count-completed').textContent = completed;
  } catch (_) { /* silent */ }
}

// ─────────────────────────────────────────
// Modal helpers
// ─────────────────────────────────────────

/** Open modal for creating a new task. */
function openCreateModal() {
  fId.value       = '';
  fTitle.value    = '';
  fDesc.value     = '';
  fPriority.value = 'medium';
  fDue.value      = '';
  errTitle.textContent = '';
  modalTitle.textContent = 'New Task';
  btnSubmit.textContent  = 'Create Task';
  openModal(modalOverlay);
  fTitle.focus();
}

/** Open modal pre-filled for editing a task. */
function openEditModal(task) {
  fId.value       = task.id;
  fTitle.value    = task.title;
  fDesc.value     = task.description || '';
  fPriority.value = task.priority;
  fDue.value      = task.due_date || '';
  errTitle.textContent = '';
  modalTitle.textContent = 'Edit Task';
  btnSubmit.textContent  = 'Save Changes';
  openModal(modalOverlay);
  fTitle.focus();
}

function openModal(overlay)  { overlay.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(overlay) { overlay.classList.add('hidden');    document.body.style.overflow = ''; }

// ─────────────────────────────────────────
// Form submit
// ─────────────────────────────────────────

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errTitle.textContent = '';

  const title = fTitle.value.trim();
  if (!title) {
    errTitle.textContent = 'Title is required.';
    fTitle.focus();
    return;
  }

  const payload = {
    title,
    description: fDesc.value.trim(),
    priority:    fPriority.value,
    due_date:    fDue.value || null,
  };

  const taskId = fId.value;

  try {
    if (taskId) {
      await updateTask(taskId, payload);
      showToast('Task updated ✓', 'success');
    } else {
      await createTask(payload);
      showToast('Task created ✓', 'success');
    }
    closeModal(modalOverlay);
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ─────────────────────────────────────────
// Event delegation — task list
// ─────────────────────────────────────────

taskList.addEventListener('click', async (e) => {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;

  const card   = btn.closest('.task-card');
  const taskId = card?.dataset.id;
  if (!taskId) return;

  const action = btn.dataset.action;

  if (action === 'toggle') {
    try {
      await toggleTask(taskId);
      await refresh();
    } catch (err) { showToast(err.message, 'error'); }
  }

  if (action === 'edit') {
    const task = state.tasks.find(t => String(t.id) === taskId);
    if (task) openEditModal(task);
  }

  if (action === 'delete') {
    state.deleteTarget = taskId;
    openModal(confirmOverlay);
  }
});

// ─────────────────────────────────────────
// Delete confirmation
// ─────────────────────────────────────────

document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
  if (!state.deleteTarget) return;
  try {
    await deleteTask(state.deleteTarget);
    showToast('Task deleted', 'success');
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    closeModal(confirmOverlay);
    state.deleteTarget = null;
  }
});

document.getElementById('btn-cancel-delete').addEventListener('click', () => {
  closeModal(confirmOverlay);
  state.deleteTarget = null;
});

// ─────────────────────────────────────────
// Filter buttons
// ─────────────────────────────────────────

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;

    const labels = { all: 'All Tasks', pending: 'Pending', completed: 'Completed' };
    pageTitle.textContent = labels[state.filter] || 'All Tasks';

    await refresh();
  });
});

// ─────────────────────────────────────────
// Search
// ─────────────────────────────────────────

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.search = searchInput.value.trim();
    await refresh();
  }, 280);
});

// ─────────────────────────────────────────
// Modal open / close buttons
// ─────────────────────────────────────────

document.getElementById('btn-open-modal').addEventListener('click', openCreateModal);
document.getElementById('btn-close-modal').addEventListener('click', () => closeModal(modalOverlay));
document.getElementById('btn-cancel').addEventListener('click',      () => closeModal(modalOverlay));

// Close on backdrop click
[modalOverlay, confirmOverlay].forEach(ov => {
  ov.addEventListener('click', (e) => {
    if (e.target === ov) {
      if (ov === confirmOverlay) state.deleteTarget = null;
      closeModal(ov);
    }
  });
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.classList.contains('hidden'))  closeModal(modalOverlay);
    if (!confirmOverlay.classList.contains('hidden')) { state.deleteTarget = null; closeModal(confirmOverlay); }
  }
});

// ─────────────────────────────────────────
// Toast notification
// ─────────────────────────────────────────

let toastTimer = null;
function showToast(message, type = '') {
  clearTimeout(toastTimer);
  toast.textContent  = message;
  toast.className    = `toast show${type ? ' ' + type : ''}`;
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────

/** Reload tasks and re-render. */
async function refresh() {
  try {
    await loadTasks();
    renderTasks();
  } catch (err) {
    showToast('Failed to load tasks', 'error');
    console.error(err);
  }
}

/** Format ISO date string to readable format. */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00'); // avoid timezone shift
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Escape HTML to prevent XSS. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Display today's date in the sidebar. */
function setTodayDate() {
  const el = document.getElementById('today-date');
  if (el) {
    el.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
}

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────

(async function init() {
  setTodayDate();
  await refresh();
})();
