// ══════════════════════════════════════════════════════════════════════════════
//  ASSET EXTRAS  — Asset per Location · FA Category · Fiscal FA Category ·
//                  Fixed Asset Edited · FA Disposition · Asset Transfer
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function save() {
    window.saveDB && window.saveDB();
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }
  function modal(t, b, f, w) {
    window.openModal && window.openModal(t, b, f || '', w);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  var TH =
    'text-align:left;padding:10px 14px;font-size:11px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)';

  function injectView(html) {
    window.invalidateView && window.invalidateView('assets');
    window.navigate && window.navigate('assets');
    setTimeout(function () {
      var el = document.getElementById('view-assets');
      if (el) el.innerHTML = html;
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASSET PER LOCATION
  // ══════════════════════════════════════════════════════════════════════════
  function openAssetPerLocation() {
    // Gather assets from DB.assets (from erp-view.js native assets view)
    var assets = db().assets || db().fixedAssets || [];

    // If no assets in DB, try to build from inventoryItems tagged as asset
    if (!assets.length && db().inventoryItems) {
      assets = (db().inventoryItems || []).filter(function (it) {
        return it.category === 'Asset' || it.type === 'Asset' || it.assetType;
      });
    }

    // Group by location
    var locMap = {};
    assets.forEach(function (a) {
      var loc = a.location || a.lokasi || a.department || 'Tidak Ditentukan';
      if (!locMap[loc]) locMap[loc] = [];
      locMap[loc].push(a);
    });

    var locations = Object.keys(locMap).sort();

    // Stats
    var totalAssets = assets.length;
    var totalValue = assets.reduce(function (s, a) {
      return s + (a.value || a.purchasePrice || a.cost || a.hargaBeli || 0);
    }, 0);
    var totalNetBook = assets.reduce(function (s, a) {
      return s + (a.bookValue || a.netBookValue || a.value || a.purchasePrice || a.cost || 0);
    }, 0);

    if (!assets.length) {
      injectView(
        '<div class="sec-hdr"><div><h1>Asset per Location</h1><p>Daftar aset dikelompokkan berdasarkan lokasi</p></div></div>' +
          '<div class="card" style="text-align:center;padding:40px">' +
          '<div style="font-size:36px;margin-bottom:12px">🏗️</div>' +
          '<div style="font-size:15px;font-weight:700;margin-bottom:6px">Belum ada data aset</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-bottom:16px">Tambahkan aset melalui menu Fixed Assets atau tandai item inventory sebagai aset</div>' +
          '<button class="btn-ghost" data-action="navAssets">Buka Fixed Assets</button></div>'
      );
      return;
    }

    var locationCards = locations
      .map(function (loc) {
        var locAssets = locMap[loc];
        var locValue = locAssets.reduce(function (s, a) {
          return s + (a.value || a.purchasePrice || a.cost || a.hargaBeli || 0);
        }, 0);
        var locNetBook = locAssets.reduce(function (s, a) {
          return s + (a.bookValue || a.netBookValue || a.value || a.purchasePrice || a.cost || 0);
        }, 0);
        var pct = totalValue > 0 ? Math.round((locValue / totalValue) * 100) : 0;

        var assetRows = locAssets
          .map(function (a) {
            var val = a.value || a.purchasePrice || a.cost || a.hargaBeli || 0;
            var nbv = a.bookValue || a.netBookValue || val;
            var dep = val > 0 ? Math.round(((val - nbv) / val) * 100) : 0;
            var statusColor = dep > 80 ? '#DC2626' : dep > 50 ? '#F97316' : '#15803D';
            return (
              '<tr>' +
              '<td class="td-p" style="font-size:12px">' +
              esc(a.name || a.itemName || a.description || a.id) +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(a.category || a.assetType || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(a.serialNo || a.kodeAset || a.id || '—') +
              '</td>' +
              '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
              esc(a.purchaseDate || a.tanggalBeli || '—') +
              '</td>' +
              '<td class="td-p" style="text-align:right">' +
              money(val) +
              '</td>' +
              '<td class="td-p" style="text-align:right;font-weight:700">' +
              money(nbv) +
              '</td>' +
              '<td class="td-p" style="text-align:center">' +
              '<span style="font-size:11px;font-weight:700;color:' +
              statusColor +
              '">' +
              dep +
              '%</span>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        return (
          '<div class="card" style="margin-bottom:14px">' +
          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">' +
          '<div style="width:36px;height:36px;border-radius:8px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none">📍</div>' +
          '<div style="flex:1">' +
          '<div style="font-size:14px;font-weight:700">' +
          esc(loc) +
          '</div>' +
          '<div style="font-size:11px;color:var(--muted)">' +
          locAssets.length +
          ' aset · Nilai buku neto ' +
          money(locNetBook) +
          '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
          '<div style="font-size:13px;font-weight:700">' +
          money(locValue) +
          '</div>' +
          '<div style="font-size:10px;color:var(--muted)">' +
          pct +
          '% dari total</div>' +
          '</div>' +
          '</div>' +
          '<div style="height:5px;background:var(--border);border-radius:3px;margin-bottom:10px;overflow:hidden">' +
          '<div style="height:100%;background:#3B82F6;width:' +
          pct +
          '%;transition:width .3s"></div>' +
          '</div>' +
          '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
          '<thead><tr>' +
          '<th style="' +
          TH +
          '">Nama Aset</th><th style="' +
          TH +
          '">Kategori</th>' +
          '<th style="' +
          TH +
          '">Kode/Serial</th><th style="' +
          TH +
          '">Tgl Beli</th>' +
          '<th style="' +
          TH +
          'text-align:right">Harga Perolehan</th>' +
          '<th style="' +
          TH +
          'text-align:right">Nilai Buku</th>' +
          '<th style="' +
          TH +
          'text-align:center">Depresiasi</th>' +
          '</tr></thead>' +
          '<tbody>' +
          assetRows +
          '</tbody>' +
          '</table></div></div>'
        );
      })
      .join('');

    // Location distribution chart (simple)
    var chartBars = locations
      .slice(0, 8)
      .map(function (loc) {
        var pct =
          totalValue > 0
            ? Math.round(
                (locMap[loc].reduce(function (s, a) {
                  return s + (a.value || a.purchasePrice || a.cost || 0);
                }, 0) /
                  totalValue) *
                  100
              )
            : 0;
        return (
          '<div style="flex:1;text-align:center;min-width:60px">' +
          '<div style="display:flex;align-items:flex-end;justify-content:center;height:60px;margin-bottom:4px">' +
          '<div style="width:24px;background:#3B82F6;border-radius:3px 3px 0 0;height:' +
          pct +
          '%;min-height:2px" title="' +
          esc(loc) +
          ': ' +
          pct +
          '%"></div>' +
          '</div>' +
          '<div style="font-size:9px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60px;margin:0 auto">' +
          esc(loc.slice(0, 10)) +
          '</div>' +
          '<div style="font-size:10px;font-weight:700">' +
          pct +
          '%</div>' +
          '</div>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>Asset per Location</h1><p>Aset dikelompokkan berdasarkan lokasi/departemen</p></div>' +
        '<button class="btn-ghost" data-action="navAssets">Buka Fixed Assets</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Aset</div><div class="stat-val">' +
        totalAssets +
        '</div><div class="stat-sub">' +
        locations.length +
        ' lokasi</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Total Harga Perolehan</div><div class="stat-val" style="font-size:18px">' +
        money(totalValue) +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Total Nilai Buku</div><div class="stat-val" style="font-size:18px">' +
        money(totalNetBook) +
        '</div><div class="stat-sub">Setelah depresiasi</div></div>' +
        '</div>' +
        (locations.length > 1
          ? '<div class="card" style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Distribusi per Lokasi</div>' +
            '<div style="display:flex;gap:8px;align-items:flex-end">' +
            chartBars +
            '</div></div>'
          : '') +
        locationCards
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED HELPERS — settings stores, edit log, stat cards
  // ══════════════════════════════════════════════════════════════════════════
  function ensureS() {
    var d = db();
    d.settings = d.settings || {};
    var s = d.settings;
    s.assets = s.assets || [];
    s.assetCategories = s.assetCategories || [];
    s.assetFiscalCategories = s.assetFiscalCategories || [];
    s.assetEditLog = s.assetEditLog || [];
    s.assetTransfers = s.assetTransfers || [];
    return s;
  }

  function activeAssets() {
    return ensureS().assets.filter(function (a) {
      return a.status !== 'Disposed';
    });
  }

  function logEdit(asset, fieldLabel, from, to) {
    ensureS().assetEditLog.unshift({
      ts: Date.now(),
      date: today(),
      assetId: asset.id,
      assetName: asset.name,
      field: fieldLabel,
      from: from == null ? '' : String(from),
      to: to == null ? '' : String(to),
    });
  }

  function confirmD(title, msg, fn) {
    if (window.confirmDialog) {
      window.confirmDialog(title, msg, fn);
    } else if (window.confirm(msg)) {
      fn();
    }
  }

  function assetOptions(list) {
    return list
      .map(function (a) {
        return '<option value="' + esc(a.id) + '">' + esc(a.id + ' — ' + (a.name || '')) + '</option>';
      })
      .join('');
  }

  function findAsset(id) {
    return ensureS().assets.find(function (a) {
      return a.id === id;
    });
  }

  function statRow(stats) {
    return (
      '<div class="stat-row" style="grid-template-columns:repeat(' +
      stats.length +
      ',1fr);margin-bottom:16px">' +
      stats
        .map(function (st) {
          return (
            '<div class="card stat-card"><div class="stat-label">' +
            st[0] +
            '</div><div class="stat-val" style="font-size:18px">' +
            st[1] +
            '</div>' +
            (st[2] ? '<div class="stat-sub">' + st[2] + '</div>' : '') +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function emptyCard(icon, title, sub) {
    return (
      '<div class="card" style="text-align:center;padding:40px">' +
      '<div style="font-size:36px;margin-bottom:12px">' +
      icon +
      '</div>' +
      '<div style="font-size:15px;font-weight:700;margin-bottom:6px">' +
      title +
      '</div>' +
      '<div style="font-size:13px;color:var(--muted)">' +
      sub +
      '</div></div>'
    );
  }

  function tableCard(headHtml, bodyHtml) {
    return (
      '<div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
      headHtml +
      '</tr></thead><tbody>' +
      bodyHtml +
      '</tbody></table></div></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIXED ASSET CATEGORY  &  FISCAL FA CATEGORY  (shared manager)
  // ══════════════════════════════════════════════════════════════════════════
  // Indonesian tax depreciation groups (UU PPh Art. 11, straight-line rates)
  var FISCAL_REF = [
    { name: 'Golongan 1', life: '4 tahun', rate: 0.25 },
    { name: 'Golongan 2', life: '8 tahun', rate: 0.125 },
    { name: 'Golongan 3', life: '16 tahun', rate: 0.0625 },
    { name: 'Golongan 4', life: '20 tahun', rate: 0.05 },
    { name: 'Bangunan Permanen', life: '20 tahun', rate: 0.05 },
    { name: 'Bangunan Tidak Permanen', life: '10 tahun', rate: 0.1 },
  ];

  function fiscalRef(name) {
    var n = String(name || '')
      .trim()
      .toLowerCase();
    if (!n) return null;
    for (var i = 0; i < FISCAL_REF.length; i++) {
      if (FISCAL_REF[i].name.toLowerCase() === n) return FISCAL_REF[i];
    }
    return null;
  }

  function getCfg(type) {
    if (type === 'fis') {
      return {
        type: 'fis',
        key: 'assetFiscalCategories',
        field: 'fiscalCategory',
        title: 'Fiscal FA Category',
        sub: 'Kategori fiskal aset tetap (golongan penyusutan pajak)',
        noun: 'kategori fiskal',
        reopen: openFiscalCategory,
      };
    }
    return {
      type: 'cat',
      key: 'assetCategories',
      field: 'category',
      title: 'Fixed Asset Category',
      sub: 'Kelola kategori aset tetap',
      noun: 'kategori',
      reopen: openAssetCategory,
    };
  }

  function renderCatManager(cfg) {
    var s = ensureS();
    var names = s[cfg.key].slice();
    // Include values present on assets but missing from the settings list
    s.assets.forEach(function (a) {
      var v = a[cfg.field];
      if (v && v !== '—' && names.indexOf(v) === -1) names.push(v);
    });
    names.sort();

    var isFiscal = cfg.type === 'fis';
    var rows = names
      .map(function (name) {
        var catAssets = s.assets.filter(function (a) {
          return (a[cfg.field] || '') === name;
        });
        var totalCost = catAssets.reduce(function (sum, a) {
          return sum + (a.cost || 0);
        }, 0);
        var ref = isFiscal ? fiscalRef(name) : null;
        var fiscalCells = isFiscal
          ? '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
            (ref ? ref.life + ' · ' + ref.rate * 100 + '%' : '—') +
            '</td>' +
            '<td class="td-p" style="text-align:right;font-size:12px">' +
            (ref && totalCost > 0 ? money(Math.round(totalCost * ref.rate)) : '—') +
            '</td>'
          : '';
        return (
          '<tr>' +
          '<td class="td-p" style="font-weight:600;font-size:12px">' +
          esc(name) +
          '</td>' +
          '<td class="td-p" style="text-align:center">' +
          catAssets.length +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(totalCost) +
          '</td>' +
          fiscalCells +
          '<td class="td-p" style="text-align:right;white-space:nowrap">' +
          '<button class="btn-ghost" style="padding:4px 10px;font-size:11px" data-action="axRenCat" data-type="' +
          cfg.type +
          '" data-cat="' +
          esc(name) +
          '">Ubah</button> ' +
          (catAssets.length === 0
            ? '<button class="btn-ghost" style="padding:4px 10px;font-size:11px;color:#DC2626" data-action="axDelCat" data-type="' +
              cfg.type +
              '" data-cat="' +
              esc(name) +
              '">Hapus</button>'
            : '') +
          '</td></tr>'
        );
      })
      .join('');

    var head =
      '<th style="' +
      TH +
      '">Nama</th><th style="' +
      TH +
      'text-align:center">Jumlah Aset</th><th style="' +
      TH +
      'text-align:right">Total Perolehan</th>' +
      (isFiscal
        ? '<th style="' +
          TH +
          '">Masa Manfaat · Tarif</th><th style="' +
          TH +
          'text-align:right">Penyusutan/Tahun</th>'
        : '') +
      '<th style="' +
      TH +
      '"></th>';

    var refCard = '';
    if (isFiscal) {
      refCard =
        '<div class="card" style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Referensi Golongan Fiskal (Garis Lurus, UU PPh Pasal 11)</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        FISCAL_REF.map(function (r) {
          return (
            '<div style="flex:1;min-width:140px;padding:8px 12px;background:var(--bg);border-radius:8px">' +
            '<div style="font-size:12px;font-weight:700">' +
            r.name +
            '</div><div style="font-size:11px;color:var(--muted)">' +
            r.life +
            ' · tarif ' +
            r.rate * 100 +
            '%/tahun</div></div>'
          );
        }).join('') +
        '</div></div>';
    }

    injectView(
      '<div class="sec-hdr"><div><h1>' +
        cfg.title +
        '</h1><p>' +
        cfg.sub +
        '</p></div>' +
        '<button class="btn" data-action="axAddCat" data-type="' +
        cfg.type +
        '">+ Tambah</button></div>' +
        refCard +
        (names.length
          ? tableCard(head, rows)
          : emptyCard('🗂️', 'Belum ada ' + cfg.noun, 'Klik "+ Tambah" untuk membuat ' + cfg.noun + ' baru'))
    );
  }

  function openAssetCategory() {
    renderCatManager(getCfg('cat'));
  }
  function openFiscalCategory() {
    renderCatManager(getCfg('fis'));
  }

  function addCatModal(cfg) {
    modal(
      'Tambah ' + cfg.title,
      '<div class="form-group"><label class="form-label">Nama ' +
        cfg.noun +
        '</label><input class="form-input" id="axc-name" type="text" placeholder="' +
        (cfg.type === 'fis' ? 'Golongan 1' : 'Kendaraan') +
        '"' +
        (cfg.type === 'fis' ? ' list="axc-ref-list"' : '') +
        '>' +
        (cfg.type === 'fis'
          ? '<datalist id="axc-ref-list">' +
            FISCAL_REF.map(function (r) {
              return '<option value="' + r.name + '"></option>';
            }).join('') +
            '</datalist>'
          : '') +
        '</div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button><button class="btn" id="axc-save">Simpan</button>'
    );
    setTimeout(function () {
      var saveBtn = document.getElementById('axc-save');
      if (!saveBtn) return;
      saveBtn.addEventListener('click', function () {
        var name = (document.getElementById('axc-name').value || '').trim();
        if (!name) {
          toast('Nama harus diisi', 'warning');
          return;
        }
        var s = ensureS();
        if (s[cfg.key].indexOf(name) !== -1) {
          toast('Kategori sudah ada', 'warning');
          return;
        }
        s[cfg.key].unshift(name);
        save();
        closeM();
        toast('Kategori "' + name + '" ditambahkan');
        cfg.reopen();
      });
    }, 0);
  }

  function renameCatModal(cfg, oldName) {
    modal(
      'Ubah ' + cfg.title,
      '<div class="form-group"><label class="form-label">Nama ' +
        cfg.noun +
        '</label><input class="form-input" id="axc-name" type="text" value="' +
        esc(oldName) +
        '"></div>' +
        '<div style="font-size:11px;color:var(--muted)">Semua aset dengan ' +
        cfg.noun +
        ' ini akan ikut diperbarui.</div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button><button class="btn" id="axc-save">Simpan</button>'
    );
    setTimeout(function () {
      var saveBtn = document.getElementById('axc-save');
      if (!saveBtn) return;
      saveBtn.addEventListener('click', function () {
        var name = (document.getElementById('axc-name').value || '').trim();
        if (!name) {
          toast('Nama harus diisi', 'warning');
          return;
        }
        if (name === oldName) {
          closeM();
          return;
        }
        var s = ensureS();
        var idx = s[cfg.key].indexOf(oldName);
        if (idx !== -1) {
          s[cfg.key][idx] = name;
        } else {
          s[cfg.key].unshift(name);
        }
        var touched = 0;
        s.assets.forEach(function (a) {
          if ((a[cfg.field] || '') === oldName) {
            a[cfg.field] = name;
            touched++;
          }
        });
        save();
        closeM();
        toast('Kategori diubah' + (touched ? ' · ' + touched + ' aset diperbarui' : ''));
        cfg.reopen();
      });
    }, 0);
  }

  function deleteCat(cfg, name) {
    var s = ensureS();
    var inUse = s.assets.some(function (a) {
      return (a[cfg.field] || '') === name;
    });
    if (inUse) {
      toast('Masih dipakai aset — tidak bisa dihapus', 'warning');
      return;
    }
    confirmD('Hapus Kategori', 'Hapus ' + cfg.noun + ' "' + name + '"?', function () {
      s[cfg.key] = s[cfg.key].filter(function (c) {
        return c !== name;
      });
      save();
      toast('Kategori dihapus');
      cfg.reopen();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FIXED ASSET EDITED — riwayat perubahan data aset
  // ══════════════════════════════════════════════════════════════════════════
  var FIELD_LABELS = {
    name: 'Nama',
    category: 'Kategori',
    fiscalCategory: 'Kategori Fiskal',
    acquired: 'Tgl Perolehan',
    cost: 'Nilai Perolehan',
    location: 'Lokasi',
    status: 'Status',
    notes: 'Catatan',
  };

  function openAssetEdited() {
    var s = ensureS();
    var log = s.assetEditLog;
    var touchedAssets = {};
    log.forEach(function (l) {
      touchedAssets[l.assetId] = true;
    });

    var rows = log
      .map(function (l) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted);white-space:nowrap">' +
          esc(l.date || '') +
          '</td>' +
          '<td class="td-p" style="font-size:12px;font-weight:600">' +
          esc(l.assetId + ' — ' + (l.assetName || '')) +
          '</td>' +
          '<td class="td-p" style="font-size:12px">' +
          esc(l.field || '') +
          '</td>' +
          '<td class="td-p" style="font-size:12px;color:#DC2626">' +
          esc(l.from === '' ? '—' : l.from) +
          '</td>' +
          '<td class="td-p" style="font-size:12px;color:#15803D;font-weight:600">' +
          esc(l.to === '' ? '—' : l.to) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>Fixed Asset Edited</h1><p>Riwayat perubahan data aset tetap</p></div>' +
        '<button class="btn" data-action="axEditAsset">Edit Aset</button></div>' +
        statRow([
          ['Total Perubahan', String(log.length), 'Entri tercatat'],
          ['Aset Terdampak', String(Object.keys(touchedAssets).length), ''],
          ['Total Aset', String(s.assets.length), ''],
        ]) +
        (log.length
          ? tableCard(
              '<th style="' +
                TH +
                '">Tanggal</th><th style="' +
                TH +
                '">Aset</th><th style="' +
                TH +
                '">Field</th><th style="' +
                TH +
                '">Sebelum</th><th style="' +
                TH +
                '">Sesudah</th>',
              rows
            )
          : emptyCard(
              '📝',
              'Belum ada riwayat perubahan',
              'Perubahan yang dilakukan lewat tombol "Edit Aset" di halaman ini akan tercatat di sini'
            ))
    );
  }

  function editAssetModal() {
    var s = ensureS();
    if (!s.assets.length) {
      toast('Belum ada aset', 'warning');
      return;
    }
    modal(
      'Edit Aset (Tercatat)',
      '<div class="form-group"><label class="form-label">Pilih Aset</label>' +
        '<select class="form-select" id="axe-asset">' +
        assetOptions(s.assets) +
        '</select></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Nama Aset</label><input class="form-input" id="axe-name" type="text"></div>' +
        '<div class="form-group"><label class="form-label">Kategori</label><input class="form-input" id="axe-category" type="text"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Lokasi</label><input class="form-input" id="axe-location" type="text"></div>' +
        '<div class="form-group"><label class="form-label">Nilai Perolehan</label><input class="form-input" id="axe-cost" type="number" min="0"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Kategori Fiskal</label><input class="form-input" id="axe-fiscal" type="text"></div>' +
        '<div class="form-group"><label class="form-label">Status</label><select class="form-select" id="axe-status">' +
        '<option value="OK">Normal</option><option value="Maintenance">Servis/Perbaikan</option><option value="Disposed">Dilepas</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Catatan</label><input class="form-input" id="axe-notes" type="text"></div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button><button class="btn" id="axe-save">Simpan &amp; Catat</button>'
    );
    setTimeout(function () {
      var sel = document.getElementById('axe-asset');
      if (!sel) return;
      function val(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
      }
      function setVal(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = v == null ? '' : v;
      }
      function fill() {
        var a = findAsset(sel.value);
        if (!a) return;
        setVal('axe-name', a.name);
        setVal('axe-category', a.category === '—' ? '' : a.category);
        setVal('axe-location', a.location === '—' ? '' : a.location);
        setVal('axe-cost', a.cost || 0);
        setVal('axe-fiscal', a.fiscalCategory === '—' ? '' : a.fiscalCategory);
        setVal('axe-status', a.status || 'OK');
        setVal('axe-notes', a.notes);
      }
      sel.addEventListener('change', fill);
      fill();
      document.getElementById('axe-save').addEventListener('click', function () {
        var a = findAsset(sel.value);
        if (!a) {
          toast('Aset tidak ditemukan', 'danger');
          return;
        }
        var name = val('axe-name').trim();
        if (!name) {
          toast('Nama aset harus diisi', 'warning');
          return;
        }
        var changes = 0;
        function apply(field, newVal) {
          var oldVal = a[field] == null ? '' : a[field];
          if (String(oldVal) !== String(newVal)) {
            logEdit(a, FIELD_LABELS[field], oldVal, newVal);
            a[field] = newVal;
            changes++;
          }
        }
        apply('name', name);
        apply('category', val('axe-category').trim() || '—');
        apply('location', val('axe-location').trim() || '—');
        apply('cost', Number(val('axe-cost')) || 0);
        apply('fiscalCategory', val('axe-fiscal').trim() || '—');
        apply('status', val('axe-status'));
        apply('notes', val('axe-notes').trim());
        if (!changes) {
          toast('Tidak ada perubahan', 'info');
          return;
        }
        save();
        closeM();
        toast(changes + ' perubahan dicatat');
        openAssetEdited();
      });
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FA DISPOSITION — pelepasan aset tetap
  // ══════════════════════════════════════════════════════════════════════════
  function openFADisposition() {
    var s = ensureS();
    var disposed = s.assets.filter(function (a) {
      return a.status === 'Disposed';
    });
    var totalCost = disposed.reduce(function (sum, a) {
      return sum + (a.cost || 0);
    }, 0);
    var totalProceeds = disposed.reduce(function (sum, a) {
      return sum + (a.disposalProceeds || 0);
    }, 0);
    var diff = totalProceeds - totalCost;

    var rows = disposed
      .map(function (a) {
        var gain = (a.disposalProceeds || 0) - (a.cost || 0);
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:12px;font-weight:600">' +
          esc(a.id + ' — ' + (a.name || '')) +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted);white-space:nowrap">' +
          esc(a.disposedAt || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:12px">' +
          esc(a.disposalMethod || '—') +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(a.cost || 0) +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          money(a.disposalProceeds || 0) +
          '</td>' +
          '<td class="td-p" style="text-align:right;font-weight:700;color:' +
          (gain >= 0 ? '#15803D' : '#DC2626') +
          '">' +
          (gain >= 0 ? '+' : '−') +
          money(Math.abs(gain)) +
          '</td>' +
          '<td class="td-p" style="text-align:right">' +
          '<button class="btn-ghost" style="padding:4px 10px;font-size:11px" data-action="axUndoDisp" data-id="' +
          esc(a.id) +
          '">Batalkan</button>' +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>FA Disposition</h1><p>Pelepasan aset tetap — penjualan, penghapusbukuan, kehilangan</p></div>' +
        '<button class="btn" data-action="axNewDisp">+ Catat Pelepasan</button></div>' +
        statRow([
          ['Aset Dilepas', String(disposed.length), s.assets.length + ' aset total'],
          ['Nilai Perolehan Dilepas', money(totalCost), ''],
          ['Hasil Pelepasan', money(totalProceeds), ''],
          [
            'Selisih',
            (diff >= 0 ? '+' : '−') + money(Math.abs(diff)),
            diff >= 0 ? 'Laba pelepasan' : 'Rugi pelepasan',
          ],
        ]) +
        (disposed.length
          ? tableCard(
              '<th style="' +
                TH +
                '">Aset</th><th style="' +
                TH +
                '">Tgl Pelepasan</th><th style="' +
                TH +
                '">Metode</th><th style="' +
                TH +
                'text-align:right">Nilai Perolehan</th><th style="' +
                TH +
                'text-align:right">Hasil</th><th style="' +
                TH +
                'text-align:right">Selisih</th><th style="' +
                TH +
                '"></th>',
              rows
            )
          : emptyCard('♻️', 'Belum ada aset yang dilepas', 'Klik "+ Catat Pelepasan" untuk mencatat penjualan / penghapusan aset'))
    );
  }

  function dispositionModal() {
    var list = activeAssets();
    if (!list.length) {
      toast('Tidak ada aset aktif untuk dilepas', 'warning');
      return;
    }
    modal(
      'Catat Pelepasan Aset',
      '<div class="form-group"><label class="form-label">Aset</label>' +
        '<select class="form-select" id="axd-asset">' +
        assetOptions(list) +
        '</select></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Tanggal Pelepasan</label><input class="form-input" id="axd-date" type="date" value="' +
        today() +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Metode</label><select class="form-select" id="axd-method">' +
        '<option value="Dijual">Dijual</option><option value="Dihapusbukukan">Dihapusbukukan</option><option value="Hilang/Rusak">Hilang / Rusak</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Hasil Pelepasan (Rp)</label><input class="form-input" id="axd-proceeds" type="number" min="0" placeholder="0 jika tidak ada"></div>' +
        '<div class="form-group"><label class="form-label">Catatan</label><input class="form-input" id="axd-notes" type="text" placeholder="Opsional"></div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button><button class="btn" id="axd-save">Catat Pelepasan</button>'
    );
    setTimeout(function () {
      var saveBtn = document.getElementById('axd-save');
      if (!saveBtn) return;
      saveBtn.addEventListener('click', function () {
        var a = findAsset(document.getElementById('axd-asset').value);
        if (!a) {
          toast('Aset tidak ditemukan', 'danger');
          return;
        }
        var date = document.getElementById('axd-date').value;
        if (!date) {
          toast('Tanggal harus diisi', 'warning');
          return;
        }
        var method = document.getElementById('axd-method').value;
        var proceeds = Number(document.getElementById('axd-proceeds').value) || 0;
        var notes = (document.getElementById('axd-notes').value || '').trim();
        logEdit(a, 'Status', a.status || 'OK', 'Disposed (' + method + ')');
        a.status = 'Disposed';
        a.disposedAt = date;
        a.disposalMethod = method;
        a.disposalProceeds = proceeds;
        a.disposalNote = notes;
        save();
        closeM();
        toast('Pelepasan aset "' + a.name + '" dicatat');
        openFADisposition();
      });
    }, 0);
  }

  function undoDisposition(id) {
    var a = findAsset(id);
    if (!a) return;
    confirmD('Batalkan Pelepasan', 'Kembalikan aset "' + a.name + '" menjadi aktif?', function () {
      logEdit(a, 'Status', 'Disposed (' + (a.disposalMethod || '') + ')', 'OK');
      a.status = 'OK';
      delete a.disposedAt;
      delete a.disposalMethod;
      delete a.disposalProceeds;
      delete a.disposalNote;
      save();
      toast('Pelepasan dibatalkan — aset aktif kembali');
      openFADisposition();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASSET TRANSFER — pemindahan aset antar lokasi
  // ══════════════════════════════════════════════════════════════════════════
  function openAssetTransfer() {
    var s = ensureS();
    var transfers = s.assetTransfers;
    var thisMonth = today().slice(0, 7);
    var monthCount = transfers.filter(function (t) {
      return (t.date || '').slice(0, 7) === thisMonth;
    }).length;

    var rows = transfers
      .map(function (t) {
        return (
          '<tr>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted);white-space:nowrap">' +
          esc(t.date || '') +
          '</td>' +
          '<td class="td-p" style="font-size:12px;font-weight:600">' +
          esc(t.assetId + ' — ' + (t.assetName || '')) +
          '</td>' +
          '<td class="td-p" style="font-size:12px">' +
          esc(t.from || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:12px;font-weight:600;color:#15803D">' +
          esc(t.to || '—') +
          '</td>' +
          '<td class="td-p" style="font-size:11px;color:var(--muted)">' +
          esc(t.note || '') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>Asset Transfer</h1><p>Pemindahan aset tetap antar lokasi/departemen</p></div>' +
        '<button class="btn" data-action="axNewTrf">+ Transfer Aset</button></div>' +
        statRow([
          ['Total Transfer', String(transfers.length), 'Riwayat tercatat'],
          ['Bulan Ini', String(monthCount), thisMonth],
          ['Aset Aktif', String(activeAssets().length), ''],
        ]) +
        (transfers.length
          ? tableCard(
              '<th style="' +
                TH +
                '">Tanggal</th><th style="' +
                TH +
                '">Aset</th><th style="' +
                TH +
                '">Dari</th><th style="' +
                TH +
                '">Ke</th><th style="' +
                TH +
                '">Catatan</th>',
              rows
            )
          : emptyCard('🚚', 'Belum ada transfer aset', 'Klik "+ Transfer Aset" untuk memindahkan aset antar lokasi'))
    );
  }

  function transferModal() {
    var list = activeAssets();
    if (!list.length) {
      toast('Tidak ada aset aktif', 'warning');
      return;
    }
    var s = ensureS();
    var locations = [];
    s.assets.forEach(function (a) {
      if (a.location && a.location !== '—' && locations.indexOf(a.location) === -1) {
        locations.push(a.location);
      }
    });
    modal(
      'Transfer Aset',
      '<div class="form-group"><label class="form-label">Aset</label>' +
        '<select class="form-select" id="axt-asset">' +
        assetOptions(list) +
        '</select>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:4px" id="axt-from-info"></div></div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Lokasi Tujuan</label><input class="form-input" id="axt-to" type="text" list="axt-loc-list" placeholder="Gudang Utama">' +
        '<datalist id="axt-loc-list">' +
        locations
          .map(function (l) {
            return '<option value="' + esc(l) + '"></option>';
          })
          .join('') +
        '</datalist></div>' +
        '<div class="form-group"><label class="form-label">Tanggal</label><input class="form-input" id="axt-date" type="date" value="' +
        today() +
        '"></div>' +
        '</div>' +
        '<div class="form-group"><label class="form-label">Catatan</label><input class="form-input" id="axt-note" type="text" placeholder="Opsional"></div>',
      '<button class="btn-ghost" data-action="closeModal">Batal</button><button class="btn" id="axt-save">Transfer</button>'
    );
    setTimeout(function () {
      var sel = document.getElementById('axt-asset');
      if (!sel) return;
      function showFrom() {
        var a = findAsset(sel.value);
        var info = document.getElementById('axt-from-info');
        if (info) {
          info.textContent = a ? 'Lokasi saat ini: ' + (a.location || '—') : '';
        }
      }
      sel.addEventListener('change', showFrom);
      showFrom();
      document.getElementById('axt-save').addEventListener('click', function () {
        var a = findAsset(sel.value);
        if (!a) {
          toast('Aset tidak ditemukan', 'danger');
          return;
        }
        var to = (document.getElementById('axt-to').value || '').trim();
        if (!to) {
          toast('Lokasi tujuan harus diisi', 'warning');
          return;
        }
        var from = a.location || '—';
        if (to === from) {
          toast('Lokasi tujuan sama dengan lokasi saat ini', 'warning');
          return;
        }
        var date = document.getElementById('axt-date').value || today();
        var note = (document.getElementById('axt-note').value || '').trim();
        ensureS().assetTransfers.unshift({
          id: 'TRF-' + Date.now().toString(36).toUpperCase(),
          ts: Date.now(),
          date: date,
          assetId: a.id,
          assetName: a.name,
          from: from,
          to: to,
          note: note,
        });
        logEdit(a, 'Lokasi', from, to);
        a.location = to;
        save();
        closeM();
        toast('Aset "' + a.name + '" dipindah ke ' + to);
        openAssetTransfer();
      });
    }, 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'navAssets') {
      window.invalidateView && window.invalidateView('assets');
      window.navigate && window.navigate('assets');
    } else if (action === 'axAddCat') {
      addCatModal(getCfg(btn.dataset.type));
    } else if (action === 'axRenCat') {
      renameCatModal(getCfg(btn.dataset.type), btn.dataset.cat);
    } else if (action === 'axDelCat') {
      deleteCat(getCfg(btn.dataset.type), btn.dataset.cat);
    } else if (action === 'axEditAsset') {
      editAssetModal();
    } else if (action === 'axNewDisp') {
      dispositionModal();
    } else if (action === 'axUndoDisp') {
      undoDisposition(btn.dataset.id);
    } else if (action === 'axNewTrf') {
      transferModal();
    }
  });

  window._assetExtras = {
    openAssetPerLocation: openAssetPerLocation,
    openAssetCategory: openAssetCategory,
    openFiscalCategory: openFiscalCategory,
    openAssetEdited: openAssetEdited,
    openFADisposition: openFADisposition,
    openAssetTransfer: openAssetTransfer,
  };
  console.log('[AssetExtras] Asset extras ready (6 features)');
})();
