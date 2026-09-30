function _applyUserIdentity() {
  const u = (DB.settings && DB.settings.user) || {};
  // RBAC: prefer the real signed-in account + its assigned role over the shared
  // cosmetic DB.settings.user fields, so each user sees their own identity/role.
  const me = window.__ERP_USER || {};
  const roleLabels = (window.erpUsers && window.erpUsers.roleLabels) || {};
  // Employee-user link: an Employee master record whose email matches the
  // signed-in account gives each user their own real name/jabatan instead of
  // the single shared DB.settings.user fields (which every account otherwise
  // sees identically).
  const myEmployee =
    me.email &&
    (DB.employees || []).find(
      e => e.email && e.email.toLowerCase() === String(me.email).toLowerCase()
    );
  // Priority: linked Employee name (per-user, real) > the shared configured
  // display name > the auth account's own name > a generic placeholder. The
  // ROLE always reflects the real RBAC role from users/{uid}.
  const name = (myEmployee && myEmployee.name) || u.name || me.displayName || 'Pengguna';
  const initials =
    u.initials ||
    name
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  const role = roleLabels[me.role] || me.role || u.role || 'Staff';
  const access = '';

  const sidebarName = document.getElementById('sidebar-username');
  const sidebarRole = document.getElementById('sidebar-role');
  if (sidebarName) {
    sidebarName.textContent = name;
  }
  if (sidebarRole) {
    sidebarRole.textContent = `${role}${access ? ' - ' + access : ''}`;
  }

  const photo = u.photo || '';
  document.querySelectorAll('.avatar-sm, .avatar-xs').forEach(el => {
    if (photo) {
      el.textContent = '';
      const img = document.createElement('img');
      img.src = photo;
      img.alt = initials;
      el.appendChild(img);
    } else {
      el.textContent = initials;
    }
  });

  const userChip = document.querySelector('.user-chip span');
  if (userChip) {
    const first = name.split(' ')[0] || name;
    const restInitials = name.includes(' ')
      ? name
          .split(' ')
          .slice(1)
          .map(w => w[0])
          .join('.') + '.'
      : '';
    userChip.textContent = `${first}${restInitials ? ' ' + restInitials : ''}`;
  }
}

