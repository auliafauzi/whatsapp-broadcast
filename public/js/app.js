/**
 * WhatsApp Broadcast System - Frontend Application
 */

// ===== STATE =====
const state = {
  currentPage: 'dashboard',
  contacts: [],
  templates: [],
  history: [],
  selectedContacts: new Set(),
  connectionStatus: 'disconnected',
  activeBroadcasts: [],
  stats: {}
};

// ===== NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    navigateTo(page);
  });
});

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  
  state.currentPage = page;
  
  if (page === 'dashboard') refreshDashboard();
  if (page === 'contacts') loadContacts();
  if (page === 'templates') loadTemplates();
  if (page === 'history') loadHistory();
  if (page === 'broadcast') prepareBroadcastPage();
  if (page === 'settings') refreshSettings();
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ===== API HELPERS =====
async function api(url, options = {}) {
  try {
    const res = await fetch(`/api${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.error || data.message || `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// ===== CONNECTION STATUS =====
async function checkConnection() {
  try {
    const status = await api('/connection/status');
    state.connectionStatus = status.status;
    updateConnectionUI(status);
    return status;
  } catch (err) {
    updateConnectionUI({ status: 'disconnected' });
  }
}

function updateConnectionUI(status) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const detail = document.getElementById('statusDetail');
  
  dot.className = 'status-dot';
  
  const labels = {
    connected: { text: 'Terhubung', class: 'connected', detail: status.user?.name || 'WhatsApp aktif' },
    connecting: { text: 'Menghubungkan...', class: 'connecting', detail: 'Mohon tunggu' },
    qr_required: { text: 'QR Code', class: 'connecting', detail: 'Scan QR di halaman Settings' },
    disconnected: { text: 'Terputus', class: '', detail: 'Klik Reconnect di Settings' }
  };
  
  const info = labels[status.status] || labels.disconnected;
  dot.classList.add(info.class);
  text.textContent = info.text;
  detail.textContent = info.detail;
}

// ===== DASHBOARD =====
async function refreshDashboard() {
  try {
    const [stats, status, active] = await Promise.all([
      api('/stats'),
      api('/connection/status'),
      api('/history?limit=10')
    ]);
    
    state.stats = stats;
    state.activeBroadcasts = active.filter(h => h.status === 'running');
    
    document.getElementById('statContacts').textContent = stats.totalContacts;
    document.getElementById('statTemplates').textContent = stats.totalTemplates;
    document.getElementById('statTodayBroadcasts').textContent = stats.todayBroadcasts;
    document.getElementById('statTodaySent').textContent = stats.todaySent;
    document.getElementById('statTodayFailed').textContent = stats.todayFailed;
    document.getElementById('statTotalBroadcasts').textContent = stats.totalBroadcasts;
    
    updateConnectionUI(status);
    renderActiveBroadcasts();
    renderConnectionPanel(status);
  } catch (err) {
    console.error('Dashboard refresh failed:', err);
  }
}

function renderConnectionPanel(status) {
  const panel = document.getElementById('connectionPanel');
  
  if (status.status === 'connected') {
    panel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; padding: 20px;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); 
                    border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px;">
          ✅
        </div>
        <div>
          <div style="font-size: 18px; font-weight: 700;">WhatsApp Terhubung</div>
          <div style="color: var(--text-secondary); font-size: 14px;">
            ${status.user?.name || 'Akun aktif'} • ${status.user?.id || ''}
          </div>
          <div style="margin-top: 8px;">
            <button class="btn btn-sm btn-secondary" onclick="logoutWhatsApp()">🔌 Logout</button>
          </div>
        </div>
      </div>
    `;
  } else if (status.status === 'qr_required') {
    panel.innerHTML = `
      <div class="qr-section">
        <p style="margin-bottom: 16px;">Scan QR code ini dengan WhatsApp Anda</p>
        <div class="qr-code">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(status.qrCode)}" 
               alt="QR Code" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22256%22><rect fill=%22white%22 width=%22256%22 height=%22256%22/><text x=%22128%22 y=%22128%22 text-anchor=%22middle%22 font-size=%2214%22>QR Code Error</text></svg>'">
        </div>
        <p style="color: var(--text-secondary); font-size: 13px; margin-top: 12px;">
          Buka WhatsApp → Menu → Perangkat Tertaut → Tautkan Perangkat
        </p>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="icon">📱</div>
        <p>WhatsApp belum terhubung</p>
        <button class="btn btn-primary" onclick="reconnectWhatsApp()" style="margin-top: 16px;">
          🔄 Hubungkan
        </button>
      </div>
    `;
  }
}

function renderActiveBroadcasts() {
  const container = document.getElementById('activeBroadcasts');
  const active = state.activeBroadcasts;
  
  if (active.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">🚀</div>
        <p>Tidak ada broadcast yang sedang berjalan</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = active.map(b => `
    <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <div style="font-weight: 600;">${b.name}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">
            ${b.contactCount} kontak • ${b.status}
          </div>
        </div>
        <div style="font-size: 24px; font-weight: 800; color: var(--primary);">
          ${b.details?.progress || 0}%
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${b.details?.progress || 0}%"></div>
      </div>
      <div class="progress-stats">
        <span>✅ ${b.details?.sent || 0} terkirim</span>
        <span>⏳ ${b.details?.pending || 0} tertunda</span>
        <span>❌ ${b.details?.failed || 0} gagal</span>
      </div>
    </div>
  `).join('');
}

async function reconnectWhatsApp() {
  try {
    showToast('Menghubungkan ulang...', 'warning');
    await api('/connection/reconnect', { method: 'POST' });
    setTimeout(checkConnection, 3000);
  } catch (err) {}
}

async function logoutWhatsApp() {
  if (!confirm('Yakin ingin logout? Anda perlu scan QR lagi.')) return;
  try {
    await api('/connection/logout', { method: 'POST' });
    showToast('Berhasil logout');
    setTimeout(checkConnection, 2000);
  } catch (err) {}
}

// ===== CONTACTS =====
async function loadContacts() {
  try {
    const contacts = await api('/contacts');
    state.contacts = contacts;
    document.getElementById('contactTotal').textContent = contacts.length;
    
    const tbody = document.getElementById('contactsTableBody');
    if (contacts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding: 40px;">Belum ada kontak</td></tr>`;
      return;
    }
    
    tbody.innerHTML = contacts.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.phone}</td>
        <td>${c.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</td>
        <td>${new Date(c.createdAt).toLocaleDateString('id-ID')}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteContact('${c.id}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {}
}

async function addContact() {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const tagsStr = document.getElementById('contactTags').value.trim();
  
  if (!phone) {
    showToast('Nomor telepon wajib diisi', 'error');
    return;
  }
  
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
  
  try {
    await api('/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: name || 'Unknown', phone, tags })
    });
    showToast('Kontak berhasil ditambahkan');
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactTags').value = '';
    loadContacts();
  } catch (err) {}
}

