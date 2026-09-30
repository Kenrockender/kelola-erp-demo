function renderMasterData() {
  const soCountByCustomer = {};
  for (const o of DB.salesOrders) {
    if (o.customer) {
      soCountByCustomer[o.customer] = (soCountByCustomer[o.customer] || 0) + 1;
    }
  }
  const poCountBySupplier = {};
  for (const o of DB.purchaseOrders) {
    if (o.supplier) {
      poCountBySupplier[o.supplier] = (poCountBySupplier[o.supplier] || 0) + 1;
    }
  }

  let custs = [...DB.customers];
  let supps = [...DB.suppliers];
  const totalCust = custs.length;
  const totalSupp = supps.length;
  custs = applyPage(custs, 'master_cust');
  supps = applyPage(supps, 'master_supp');

  function custRow(c) {
    const cnt = soCountByCustomer[c.name] || 0;
    return `<tr data-action="viewCustomer" data-id="${escapeHtml(c.id)}" style="cursor:pointer">
      <td class="td-p" style="font-size:13px;font-weight:700">${escapeHtml(c.name)}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(c.phone || '-')}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(c.address || '-')}</td>
      <td class="td-p" style="font-size:12px;font-weight:700">${cnt} SO</td>
      <td class="td-p">${actionBtns('Customer', c.id)}</td>
    </tr>`;
  }

  function suppRow(s) {
    const cnt = poCountBySupplier[s.name] || 0;
    return `<tr data-action="viewSupplier" data-id="${escapeHtml(s.id)}" style="cursor:pointer">
      <td class="td-p" style="font-size:13px;font-weight:700">${escapeHtml(s.name)}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(s.contact || '-')}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(s.phone || '-')}</td>
      <td class="td-p" style="font-size:12px;color:var(--muted)">${escapeHtml(s.address || '-')}</td>
      <td class="td-p" style="font-size:12px;font-weight:700">${cnt} PO</td>
      <td class="td-p">${actionBtns('Supplier', s.id)}</td>
    </tr>`;
  }

  return `
  ${secHdr('Master Data', 'Kelola data pelanggan dan supplier')}
  ${statRow([
    { label: 'Total Pelanggan', value: String(DB.customers.length), sub: 'Data aktif' },
    { label: 'Total Supplier', value: String(DB.suppliers.length), sub: 'Rekanan pembelian' },
    { label: 'SO Terhubung', value: String(DB.salesOrders.length), sub: 'Ke pelanggan terdaftar' },
    {
      label: 'PO Terhubung',
      value: String(DB.purchaseOrders.length),
      sub: 'Ke supplier terdaftar',
    },
  ])}

  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">Pelanggan</div>
      <button class="btn" data-action="addCustomer" style="font-size:12px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Tambah Pelanggan
      </button>
    </div>
    <div class="table-wrap">
      <table>
        ${tblHdr(['Nama', 'Telepon', 'Alamat', 'Riwayat SO', 'Aksi'])}
        <tbody>
          ${
            custs.length === 0
              ? `<tr><td colspan="5" class="td-empty">Belum ada pelanggan terdaftar.</td></tr>`
              : custs.map(custRow).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalCust, 'master_cust')}
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:700">Supplier</div>
      <button class="btn" data-action="addSupplier" style="font-size:12px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Tambah Supplier
      </button>
    </div>
    <div class="table-wrap">
      <table>
        ${tblHdr(['Nama', 'Kontak', 'Telepon', 'Alamat', 'Riwayat PO', 'Aksi'])}
        <tbody>
          ${
            supps.length === 0
              ? `<tr><td colspan="6" class="td-empty">Belum ada supplier terdaftar.</td></tr>`
              : supps.map(suppRow).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalSupp, 'master_supp')}
  </div>`;
}