function editIdentity() {
  const u = (DB.settings && DB.settings.user) || {};
  const c = (DB.settings && DB.settings.company) || {};

  openModal(
    'Identitas Pengguna & Perusahaan',
    `
  <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
    Pengguna
  </div>
  <div class="form-group">
    <label class="form-label">Foto Profil</label>
    <div style="display:flex;align-items:center;gap:12px">
      <div id="id-photo-preview" style="width:48px;height:48px;border-radius:14px;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg,var(--primary),#7c3aed);color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center"></div>
      <input type="file" id="id-photo-file" accept="image/*" style="display:none">
      <button class="btn-ghost" type="button" id="id-photo-upload">Upload Foto</button>
      <button class="btn-ghost" type="button" id="id-photo-remove" style="color:var(--danger,#f87171)">Hapus</button>
    </div>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">Nama Lengkap</label>
      <input class="form-input" id="id-name" type="text" value="${escapeHtml(u.name || '')}" placeholder="Nama Lengkap">
    </div>
    <div class="form-group">
      <label class="form-label">Inisial (maks. 2 huruf)</label>
      <input class="form-input" id="id-initials" type="text" maxlength="2" value="${escapeHtml(u.initials || '')}" placeholder="HW">
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">Peran (Role)</label>
    <input class="form-input" id="id-role" type="text" value="${escapeHtml(((window.erpUsers && window.erpUsers.roleLabels) || {})[(window.__ERP_USER || {}).role] || (window.__ERP_USER || {}).role || '')}" readonly style="background:var(--surface);color:var(--muted)">
    <div style="font-size:10px;color:var(--muted);margin-top:4px">Peran ditetapkan oleh Admin via Pengaturan → Manajemen Pengguna.</div>
  </div>

  <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px">
    Perusahaan
  </div>
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">Nama Perusahaan</label>
      <input class="form-input" id="id-company" type="text" value="${escapeHtml(c.name || '')}" placeholder="CV Contoh Sejahtera">
    </div>
    <div class="form-group">
      <label class="form-label">Telepon</label>
      <input class="form-input" id="id-phone" type="text" value="${escapeHtml(c.phone || '')}" placeholder="021-0000-0000">
    </div>
  </div>
  <div class="form-group">
    <label class="form-label">Alamat Perusahaan</label>
    <input class="form-input" id="id-address" type="text" value="${escapeHtml(c.address || '')}" placeholder="Ruko Graha Boulevard Summarecon Serpong Blok GBVB 10, Tangerang">
  </div>`,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveIdentity">Simpan</button>`
  );

  setTimeout(() => {
    const saveBtn = document.getElementById('saveIdentity');
    if (!saveBtn) {
      return;
    }

    let pendingPhoto = u.photo || '';

    const preview = document.getElementById('id-photo-preview');
    const fileInput = document.getElementById('id-photo-file');
    const uploadBtn = document.getElementById('id-photo-upload');
    const removeBtn = document.getElementById('id-photo-remove');

    function renderPhotoPreview() {
      if (!preview) {
        return;
      }
      if (pendingPhoto) {
        preview.textContent = '';
        const img = document.createElement('img');
        img.src = pendingPhoto;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        preview.appendChild(img);
      } else {
        const nm = document.getElementById('id-name')?.value || u.name || 'P';
        preview.textContent = nm
          .split(' ')
          .map(w => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
      }
      if (removeBtn) {
        removeBtn.style.display = pendingPhoto ? '' : 'none';
      }
    }
    renderPhotoPreview();

    uploadBtn?.addEventListener('click', () => fileInput?.click());
    removeBtn?.addEventListener('click', () => {
      pendingPhoto = '';
      if (fileInput) {
        fileInput.value = '';
      }
      renderPhotoPreview();
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        return;
      }
      if (!file.type.startsWith('image/')) {
        showToast('File harus berupa gambar', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Resize + compress to keep the data URL small (stored in
          // DB.settings → synced to Firestore, so it must stay tiny)
          const SIZE = 128;
          const canvas = document.createElement('canvas');
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext('2d');
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          pendingPhoto = canvas.toDataURL('image/jpeg', 0.85);
          renderPhotoPreview();
        };
        img.onerror = () => showToast('Gambar tidak dapat dibaca', 'warning');
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    saveBtn.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('id-name').value);
      const initials = sanitizeInput(document.getElementById('id-initials').value)
        .toUpperCase()
        .slice(0, 2);
      // Role is governed by users/{uid} (Manajemen Pengguna), not this field.
      const prevUser = (DB.settings && DB.settings.user) || {};
      const role = prevUser.role || '';
      const access = prevUser.access || '';
      const company = sanitizeInput(document.getElementById('id-company').value);
      const phone = sanitizeInput(document.getElementById('id-phone').value);
      const address = sanitizeInput(document.getElementById('id-address').value);

      if (!name) {
        showToast('Nama tidak boleh kosong', 'warning');
        return;
      }

      if (!DB.settings) {
        DB.settings = {};
      }
      DB.settings.user = { name, initials, role, access, photo: pendingPhoto };
      DB.settings.company = { name: company, phone, address };

      saveDB();
      closeModal();
      _applyUserIdentity();
      showToast('Identitas berhasil disimpan', 'success');
    });
  }, 50);
}

ERP.registerAction('editIdentity', function editIdentityAction() {
  editIdentity();
  return true;
});

window._companyProfile = { open: function () { editIdentity(); } };

document.addEventListener(
  'click',
  function settingsIdentityShortcut(e) {
    const btn = e.target.closest('[data-action="openSettings"]');
    if (!btn) {
      return;
    }
    if (btn.dataset.title !== 'Profil Perusahaan') {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    editIdentity();
  },
  true
);

// NOTE (demo rebrand): this used to monkey-patch window.printDocument to
// text-replace the previous owner's real company name/address/phone into
// printed documents via a regex over the rendered HTML. That is no longer
// needed — erp-crud.js's print templates already read
// DB.settings.company.{name,address,phone} directly, with generic
// placeholder fallbacks, so there is nothing left to substitute here.

document.addEventListener('DOMContentLoaded', _applyUserIdentity);
if (document.readyState !== 'loading') {
  _applyUserIdentity();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY & BACKUP SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

// Change Password
function showChangePassword() {
  openModal(
    'Ganti Password',
    `
    <div class="form-group">
      <label class="form-label">Password Lama</label>
      <input class="form-input" id="pwd-current" type="password" autocomplete="current-password">
    </div>
    <div class="form-group">
      <label class="form-label">Password Baru</label>
      <input class="form-input" id="pwd-new" type="password" autocomplete="new-password">
    </div>
    <div class="form-group">
      <label class="form-label">Konfirmasi Password Baru</label>
      <input class="form-input" id="pwd-confirm" type="password" autocomplete="new-password">
    </div>
    <div style="padding:12px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--muted);margin-top:12px">
      <strong>Tips keamanan:</strong><br>
      • Gunakan minimal 8 karakter<br>
      • Kombinasikan huruf besar, kecil, angka, dan simbol<br>
      • Jangan gunakan password yang mudah ditebak
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="savePassword">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('savePassword')?.addEventListener('click', async () => {
      const current = document.getElementById('pwd-current').value;
      const newPwd = document.getElementById('pwd-new').value;
      const confirm = document.getElementById('pwd-confirm').value;

      if (!current || !newPwd || !confirm) {
        showToast('Semua field harus diisi', 'warning');
        return;
      }

      if (newPwd !== confirm) {
        showToast('Password baru tidak cocok', 'warning');
        return;
      }

      if (newPwd.length < 6) {
        showToast('Password baru minimal 6 karakter', 'warning');
        return;
      }

      try {
        await window.erpAuth.changePassword(current, newPwd);
        closeModal();
        showToast('Password berhasil diubah', 'success');
      } catch (error) {
        showToast(error.message, 'danger');
      }
    });
  }, 50);
}

// ── Two-Factor Authentication (TOTP) ───────────────────────────────────────────
function _groupSecret(s) {
  return String(s || '').replace(/(.{4})/g, '$1 ').trim();
}

function _backupCodesHtml(codes) {
  return (
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-family:monospace;font-size:14px;' +
    'padding:14px;background:var(--bg);border:1px dashed var(--border);border-radius:10px;margin:12px 0">' +
    codes
      .map(c => '<div style="text-align:center;letter-spacing:1px">' + escapeHtml(c) + '</div>')
      .join('') +
    '</div>'
  );
}

function _showBackupCodes(codes, note) {
  openModal(
    'Kode Cadangan 2FA',
    '<p style="font-size:13px;color:var(--muted);margin-bottom:4px">' +
      (note || 'Simpan kode berikut di tempat aman.') +
      ' Setiap kode hanya bisa dipakai <strong>satu kali</strong> jika kamu kehilangan akses ke aplikasi authenticator.</p>' +
      _backupCodesHtml(codes) +
      '<div style="font-size:12px;color:var(--danger)">⚠️ Kode ini tidak akan ditampilkan lagi.</div>',
    '<button class="btn-ghost" data-action="closeModal">Tutup</button>' +
      '<button class="btn" id="tfa-copy-codes">Salin Semua</button>'
  );
  setTimeout(() => {
    document.getElementById('tfa-copy-codes')?.addEventListener('click', () => {
      try {
        navigator.clipboard.writeText(codes.join('\n'));
        showToast('Kode cadangan disalin', 'success');
      } catch (_) {
        showToast('Gagal menyalin — salin manual', 'warning');
      }
    });
  }, 50);
}

function showTwoFactorEnroll() {
  const { secret, otpauthUrl } = window.erpAuth.begin2FAEnrollment();
  openModal(
    'Aktifkan Verifikasi 2 Langkah',
    '<ol style="font-size:13px;color:var(--text);padding-left:18px;margin:0 0 12px;line-height:1.8">' +
      '<li>Buka aplikasi authenticator (Google Authenticator, Authy, dll).</li>' +
      '<li>Pilih <strong>“Enter a setup key”</strong> lalu masukkan kunci di bawah.</li>' +
      '<li>Masukkan kode 6 digit yang muncul untuk mengonfirmasi.</li>' +
      '</ol>' +
      '<label class="form-label">Kunci Setup (manual)</label>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
      '<code id="tfa-secret" style="flex:1;padding:12px;background:var(--bg);border:1px solid var(--border);' +
      'border-radius:10px;font-size:15px;letter-spacing:2px;user-select:all">' +
      _groupSecret(secret) +
      '</code>' +
      '<button class="btn-ghost" id="tfa-copy-secret" type="button">Salin</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:14px;word-break:break-all">Atau buka URI: ' +
      '<a href="' +
      escapeHtml(otpauthUrl) +
      '" style="color:var(--primary)">' +
      escapeHtml(otpauthUrl) +
      '</a></div>' +
      '<div class="form-group"><label class="form-label">Kode Verifikasi (6 digit)</label>' +
      '<input class="form-input" id="tfa-token" inputmode="numeric" autocomplete="one-time-code" ' +
      'placeholder="123456" maxlength="6" style="letter-spacing:4px;text-align:center;font-size:18px"></div>',
    '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
      '<button class="btn" id="tfa-confirm">Aktifkan</button>'
  );
  setTimeout(() => {
    document.getElementById('tfa-copy-secret')?.addEventListener('click', () => {
      try {
        navigator.clipboard.writeText(secret);
        showToast('Kunci disalin', 'success');
      } catch (_) {
        showToast('Gagal menyalin', 'warning');
      }
    });
    document.getElementById('tfa-confirm')?.addEventListener('click', async () => {
      const token = (document.getElementById('tfa-token')?.value || '').trim();
      if (!token) {
        showToast('Masukkan kode 6 digit', 'warning');
        return;
      }
      try {
        const { backupCodes } = await window.erpAuth.enable2FA(secret, token);
        closeModal();
        showToast('Verifikasi 2 langkah aktif', 'success');
        _showBackupCodes(backupCodes, 'Kode cadangan baru dibuat.');
      } catch (err) {
        showToast(err.message || 'Gagal mengaktifkan 2FA', 'danger');
      }
    });
    document.getElementById('tfa-token')?.focus();
  }, 50);
}

function showTwoFactorManage(status) {
  status = status || { backupCodesRemaining: 0 };
  openModal(
    'Verifikasi 2 Langkah',
    '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg);border-radius:10px;margin-bottom:14px">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--success,#10B981)22;display:flex;align-items:center;justify-content:center">✅</div>' +
      '<div><div style="font-size:14px;font-weight:700">2FA Aktif</div>' +
      '<div style="font-size:12px;color:var(--muted)">' +
      status.backupCodesRemaining +
      ' kode cadangan tersisa</div></div></div>' +
      '<p style="font-size:12px;color:var(--muted)">Nonaktifkan 2FA atau buat ulang kode cadangan. ' +
      'Konfirmasi dengan password atau kode 2FA.</p>' +
      '<div class="form-group" style="margin-top:12px"><label class="form-label">Konfirmasi (password / kode 2FA)</label>' +
      '<input class="form-input" id="tfa-confirm-val" type="password" autocomplete="current-password"></div>',
    '<button class="btn-ghost" data-action="closeModal">Tutup</button>' +
      '<button class="btn-ghost" id="tfa-regen">Buat Ulang Kode</button>' +
      '<button class="btn" id="tfa-disable" style="background:var(--danger);border-color:var(--danger)">Nonaktifkan</button>'
  );
  setTimeout(() => {
    document.getElementById('tfa-regen')?.addEventListener('click', async () => {
      try {
        const { backupCodes } = await window.erpAuth.regenerateBackupCodes();
        closeModal();
        _showBackupCodes(backupCodes, 'Kode cadangan lama dibatalkan.');
      } catch (err) {
        showToast(err.message || 'Gagal', 'danger');
      }
    });
    document.getElementById('tfa-disable')?.addEventListener('click', async () => {
      const val = (document.getElementById('tfa-confirm-val')?.value || '').trim();
      if (!val) {
        showToast('Masukkan password atau kode 2FA untuk konfirmasi', 'warning');
        return;
      }
      try {
        await window.erpAuth.disable2FA(val);
        closeModal();
        showToast('Verifikasi 2 langkah dinonaktifkan', 'success');
      } catch (err) {
        showToast(err.message || 'Gagal menonaktifkan', 'danger');
      }
    });
  }, 50);
}

async function showTwoFactor() {
  if (!window.erpAuth || typeof window.erpAuth.get2FAStatus !== 'function') {
    showToast('Modul 2FA belum siap', 'warning');
    return;
  }
  // Authoritative enroll/manage decision — in cloud mode this queries the server.
  let status;
  try {
    status = await window.erpAuth.get2FAStatus();
  } catch (_) {
    status = { enabled: false };
  }
  if (status.enabled) {
    showTwoFactorManage(status);
  } else {
    showTwoFactorEnroll();
  }
}

// Backup Management
function showBackupManager() {
  const status = window.erpBackup.getBackupStatus();
  const backups = window.erpBackup.getBackupList();

  const statusHtml = status.lastBackup
    ? `<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--bg);border-radius:8px;margin-bottom:16px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">Backup Otomatis Aktif</div>
          <div style="font-size:11px;color:var(--muted)">
            Terakhir: ${status.lastBackupDate} • 
            Backup berikutnya dalam ${status.hoursUntilNext} jam
          </div>
        </div>
      </div>`
    : `<div style="padding:12px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;margin-bottom:16px;font-size:12px;color:#92400E">
        Belum ada backup otomatis. Backup pertama akan dibuat dalam 24 jam.
      </div>`;

  const backupListHtml =
    backups.length > 0
      ? backups
          .map(
            b => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">${b.date}</div>
            <div style="font-size:11px;color:var(--muted)">${b.sizeFormatted}</div>
          </div>
          <button class="btn-ghost" data-action="restoreBackup" data-key="${b.key}" style="font-size:11px;padding:4px 12px">
            Pulihkan
          </button>
        </div>
      `
          )
          .join('')
      : `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">
        Belum ada backup tersimpan
      </div>`;

  openModal(
    'Kelola Backup',
    `
    ${statusHtml}
    
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn" id="exportBackup" style="flex:1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export ke File
      </button>
      <button class="btn-ghost" id="importBackup" style="flex:1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Import dari File
      </button>
      <button class="btn-ghost" id="forceBackup" style="padding:8px 16px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
    </div>

    <button class="btn-ghost" id="openExcelImport" style="width:100%;margin-bottom:12px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;gap:8px;padding:10px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span style="font-size:12px;font-weight:600">Import dari Excel</span>
    </button>

    <input type="file" id="backupFileInput" accept=".json" style="display:none">

    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
      Backup Otomatis (${backups.length})
    </div>
    ${backupListHtml}
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );

  setTimeout(() => {
    // Export backup
    document.getElementById('exportBackup')?.addEventListener('click', () => {
      try {
        const filename = window.erpBackup.exportToFile();
        showToast(`Backup berhasil diekspor: ${filename}`, 'success');
      } catch (error) {
        showToast(`Gagal export: ${error.message}`, 'danger');
      }
    });

    // Import backup
    document.getElementById('importBackup')?.addEventListener('click', () => {
      document.getElementById('backupFileInput').click();
    });

    document.getElementById('backupFileInput')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }

      if (!confirm('Import backup akan menimpa semua data saat ini. Lanjutkan?')) {
        return;
      }

      try {
        await window.erpBackup.importFromFile(file);
        closeModal();
        showToast('Backup berhasil diimport. Halaman akan dimuat ulang.', 'success');
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        showToast(`Gagal import: ${error.message}`, 'danger');
      }
    });

    // Import dari Excel — opens the dedicated importer screen.
    document.getElementById('openExcelImport')?.addEventListener('click', () => {
      closeModal();
      if (typeof window.navigate === 'function') {
        window.navigate('excelImport');
      }
    });

    // Force backup
    document.getElementById('forceBackup')?.addEventListener('click', () => {
      try {
        window.erpBackup.forceBackup();
        closeModal();
        showToast('Backup manual berhasil dibuat', 'success');
        setTimeout(() => showBackupManager(), 500);
      } catch (error) {
        showToast(`Gagal membuat backup: ${error.message}`, 'danger');
      }
    });

    // Restore backup
    document.querySelectorAll('[data-action="restoreBackup"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (!confirm('Pulihkan backup ini? Data saat ini akan ditimpa.')) {
          return;
        }

        try {
          window.erpBackup.restoreFromBackup(key);
          closeModal();
          showToast('Backup berhasil dipulihkan. Halaman akan dimuat ulang.', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
          showToast(`Gagal memulihkan: ${error.message}`, 'danger');
        }
      });
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALL APP (PWA)
// ═══════════════════════════════════════════════════════════════════════════════

// Chrome/Edge/Android: native install via window.erpPwa (beforeinstallprompt,
// captured in src/pwa-register.js). Safari has no install API, so iOS gets
// "Tambahkan ke Layar Utama" steps and macOS gets "Add to Dock" steps.
function showInstallApp() {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafariDesktop =
    !isIOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const standalone = !!(window.erpPwa && window.erpPwa.isStandalone());
  const canPrompt = !!(window.erpPwa && window.erpPwa.canPrompt());

  const shareIcon =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

  function steps(list) {
    return list
      .map(
        (s, i) => `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px">
        <div style="width:20px;height:20px;border-radius:50%;background:var(--primary,#2563EB);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
        <div style="font-size:12.5px;line-height:1.5">${s}</div>
      </div>`
      )
      .join('');
  }

  let body = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <img src="/icon-192.png" alt="Kelola ERP" style="width:48px;height:48px;border-radius:12px">
      <div style="font-size:12px;color:var(--muted);line-height:1.5">
        Pasang Kelola ERP sebagai aplikasi: dibuka langsung dari homescreen/desktop,
        tampil layar penuh tanpa address bar, dan tetap bisa diakses saat offline.
      </div>
    </div>`;

  if (standalone) {
    body += `
    <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;color:#166534">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      <div style="font-size:13px;font-weight:600">Aplikasi sudah terpasang — Anda sedang menggunakannya dalam mode aplikasi.</div>
    </div>`;
  } else if (canPrompt) {
    body += `
    <button class="btn" id="pwa-install-now" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;font-size:13px;font-weight:700">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Pasang Sekarang
    </button>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:10px">
      Browser akan menampilkan dialog konfirmasi pemasangan.
    </div>`;
  } else if (isIOS) {
    body += `
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">iPhone / iPad</div>
    ${steps([
      'Buka aplikasi ini di <strong>Safari</strong> (Chrome iOS juga bisa)',
      `Ketuk tombol <strong>Bagikan</strong> ${shareIcon} di bagian bawah layar`,
      'Scroll ke bawah, pilih <strong>"Tambahkan ke Layar Utama"</strong> <em>(Add to Home Screen)</em>',
      'Ketuk <strong>"Tambah"</strong> — ikon Kelola ERP muncul di homescreen',
    ])}`;
  } else if (isSafariDesktop) {
    body += `
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Safari (Mac)</div>
    ${steps([
      'Buka menu <strong>File</strong> di bar menu Safari',
      'Pilih <strong>"Tambahkan ke Dock"</strong> <em>(Add to Dock)</em> — perlu Safari 17 / macOS Sonoma ke atas',
      'Klik <strong>"Tambah"</strong> — Kelola ERP muncul di Dock sebagai aplikasi',
    ])}`;
  } else if (isFirefox) {
    body += `
    <div style="padding:12px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;font-size:12px;color:#92400E;line-height:1.5">
      Firefox desktop tidak mendukung pemasangan PWA. Gunakan <strong>Chrome</strong> atau <strong>Edge</strong> untuk memasang aplikasi.
      Di Firefox Android: menu <strong>⋮</strong> → <strong>"Tambahkan ke Layar Utama"</strong>.
    </div>`;
  } else if (isAndroid) {
    body += `
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Android (Chrome)</div>
    ${steps([
      'Ketuk menu <strong>⋮</strong> di kanan atas Chrome',
      'Pilih <strong>"Tambahkan ke Layar utama"</strong> atau <strong>"Instal aplikasi"</strong>',
      'Konfirmasi — ikon Kelola ERP muncul di homescreen',
    ])}`;
  } else {
    body += `
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Chrome / Edge (Desktop)</div>
    ${steps([
      'Cari ikon <strong>install</strong> (layar dengan panah ke bawah) di ujung kanan <strong>address bar</strong>, lalu klik <strong>"Instal"</strong>',
      'Atau: menu <strong>⋮</strong> → <strong>"Simpan dan bagikan"</strong> → <strong>"Instal Kelola ERP…"</strong>',
    ])}
    <div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5">
      Jika ikon install tidak muncul, kemungkinan aplikasi sudah pernah dipasang —
      buka dari ikon Kelola ERP di desktop/launcher. Pastikan juga halaman dibuka via
      <strong>https</strong> (bukan alamat IP lokal).
    </div>`;
  }

  openModal(
    'Install Aplikasi',
    body,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );

  setTimeout(() => {
    document.getElementById('pwa-install-now')?.addEventListener('click', async () => {
      const outcome = await window.erpPwa.promptInstall();
      if (outcome === 'accepted') {
        closeModal();
        showToast('Aplikasi sedang dipasang — cek homescreen/desktop Anda', 'success');
      } else if (outcome === 'dismissed') {
        showToast('Pemasangan dibatalkan', 'warning');
      } else {
        showToast('Prompt install tidak tersedia — coba muat ulang halaman', 'warning');
      }
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM NOTIFICATIONS (Notification API permission + test)
// ═══════════════════════════════════════════════════════════════════════════════

// The alert scheduler (src/core/notifications.js, window.NSANotif) already
// sends OS notifications for overdue invoices / low stock / over-budget — but
// only once the user grants Notification permission. This card is where they
// grant it.
function showNotificationSettings() {
  const supported = typeof Notification !== 'undefined';
  const perm = supported ? Notification.permission : 'unsupported';

  let statusHtml = '';
  if (!supported) {
    statusHtml = `
      <div style="padding:12px;background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;font-size:12px;color:#92400E;line-height:1.5">
        Browser ini tidak mendukung notifikasi sistem.
      </div>`;
  } else if (perm === 'granted') {
    statusHtml = `
      <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;color:#166534;margin-bottom:12px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <div style="font-size:13px;font-weight:600">Notifikasi aktif untuk perangkat ini.</div>
      </div>
      <button class="btn" id="notif-test" style="width:100%;padding:11px;font-size:13px">Kirim Notifikasi Percobaan</button>`;
  } else if (perm === 'denied') {
    statusHtml = `
      <div style="padding:12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;font-size:12px;color:#991B1B;line-height:1.6">
        Notifikasi <strong>diblokir</strong> untuk situs ini. Buka pengaturan situs di browser
        (ikon gembok di address bar → Notifikasi → Izinkan), lalu muat ulang halaman.
      </div>`;
  } else {
    statusHtml = `
      <button class="btn" id="notif-enable" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;font-size:13px;font-weight:700">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        Aktifkan Notifikasi
      </button>
      <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:10px">
        Browser akan meminta izin menampilkan notifikasi.
      </div>`;
  }

  const body = `
    <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:14px">
      Dapatkan peringatan di perangkat Anda — juga saat aplikasi sedang tidak dibuka
      (mode terpasang/PWA): piutang &amp; hutang jatuh tempo, invoice outstanding,
      stok di bawah minimum, dan anggaran terlampaui. Pemeriksaan berjalan otomatis
      setiap 4 jam selama aplikasi berjalan.
    </div>
    ${statusHtml}`;

  openModal(
    'Notifikasi Sistem',
    body,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );

  setTimeout(() => {
    document.getElementById('notif-enable')?.addEventListener('click', async () => {
      const result = window.NSANotif
        ? await window.NSANotif.requestPermission()
        : await Notification.requestPermission();
      closeModal();
      if (result === 'granted') {
        showToast('Notifikasi diaktifkan ✓', 'success');
        if (window.NSANotif) {
          window.NSANotif.checkAlerts();
        }
      } else if (result === 'denied') {
        showToast('Izin notifikasi ditolak', 'warning');
      }
      // Re-open with the new state on a later tick — open/close in the same
      // frame trips the modal's RAF transition (known gotcha).
      setTimeout(showNotificationSettings, 150);
    });

    document.getElementById('notif-test')?.addEventListener('click', () => {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: 'Kelola ERP — Percobaan',
            body: 'Notifikasi sistem berfungsi di perangkat ini.',
            tag: 'kelola-test',
            icon: '/icons/icon-192x192.png',
          });
        } else {
          new Notification('Kelola ERP — Percobaan', {
            body: 'Notifikasi sistem berfungsi di perangkat ini.',
            tag: 'kelola-test',
          });
        }
        showToast('Notifikasi percobaan dikirim', 'success');
      } catch (_e) {
        showToast('Gagal mengirim notifikasi percobaan', 'warning');
      }
    });
  }, 50);
}

// Register actions
ERP.registerAction('installPwaApp', function () {
  showInstallApp();
  return true;
});

ERP.registerAction('manageNotifications', function () {
  showNotificationSettings();
  return true;
});

ERP.registerAction('changePassword', function () {
  showChangePassword();
  return true;
});

ERP.registerAction('manage2FA', function () {
  showTwoFactor();
  return true;
});

ERP.registerAction('manageBackup', function () {
  showBackupManager();
  return true;
});
