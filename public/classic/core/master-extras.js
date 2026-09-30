// ══════════════════════════════════════════════════════════════════════════════
//  MASTER EXTRAS  — Employee, Contact, Customer Category, Supplier Category
//  All inject into the 'master' view. DB.employees is shared with Payroll.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function save() {
    window.saveDB && window.saveDB();
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function uid(p) {
    return (p || 'X') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function modal(title, body, footer, wide) {
    window.openModal && window.openModal(title, body, footer || '', wide);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }
  function ensureArr(key) {
    if (!window.DB[key]) window.DB[key] = [];
    return window.DB[key];
  }
  function ensureSettings(key, def) {
    if (!db().settings) window.DB.settings = {};
    if (db().settings[key] == null) db().settings[key] = def;
    return db().settings[key];
  }

  function injectView(html) {
    window.invalidateView && window.invalidateView('master');
    window.navigate && window.navigate('master');
    setTimeout(function () {
      var el = document.getElementById('view-master');
      if (el) el.innerHTML = html;
    }, 0);
  }

  var TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  EMPLOYEE
  //  Reads/writes DB.employees (shared with Employee Payroll in Finance).
  //  This view focuses on HR directory info; salary details live in Payroll.
  // ══════════════════════════════════════════════════════════════════════════
  var EMP_DEPTS = [
    'Operasional',
    'Penjualan',
    'Keuangan',
    'Pengiriman',
    'Gudang',
    'HRD',
    'IT',
    'Manajemen',
  ];
  var EMP_STATUS = [
    ['Active', 'Aktif'],
    ['Inactive', 'Tidak Aktif'],
    ['Probation', 'Probasi'],
  ];

  function openEmployee() {
    var emps = ensureArr('employees')
      .slice()
      .sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });

    var statMap = {
      Active: '#DCFCE7|#15803D',
      Inactive: '#FEE2E2|#DC2626',
      Probation: '#FEF9C3|#854D0E',
    };

    var rows = emps.length
      ? emps
          .map(function (e) {
            var sc = (statMap[e.status] || '#F3F4F6|#374151').split('|');
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(e.id) +
              '</td>' +
              '<td class="td-p" style="font-weight:700">' +
              esc(e.name) +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(e.position || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(e.department || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(e.phone || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(e.email || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:11px">' +
              esc(e.joinDate || '—') +
              '</td>' +
              '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:' +
              sc[0] +
              ';color:' +
              sc[1] +
              '">' +
              esc(
                EMP_STATUS.find(function (x) {
                  return x[0] === e.status;
                })
                  ? EMP_STATUS.find(function (x) {
                      return x[0] === e.status;
                    })[1]
                  : e.status || 'Aktif'
              ) +
              '</span></td>' +
              '<td class="td-p" style="text-align:center;white-space:nowrap">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="editEmpM" data-id="' +
              esc(e.id) +
              '">Edit</button> ' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delEmpM" data-id="' +
              esc(e.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Belum ada karyawan. Tambah via tombol di atas atau di menu Payroll.</td></tr>';

    var activeCount = emps.filter(function (e) {
      return !e.status || e.status === 'Active';
    }).length;
    var deptSet = {};
    emps.forEach(function (e) {
      if (e.department) deptSet[e.department] = true;
    });

    injectView(
      '<div class="sec-hdr"><div><h1>Employee</h1><p>Direktori karyawan</p></div>' +
        '<button class="btn" data-action="addEmpM">+ Tambah Karyawan</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Karyawan</div><div class="stat-val">' +
        emps.length +
        '</div><div class="stat-sub">Terdaftar</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Aktif</div><div class="stat-val" style="color:#15803D">' +
        activeCount +
        '</div><div class="stat-sub">Status aktif</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Departemen</div><div class="stat-val">' +
        Object.keys(deptSet).length +
        '</div><div class="stat-sub">Divisi berbeda</div></div>' +
        '</div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">ID</th><th style="' +
        TH +
        '">Nama</th><th style="' +
        TH +
        '">Jabatan</th><th style="' +
        TH +
        '">Departemen</th>' +
        '<th style="' +
        TH +
        '">Telepon</th><th style="' +
        TH +
        '">Email</th><th style="' +
        TH +
        '">Bergabung</th>' +
        '<th style="' +
        TH +
        '">Status</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addEmpMModal(existing) {
    existing = existing || {};
    var deptOpts = EMP_DEPTS.map(function (d) {
      return (
        '<option value="' +
        esc(d) +
        '"' +
        (existing.department === d ? ' selected' : '') +
        '>' +
        esc(d) +
        '</option>'
      );
    }).join('');
    var statOpts = EMP_STATUS.map(function (s) {
      return (
        '<option value="' +
        s[0] +
        '"' +
        ((existing.status || 'Active') === s[0] ? ' selected' : '') +
        '>' +
        s[1] +
        '</option>'
      );
    }).join('');

    modal(
      existing.id ? 'Edit Karyawan' : 'Tambah Karyawan',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Nama Lengkap</label>' +
        '<input class="form-input" id="em-name" value="' +
        esc(existing.name || '') +
        '" placeholder="Nama karyawan"></div>' +
        '<div class="form-group"><label class="form-label">Jabatan</label>' +
        '<input class="form-input" id="em-pos" value="' +
        esc(existing.position || '') +
        '" placeholder="Staff, Supervisor, Manager..."></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Departemen</label>' +
        '<select class="form-select" id="em-dept">' +
        deptOpts +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Status</label>' +
        '<select class="form-select" id="em-status">' +
        statOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Telepon</label>' +
        '<input class="form-input" id="em-phone" value="' +
        esc(existing.phone || '') +
        '" placeholder="08xx-xxxx-xxxx"></div>' +
        '<div class="form-group"><label class="form-label">Email</label>' +
        '<input class="form-input" id="em-email" type="email" value="' +
        esc(existing.email || '') +
        '" placeholder="nama@perusahaan.com"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal Bergabung</label>' +
        '<input class="form-input" id="em-join" type="date" value="' +
        esc(existing.joinDate || '') +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Gaji Pokok (Rp)</label>' +
        '<input class="form-input" id="em-salary" type="number" min="0" value="' +
        (existing.salary || 0) +
        '" placeholder="0"></div>' +
        '</div>',
      '<button class="btn" id="saveEmpM">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>',
      true
    );

    setTimeout(function () {
      var btn = document.getElementById('saveEmpM');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('em-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('employees');
        var data = {
          name: name,
          position: document.getElementById('em-pos').value.trim(),
          department: document.getElementById('em-dept').value,
          status: document.getElementById('em-status').value,
          phone: document.getElementById('em-phone').value.trim(),
          email: document.getElementById('em-email').value.trim(),
          joinDate: document.getElementById('em-join').value,
          salary: parseFloat(document.getElementById('em-salary').value) || 0,
        };
        if (existing.id) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0) Object.assign(arr[idx], data);
        } else {
          var maxNum = arr.reduce(function (m, e) {
            var n = parseInt((e.id || '').replace(/\D/g, '')) || 0;
            return Math.max(m, n);
          }, 0);
          data.id = 'EMP' + String(maxNum + 1).padStart(3, '0');
          data.createdAt = today();
          arr.push(data);
        }
        save();
        closeM();
        toast(existing.id ? 'Data karyawan diperbarui' : 'Karyawan ditambahkan', 'success');
        openEmployee();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  CONTACT  (DB.contacts — CRM-style general contacts)
  // ══════════════════════════════════════════════════════════════════════════
  var CONTACT_TYPES = ['Prospect', 'Lead', 'Rekanan', 'Vendor', 'Konsultan', 'Lainnya'];

  function openContact() {
    var contacts = ensureArr('contacts')
      .slice()
      .sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });

    var rows = contacts.length
      ? contacts
          .map(function (c) {
            return (
              '<tr>' +
              '<td class="td-p" style="font-weight:700">' +
              esc(c.name) +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(c.company || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(c.position || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(c.phone || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(c.email || '—') +
              '</td>' +
              '<td class="td-p"><span style="font-size:10px;font-weight:700;padding:2px 7px;background:var(--bg);border-radius:4px">' +
              esc(c.type || '—') +
              '</span></td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              esc(c.notes || '') +
              '</td>' +
              '<td class="td-p" style="text-align:center;white-space:nowrap">' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px" data-action="editContact" data-id="' +
              esc(c.id) +
              '">Edit</button> ' +
              '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delContact" data-id="' +
              esc(c.id) +
              '">Hapus</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Belum ada kontak ditambahkan.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Contact</h1><p>Direktori kontak bisnis &amp; CRM</p></div>' +
        '<button class="btn" data-action="addContact">+ Tambah Kontak</button></div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr>' +
        '<th style="' +
        TH +
        '">Nama</th><th style="' +
        TH +
        '">Perusahaan</th><th style="' +
        TH +
        '">Jabatan</th>' +
        '<th style="' +
        TH +
        '">Telepon</th><th style="' +
        TH +
        '">Email</th><th style="' +
        TH +
        '">Tipe</th>' +
        '<th style="' +
        TH +
        '">Catatan</th><th style="' +
        TH +
        '"></th>' +
        '</tr></thead><tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addContactModal(existing) {
    existing = existing || {};
    var typeOpts = CONTACT_TYPES.map(function (t) {
      return (
        '<option value="' +
        esc(t) +
        '"' +
        (existing.type === t ? ' selected' : '') +
        '>' +
        esc(t) +
        '</option>'
      );
    }).join('');

    modal(
      existing.id ? 'Edit Kontak' : 'Tambah Kontak',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Nama</label>' +
        '<input class="form-input" id="ct-name" value="' +
        esc(existing.name || '') +
        '" placeholder="Nama kontak"></div>' +
        '<div class="form-group"><label class="form-label">Tipe</label>' +
        '<select class="form-select" id="ct-type">' +
        typeOpts +
        '</select></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Perusahaan</label>' +
        '<input class="form-input" id="ct-company" value="' +
        esc(existing.company || '') +
        '" placeholder="PT. / CV. / Nama Toko"></div>' +
        '<div class="form-group"><label class="form-label">Jabatan</label>' +
        '<input class="form-input" id="ct-pos" value="' +
        esc(existing.position || '') +
        '" placeholder="Direktur, Manager..."></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Telepon</label>' +
        '<input class="form-input" id="ct-phone" value="' +
        esc(existing.phone || '') +
        '" placeholder="08xx-xxxx-xxxx"></div>' +
        '<div class="form-group"><label class="form-label">Email</label>' +
        '<input class="form-input" id="ct-email" type="email" value="' +
        esc(existing.email || '') +
        '" placeholder="nama@email.com"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Catatan</label>' +
        '<input class="form-input" id="ct-notes" value="' +
        esc(existing.notes || '') +
        '" placeholder="Referral dari, interest, dll."></div>',
      '<button class="btn" id="saveContact">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );

    setTimeout(function () {
      var btn = document.getElementById('saveContact');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('ct-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var arr = ensureArr('contacts');
        var data = {
          name: name,
          type: document.getElementById('ct-type').value,
          company: document.getElementById('ct-company').value.trim(),
          position: document.getElementById('ct-pos').value.trim(),
          phone: document.getElementById('ct-phone').value.trim(),
          email: document.getElementById('ct-email').value.trim(),
          notes: document.getElementById('ct-notes').value.trim(),
        };
        if (existing.id) {
          var idx = arr.findIndex(function (x) {
            return x.id === existing.id;
          });
          if (idx >= 0) Object.assign(arr[idx], data);
        } else {
          data.id = uid('CT');
          data.createdAt = today();
          arr.push(data);
        }
        save();
        closeM();
        toast(existing.id ? 'Kontak diperbarui' : 'Kontak ditambahkan', 'success');
        openContact();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  CUSTOMER CATEGORY  (DB.settings.customerCategories — string array)
  // ══════════════════════════════════════════════════════════════════════════
  function openCustomerCategory() {
    var cats = ensureSettings('customerCategories', [
      'Distributor',
      'Retailer',
      'Kontraktor',
      'Pemerintah',
      'Lainnya',
    ]);
    var customers = db().customers || [];

    var rows =
      cats
        .map(function (c, i) {
          var count = customers.filter(function (x) {
            return x.category === c;
          }).length;
          return (
            '<tr>' +
            '<td class="td-p" style="font-weight:700">' +
            esc(c) +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            count +
            ' pelanggan</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delCustCat" data-idx="' +
            i +
            '">Hapus</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--muted)">Belum ada kategori.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Customer Category</h1><p>Kelompok / segmentasi pelanggan</p></div>' +
        '<button class="btn" data-action="addCustCat">+ Tambah Kategori</button></div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">' +
        cats
          .map(function (c) {
            var count = customers.filter(function (x) {
              return x.category === c;
            }).length;
            return (
              '<div class="card" style="flex:0 0 auto;padding:14px 20px;text-align:center;min-width:120px">' +
              '<div style="font-size:22px;font-weight:800">' +
              count +
              '</div>' +
              '<div style="font-size:11px;color:var(--muted);margin-top:2px">' +
              esc(c) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Kategori</th><th style="' +
        TH +
        'text-align:center">Pelanggan</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addCustCatModal() {
    modal(
      'Tambah Kategori Pelanggan',
      '<div class="form-group"><label class="form-label">Nama Kategori</label>' +
        '<input class="form-input" id="ccat-name" placeholder="Distributor, Kontraktor, Retail..."></div>',
      '<button class="btn" id="saveCustCat">Tambah</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveCustCat');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('ccat-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var cats = ensureSettings('customerCategories', []);
        if (cats.indexOf(name) >= 0) {
          toast('Kategori sudah ada', 'warning');
          return;
        }
        cats.push(name);
        save();
        closeM();
        toast('Kategori ditambahkan', 'success');
        openCustomerCategory();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 4  SUPPLIER CATEGORY  (DB.settings.supplierCategories — string array)
  // ══════════════════════════════════════════════════════════════════════════
  function openSupplierCategory() {
    var cats = ensureSettings('supplierCategories', [
      'Produsen',
      'Distributor',
      'Agen',
      'Importir',
      'Jasa',
      'Lainnya',
    ]);
    var suppliers = db().suppliers || [];

    var rows =
      cats
        .map(function (c, i) {
          var count = suppliers.filter(function (x) {
            return x.category === c;
          }).length;
          return (
            '<tr>' +
            '<td class="td-p" style="font-weight:700">' +
            esc(c) +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            count +
            ' supplier</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn-ghost" style="font-size:11px;padding:3px 8px;color:var(--danger)" data-action="delSuppCat" data-idx="' +
            i +
            '">Hapus</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--muted)">Belum ada kategori.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Supplier Category</h1><p>Kelompok / segmentasi supplier</p></div>' +
        '<button class="btn" data-action="addSuppCat">+ Tambah Kategori</button></div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">' +
        cats
          .map(function (c) {
            var count = suppliers.filter(function (x) {
              return x.category === c;
            }).length;
            return (
              '<div class="card" style="flex:0 0 auto;padding:14px 20px;text-align:center;min-width:120px">' +
              '<div style="font-size:22px;font-weight:800">' +
              count +
              '</div>' +
              '<div style="font-size:11px;color:var(--muted);margin-top:2px">' +
              esc(c) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="card" style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr><th style="' +
        TH +
        '">Nama Kategori</th><th style="' +
        TH +
        'text-align:center">Supplier</th><th style="' +
        TH +
        '"></th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function addSuppCatModal() {
    modal(
      'Tambah Kategori Supplier',
      '<div class="form-group"><label class="form-label">Nama Kategori</label>' +
        '<input class="form-input" id="scat-name" placeholder="Produsen, Distributor, Agen..."></div>',
      '<button class="btn" id="saveSuppCat">Tambah</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('saveSuppCat');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var name = (document.getElementById('scat-name').value || '').trim();
        if (!name) {
          toast('Nama wajib diisi', 'warning');
          return;
        }
        var cats = ensureSettings('supplierCategories', []);
        if (cats.indexOf(name) >= 0) {
          toast('Kategori sudah ada', 'warning');
          return;
        }
        cats.push(name);
        save();
        closeM();
        toast('Kategori ditambahkan', 'success');
        openSupplierCategory();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      // Employee
      case 'addEmpM':
        addEmpMModal();
        break;
      case 'editEmpM': {
        var emp = ensureArr('employees').find(function (x) {
          return x.id === id;
        });
        if (emp) addEmpMModal(emp);
        break;
      }
      case 'delEmpM': {
        if (!confirm('Hapus karyawan ' + id + '? Data payroll terkait tidak terhapus.')) return;
        var ea = ensureArr('employees');
        var ei = ea.findIndex(function (x) {
          return x.id === id;
        });
        if (ei >= 0) {
          ea.splice(ei, 1);
          save();
          toast('Karyawan dihapus', 'success');
          openEmployee();
        }
        break;
      }
      // Contact
      case 'addContact':
        addContactModal();
        break;
      case 'editContact': {
        var ct = ensureArr('contacts').find(function (x) {
          return x.id === id;
        });
        if (ct) addContactModal(ct);
        break;
      }
      case 'delContact': {
        if (!confirm('Hapus kontak ini?')) return;
        var ca = ensureArr('contacts');
        var ci = ca.findIndex(function (x) {
          return x.id === id;
        });
        if (ci >= 0) {
          ca.splice(ci, 1);
          save();
          toast('Kontak dihapus', 'success');
          openContact();
        }
        break;
      }
      // Customer Category
      case 'addCustCat':
        addCustCatModal();
        break;
      case 'delCustCat': {
        var cIdx = parseInt(btn.dataset.idx);
        var cCats = ensureSettings('customerCategories', []);
        if (!isNaN(cIdx)) {
          cCats.splice(cIdx, 1);
          save();
          toast('Kategori dihapus', 'success');
          openCustomerCategory();
        }
        break;
      }
      // Supplier Category
      case 'addSuppCat':
        addSuppCatModal();
        break;
      case 'delSuppCat': {
        var sIdx = parseInt(btn.dataset.idx);
        var sCats = ensureSettings('supplierCategories', []);
        if (!isNaN(sIdx)) {
          sCats.splice(sIdx, 1);
          save();
          toast('Kategori dihapus', 'success');
          openSupplierCategory();
        }
        break;
      }
    }
  });

  window._masterExtras = {
    openEmployee: openEmployee,
    openContact: openContact,
    openCustomerCategory: openCustomerCategory,
    openSupplierCategory: openSupplierCategory,
  };
  console.log('[MasterExtras] Master extras ready');
})();
