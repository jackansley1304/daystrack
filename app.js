(() => {
  'use strict';

  // --- Helpers ---
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function daysBetween(dateStr) {
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function computeStreak(sortedNewestFirst) {
    if (!sortedNewestFirst.length) return 0;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // streak counts consecutive days ending at today or yesterday
    if (sortedNewestFirst[0] !== todayStr) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      if (sortedNewestFirst[0] !== yesterdayStr) return 0;
    }
    let streak = 1;
    for (let i = 1; i < sortedNewestFirst.length; i++) {
      const prev = new Date(sortedNewestFirst[i - 1] + 'T00:00:00');
      const curr = new Date(sortedNewestFirst[i] + 'T00:00:00');
      const diff = Math.round((prev - curr) / 86400000);
      if (diff === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // --- Theme ---
  async function initTheme() {
    const saved = await DB.getSetting('theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }
    updateThemeToggle();
  }

  function updateThemeToggle() {
    const toggle = $('#theme-toggle');
    if (toggle) {
      toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
    }
  }

  async function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      await DB.setSetting('theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      await DB.setSetting('theme', 'dark');
    }
    updateThemeToggle();
  }

  // --- Toast ---
  let toastTimeout;
  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // --- Confirm dialog ---
  function showConfirm(title, message) {
    return new Promise(resolve => {
      const overlay = $('#confirm-overlay');
      $('#confirm-title').textContent = title;
      $('#confirm-message').textContent = message;
      overlay.classList.add('active');

      const onConfirm = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };

      function cleanup() {
        overlay.classList.remove('active');
        $('#confirm-yes').removeEventListener('click', onConfirm);
        $('#confirm-no').removeEventListener('click', onCancel);
      }

      $('#confirm-yes').addEventListener('click', onConfirm);
      $('#confirm-no').addEventListener('click', onCancel);
    });
  }

  // --- Render events ---
  function getDisplayDate(event) {
    const logs = event.logs || [];
    return logs.length ? logs.reduce((a, b) => a > b ? a : b) : event.date;
  }

  function sortEvents(events) {
    return events.sort((a, b) => {
      const da = daysBetween(getDisplayDate(a));
      const db = daysBetween(getDisplayDate(b));
      const aUp = da >= 0;
      const bUp = db >= 0;
      if (aUp && !bUp) return -1;
      if (!aUp && bUp) return 1;
      if (aUp && bUp) return da - db;
      return da - db;
    });
  }

  function renderEvents(events) {
    const container = $('#events-container');
    if (!events.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128197;</div>
          <h2>No events yet</h2>
          <p>Tap the + button to start tracking days until or since your important moments.</p>
        </div>`;
      return;
    }

    const sorted = sortEvents(events);
    let html = '';
    let section = null;

    for (const event of sorted) {
      const logs = event.logs || [];
      const latestLog = logs.length ? logs.reduce((a, b) => a > b ? a : b) : null;
      const displayDate = latestLog || event.date;
      const days = daysBetween(displayDate);
      let status, countLabel, sectionLabel;

      if (days > 0) {
        status = 'upcoming';
        countLabel = days === 1 ? 'day left' : 'days left';
        sectionLabel = 'Upcoming';
      } else if (days === 0) {
        status = 'today';
        countLabel = latestLog ? 'logged today' : 'today!';
        sectionLabel = latestLog ? 'Recent' : 'Today';
      } else {
        status = 'past';
        countLabel = latestLog
          ? (Math.abs(days) === 1 ? 'day since last log' : 'days since last log')
          : (Math.abs(days) === 1 ? 'day ago' : 'days ago');
        sectionLabel = 'Past';
      }

      if (sectionLabel !== section) {
        section = sectionLabel;
        html += `<div class="section-label">${section}</div>`;
      }

      const logCount = (event.logs || []).length;

      html += `
        <div class="event-card ${status}" data-id="${event.id}">
          <div class="event-info">
            <div class="event-title">${escapeHtml(event.title)}</div>
            ${event.description ? `<div class="event-desc">${escapeHtml(event.description)}</div>` : ''}
            <div class="event-date">${formatDate(event.date)}${logCount ? ` &middot; ${logCount} log${logCount !== 1 ? 's' : ''}` : ''}</div>
          </div>
          <div class="event-count">
            <div class="number">${days === 0 ? '&#10024;' : Math.abs(days)}</div>
            <div class="label">${countLabel}</div>
          </div>
          <button class="log-btn" data-log-id="${event.id}" aria-label="Log today">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>`;
    }

    container.innerHTML = `<div class="events-list">${html}</div>`;

    // Stagger animation
    $$('.event-card', container).forEach((card, i) => {
      card.style.animationDelay = `${i * 0.04}s`;
    });
  }

  async function loadEvents() {
    const events = await DB.getAllEvents();
    renderEvents(events);
  }

  // --- Event Detail ---
  let currentEventId = null;

  async function showDetail(id) {
    const event = await DB.getEvent(id);
    if (!event) return;
    currentEventId = id;

    const displayDate = getDisplayDate(event);
    const hasLogs = (event.logs || []).length > 0;
    const days = daysBetween(displayDate);
    let status, countText;
    if (days > 0) {
      status = 'upcoming';
      countText = days === 1 ? 'day left' : 'days left';
    } else if (days === 0) {
      status = 'today';
      countText = hasLogs ? 'Logged today' : "It's today!";
    } else {
      status = 'past';
      countText = hasLogs
        ? (Math.abs(days) === 1 ? 'day since last log' : 'days since last log')
        : (Math.abs(days) === 1 ? 'day ago' : 'days ago');
    }

    $('#detail-count').className = `detail-count ${status}`;
    $('#detail-number').innerHTML = days === 0 ? '&#10024;' : Math.abs(days);
    $('#detail-label').textContent = countText;
    $('#detail-title').textContent = event.title;
    $('#detail-date').textContent = formatDate(event.date);

    const descEl = $('#detail-description');
    if (event.description) {
      descEl.textContent = event.description;
      descEl.style.display = '';
    } else {
      descEl.style.display = 'none';
    }

    // Render stats & logs
    const logsEl = $('#detail-logs');
    const logs = event.logs || [];
    // sorted newest first (already stored that way)
    const sortedLogs = [...logs].sort().reverse();
    // sorted oldest first for gap calculation
    const chronological = [...logs].sort();

    let logsHtml = '';

    // Stats section
    if (sortedLogs.length >= 2) {
      const gaps = [];
      for (let i = 1; i < chronological.length; i++) {
        gaps.push(Math.abs(daysBetween(chronological[i]) - daysBetween(chronological[i - 1])));
      }
      const totalDays = Math.abs(daysBetween(chronological[chronological.length - 1]) - daysBetween(chronological[0]));
      const avgGap = (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1);
      const minGap = Math.min(...gaps);
      const maxGap = Math.max(...gaps);
      const currentStreak = computeStreak(sortedLogs);

      logsHtml += `<div class="stats-section">
        <h3 class="logs-title">Stats</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${sortedLogs.length}</div>
            <div class="stat-label">Total Logs</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalDays}</div>
            <div class="stat-label">Day Span</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${avgGap}</div>
            <div class="stat-label">Avg Gap</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${minGap}</div>
            <div class="stat-label">Min Gap</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${maxGap}</div>
            <div class="stat-label">Max Gap</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${currentStreak}</div>
            <div class="stat-label">Streak</div>
          </div>
        </div>
      </div>`;
    } else if (sortedLogs.length === 1) {
      logsHtml += `<div class="stats-section">
        <h3 class="logs-title">Stats</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">1</div>
            <div class="stat-label">Total Logs</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">1</div>
            <div class="stat-label">Streak</div>
          </div>
        </div>
      </div>`;
    }

    logsHtml += `<div class="logs-header"><h3 class="logs-title">Activity Log${logs.length ? ` (${logs.length})` : ''}</h3></div>`;
    logsHtml += `<div class="log-add-row">
      <input type="date" class="log-date-input" id="log-date-input" value="${new Date().toISOString().split('T')[0]}">
      <button class="btn btn-primary btn-sm" id="log-add-btn">Log Date</button>
    </div>`;
    if (sortedLogs.length) {
      logsHtml += '<div class="logs-list">';
      for (let i = 0; i < sortedLogs.length; i++) {
        const logDate = sortedLogs[i];
        // Gap to next (older) log
        let gapHtml = '';
        if (i < sortedLogs.length - 1) {
          const gap = Math.abs(daysBetween(sortedLogs[i]) - daysBetween(sortedLogs[i + 1]));
          if (gap > 1) {
            gapHtml = `<span class="log-gap">${gap} day${gap !== 1 ? 's' : ''} gap</span>`;
          } else {
            gapHtml = `<span class="log-gap log-gap-consecutive">consecutive</span>`;
          }
        }
        logsHtml += `<div class="log-entry">
          <span class="log-dot"></span>
          <span class="log-entry-text">${formatDate(logDate)}</span>
          <button class="log-delete-btn" data-log-date="${logDate}" aria-label="Remove log">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
        if (gapHtml) {
          logsHtml += `<div class="log-gap-row">${gapHtml}</div>`;
        }
      }
      logsHtml += '</div>';
    } else {
      logsHtml += '<p class="logs-empty">No logs yet. Pick a date and tap "Log Date".</p>';
    }
    logsEl.innerHTML = logsHtml;

    // Log add handler
    $('#log-add-btn').addEventListener('click', async () => {
      const dateVal = $('#log-date-input').value;
      if (!dateVal) return;
      const ev = await DB.getEvent(currentEventId);
      if (!ev) return;
      if (!ev.logs) ev.logs = [];
      if (!ev.logs.includes(dateVal)) {
        ev.logs.push(dateVal);
        ev.logs.sort().reverse();
        await DB.saveEvent(ev);
      }
      await loadEvents();
      showDetail(currentEventId);
      showToast('Date logged');
    });

    // Log delete handlers
    $$('.log-delete-btn', logsEl).forEach(btn => {
      btn.addEventListener('click', async () => {
        const dateToRemove = btn.dataset.logDate;
        const ev = await DB.getEvent(currentEventId);
        if (!ev || !ev.logs) return;
        ev.logs = ev.logs.filter(d => d !== dateToRemove);
        await DB.saveEvent(ev);
        await loadEvents();
        showDetail(currentEventId);
        showToast('Log removed');
      });
    });

    $('#detail-view').classList.add('active');
  }

  function hideDetail() {
    $('#detail-view').classList.remove('active');
    currentEventId = null;
  }

  // --- Add/Edit Modal ---
  let editingId = null;

  function openModal(event = null) {
    editingId = event ? event.id : null;
    $('#modal-title').textContent = event ? 'Edit Event' : 'New Event';
    $('#input-title').value = event ? event.title : '';
    $('#input-desc').value = event ? (event.description || '') : '';
    $('#input-date').value = event ? event.date : new Date().toISOString().split('T')[0];
    $('#input-title').classList.remove('error');
    $('#modal-overlay').classList.add('active');
    setTimeout(() => $('#input-title').focus(), 300);
  }

  function closeModal() {
    $('#modal-overlay').classList.remove('active');
    editingId = null;
  }

  async function saveModal() {
    const title = $('#input-title').value.trim();
    const description = $('#input-desc').value.trim();
    const date = $('#input-date').value;

    if (!title) {
      $('#input-title').classList.add('error');
      $('#input-title').focus();
      return;
    }

    const event = editingId ? await DB.getEvent(editingId) : {};
    event.title = title;
    event.description = description;
    event.date = date;

    if (editingId) event.id = editingId;
    await DB.saveEvent(event);

    closeModal();
    await loadEvents();
    showToast(editingId ? 'Event updated' : 'Event added');

    // If detail is open, refresh it
    if (currentEventId === editingId) {
      showDetail(editingId);
    }
  }

  // --- Settings ---
  function openSettings() {
    $('#settings-view').classList.add('active');
  }

  function closeSettings() {
    $('#settings-view').classList.remove('active');
  }

  async function exportEvents() {
    try {
      const json = await DB.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `days-track-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Events exported');
    } catch {
      showToast('Export failed');
    }
  }

  async function importEvents() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await DB.importData(text);
        await loadEvents();
        showToast('Events imported');
      } catch {
        showToast('Invalid file format');
      }
    };
    input.click();
  }

  async function clearAllData() {
    const yes = await showConfirm('Clear All Data', 'This will permanently delete all your events. This cannot be undone.');
    if (!yes) return;
    await DB.clearAllEvents();
    await loadEvents();
    hideDetail();
    showToast('All events cleared');
  }

  // --- Event delegation ---
  function initListeners() {
    // FAB
    $('#fab').addEventListener('click', () => openModal());

    // Log button click
    $('#events-container').addEventListener('click', async (e) => {
      const logBtn = e.target.closest('.log-btn');
      if (logBtn) {
        e.stopPropagation();
        const id = logBtn.dataset.logId;
        await DB.logEvent(id);
        await loadEvents();
        showToast('Logged today');
        return;
      }
      const card = e.target.closest('.event-card');
      if (card) showDetail(card.dataset.id);
    });

    // Detail close
    $('#detail-back').addEventListener('click', hideDetail);

    // Detail edit
    $('#detail-edit').addEventListener('click', async () => {
      const event = await DB.getEvent(currentEventId);
      if (event) openModal(event);
    });

    // Detail delete
    $('#detail-delete').addEventListener('click', async () => {
      const yes = await showConfirm('Delete Event', 'Are you sure you want to delete this event?');
      if (!yes) return;
      await DB.deleteEvent(currentEventId);
      hideDetail();
      await loadEvents();
      showToast('Event deleted');
    });

    // Modal
    $('#modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-save').addEventListener('click', saveModal);

    // Enter to save in modal
    $('#input-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveModal();
    });

    // Remove error class on input
    $('#input-title').addEventListener('input', () => {
      $('#input-title').classList.remove('error');
    });

    // Settings
    $('#btn-settings').addEventListener('click', openSettings);
    $('#settings-back').addEventListener('click', closeSettings);
    $('#theme-toggle').addEventListener('change', toggleTheme);
    $('#btn-export').addEventListener('click', exportEvents);
    $('#btn-import').addEventListener('click', importEvents);
    $('#btn-clear').addEventListener('click', clearAllData);

    // Back button / Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if ($('#confirm-overlay').classList.contains('active')) return;
        if ($('#modal-overlay').classList.contains('active')) closeModal();
        else if ($('#settings-view').classList.contains('active')) closeSettings();
        else if ($('#detail-view').classList.contains('active')) hideDetail();
      }
    });
  }

  // --- Auto-update day counts ---
  function startAutoUpdate() {
    // Update every minute
    setInterval(loadEvents, 60000);

    // Also update at midnight
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = midnight - now;
    setTimeout(() => {
      loadEvents();
      // Then every 24 hours
      setInterval(loadEvents, 86400000);
    }, msUntilMidnight);
  }

  // --- Service Worker ---
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // --- Init ---
  async function init() {
    await initTheme();
    await loadEvents();
    initListeners();
    startAutoUpdate();
    registerSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