async function deleteContact(id) {
  if (!confirm('Hapus kontak ini?')) return;
  try {
    await api(`/contacts/${id}`, { method: 'DELETE' });
    showToast('Kontak dihapus');
    loadContacts();
  } catch (err) {}
}

async function importContacts() {
  const fileInput = document.getElementById('contactFile');
  const file = fileInput.files[0];
  if (!file) {
    showToast('Pilih file JSON terlebih dahulu', 'error');
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch('/api/contacts/bulk', { method: 'POST', body: formData });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Import failed');
    
    showToast(`Import selesai: ${data.added} ditambah, ${data.updated} diupdate, ${data.failed} gagal`);
    fileInput.value = '';
    loadContacts();
  } catch (err) {
    showToast('Gagal import: ' + err.message, 'error');
  }
}

// ===== TEMPLATES =====
async function loadTemplates() {
  try {
    const templates = await api('/templates');
    state.templates = templates;
    
    const select = document.getElementById('broadcastTemplate');
    select.innerHTML = '<option value="">-- Pesan Manual --</option>' + 
      templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    const container = document.getElementById('templatesList');
    if (templates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📝</div>
          <p>Belum ada template</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = templates.map(t => `
      <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <div style="font-weight: 600; margin-bottom: 4px;">${t.name}</div>
            <div style="color: var(--text-secondary); font-size: 13px; white-space: pre-wrap;">${t.content}</div>
            ${t.variables.length > 0 ? `<div style="margin-top: 8px;">${t.variables.map(v => `<span class="tag">{{${v}}}</span>`).join(' ')}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-danger" onclick="deleteTemplate('${t.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch (err) {}
}

async function addTemplate() {
  const name = document.getElementById('templateName').value.trim();
  const content = document.getElementById('templateContent').value.trim();
  
  if (!name || !content) {
    showToast('Nama dan isi template wajib diisi', 'error');
    return;
  }
  
  const vars = [...content.matchAll(/\{\{(.+?)\}\}/g)].map(m => m[1].trim());
  
  try {
    await api('/templates', {
      method: 'POST',
      body: JSON.stringify({ name, content, variables: [...new Set(vars)] })
    });
    showToast('Template berhasil disimpan');
    document.getElementById('templateName').value = '';
    document.getElementById('templateContent').value = '';
    loadTemplates();
  } catch (err) {}
}

async function deleteTemplate(id) {
  if (!confirm('Hapus template ini?')) return;
  try {
    await api(`/templates/${id}`, { method: 'DELETE' });
    showToast('Template dihapus');
    loadTemplates();
  } catch (err) {}
}

// ===== BROADCAST =====
async function prepareBroadcastPage() {
  await Promise.all([loadContacts(), loadTemplates()]);
  renderBroadcastContacts();
  updateTagFilter();
}

function updateTagFilter() {
  const allTags = [...new Set(state.contacts.flatMap(c => c.tags))];
  const select = document.getElementById('broadcastTagFilter');
  select.innerHTML = '<option value="">Semua Kontak</option>' + 
    allTags.map(t => `<option value="${t}">${t}</option>`).join('');
}

function renderBroadcastContacts() {
  const tagFilter = document.getElementById('broadcastTagFilter').value;
  const filtered = tagFilter 
    ? state.contacts.filter(c => c.tags.includes(tagFilter))
    : state.contacts;
  
  const container = document.getElementById('broadcastContactList');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>Tidak ada kontak</p></div>';
    return;
  }
  
  container.innerHTML = filtered.map(c => `
    <div class="contact-item" onclick="toggleContactSelection('${c.id}', this)">
      <input type="checkbox" ${state.selectedContacts.has(c.id) ? 'checked' : ''} 
             onchange="event.stopPropagation(); toggleContactSelection('${c.id}', this.parentElement)">
      <div>
        <div style="font-weight: 600;">${c.name}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${c.phone}</div>
      </div>
      ${c.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}
    </div>
  `).join('');
  
  updateSelectedCount();
}

function toggleContactSelection(id, element) {
  const checkbox = element.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;
  
  if (checkbox.checked) {
    state.selectedContacts.add(id);
  } else {
    state.selectedContacts.delete(id);
  }
  
  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = state.selectedContacts.size;
}

document.getElementById('broadcastTagFilter').addEventListener('change', () => {
  state.selectedContacts.clear();
  renderBroadcastContacts();
});

document.getElementById('broadcastTemplate').addEventListener('change', (e) => {
  const template = state.templates.find(t => t.id === e.target.value);
  if (template) {
    document.getElementById('broadcastMessage').value = template.content;
  }
});

document.getElementById('broadcastMessage').addEventListener('input', (e) => {
  document.getElementById('charCount').textContent = e.target.value.length;
});

async function startBroadcast() {
  const message = document.getElementById('broadcastMessage').value.trim();
  const name = document.getElementById('broadcastName').value.trim();
  const delay = parseInt(document.getElementById('broadcastDelay').value) || 2000;
  const tagFilter = document.getElementById('broadcastTagFilter').value;
  const templateId = document.getElementById('broadcastTemplate').value;
  
  if (!message) {
    showToast('Isi pesan wajib diisi', 'error');
    return;
  }
  
  const contactIds = Array.from(state.selectedContacts);
  if (contactIds.length === 0 && !tagFilter) {
    showToast('Pilih kontak atau filter tag', 'error');
    return;
  }
  
  try {
    showToast('Memulai broadcast...', 'warning');
    const result = await api('/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        contactIds: contactIds.length > 0 ? contactIds : undefined,
        tagFilter: contactIds.length === 0 ? tagFilter : undefined,
        templateId: templateId || undefined,
        message: message,
        options: { delay, name: name || `Broadcast ${new Date().toLocaleString()}` }
      })
    });
    
    showToast(`Broadcast dimulai! ID: ${result.broadcastId.slice(0, 8)}`);
    state.selectedContacts.clear();
    document.getElementById('broadcastMessage').value = '';
    document.getElementById('broadcastName').value = '';
    navigateTo('dashboard');
  } catch (err) {}
}

function previewBroadcast() {
  const message = document.getElementById('broadcastMessage').value;
  const count = state.selectedContacts.size || document.getElementById('broadcastTagFilter').value 
    ? state.contacts.filter(c => c.tags.includes(document.getElementById('broadcastTagFilter').value)).length 
    : 0;
  
  alert(`Preview Broadcast:

Pesan:
${message}

Target: ${count} kontak`);
}

// ===== HISTORY =====
async function loadHistory() {
  try {
    const history = await api('/history?limit=50');
    state.history = history;
    
    const container = document.getElementById('historyList');
    if (history.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📜</div>
          <p>Belum ada riwayat broadcast</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = history.map(h => {
      const statusColors = {
        completed: 'var(--primary)',
        running: 'var(--warning)',
        failed: 'var(--danger)',
        stopped: 'var(--text-secondary)',
        queued: '#3b82f6'
      };
      
      return `
        <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 600;">${h.name}</div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                ${new Date(h.createdAt).toLocaleString('id-ID')} • ${h.contactCount} kontak
              </div>
            </div>
            <span style="padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;
                         background: ${statusColors[h.status] || 'var(--border)'}22; color: ${statusColors[h.status] || 'var(--text-secondary)'};">
              ${h.status.toUpperCase()}
            </span>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${h.message}
          </div>
          ${h.details ? `
            <div style="margin-top: 8px; display: flex; gap: 16px; font-size: 12px;">
              <span style="color: var(--primary);">✅ ${h.details.sent || 0} terkirim</span>
              <span style="color: var(--danger);">❌ ${h.details.failed || 0} gagal</span>
              ${h.details.progress ? `<span>📊 ${h.details.progress}%</span>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {}
}

// ===== SETTINGS - FIXED TEST SEND =====
async function refreshSettings() {
  const status = await checkConnection();
  const panel = document.getElementById('settingsConnectionPanel');
  
  if (status.status === 'qr_required') {
    panel.innerHTML = `
      <div class="qr-section">
        <p style="margin-bottom: 16px; font-weight: 600;">Scan QR Code untuk Login</p>
        <div class="qr-code">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(status.qrCode)}" 
               alt="QR Code" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22256%22><rect fill=%22white%22 width=%22256%22 height=%22256%22/><text x=%22128%22 y=%22128%22 text-anchor=%22middle%22 font-size=%2214%22>QR Code</text></svg>'">
        </div>
        <p style="color: var(--text-secondary); font-size: 13px; margin-top: 12px;">
          WhatsApp → Menu (⋮) → Perangkat Tertaut → Tautkan Perangkat
        </p>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="reconnectWhatsApp()">🔄 Refresh QR</button>
        </div>
      </div>
    `;
  } else if (status.status === 'connected') {
    panel.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; padding: 20px;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); 
                    border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px;">
          ✅
        </div>
        <div style="flex: 1;">
          <div style="font-size: 18px; font-weight: 700;">WhatsApp Terhubung</div>
          <div style="color: var(--text-secondary); font-size: 14px;">
            ${status.user?.name || 'Akun aktif'}
          </div>
        </div>
        <button class="btn btn-danger" onclick="logoutWhatsApp()">🔌 Logout</button>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="icon">📱</div>
        <p>WhatsApp belum terhubung</p>
        <button class="btn btn-primary" onclick="reconnectWhatsApp()" style="margin-top: 16px;">
          🔄 Hubungkan Sekarang
        </button>
      </div>
    `;
  }
}

function saveSettings() {
  const rateLimit = document.getElementById('settingRateLimit').value;
  const batchSize = document.getElementById('settingBatchSize').value;
  showToast('Pengaturan disimpan (lokal)');
}

// FIXED: Test send with better error handling
async function sendTest() {
  const phone = document.getElementById('testPhone').value.trim();
  const message = document.getElementById('testMessage').value.trim();
  
  if (!phone || !message) {
    showToast('Nomor dan pesan wajib diisi', 'error');
    return;
  }
  
  // Show loading
  const btn = document.querySelector('button[onclick="sendTest()"]');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Mengirim...';
  btn.disabled = true;
  
  try {
    const res = await fetch('/api/send/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message })
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Gagal mengirim pesan');
    }
    
    showToast(`✅ Pesan terkirim ke ${phone}! ID: ${data.messageId?.slice(0, 8) || 'N/A'}`);
    document.getElementById('testMessage').value = '';
  } catch (err) {
    console.error('Test send error:', err);
    showToast('❌ ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ===== INITIALIZATION =====
function init() {
  checkConnection();
  refreshDashboard();
  
  setInterval(() => {
    if (state.currentPage === 'dashboard') refreshDashboard();
    if (state.currentPage === 'history') loadHistory();
    checkConnection();
  }, 5000);
}

init();
