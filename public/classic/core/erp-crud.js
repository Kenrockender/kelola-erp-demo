// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — CRUD Module
// SO, PO (with line items), Inventory, DO, Customer, Supplier
// ═══════════════════════════════════════════════════════════════════════════════

// ── Pesanan Penjualan (Sales Order) — Accurate-style print template ───────────
// Builds the inner HTML for a Sales Order that visually matches the Accurate
// "Pesanan Penjualan" PDF: company header + logo, customer box, line table with
// the dark header bar, and the totals box (Sub Total / Diskon / PPN / Total).
function buildSalesOrderDoc(data) {
  const num = v => Math.round(Math.abs(v || 0)).toLocaleString('id-ID');
  const ID_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return escapeHtml(String(iso));
    return `${String(d.getDate()).padStart(2, '0')} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  const company = (DB.settings && DB.settings.company) || {};
  // Match the official letterhead, which omits the "PT" legal prefix.
  const companyName = (company.name || 'Demo').replace(/^PT\.?\s+/i, '');
  // The DB only stores a placeholder address ("-"); fall back to a generic
  // sample address so the printed document still has something to show.
  const defaultAddress = ['Jl. Contoh No. 1, Jakarta, Indonesia'];
  const addrRaw = (company.address || '').trim();
  const addressLines = addrRaw && addrRaw !== '-' ? addrRaw.split(/\r?\n/) : defaultAddress;

  const items = Array.isArray(DB.inventoryItems) ? DB.inventoryItems : [];
  const itemByName = {};
  items.forEach(it => {
    if (it && it.name && !(it.name in itemByName)) itemByName[it.name] = it;
  });

  const lines = data.lines || [];
  let lineDiscountTotal = 0;
  const rowsHtml = lines
    .map(l => {
      const it = items.find(x => String(x.id) === String(l.itemId)) || itemByName[l.itemName] || {};
      const code = l.itemCode || it.sku || '';
      const unit = l.unit || it.unit || '';
      const disc = l.discount || 0;
      lineDiscountTotal += disc;
      const lineTotal = (l.qty || 0) * (l.price || 0) - disc;
      return `<tr>
        <td class="so-code">${escapeHtml(code)}</td>
        <td>${escapeHtml(l.itemName || '')}</td>
        <td class="so-r">${num(l.qty)}</td>
        <td class="so-c">${escapeHtml(unit)}</td>
        <td class="so-r">${num(l.price)}</td>
        <td class="so-r">${num(disc)}</td>
        <td class="so-r">${num(lineTotal)}</td>
      </tr>`;
    })
    .join('');

  const subtotal =
    data.subtotal != null
      ? data.subtotal
      : lines.reduce((s, l) => s + (l.qty || 0) * (l.price || 0), 0);
  const discount = data.discount != null ? data.discount : lineDiscountTotal;
  const tax = data.tax || 0;
  const otherCost = data.otherCost || data.shippingCost || 0;
  const total = data.total != null ? data.total : subtotal - discount + tax + otherCost;

  const notesHtml = data.notes ? escapeHtml(data.notes).replace(/\r?\n/g, '<br>') : '';

  // Optional blocks — hidden when the underlying data is empty.
  const shipAddr = (data.shippingAddress || data.shipTo || '').trim();
  const shipBlock = shipAddr
    ? `<div class="so-label">Kirim ke:</div>
       <div class="so-box">${escapeHtml(shipAddr).replace(/\r?\n/g, '<br>')}</div>`
    : '';
  const term = data.paymentTerm || company.paymentTerm || '';
  const termRow = term ? `<tr><td>Pembayaran</td><td>: ${escapeHtml(String(term))}</td></tr>` : '';

  const logoUrl = `${location.origin}/logo-kelola-sq.png`;

  return `<style>
    .so-doc { font-family: Arial, sans-serif; color:#1a1a1a; font-size:12px; }
    .so-doc table { border-collapse:collapse; }
    .so-doc thead tr, .so-doc tfoot tr, .so-doc tbody tr { border:0; }
    .so-doc td, .so-doc th { padding:0; }
    .so-head { width:100%; }
    .so-head td { vertical-align:top; }
    .so-logo { width:120px; }
    .so-logo img { width:96px; height:auto; }
    .so-coname { font-size:26px; font-weight:bold; margin:0 0 4px; }
    .so-coaddr { color:#222; line-height:1.5; }
    .so-meta { width:100%; margin-top:20px; }
    .so-meta > div { display:inline-block; vertical-align:top; }
    .so-title { font-size:24px; color:#333; border-bottom:2px solid #1b3a5b; padding-bottom:4px; margin:0 0 8px; }
    .so-label { color:#444; padding:2px 0; }
    .so-box { background:#e7eaee; padding:8px 10px; line-height:1.5; }
    .so-info { width:100%; }
    .so-info td { padding:3px 0; }
    .so-info td:first-child { color:#444; width:90px; }
    .so-items { width:100%; margin-top:18px; }
    .so-items thead th { background:#1b3a5b; color:#fff; font-weight:bold; text-align:left; padding:9px 8px; border-right:1px solid #2e527a; }
    .so-items thead th:last-child { border-right:0; }
    .so-items tbody td { padding:8px; border-bottom:1px solid #d8dde3; }
    .so-items .so-code { white-space:nowrap; }
    .so-items .so-r { text-align:right; }
    .so-items .so-c { text-align:center; }
    .so-bottom { width:100%; margin-top:10px; }
    .so-bottom > td { vertical-align:top; }
    .so-tot { width:100%; }
    .so-tot td { padding:6px 10px; background:#e7eaee; }
    .so-tot td:last-child { text-align:right; }
    .so-tot tr.grand td { background:#1b3a5b; color:#fff; font-weight:bold; }
    .so-sep { border-top:1px dotted #555; margin:28px 0 10px; }
    .so-sign { padding-left:24px; }
    .so-sign .line { border-top:1px solid #000; width:200px; margin-top:70px; }
    .so-foot { text-align:right; color:#444; font-style:italic; margin-top:40px; }
  </style>
  <div class="so-doc">
    <table class="so-head"><tr>
      <td class="so-logo"><img src="${logoUrl}" alt=""></td>
      <td>
        <div class="so-coname">${escapeHtml(companyName)}</div>
        <div class="so-coaddr">${addressLines.map(escapeHtml).join('<br>')}</div>
      </td>
    </tr></table>

    <table class="so-meta"><tr>
      <td style="width:52%;padding-right:24px">
        <div class="so-label">Kepada</div>
        <div class="so-box"><strong>${escapeHtml(data.customerName || data.customer || '')}</strong></div>
        ${shipBlock}
      </td>
      <td style="width:48%;vertical-align:top">
        <div class="so-title">Pesanan Penjualan</div>
        <table class="so-info">
          <tr><td>Nomor</td><td>: ${escapeHtml(data.number || data.id || '')}</td></tr>
          <tr><td>Tanggal</td><td>: ${fmtDate(data.date)}</td></tr>
          <tr><td>Tgl Kirim</td><td>: ${fmtDate(data.shipDate || data.date)}</td></tr>
          ${termRow}
        </table>
      </td>
    </tr></table>

    <table class="so-items">
      <thead><tr>
        <th>Kode Barang</th><th>Nama Barang</th><th class="so-r">Qty</th>
        <th class="so-c">Unit</th><th class="so-r">@Harga</th><th class="so-r">Diskon</th><th class="so-r">Total Harga</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <table class="so-bottom"><tr>
      <td style="width:52%;padding-right:24px">
        ${notesHtml ? `<div class="so-label" style="border-bottom:1px solid #1b3a5b;padding-bottom:4px;margin-bottom:8px">Keterangan</div><div>${notesHtml}</div>` : ''}
      </td>
      <td style="width:48%">
        <table class="so-tot">
          <tr><td>Sub Total</td><td>${num(subtotal)}</td></tr>
          <tr><td>Diskon</td><td>${num(discount)}</td></tr>
          <tr><td>PPN (${data.taxRate ? Math.round(data.taxRate * 100) : 0}%)</td><td>${num(tax)}</td></tr>
          <tr><td>Biaya Lain-lain</td><td>${num(otherCost)}</td></tr>
          <tr class="grand"><td>Total</td><td>${num(total)}</td></tr>
        </table>
      </td>
    </tr></table>

    <div class="so-sep"></div>
    <div class="so-sign">
      Disetujui,
      <div class="line"></div>
      Tgl.
    </div>
    <div class="so-foot">Halaman 1 dari 1</div>
  </div>`;
}

// ── Pesanan Pembelian (Purchase Order) — Accurate-style print template ────────
function buildPurchaseOrderDoc(data) {
  const num = v => Math.round(Math.abs(v || 0)).toLocaleString('id-ID');
  const ID_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return escapeHtml(String(iso));
    return `${String(d.getDate()).padStart(2, '0')} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  const company = (DB.settings && DB.settings.company) || {};
  const companyName = (company.name || 'Demo').replace(/^PT\.?\s+/i, '');
  const defaultAddress = ['Jl. Contoh No. 1, Jakarta, Indonesia'];
  const addrRaw = (company.address || '').trim();
  const addressLines = addrRaw && addrRaw !== '-' ? addrRaw.split(/\r?\n/) : defaultAddress;

  const items = Array.isArray(DB.inventoryItems) ? DB.inventoryItems : [];
  const itemByName = {};
  items.forEach(it => {
    if (it && it.name && !(it.name in itemByName)) itemByName[it.name] = it;
  });

  const lines = data.lines || [];
  let lineDiscountTotal = 0;
  const rowsHtml = lines
    .map(l => {
      const it = items.find(x => String(x.id) === String(l.itemId)) || itemByName[l.itemName] || {};
      const code = l.itemCode || it.sku || '';
      const unit = l.unit || it.unit || '';
      const disc = l.lineDiscount || l.discount || 0;
      lineDiscountTotal += disc;
      const lineTotal = (l.qty || 0) * (l.price || 0) - disc;
      return `<tr>
      <td class="po-code">${escapeHtml(code)}</td>
      <td>${escapeHtml(l.itemName || '')}</td>
      <td class="po-r">${num(l.qty)}</td>
      <td class="po-c">${escapeHtml(unit)}</td>
      <td class="po-r">${num(l.price)}</td>
      <td class="po-r">${num(disc)}</td>
      <td class="po-r">${num(lineTotal)}</td>
    </tr>`;
    })
    .join('');

  const subtotal =
    data.subtotal != null
      ? data.subtotal
      : lines.reduce((s, l) => s + (l.qty || 0) * (l.price || 0), 0);
  const discount = data.discount != null ? data.discount : lineDiscountTotal;
  const ppnRate = data.taxRate != null ? data.taxRate : 0;
  const tax = data.tax != null ? data.tax : Math.round(((subtotal - discount) * ppnRate) / 100);
  // PPH 23 = 2% withholding tax (informational, not added to total)
  const pph23 = Math.round((subtotal - discount) * 0.02);
  const total = data.total != null ? data.total : subtotal - discount + tax;

  const notesHtml = data.notes ? escapeHtml(data.notes).replace(/\r?\n/g, '<br>') : '';

  const suppObj = (DB.suppliers || []).find(s => s.name === data.supplier);
  const suppAddress = suppObj && suppObj.address ? suppObj.address : '';
  const shipTo = (data.shipTo || data.shippingAddress || '').trim();
  const term = data.paymentTerm || data.dueDate || company.paymentTerm || '';
  const termRow = term ? `<tr><td>Pembayaran</td><td>: ${escapeHtml(String(term))}</td></tr>` : '';

  const logoUrl = `${location.origin}/logo-kelola-sq.png`;

  return `<style>
    .po-doc { font-family: Arial, sans-serif; color:#1a1a1a; font-size:12px; }
    .po-doc table { border-collapse:collapse; }
    .po-doc td, .po-doc th { padding:0; }
    .po-head { width:100%; }
    .po-head td { vertical-align:top; }
    .po-logo { width:120px; }
    .po-logo img { width:96px; height:auto; }
    .po-coname { font-size:26px; font-weight:bold; margin:0 0 4px; }
    .po-coaddr { color:#222; line-height:1.5; }
    .po-meta { width:100%; margin-top:20px; }
    .po-title { font-size:24px; color:#333; border-bottom:2px solid #1b3a5b; padding-bottom:4px; margin:0 0 8px; }
    .po-label { color:#444; padding:2px 0; }
    .po-box { background:#e7eaee; padding:8px 10px; line-height:1.5; }
    .po-info { width:100%; }
    .po-info td { padding:3px 0; }
    .po-info td:first-child { color:#444; width:100px; }
    .po-items { width:100%; margin-top:18px; }
    .po-items thead th { background:#1b3a5b; color:#fff; font-weight:bold; text-align:left; padding:9px 8px; border-right:1px solid #2e527a; }
    .po-items thead th:last-child { border-right:0; }
    .po-items tbody td { padding:8px; border-bottom:1px solid #d8dde3; }
    .po-items .po-code { white-space:nowrap; }
    .po-items .po-r { text-align:right; }
    .po-items .po-c { text-align:center; }
    .po-bottom { width:100%; margin-top:10px; }
    .po-bottom > td { vertical-align:top; }
    .po-tot { width:100%; }
    .po-tot td { padding:6px 10px; background:#e7eaee; }
    .po-tot td:last-child { text-align:right; }
    .po-tot tr.grand td { background:#1b3a5b; color:#fff; font-weight:bold; }
    .po-sep { border-top:1px dotted #555; margin:28px 0 10px; }
    .po-sign { padding-left:24px; }
    .po-sign .line { border-top:1px solid #000; width:200px; margin-top:70px; }
    .po-foot { text-align:right; color:#444; font-style:italic; margin-top:40px; }
  </style>
  <div class="po-doc">
    <table class="po-head"><tr>
      <td class="po-logo"><img src="${logoUrl}" alt=""></td>
      <td>
        <div class="po-coname">${escapeHtml(companyName)}</div>
        <div class="po-coaddr">${addressLines.map(escapeHtml).join('<br>')}</div>
      </td>
    </tr></table>

    <table class="po-meta"><tr>
      <td style="width:52%;padding-right:24px">
        <div class="po-label">Kepada</div>
        <div class="po-box">
          <strong>${escapeHtml(data.supplier || '')}</strong>
          ${suppAddress ? '<br>' + escapeHtml(suppAddress).replace(/\r?\n/g, '<br>') : ''}
        </div>
        ${
          shipTo
            ? `<div class="po-label" style="margin-top:8px">Kirim ke:</div>
        <div class="po-box">${escapeHtml(shipTo).replace(/\r?\n/g, '<br>')}</div>`
            : ''
        }
      </td>
      <td style="width:48%;vertical-align:top">
        <div class="po-title">Pesanan Pembelian</div>
        <table class="po-info">
          <tr><td>Nomor</td><td>: ${escapeHtml(data.id || '')}</td></tr>
          <tr><td>Tanggal</td><td>: ${fmtDate(data.date)}</td></tr>
          <tr><td>Tanggal Kirim</td><td>: ${fmtDate(data.shipDate || data.date)}</td></tr>
          ${termRow}
        </table>
      </td>
    </tr></table>

    <table class="po-items">
      <thead><tr>
        <th>Kode Barang</th><th>Nama Barang</th><th class="po-r">Qty.</th>
        <th class="po-c">Satuan</th><th class="po-r">@Harga</th><th class="po-r">Diskon</th><th class="po-r">Total</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <table class="po-bottom"><tr>
      <td style="width:52%;padding-right:24px">
        ${notesHtml ? `<div class="po-label" style="border-bottom:1px solid #1b3a5b;padding-bottom:4px;margin-bottom:8px">Keterangan</div><div>${notesHtml}</div>` : ''}
      </td>
      <td style="width:48%">
        <table class="po-tot">
          <tr><td>Sub Total</td><td>${num(subtotal)}</td></tr>
          <tr><td>Diskon</td><td>${num(discount)}</td></tr>
          <tr><td>PPN (${ppnRate}%)</td><td>${num(tax)}</td></tr>
          <tr><td>PPH 23 - 2%</td><td>${num(pph23)}</td></tr>
          <tr class="grand"><td>Total</td><td>${num(total)}</td></tr>
        </table>
      </td>
    </tr></table>

    <div class="po-sep"></div>
    <div class="po-sign">
      Bagian Pembelian
      <div class="line"></div>
      Tgl.
    </div>
    <div class="po-foot">Halaman 1 dari 1</div>
  </div>`;
}

// ── Surat Jalan (Delivery Order) — replica of 039-brik loco.xlsx layout ───────
function buildDeliveryOrderDoc(data) {
  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return escapeHtml(String(iso));
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const company = (DB.settings && DB.settings.company) || {};
  const companyName = (company.name || 'DEMO').toUpperCase();
  const addr1 = company.address || 'Jl. Contoh No. 1, Jakarta, Indonesia';
  const addr2 = '';
  const addr3 = '';
  const phone = company.phone || '021-0000-0000';

  const linkedSO = data.soId ? (DB.salesOrders || []).find(s => s.id === data.soId) : null;
  const linkedPO = data.poId ? (DB.purchaseOrders || []).find(p => p.id === data.poId) : null;
  const topPO = data.poId || data.soId || '';
  const customerPO = data.customerPO || '';

  // Prefer `lines` (kept current by manual edits) over the imported `items`.
  let doLines = (data.lines && data.lines.length ? data.lines : data.items) || [];
  if (doLines.length === 0 && linkedSO) doLines = linkedSO.lines || linkedSO.items || [];
  if (doLines.length === 0 && linkedPO) doLines = linkedPO.lines || linkedPO.items || [];

  const invItems = Array.isArray(DB.inventoryItems) ? DB.inventoryItems : [];

  const totalQty = doLines.reduce((s, l) => s + (l.qty || 0), 0);
  const firstLine = doLines.length > 0 ? doLines[0] : {};
  const firstInv = firstLine.itemId
    ? invItems.find(x => String(x.id) === String(firstLine.itemId))
    : null;
  const mainUnit = firstLine.unit || (firstInv && firstInv.unit) || '';
  const qtyPOStr =
    totalQty > 0 ? `${Math.round(totalQty).toLocaleString('id-ID')} ${mainUnit}` : '';

  const b = 'border:1px solid #000;';
  let rowNum = 0;
  const buildItemBlock = l => {
    rowNum++;
    const it = invItems.find(x => String(x.id) === String(l.itemId)) || {};
    const name = (l.itemName || it.name || '').toUpperCase();
    const unit = l.unit || it.unit || '';
    return `<tr>
      <td style="${b}padding:4px 6px;text-align:center;vertical-align:top">${rowNum}</td>
      <td style="${b}padding:4px 6px;vertical-align:top" colspan="5">${escapeHtml(name)}</td>
      <td style="${b}padding:4px 6px;text-align:right;vertical-align:top">&nbsp;</td>
      <td style="${b}padding:4px 6px;text-align:center;vertical-align:top">${escapeHtml(unit)}</td>
      <td style="${b}padding:4px 6px;vertical-align:top" colspan="3">&nbsp;</td>
    </tr>
    <tr>
      <td style="${b}padding:2px 6px" colspan="6"></td>
      <td style="${b}padding:2px 6px;font-size:11px;text-align:right">P=</td>
      <td style="${b}padding:2px 6px"></td>
      <td style="${b}padding:2px 6px" colspan="3"></td>
    </tr>
    <tr>
      <td style="${b}padding:2px 6px" colspan="6"></td>
      <td style="${b}padding:2px 6px;font-size:11px;text-align:right">L=</td>
      <td style="${b}padding:2px 6px"></td>
      <td style="${b}padding:2px 6px" colspan="3"></td>
    </tr>
    <tr>
      <td style="${b}padding:2px 6px" colspan="6"></td>
      <td style="${b}padding:2px 6px;font-size:11px;text-align:right">T=</td>
      <td style="${b}padding:2px 6px"></td>
      <td style="${b}padding:2px 6px" colspan="3"></td>
    </tr>`;
  };

  const rowsHtml =
    doLines.length > 0
      ? doLines.map(l => buildItemBlock(l)).join('')
      : buildItemBlock({ itemName: '', unit: '', qty: 0 });
  rowNum = 0;

  const driver = data.driver && data.driver !== '—' ? data.driver : '';
  const vehicle = data.vehicle && data.vehicle !== '—' ? data.vehicle : '';

  const logoUrl = `${location.origin}/logo-kelola-sq.png`;

  // Use a single 11-column master table matching Excel cols A-K
  // Widths: A=30px, B-F=flex(~50%), G=50px, H=50px, I-K=flex(~25%)
  return `<style>
    @media print {
      @page { size:A4 portrait; margin:12mm 15mm; }
      body { margin:0; }
    }
  </style>
  <table style="font-family:Arial,sans-serif;font-size:12px;color:#000;border-collapse:collapse;width:100%;table-layout:fixed" cellpadding="0" cellspacing="0">
    <colgroup>
      <col style="width:30px">
      <col><col><col><col><col>
      <col style="width:50px">
      <col style="width:50px">
      <col><col><col>
    </colgroup>

    <!-- ROW 2: Logo + Company name -->
    <tr>
      <td rowspan="4" style="width:30px;padding:4px 6px 4px 0;vertical-align:top">
        <img src="${logoUrl}" style="width:40px;height:auto" alt="">
      </td>
      <td colspan="7" style="font-size:14px;font-weight:bold;padding:2px 0">
        ${escapeHtml(companyName)}
      </td>
      <td style="font-size:12px;text-align:right;vertical-align:middle;padding-right:2px" rowspan="2">PO:</td>
      <td colspan="2" style="font-size:18px;font-weight:bold;text-align:left;vertical-align:middle;border:2px solid #000;padding:4px 8px;text-align:center" rowspan="2">
        ${escapeHtml(topPO)}
      </td>
    </tr>

    <!-- ROW 3: Address line 1 -->
    <tr>
      <td colspan="7" style="font-size:10px;padding:1px 0">${escapeHtml(addr1)}</td>
    </tr>

    <!-- ROW 4: Address line 2 -->
    <tr>
      <td colspan="10" style="font-size:10px;padding:1px 0">${escapeHtml(addr2)}</td>
    </tr>

    <!-- ROW 5: Address line 3 + phone -->
    <tr>
      <td colspan="4" style="font-size:10px;padding:1px 0">${escapeHtml(addr3)}</td>
      <td colspan="6" style="font-size:10px;padding:1px 0">Telp: ${escapeHtml(phone)}</td>
    </tr>

    <!-- ROW 6: SURAT JALAN title -->
    <tr>
      <td colspan="11" style="text-align:center;font-size:14px;font-weight:bold;letter-spacing:3px;border-top:2px solid #000;border-bottom:2px solid #000;padding:5px 0;margin:0">
        SURAT JALAN
      </td>
    </tr>

    <!-- ROW 7: Tgl. Surat Jalan -->
    <tr>
      <td colspan="3" style="padding:3px 0">Tgl. Surat Jalan</td>
      <td colspan="3" style="padding:3px 0">: ${fmtDate(data.date)}</td>
      <td colspan="5" style="padding:3px 0"></td>
    </tr>

    <!-- ROW 8: No. Surat Jalan + NO. POLISI -->
    <tr>
      <td colspan="3" style="padding:3px 0">No. Surat Jalan</td>
      <td colspan="3" style="padding:3px 0;font-weight:bold">: ${escapeHtml(data.number || data.id || '')}</td>
      <td colspan="2" style="padding:3px 0;white-space:nowrap">NO. POLISI</td>
      <td colspan="3" style="padding:3px 0;font-weight:bold">: ${escapeHtml(vehicle)}</td>
    </tr>

    <!-- ROW 9: No. PO + NAMA SUPIR -->
    <tr>
      <td colspan="3" style="padding:3px 0">No. PO</td>
      <td colspan="3" style="padding:3px 0">: ${escapeHtml(customerPO)}</td>
      <td colspan="2" style="padding:3px 0;white-space:nowrap">NAMA SUPIR</td>
      <td colspan="3" style="padding:3px 0">: ${escapeHtml(driver)}</td>
    </tr>

    <!-- ROW 10: QTY PO -->
    <tr>
      <td colspan="3" style="padding:3px 0">QTY PO</td>
      <td colspan="3" style="padding:3px 0">: ${escapeHtml(qtyPOStr)}</td>
      <td colspan="5" style="padding:3px 0"></td>
    </tr>

    <!-- ROW 11: Kepada Yth + Alamat Kirim labels -->
    <tr>
      <td colspan="6" style="padding:6px 0 1px;border-top:1px solid #999;font-size:10px">Kepada Yth:</td>
      <td colspan="5" style="padding:6px 0 1px;border-top:1px solid #999;font-size:10px">Alamat Kirim:</td>
    </tr>

    <!-- ROW 12: Customer name + Destination -->
    <tr>
      <td colspan="6" style="padding:1px 0 6px;font-weight:bold;font-size:12px">${escapeHtml(data.customer || data.customerName || '')}</td>
      <td colspan="5" style="padding:1px 0 6px;font-size:12px">${escapeHtml(data.destination || _getCustomerAddress(data.customer || data.customerName) || '')}</td>
    </tr>

    <!-- ROW 13-14: spacer -->
    <tr><td colspan="11" style="padding:2px 0"></td></tr>

    <!-- ROW 15: Items table header -->
    <tr>
      <td style="${b}padding:5px 4px;text-align:center;font-weight:bold;background:#f0f0f0">No.</td>
      <td style="${b}padding:5px 4px;text-align:center;font-weight:bold;background:#f0f0f0" colspan="5">NAMA BARANG</td>
      <td style="${b}padding:5px 4px;text-align:center;font-weight:bold;background:#f0f0f0" colspan="2">JUMLAH</td>
      <td style="${b}padding:5px 4px;text-align:center;font-weight:bold;background:#f0f0f0" colspan="3">Keterangan</td>
    </tr>

    <!-- Item rows -->
    ${rowsHtml}

    <!-- Spacer before signatures -->
    <tr><td colspan="11" style="height:20px"></td></tr>

    <!-- Signatures row -->
    <tr>
      <td colspan="4" style="text-align:center;padding:4px 0">PENERIMA</td>
      <td colspan="4" style="text-align:center;padding:4px 0">PENGIRIM</td>
      <td colspan="3" style="text-align:center;padding:4px 0">HORMAT KAMI</td>
    </tr>

    <!-- Signature space -->
    <tr><td colspan="11" style="height:60px"></td></tr>

    <!-- Signature lines -->
    <tr>
      <td colspan="4" style="text-align:center;padding:4px 0;border-top:1px solid #000">(..........................)</td>
      <td colspan="4" style="text-align:center;padding:4px 0;border-top:1px solid #000">(..........................)</td>
      <td colspan="3" style="text-align:center;padding:4px 0;font-weight:bold">${escapeHtml(companyName)}</td>
    </tr>
  </table>`;
}

// ── Print / Cetak Dokumen ─────────────────────────────────────────────────────
// Opens a new browser window with a print-ready version of SO, PO, or DO.
function printDocument(type, data) {
  let title, body;

  if (type === 'SO') {
    // ── Pesanan Penjualan — replica of the Accurate Sales Order layout ──────────
    body = buildSalesOrderDoc(data);
    title = `Pesanan Penjualan ${escapeHtml(data.number || data.id || '')}`;
  } else if (type === 'PO') {
    body = buildPurchaseOrderDoc(data);
    title = `Pesanan Pembelian ${escapeHtml(data.id || '')}`;
  } else if (type === 'DO') {
    const doDisplayNum =
      typeof docNum === 'function' ? docNum(data.number, data.id) : data.number || data.id;
    body = buildDeliveryOrderDoc(data);
    title = `Surat Jalan ${escapeHtml(doDisplayNum)}`;
  }

  const win = window.open('', '_blank', 'width=780,height=900');
  if (!win) {
    showToast('Pop-up diblokir browser — izinkan pop-up untuk mencetak', 'warning');
    return;
  }
  try {
    win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 14px; margin: 32px 40px; color: #1a1a1a; }
      table { width: 100%; border-collapse: collapse; }
      thead tr { border-bottom: 2px solid #000; }
      tfoot tr { border-top: 2px solid #000; }
      tbody tr { border-bottom: 1px solid #e5e7eb; }
      td, th { padding: 6px 8px; }
      @media print { body { margin: 0; } }
    </style>
  </head><body>${body}<script>window.onload=()=>window.print()</scr${''}ipt></body></html>`);
    win.document.close();
  } catch (e) {
    showToast('Pop-up diblokir browser — izinkan pop-up untuk mencetak', 'warning');
  }
}

const SO_STATUSES = [
  ['Draft', 'Draft'],
  ['Waiting on Process', 'Menunggu Proses'],
  ['Partially Processed', 'Diproses Sebagian'],
  ['Processed', 'Diproses'],
  ['Confirmed', 'Dikonfirmasi'],
  ['Paid', 'Lunas'],
  ['Delivered', 'Terkirim'],
  ['Cancelled', 'Dibatalkan'],
];
const PO_STATUSES = [
  ['Draft', 'Draft'],
  ['Waiting on Process', 'Menunggu Proses'],
  ['Partially Processed', 'Diproses Sebagian'],
  ['Processed', 'Diproses'],
  ['Confirmed', 'Dikonfirmasi'],
  ['Paid', 'Lunas'],
  ['Received', 'Diterima'],
  ['Cancelled', 'Dibatalkan'],
];
const DO_STATUSES = [
  ['Pending', 'Pending'],
  ['In Transit', 'Dalam Pengiriman'],
  ['Delivered', 'Terkirim'],
];
const ITEM_CATEGORIES = [
  'Granit',
  'Marmer',
  'Andesit',
  'Travertine',
  'Koral',
  'Candi',
  'Paras',
  'Batu Alam',
  'Lainnya',
];

function statusOptions(list, current) {
  // If the document carries a status outside the known list (e.g. legacy or
  // Accurate-imported values), keep it as a selectable option — otherwise the
  // browser silently falls back to the first option and a save would force an
  // unintended status change.
  const known = list.some(([v]) => v === current);
  const extra =
    current && !known
      ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
      : '';
  return (
    extra +
    list
      .map(
        ([v, l]) =>
          `<option value="${v}"${current === v ? ' selected' : ''}>${escapeHtml(l)}</option>`
      )
      .join('')
  );
}

function warehouseSelectHTML(selectedId) {
  const wh = window.Warehouse;
  if (!wh) return '';
  const list = wh.getWarehouses();
  if (list.length <= 1) return '';
  const sel = selectedId || wh.DEFAULT_WH_ID;
  const opts = list.map(w =>
    `<option value="${escapeHtml(w.id)}"${w.id === sel ? ' selected' : ''}>${escapeHtml(w.name)}</option>`
  ).join('');
  return `<div class="form-group">
    <label class="form-label">Gudang</label>
    <select class="form-select" id="order-warehouse">${opts}</select>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINE ITEMS — shared helper used by SO and PO forms
// priceField: "sell" for SO, "cost" for PO
// ═══════════════════════════════════════════════════════════════════════════════

function lineItemsHTML() {
  return `
  <div style="margin:14px 0 4px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span class="form-label" style="margin:0;font-size:13px;font-weight:700">Item Pesanan</span>
      <button type="button" class="btn-ghost" id="addLineBtn" style="font-size:11px;padding:4px 10px">+ Tambah Baris</button>
    </div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg)">
          <tr>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Item / Deskripsi</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:70px;border-bottom:1px solid var(--border)">Qty</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:46px;border-bottom:1px solid var(--border)">Sat.</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:120px;border-bottom:1px solid var(--border)">Harga (Rp)</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:110px;border-bottom:1px solid var(--border)">Diskon (Rp)</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:116px;border-bottom:1px solid var(--border)">Subtotal</th>
            <th style="width:30px;border-bottom:1px solid var(--border)"></th>
          </tr>
        </thead>
        <tbody id="linesBody"></tbody>
      </table>
    </div>
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;user-select:none">
          <input type="checkbox" id="ppnToggle">
          <span>Kenakan PPN (<span id="ppnRateLabel">11</span>%)</span>
        </label>
        <div style="text-align:right">
          <div id="ppnRow" style="display:none;font-size:12px;color:var(--muted);margin-bottom:4px">
            <span>DPP: <span id="linesDPP">Rp 0</span></span>
            <span style="margin-left:12px">PPN: <span id="linesPPN" style="color:#2563EB;font-weight:600">Rp 0</span></span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;justify-content:flex-end">
            <span style="font-size:12px;color:var(--muted)">Total:</span>
            <span id="linesGrandTotal" style="font-size:17px;font-weight:800">Rp 0</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// Returns a collectLines() function. Call after modal opens (setTimeout).
function initLineItems(priceField, existingLines) {
  const body = document.getElementById('linesBody');
  const totalEl = document.getElementById('linesGrandTotal');
  if (!body || !totalEl) {
    return null;
  }

  const ppnToggle = document.getElementById('ppnToggle');
  const ppnRow = document.getElementById('ppnRow');
  const dppEl = document.getElementById('linesDPP');
  const ppnEl = document.getElementById('linesPPN');
  const ppnRateLabel = document.getElementById('ppnRateLabel');
  const taxCfg = (DB.settings && DB.settings.tax) || {};
  const ppnRate = typeof taxCfg.ppnRate === 'number' ? taxCfg.ppnRate : 0.11;
  if (ppnRateLabel) ppnRateLabel.textContent = Math.round(ppnRate * 100);

  if (ppnToggle) {
    ppnToggle.addEventListener('change', calcTotal);
  }

  function calcTotal() {
    let t = 0;
    body.querySelectorAll('tr').forEach(tr => {
      const lineGross =
        (parseInt(tr.querySelector('.ln-qty')?.value) || 0) *
        (parseFloat(tr.querySelector('.ln-price')?.value) || 0);
      const disc = Math.max(0, parseFloat(tr.querySelector('.ln-disc')?.value) || 0);
      t += Math.max(0, lineGross - disc);
    });
    const dpp = Math.round(t);
    const usePPN = ppnToggle && ppnToggle.checked;
    const ppn = usePPN ? Math.round(dpp * ppnRate) : 0;
    if (ppnRow) ppnRow.style.display = usePPN ? 'block' : 'none';
    if (dppEl) dppEl.textContent = idrFull(dpp);
    if (ppnEl) ppnEl.textContent = idrFull(ppn);
    totalEl.textContent = idrFull(dpp + ppn);
  }

  function makeRow(line) {
    line = line || {};
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border)';
    const isCustom = line.itemId === 'custom';
    const opts = DB.inventoryItems
      .map(
        i =>
          `<option value="${i.id}" data-unit="${escapeHtml(i.unit)}" data-price="${i[priceField]}"${!isCustom && String(i.id) === String(line.itemId) ? ' selected' : ''}>${escapeHtml(i.name)}</option>`
      )
      .join('');

    tr.innerHTML = `
      <td style="padding:5px 8px">
        <select class="form-select ln-item" style="font-size:12px;padding:5px 8px">
          <option value="">— Pilih Item —</option>
          ${opts}
          <option value="custom"${isCustom ? ' selected' : ''}>✏ Item Lainnya (manual)</option>
        </select>
        <input class="form-input ln-custom" type="text" placeholder="Nama item / jasa"
               value="${isCustom ? escapeHtml(line.itemName || '') : ''}"
               style="display:${isCustom ? 'block' : 'none'};font-size:12px;padding:5px 8px;margin-top:4px">
      </td>
      <td style="padding:5px 8px">
        <input class="form-input ln-qty" type="number" min="1" step="1" value="${line.qty || 1}"
               style="width:62px;font-size:12px;padding:5px 8px">
      </td>
      <td style="padding:5px 8px;font-size:11px;color:var(--muted);white-space:nowrap" class="ln-unit">${escapeHtml(line.unit || '')}</td>
      <td style="padding:5px 8px">
        <input class="form-input ln-price" type="number" min="0" value="${line.price || 0}"
               style="width:108px;font-size:12px;padding:5px 8px">
      </td>
      <td style="padding:5px 8px">
        <input class="form-input ln-disc" type="number" min="0" value="${line.lineDiscount || 0}"
               style="width:96px;font-size:12px;padding:5px 8px">
      </td>
      <td style="padding:5px 8px;font-size:12px;font-weight:700;text-align:right;white-space:nowrap" class="ln-sub">
        ${idrFull(Math.max(0, (line.qty || 0) * (line.price || 0) - (line.lineDiscount || 0)))}
      </td>
      <td style="padding:5px 8px;text-align:center">
        <button type="button" class="ln-del" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1;padding:1px 5px" title="Hapus baris">×</button>
      </td>`;

    const sel = tr.querySelector('.ln-item');
    const customInp = tr.querySelector('.ln-custom');
    const unitTd = tr.querySelector('.ln-unit');
    const priceInp = tr.querySelector('.ln-price');
    const discInp = tr.querySelector('.ln-disc');
    const subTd = tr.querySelector('.ln-sub');

    function recalcRow() {
      const qty = Math.max(0, parseInt(tr.querySelector('.ln-qty').value) || 0);
      // FIX #4: Use parseFloat for prices to preserve decimal values
      const price = Math.max(0, parseFloat(priceInp.value) || 0);
      // Phase 1b: per-line discount (Rp), clamped so the line never goes negative.
      const disc = Math.max(0, parseFloat(discInp.value) || 0);
      subTd.textContent = idrFull(Math.round(Math.max(0, qty * price - disc)));
      calcTotal();
    }

    sel.addEventListener('change', () => {
      if (sel.value === 'custom') {
        customInp.style.display = 'block';
        unitTd.textContent = 'ls';
        priceInp.value = 0;
      } else if (sel.value) {
        customInp.style.display = 'none';
        const opt = sel.querySelector(`option[value="${sel.value}"]`);
        unitTd.textContent = opt?.dataset.unit || '';
        priceInp.value = opt?.dataset.price || 0;
        // Supplier Price override: when in PO context, check for a supplier-specific price
        if (priceField === 'cost') {
          const supplierName = (document.getElementById('po-supplier')?.value || '').trim();
          if (supplierName && DB.supplierPrices) {
            const sp = DB.supplierPrices.find(
              p =>
                p.itemId === sel.value &&
                p.supplierName.toLowerCase() === supplierName.toLowerCase()
            );
            if (sp) priceInp.value = sp.price;
          }
        }
      } else {
        customInp.style.display = 'none';
        unitTd.textContent = '';
        priceInp.value = 0;
      }
      recalcRow();
    });

    tr.querySelector('.ln-qty').addEventListener('input', recalcRow);
    priceInp.addEventListener('input', recalcRow);
    discInp.addEventListener('input', recalcRow);
    tr.querySelector('.ln-del').addEventListener('click', () => {
      tr.remove();
      calcTotal();
    });
    return tr;
  }

  // Populate with existing lines or one empty row
  const seed = existingLines && existingLines.length > 0 ? existingLines : [{}];
  seed.forEach(l => body.appendChild(makeRow(l)));
  calcTotal();

  document
    .getElementById('addLineBtn')
    ?.addEventListener('click', () => body.appendChild(makeRow()));

  // Return collect function
  return function collectLines() {
    const lines = [];
    body.querySelectorAll('tr').forEach(tr => {
      const sel = tr.querySelector('.ln-item');
      if (!sel?.value) {
        return;
      }
      const qty = Math.max(1, parseInt(tr.querySelector('.ln-qty').value) || 1);
      // FIX #4: Use parseFloat for prices to preserve decimal values
      const price = Math.max(0, parseFloat(tr.querySelector('.ln-price').value) || 0);
      // Phase 1b: per-line discount (Rp), clamped to [0, qty*price] so a line's
      // subtotal is never negative.
      const lineDiscount = Math.min(
        qty * price,
        Math.max(0, parseFloat(tr.querySelector('.ln-disc')?.value) || 0)
      );
      const unitTd = tr.querySelector('.ln-unit');
      let itemId, itemName, unit;
      if (sel.value === 'custom') {
        itemName = tr.querySelector('.ln-custom')?.value.trim();
        if (!itemName) {
          return;
        }
        itemId = 'custom';
        unit = 'ls';
      } else {
        itemId = parseInt(sel.value);
        itemName = sel.options[sel.selectedIndex]?.text || '';
        unit = unitTd?.textContent.trim() || '';
      }
      lines.push({
        itemId,
        itemName,
        unit,
        qty,
        price,
        lineDiscount,
        subtotal: qty * price - lineDiscount,
      });
    });
    return lines;
  };
}

// Lines detail HTML for view modals
function linesDetailHTML(lines, totalLabel, doc) {
  if (!lines || lines.length === 0) {
    return '';
  }
  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  // Phase 1b: only surface the Diskon column when at least one line carries a
  // per-line discount, so legacy docs render exactly as before.
  const showDisc = lines.some(l => (l.lineDiscount || 0) > 0);

  // Tax presentation. `total` is the sum of line subtotals.
  //  • exclusive (default): the lines are pre-tax, so DPP = total and the grand
  //    total adds PPN on top.
  //  • inclusive (doc.taxInclusive): the line prices already contain the tax, so
  //    `total` IS the grand total; DPP is backed out (total − PPN) and nothing
  //    is added on top (otherwise the tax would be counted twice).
  const taxRate = doc && doc.taxRate > 0 ? doc.taxRate : 0;
  const taxIncl = !!(doc && doc.taxInclusive);
  const taxAmt = taxRate
    ? doc.tax != null
      ? doc.tax
      : Math.round(taxIncl ? (total * taxRate) / (1 + taxRate) : total * taxRate)
    : 0;
  const dppAmt = taxIncl ? total - taxAmt : total;
  const grandTotal = taxRate ? (taxIncl ? total : total + taxAmt) : total;
  return `
  <div style="margin-top:14px">
    <div class="detail-label" style="margin-bottom:8px">Item Pesanan</div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg)">
          <tr>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Item</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:50px;border-bottom:1px solid var(--border)">Qty</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:46px;border-bottom:1px solid var(--border)">Sat.</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:120px;border-bottom:1px solid var(--border)">Harga</th>
            ${showDisc ? `<th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:110px;border-bottom:1px solid var(--border)">Diskon</th>` : ''}
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:120px;border-bottom:1px solid var(--border)">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${lines
            .map(
              l => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:7px 10px;font-size:12px;font-weight:600">${escapeHtml(l.itemName)}</td>
            <td style="padding:7px 10px;font-size:12px;text-align:right">${l.qty}</td>
            <td style="padding:7px 10px;font-size:11px;color:var(--muted)">${escapeHtml(l.unit)}</td>
            <td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--muted)">${idrFull(l.price)}</td>
            ${showDisc ? `<td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--muted)">${(l.lineDiscount || 0) > 0 ? '−' + idrFull(l.lineDiscount) : '—'}</td>` : ''}
            <td style="padding:7px 10px;font-size:12px;font-weight:700;text-align:right">${idrFull(l.subtotal)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div style="text-align:right;margin-top:10px">
      ${taxRate ? `
      <div style="font-size:12px;color:var(--muted);margin-bottom:2px">DPP: ${idrFull(dppAmt)}</div>
      <div style="font-size:12px;color:#2563EB;font-weight:600;margin-bottom:4px">PPN (${Math.round(taxRate * 100)}%)${taxIncl ? ' — termasuk' : ''}: ${idrFull(taxAmt)}</div>
      ` : ''}
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px">
        <span style="font-size:12px;color:var(--muted)">${totalLabel || 'Total'}:</span>
        <span style="font-size:16px;font-weight:800">${idrFull(grandTotal)}</span>
      </div>
    </div>
  </div>`;
}

// ── Payment Log & Duplication Helpers ─────────────────────────────────────────
// paymentLogHTML, showAddPayment, duplicateSO/PO, inlineSOStatus, showAddSO,
// viewSO, editSO, viewPO, showAddDO/editDO/viewDO live in the merged
// erp-patch section at the bottom of this file (erp-patch.js was folded in
// 2026-06-10; it had long stopped shadowing anything here).

// ═══════════════════════════════════════════════════════════════════════════════
// SALES ORDERS
// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: showAddSO, viewSO, and editSO are in the merged erp-patch section at
// the bottom of this file (customer validation, DO linkage, payment log, and
// stock reservation transitions). Only deleteSO remains here.

function deleteSO(id) {
  const idx = DB.salesOrders.findIndex(o => o.id === id);
  if (idx === -1) {
    return;
  }
  const o = DB.salesOrders[idx];
  // FIX: Release stock reservation if SO was Confirmed
  if (o.status === 'Confirmed') {
    releaseReservation(id);
  }
  // FIX: Reverse stock mutation if SO was Delivered
  if (o.status === 'Delivered' && o.stockMutated) {
    (o.lines || []).forEach(l => {
      if (l.itemId === 'custom') {
        return;
      }
      const item = DB.inventoryItems.find(i => String(i.id) === String(l.itemId));
      if (item) {
        item.stock = Math.max(0, item.stock + l.qty);
      }
    });
  }
  const deleted = DB.salesOrders.splice(idx, 1)[0];
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Use year-safe numeric sequence comparison.
  // String comparison (o.id > id) fails across year boundaries because
  // "SO-2025-999" > "SO-2026-001" is false lexicographically.
  // We extract the trailing sequence number and compare numerically within
  // the same year prefix; cross-year IDs are ordered by their full string.
  function _idInsertIdx(arr, field, targetId) {
    const parts = targetId.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    const prefix = parts.slice(0, -1).join('-') + '-';
    for (let i = 0; i < arr.length; i++) {
      const id = String(arr[i][field || 'id']);
      if (id.startsWith(prefix)) {
        const s = parseInt(id.split('-').pop(), 10);
        if (s > seq) {
          return i;
        }
      } else if (id > targetId) {
        return i;
      }
    }
    return arr.length;
  }

  showUndoToast(`${id} dihapus`, () => {
    const insertAt = _idInsertIdx(DB.salesOrders, 'id', id);
    DB.salesOrders.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${id} berhasil dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: viewPO is in the merged erp-patch section at the bottom of this file.
// Only showAddPO, editPO, and deletePO remain here.

/** The three free-text lines the client's PO form carries that the generic PO
 *  record has no home for. Without them the "FORM PEMESANAN BARANG" export
 *  (rekap-export.js) prints those rows blank. */
function _poFormExtras(o) {
  const cur = o || {};
  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal Pengambilan
          <span style="font-size:10px;color:var(--muted);font-weight:400">(teks bebas)</span></label>
        <input class="form-input" id="po-pickup" type="text"
          value="${escapeHtml(cur.pickupDate || '')}"
          placeholder="cth: Mei 2026 - Bertahap">
      </div>
      <div class="form-group">
        <label class="form-label">Proyek</label>
        <input class="form-input" id="po-project" type="text"
          value="${escapeHtml(cur.project || '')}"
          placeholder="cth: PT Trias Beton Perkasa - Psr. Kemis">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Pembayaran</label>
      <input class="form-input" id="po-payment-term" type="text"
        value="${escapeHtml(cur.paymentTerm || '')}"
        placeholder="cth: cash - transfer. Mingguan.">
    </div>`;
}

/** Read the three extra PO form fields; shared by the add and edit handlers. */
function _readPoExtras() {
  return {
    pickupDate: sanitizeInput(document.getElementById('po-pickup')?.value || ''),
    project: sanitizeInput(document.getElementById('po-project')?.value || ''),
    paymentTerm: sanitizeInput(document.getElementById('po-payment-term')?.value || ''),
  };
}

function showAddPO() {
  const suppOpts = DB.suppliers.map(s => `<option value="${escapeHtml(s.name)}">`).join('');
  openModal(
    'Buat Purchase Order Baru',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Supplier</label>
        <input class="form-input" id="po-supplier" type="text" placeholder="Nama supplier" list="po-supp-list" autocomplete="off">
        <datalist id="po-supp-list">${suppOpts}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input class="form-input" id="po-date" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Jatuh Tempo <span style="font-size:10px;color:var(--muted);font-weight:400">(opsional)</span></label>
        <input class="form-input" id="po-due-date" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="po-status">${statusOptions(PO_STATUSES, 'Draft')}</select>
      </div>
      ${warehouseSelectHTML()}
    </div>
    ${_poFormExtras()}
    ${lineItemsHTML()}
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="savePO">Simpan PO</button>`,
    true
  );

  setTimeout(() => {
    const collectLines = initLineItems('cost', []);
    document.getElementById('savePO')?.addEventListener('click', () => {
      const supplier = sanitizeInput(document.getElementById('po-supplier').value);
      const date = sanitizeInput(document.getElementById('po-date').value, 'date');
      const status = document.getElementById('po-status').value;
      if (!supplier) {
        showToast('Nama supplier harus diisi', 'warning');
        return;
      }
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      const lines = collectLines();
      if (lines.length === 0) {
        showToast('Tambahkan minimal 1 item', 'warning');
        return;
      }
      const dpp = lines.reduce((s, l) => s + l.subtotal, 0);
      const ppnChk = document.getElementById('ppnToggle');
      const taxCfg = (DB.settings && DB.settings.tax) || {};
      const poTaxRate = ppnChk && ppnChk.checked ? (typeof taxCfg.ppnRate === 'number' ? taxCfg.ppnRate : 0.11) : 0;
      const poTax = poTaxRate > 0 ? Math.round(dpp * poTaxRate) : 0;
      const amount = dpp + poTax;
      const poNumber = window.DocEngine
        ? window.DocEngine.nextNumber('PO', date, { commit: true })
        : null;
      const whSelPO = document.getElementById('order-warehouse');
      const newPO = {
        id: nextId('PO', DB.purchaseOrders),
        number: poNumber || undefined,
        supplier,
        supplierId: window.DocEngine?.resolvePartyId('PO', supplier) ?? null,
        date,
        amount,
        taxRate: poTaxRate,
        tax: poTax,
        status,
        lines,
        warehouseId: whSelPO ? whSelPO.value : null,
        stockMutated: false,
        ..._readPoExtras(),
      };
      if (status === 'Received') {
        applyStockMutation(newPO, 'in');
      }
      DB.purchaseOrders.unshift(newPO);
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${docNum(newPO.number, newPO.id)} berhasil dibuat`, 'success');
    });
  }, 50);
}

// viewPO is in the merged erp-patch section at the bottom of this file.

function editPO(id) {
  const o = DB.purchaseOrders.find(o => o.id === id);
  if (!o) {
    showToast('PO tidak ditemukan', 'danger');
    return;
  }
  const suppOpts = DB.suppliers.map(s => `<option value="${escapeHtml(s.name)}">`).join('');
  openModal(
    `Edit PO — ${escapeHtml(id)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Supplier</label>
        <input class="form-input" id="po-supplier" type="text" value="${escapeHtml(o.supplier)}" list="po-supp-list" autocomplete="off">
        <datalist id="po-supp-list">${suppOpts}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input class="form-input" id="po-date" type="date" value="${escapeHtml(o.date)}">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="po-status">${statusOptions(PO_STATUSES, o.status)}</select>
      </div>
      ${warehouseSelectHTML(o.warehouseId)}
    </div>
    ${_poFormExtras(o)}
    ${lineItemsHTML()}
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deletePO" data-id="${escapeHtml(id)}">Hapus</button>
   <button class="btn" id="updatePO">Simpan</button>`,
    true
  );

  setTimeout(() => {
    const ppnChkEdit = document.getElementById('ppnToggle');
    if (ppnChkEdit && o.taxRate > 0) { ppnChkEdit.checked = true; }
    const collectLines = initLineItems('cost', o.lines || []);
    document.getElementById('updatePO')?.addEventListener('click', () => {
      const supplier = sanitizeInput(document.getElementById('po-supplier').value);
      const date = sanitizeInput(document.getElementById('po-date').value, 'date');
      const status = document.getElementById('po-status').value;
      if (!supplier) {
        showToast('Nama supplier harus diisi', 'warning');
        return;
      }
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      const lines = collectLines();
      if (lines.length === 0) {
        showToast('Tambahkan minimal 1 item', 'warning');
        return;
      }

      const wasReceived = o.status === 'Received';
      const nowReceived = status === 'Received';

      // FIX #1: If PO was Received and lines changed, reverse old stock first
      // FIX: Guard against negative inventory with Math.max(0, ...)
      if (wasReceived && o.stockMutated) {
        (o.lines || []).forEach(l => {
          if (l.itemId === 'custom') {
            return;
          }
          const item = DB.inventoryItems.find(i => String(i.id) === String(l.itemId));
          if (item) {
            item.stock = Math.max(0, item.stock - l.qty);
          }
        });
        o.stockMutated = false;
      }

      const dpp = lines.reduce((s, l) => s + l.subtotal, 0);
      const ppnChk2 = document.getElementById('ppnToggle');
      const taxCfg2 = (DB.settings && DB.settings.tax) || {};
      // Preserve an existing rate (e.g. legacy 12% imports) and the
      // tax-inclusive nature so editing doesn't silently restate the total.
      const poTaxRate = ppnChk2 && ppnChk2.checked
        ? (o.taxRate > 0 ? o.taxRate : (typeof taxCfg2.ppnRate === 'number' ? taxCfg2.ppnRate : 0.11))
        : 0;
      const poIncl = poTaxRate > 0 && !!o.taxInclusive;
      const poTax = poTaxRate > 0
        ? Math.round(poIncl ? (dpp * poTaxRate) / (1 + poTaxRate) : dpp * poTaxRate)
        : 0;

      const whSelPOEdit = document.getElementById('order-warehouse');
      o.supplier = supplier;
      o.supplierId = window.DocEngine?.resolvePartyId('PO', supplier) ?? null;
      o.date = date;
      o.status = status;
      o.lines = lines;
      o.taxRate = poTaxRate;
      o.taxInclusive = poIncl;
      o.tax = poTax;
      o.amount = poIncl ? dpp : dpp + poTax;
      Object.assign(o, _readPoExtras());
      if (whSelPOEdit) o.warehouseId = whSelPOEdit.value;

      // Apply new stock mutation if status is Received
      if (nowReceived && !o.stockMutated) {
        applyStockMutation(o, 'in');
        showToast('Stok inventori diperbarui sesuai item baru', 'success');
      }

      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${id} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function deletePO(id) {
  const idx = DB.purchaseOrders.findIndex(o => o.id === id);
  if (idx === -1) {
    return;
  }
  const o = DB.purchaseOrders[idx];
  // FIX: Reverse stock mutation if PO was Received
  if (o.stockMutated) {
    (o.lines || []).forEach(l => {
      if (l.itemId === 'custom') {
        return;
      }
      const item = DB.inventoryItems.find(i => String(i.id) === String(l.itemId));
      if (item) {
        item.stock = Math.max(0, item.stock - l.qty);
      }
    });
  }
  const deleted = DB.purchaseOrders.splice(idx, 1)[0];
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Year-safe numeric ID insertion (same as deleteSO fix)
  showUndoToast(`${id} dihapus`, () => {
    const restoreIdx = DB.purchaseOrders.findIndex(o => {
      const parts = id.split('-');
      const prefix = parts.slice(0, -1).join('-') + '-';
      const seq = parseInt(parts[parts.length - 1], 10);
      const cid = String(o.id);
      if (cid.startsWith(prefix)) {
        return parseInt(cid.split('-').pop(), 10) > seq;
      }
      return cid > id;
    });
    const insertAt = restoreIdx === -1 ? DB.purchaseOrders.length : restoreIdx;
    DB.purchaseOrders.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${id} berhasil dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

function showAddItem() {
  const allCats = [...new Set([...ITEM_CATEGORIES, ...DB.inventoryItems.map(i => i.category)])];
  openModal(
    'Tambah Item Baru',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Item</label>
        <input class="form-input" id="item-name" type="text" placeholder="Contoh: Granit Alam Hitam">
      </div>
      <div class="form-group">
        <label class="form-label">Kategori</label>
        <input class="form-input" id="item-category" type="text" list="cat-list" placeholder="Pilih atau ketik kategori">
        <datalist id="cat-list">${allCats.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Satuan</label>
        <input class="form-input" id="item-unit" type="text" value="m²" placeholder="m², ton, pcs…">
      </div>
      <div class="form-group">
        <label class="form-label">Stok Awal</label>
        <input class="form-input" id="item-stock" type="number" min="0" placeholder="0">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Stok Minimum</label>
        <input class="form-input" id="item-min" type="number" min="0" placeholder="0">
      </div>
      <div class="form-group"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Harga Beli (Rp)</label>
        <input class="form-input" id="item-cost" type="number" min="0" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (Rp)</label>
        <input class="form-input" id="item-sell" type="number" min="0" placeholder="0">
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveItem">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('saveItem')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('item-name').value);
      const category = sanitizeInput(document.getElementById('item-category').value) || 'Lainnya';
      const unit = sanitizeInput(document.getElementById('item-unit').value) || 'm²';
      const stock = sanitizeInput(document.getElementById('item-stock').value, 'number');
      const min = sanitizeInput(document.getElementById('item-min').value, 'number');
      const cost = sanitizeInput(document.getElementById('item-cost').value, 'number');
      const sell = sanitizeInput(document.getElementById('item-sell').value, 'number');
      if (!name) {
        showToast('Nama item harus diisi', 'warning');
        return;
      }
      // FIX: Prevent ID collision after deletion — use max(existing IDs, _nextIdCounter) + 1
      if (!DB._nextItemId) {
        DB._nextItemId = 0;
      }
      const maxId = DB.inventoryItems.reduce(
        (m, i) => Math.max(m, Number.parseInt(i.id, 10) || 0),
        0
      );
      const newId = Math.max(maxId, DB._nextItemId) + 1;
      DB._nextItemId = newId;
      DB.inventoryItems.push({ id: newId, name, category, unit, stock, min, cost, sell });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil ditambahkan`, 'success');
    });
  }, 50);
}

function viewItem(id) {
  const item = DB.inventoryItems.find(i => String(i.id) === String(id));
  if (!item) {
    showToast('Item tidak ditemukan', 'danger');
    return;
  }
  const isLow = item.stock < item.min;
  openModal(
    `Detail Item — ${escapeHtml(item.name)}`,
    `
    <div class="detail-grid">
      ${detailRow('Nama Item', escapeHtml(item.name))}
      ${detailRow('Status Stok', badge(isLow ? 'Low' : 'OK'))}
      <div class="detail-divider"></div>
      ${detailRow('Kategori', escapeHtml(item.category))}
      ${detailRow('Satuan', escapeHtml(item.unit))}
      ${detailRow('Stok Saat Ini', `<span style="font-weight:800;color:${isLow ? 'var(--danger)' : 'var(--text)'}">${item.stock}</span>`)}
      ${detailRow('Stok Minimum', String(item.min))}
      <div class="detail-divider"></div>
      ${detailRow('Harga Beli', idrFull(item.cost))}
      ${detailRow('Harga Jual', idrFull(item.sell))}
      ${detailRow('Margin', `${item.cost > 0 ? Math.round(((item.sell - item.cost) / item.cost) * 100) : 0}%`)}
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
   <button class="btn-ghost" data-action="stockCard" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
     Kartu Stok
   </button>
   <button class="btn" data-action="editItem" data-id="${escapeHtml(id)}">Edit</button>`
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// § 3b  KARTU STOK — per-item movement card with running balance
// ────────────────────────────────────────────────────────────────────────────────
// Mirrors cost-ledger.js buildMovements EXACTLY (PO status Received = in, item
// adjustments = in/out, SO status Delivered = out) — i.e. the same basis that
// actually drives item.stock via applyStockMutation. The opening balance is
// derived as (current stock − net movement) so the card always reconciles to the
// current on-hand qty. (DOs/Surat Jalan are stock-neutral and intentionally not a
// movement source here.)
// ════════════════════════════════════════════════════════════════════════════════

function _stockCardMovements(itemId) {
  const moves = [];
  (DB.purchaseOrders || []).forEach(o => {
    if (o.status !== 'Received') return;
    (o.lines || []).forEach(l => {
      if (l.itemId !== itemId) return;
      const qty = Number(l.qty) || 0;
      if (!qty) return;
      moves.push({
        date: o.date,
        pr: 1,
        ref: docNum(o.number, o.id),
        refId: o.id,
        action: 'viewPO',
        label: 'Penerimaan (PO)',
        inQty: qty,
        outQty: 0,
      });
    });
  });
  (DB.itemAdjustments || []).forEach(a => {
    (a.lines || []).forEach(l => {
      if (l.itemId !== itemId) return;
      const qty = Number(l.qty) || 0;
      if (!qty) return;
      const out = l.type === 'out';
      moves.push({
        date: a.date,
        pr: out ? 2 : 1,
        ref: docNum(a.number, a.id),
        refId: a.id,
        action: null,
        label: out ? 'Penyesuaian (−)' : 'Penyesuaian (+)',
        inQty: out ? 0 : qty,
        outQty: out ? qty : 0,
      });
    });
  });
  (DB.salesOrders || []).forEach(o => {
    if (o.status !== 'Delivered') return;
    (o.lines || []).forEach(l => {
      if (l.itemId !== itemId) return;
      const qty = Number(l.qty) || 0;
      if (!qty) return;
      moves.push({
        date: o.date,
        pr: 2,
        ref: docNum(o.number, o.id),
        refId: o.id,
        action: 'viewSO',
        label: 'Pengiriman (SO)',
        inQty: 0,
        outQty: qty,
      });
    });
  });
  moves.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.pr - b.pr));
  return moves;
}

function showStockCard(id) {
  const item = DB.inventoryItems.find(i => String(i.id) === String(id));
  if (!item) {
    showToast('Item tidak ditemukan', 'danger');
    return;
  }
  const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
  const moves = _stockCardMovements(item.id);
  const net = moves.reduce((s, m) => s + m.inQty - m.outQty, 0);
  const current = Number(item.stock) || 0;
  const opening = r3(current - net);
  const unit = escapeHtml(item.unit || '');
  const qtyCell = (v, color) =>
    v
      ? `<span style="font-weight:700;color:${color}">${r3(v)}</span>`
      : '<span style="color:var(--border)">—</span>';

  let bal = opening;
  const bodyRows = moves
    .map(m => {
      bal = r3(bal + m.inQty - m.outQty);
      const refCell = m.action
        ? `<a data-action="${m.action}" data-id="${escapeHtml(m.refId)}" style="color:var(--primary);cursor:pointer;text-decoration:underline">${escapeHtml(m.ref)}</a>`
        : escapeHtml(m.ref);
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 10px;font-size:11px;color:var(--muted);white-space:nowrap">${escapeHtml(m.date)}</td>
        <td style="padding:6px 10px;font-size:12px">${escapeHtml(m.label)}</td>
        <td style="padding:6px 10px;font-size:11px">${refCell}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right">${qtyCell(m.inQty, '#34C759')}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right">${qtyCell(m.outQty, '#FF3B30')}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:800">${r3(bal)}</td>
      </tr>`;
    })
    .join('');

  const body = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
      <div><span style="color:var(--muted)">Satuan:</span> <strong>${unit || '—'}</strong></div>
      <div><span style="color:var(--muted)">Saldo Awal (perkiraan):</span> <strong>${opening} ${unit}</strong></div>
      <div><span style="color:var(--muted)">Stok Saat Ini:</span> <strong style="color:var(--primary)">${r3(current)} ${unit}</strong></div>
      <div><span style="color:var(--muted)">Total Mutasi:</span> <strong>${moves.length}</strong></div>
    </div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:auto;max-height:60vh">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg);position:sticky;top:0">
          <tr>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Tanggal</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Keterangan</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Ref</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border);color:#34C759">Masuk</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border);color:#FF3B30">Keluar</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border)">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border);background:var(--bg)">
            <td style="padding:6px 10px;font-size:11px;color:var(--muted)">—</td>
            <td style="padding:6px 10px;font-size:12px;font-style:italic;color:var(--muted)">Saldo Awal</td>
            <td style="padding:6px 10px"></td>
            <td style="padding:6px 10px"></td>
            <td style="padding:6px 10px"></td>
            <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:800">${opening}</td>
          </tr>
          ${
            bodyRows ||
            `<tr><td colspan="6" style="padding:16px;text-align:center;font-size:12px;color:var(--muted)">Belum ada mutasi tercatat untuk item ini.</td></tr>`
          }
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--border);background:var(--bg)">
            <td colspan="3" style="padding:7px 10px;font-size:12px;font-weight:800;text-align:right">Stok Saat Ini</td>
            <td colspan="2"></td>
            <td style="padding:7px 10px;font-size:13px;font-weight:800;text-align:right;color:var(--primary)">${r3(current)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  openModal(
    `Kartu Stok — ${escapeHtml(item.name)}`,
    body,
    `<button class="btn-ghost" data-action="viewItem" data-id="${escapeHtml(id)}">← Detail Item</button>
     <button class="btn" data-action="closeModal">Tutup</button>`
  );
}

function editItem(id) {
  const item = DB.inventoryItems.find(i => String(i.id) === String(id));
  if (!item) {
    showToast('Item tidak ditemukan', 'danger');
    return;
  }
  const allCats = [...new Set([...ITEM_CATEGORIES, ...DB.inventoryItems.map(i => i.category)])];
  openModal(
    `Edit Item — ${escapeHtml(item.name)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Item</label>
        <input class="form-input" id="item-name" type="text" value="${escapeHtml(item.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Kategori</label>
        <input class="form-input" id="item-category" type="text" value="${escapeHtml(item.category)}" list="cat-list">
        <datalist id="cat-list">${allCats.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Satuan</label>
        <input class="form-input" id="item-unit" type="text" value="${escapeHtml(item.unit)}">
      </div>
      <div class="form-group">
        <label class="form-label">Stok Saat Ini</label>
        <input class="form-input" id="item-stock" type="number" min="0" value="${item.stock}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Stok Minimum</label>
        <input class="form-input" id="item-min" type="number" min="0" value="${item.min}">
      </div>
      <div class="form-group"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Harga Beli (Rp)</label>
        <input class="form-input" id="item-cost" type="number" min="0" value="${item.cost}">
      </div>
      <div class="form-group">
        <label class="form-label">Harga Jual (Rp)</label>
        <input class="form-input" id="item-sell" type="number" min="0" value="${item.sell}">
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deleteItem" data-id="${escapeHtml(id)}">Hapus</button>
   <button class="btn" id="updateItem">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('updateItem')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('item-name').value);
      const category = sanitizeInput(document.getElementById('item-category').value) || 'Lainnya';
      const unit = sanitizeInput(document.getElementById('item-unit').value) || 'm²';
      const stock = sanitizeInput(document.getElementById('item-stock').value, 'number');
      const min = sanitizeInput(document.getElementById('item-min').value, 'number');
      const cost = sanitizeInput(document.getElementById('item-cost').value, 'number');
      const sell = sanitizeInput(document.getElementById('item-sell').value, 'number');
      if (!name) {
        showToast('Nama item harus diisi', 'warning');
        return;
      }
      item.name = name;
      item.category = category;
      item.unit = unit;
      item.stock = stock;
      item.min = min;
      item.cost = cost;
      item.sell = sell;
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function deleteItem(id) {
  const idx = DB.inventoryItems.findIndex(i => String(i.id) === String(id));
  if (idx === -1) {
    return;
  }
  const item = DB.inventoryItems[idx];

  // FIX: id arrives as a string from data-id; l.itemId is stored as a number.
  // Use loose equality (==) so "3" == 3 is true. Alternatively: Number(id).
  const numericId = Number(id);
  const usedInSO = DB.salesOrders.some(o => (o.lines || []).some(l => l.itemId === numericId));
  const usedInPO = DB.purchaseOrders.some(o => (o.lines || []).some(l => l.itemId === numericId));
  const isReserved =
    DB.reservations &&
    Object.values(DB.reservations).some(lines => lines.some(l => l.itemId === numericId));

  if (usedInSO || usedInPO || isReserved) {
    const reasons = [];
    if (usedInSO) {
      reasons.push('digunakan dalam Sales Order');
    }
    if (usedInPO) {
      reasons.push('digunakan dalam Purchase Order');
    }
    if (isReserved) {
      reasons.push('memiliki stok yang direservasi');
    }

    showToast(
      `Tidak dapat menghapus "${item.name}" karena ${reasons.join(', ')}. ` +
        `Hapus atau edit transaksi terkait terlebih dahulu.`,
      'danger'
    );
    return;
  }

  const deleted = DB.inventoryItems.splice(idx, 1)[0];
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Use ID-based lookup instead of captured array index.
  // Inventory items use numeric IDs, so we find the insertion point by
  // locating the first item with a higher ID.
  showUndoToast(`${deleted.name} dihapus`, () => {
    const restoreIdx = DB.inventoryItems.findIndex(i => i.id > deleted.id);
    const insertAt = restoreIdx === -1 ? DB.inventoryItems.length : restoreIdx;
    DB.inventoryItems.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${deleted.name} berhasil dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERY ORDERS
// ═══════════════════════════════════════════════════════════════════════════════
// The DO helpers (_getCustomerAddress, _soRefOptions, _doFormBody,
// _wireSoRefSelect) and showAddDO/editDO/viewDO live in the merged erp-patch
// section at the bottom of this file. Only deleteDO remains here.

function deleteDO(id) {
  const idx = DB.deliveryOrders.findIndex(o => o.id === id);
  if (idx === -1) {
    return;
  }
  const deleted = DB.deliveryOrders.splice(idx, 1)[0];
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Year-safe numeric ID insertion (same as deleteSO fix)
  showUndoToast(`${id} dihapus`, () => {
    const restoreIdx = DB.deliveryOrders.findIndex(o => {
      const parts = id.split('-');
      const prefix = parts.slice(0, -1).join('-') + '-';
      const seq = parseInt(parts[parts.length - 1], 10);
      const cid = String(o.id);
      if (cid.startsWith(prefix)) {
        return parseInt(cid.split('-').pop(), 10) > seq;
      }
      return cid > id;
    });
    const insertAt = restoreIdx === -1 ? DB.deliveryOrders.length : restoreIdx;
    DB.deliveryOrders.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${id} berhasil dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS (Master Data)
// ═══════════════════════════════════════════════════════════════════════════════

function showAddCustomer() {
  openModal(
    'Tambah Pelanggan Baru',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Pelanggan / Perusahaan</label>
        <input class="form-input" id="cust-name" type="text" placeholder="PT. / CV. / Nama Toko">
      </div>
      <div class="form-group">
        <label class="form-label">No. Telepon</label>
        <input class="form-input" id="cust-phone" type="text" placeholder="021-xxxx / 0812-xxxx">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Alamat / Kota</label>
        <input class="form-input" id="cust-address" type="text" placeholder="Jakarta, Bekasi, dll.">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="cust-email" type="email" placeholder="email@contoh.com">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NPWP (opsional)</label>
        <input class="form-input" id="cust-npwp" type="text" placeholder="XX.XXX.XXX.X-XXX.XXX">
      </div>
      <div class="form-group"></div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveCustomer">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('saveCustomer')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('cust-name').value);
      const phone = sanitizeInput(document.getElementById('cust-phone').value);
      const address = sanitizeInput(document.getElementById('cust-address').value);
      const email = sanitizeInput(document.getElementById('cust-email').value);
      const npwp = sanitizeInput(document.getElementById('cust-npwp').value);
      if (!name) {
        showToast('Nama pelanggan harus diisi', 'warning');
        return;
      }
      // FIX: Prevent ID collision after deletion
      if (!DB._nextCustId) {
        DB._nextCustId = 0;
      }
      const maxId = DB.customers.reduce((m, c) => Math.max(m, Number.parseInt(c.id, 10) || 0), 0);
      const newId = Math.max(maxId, DB._nextCustId) + 1;
      DB._nextCustId = newId;
      DB.customers.push({ id: newId, name, phone, address, email, npwp });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil ditambahkan`, 'success');
    });
  }, 50);
}

function viewCustomer(id) {
  const c = DB.customers.find(c => String(c.id) === String(id));
  if (!c) {
    showToast('Pelanggan tidak ditemukan', 'danger');
    return;
  }
  const orders = DB.salesOrders.filter(o => o.customer === c.name);
  const totalVal = orders.reduce((s, o) => s + o.amount, 0);
  openModal(
    `Detail Pelanggan — ${escapeHtml(c.name)}`,
    `
    <div class="detail-grid">
      ${detailRow('Nama', escapeHtml(c.name))}
      ${detailRow('Telepon', escapeHtml(c.phone || '—'))}
      <div class="detail-divider"></div>
      ${detailRow('Alamat', escapeHtml(c.address || '—'))}
      ${detailRow('Email', escapeHtml(c.email || '—'))}
      ${detailRow('NPWP', escapeHtml(c.npwp || '—'))}
      <div class="detail-divider"></div>
      ${detailRow('Total SO', `<span style="font-weight:800">${orders.length} pesanan</span>`)}
      ${detailRow('Nilai Total', `<span style="font-weight:800;color:var(--primary)">${idrFull(totalVal)}</span>`)}
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
   <button class="btn-ghost" data-action="custStatement" data-id="${escapeHtml(c.id)}">Kartu Piutang</button>
   <button class="btn" data-action="editCustomer" data-id="${escapeHtml(c.id)}">Edit</button>`
  );
}

function editCustomer(id) {
  const c = DB.customers.find(c => String(c.id) === String(id));
  if (!c) {
    showToast('Pelanggan tidak ditemukan', 'danger');
    return;
  }
  openModal(
    `Edit Pelanggan — ${escapeHtml(c.name)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama</label>
        <input class="form-input" id="cust-name" type="text" value="${escapeHtml(c.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Telepon</label>
        <input class="form-input" id="cust-phone" type="text" value="${escapeHtml(c.phone || '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Alamat / Kota</label>
        <input class="form-input" id="cust-address" type="text" value="${escapeHtml(c.address || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="cust-email" type="email" value="${escapeHtml(c.email || '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NPWP</label>
        <input class="form-input" id="cust-npwp" type="text" value="${escapeHtml(c.npwp || '')}">
      </div>
      <div class="form-group"></div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deleteCustomer" data-id="${escapeHtml(c.id)}">Hapus</button>
   <button class="btn" id="updateCustomer">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('updateCustomer')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('cust-name').value);
      if (!name) {
        showToast('Nama harus diisi', 'warning');
        return;
      }
      // FIX: Cascade name change to related Sales Orders
      const oldName = c.name;
      c.name = name;
      c.phone = sanitizeInput(document.getElementById('cust-phone').value);
      c.address = sanitizeInput(document.getElementById('cust-address').value);
      c.email = sanitizeInput(document.getElementById('cust-email').value);
      c.npwp = sanitizeInput(document.getElementById('cust-npwp').value);
      // Name-sync shim (Phase 1): keep the denormalized name current on related
      // docs, matching by the stable customerId when present and falling back to
      // the old name. Also opportunistically backfills a missing customerId.
      DB.salesOrders.forEach(o => {
        if (o.customerId === c.id || o.customer === oldName) {
          o.customer = name;
          if (o.customerId === null) {
            o.customerId = c.id;
          }
        }
      });
      DB.deliveryOrders.forEach(o => {
        if (o.customerId === c.id || o.customer === oldName) {
          o.customer = name;
          if (o.customerId === null) {
            o.customerId = c.id;
          }
        }
      });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function deleteCustomer(id) {
  const idx = DB.customers.findIndex(c => String(c.id) === String(id));
  if (idx === -1) {
    return;
  }
  const deleted = DB.customers[idx];

  // FIX: Check referential integrity before deleting
  const hasSO = DB.salesOrders.some(o => o.customer === deleted.name);
  if (hasSO) {
    showToast(
      `Tidak dapat menghapus "${deleted.name}" karena masih memiliki Sales Order. Hapus atau edit transaksi terkait terlebih dahulu.`,
      'danger'
    );
    return;
  }

  const hasDO = DB.deliveryOrders.some(o => o.customer === deleted.name);
  if (hasDO) {
    showToast(
      `Tidak dapat menghapus "${deleted.name}" karena masih memiliki Delivery Order. Hapus atau edit transaksi terkait terlebih dahulu.`,
      'danger'
    );
    return;
  }

  DB.customers.splice(idx, 1);
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Use ID-based lookup instead of captured array index
  showUndoToast(`${deleted.name} dihapus`, () => {
    const restoreIdx = DB.customers.findIndex(c => c.id > deleted.id);
    const insertAt = restoreIdx === -1 ? DB.customers.length : restoreIdx;
    DB.customers.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${deleted.name} dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIERS (Master Data)
// ═══════════════════════════════════════════════════════════════════════════════

function showAddSupplier() {
  openModal(
    'Tambah Supplier Baru',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Supplier / Perusahaan</label>
        <input class="form-input" id="supp-name" type="text" placeholder="PT. / CV. / UD.">
      </div>
      <div class="form-group">
        <label class="form-label">Nama Kontak</label>
        <input class="form-input" id="supp-contact" type="text" placeholder="Pak / Bu …">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">No. Telepon</label>
        <input class="form-input" id="supp-phone" type="text" placeholder="021-xxxx / 0812-xxxx">
      </div>
      <div class="form-group">
        <label class="form-label">Alamat / Kota</label>
        <input class="form-input" id="supp-address" type="text" placeholder="Bandung, Cikarang, dll.">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NPWP (opsional)</label>
        <input class="form-input" id="supp-npwp" type="text" placeholder="XX.XXX.XXX.X-XXX.XXX">
      </div>
      <div class="form-group"></div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveSupplier">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('saveSupplier')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('supp-name').value);
      const contact = sanitizeInput(document.getElementById('supp-contact').value);
      const phone = sanitizeInput(document.getElementById('supp-phone').value);
      const address = sanitizeInput(document.getElementById('supp-address').value);
      const npwp = sanitizeInput(document.getElementById('supp-npwp').value);
      if (!name) {
        showToast('Nama supplier harus diisi', 'warning');
        return;
      }
      // FIX: Prevent ID collision after deletion
      if (!DB._nextSuppId) {
        DB._nextSuppId = 0;
      }
      const maxId = DB.suppliers.reduce((m, s) => Math.max(m, Number.parseInt(s.id, 10) || 0), 0);
      const newId = Math.max(maxId, DB._nextSuppId) + 1;
      DB._nextSuppId = newId;
      DB.suppliers.push({ id: newId, name, contact, phone, address, npwp });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil ditambahkan`, 'success');
    });
  }, 50);
}

function viewSupplier(id) {
  const s = DB.suppliers.find(s => String(s.id) === String(id));
  if (!s) {
    showToast('Supplier tidak ditemukan', 'danger');
    return;
  }
  const orders = DB.purchaseOrders.filter(o => o.supplier === s.name);
  const totalVal = orders.reduce((t, o) => t + o.amount, 0);
  openModal(
    `Detail Supplier — ${escapeHtml(s.name)}`,
    `
    <div class="detail-grid">
      ${detailRow('Nama', escapeHtml(s.name))}
      ${detailRow('Kontak', escapeHtml(s.contact || '—'))}
      <div class="detail-divider"></div>
      ${detailRow('Telepon', escapeHtml(s.phone || '—'))}
      ${detailRow('Alamat', escapeHtml(s.address || '—'))}
      ${detailRow('NPWP', escapeHtml(s.npwp || '—'))}
      <div class="detail-divider"></div>
      ${detailRow('Total PO', `<span style="font-weight:800">${orders.length} order</span>`)}
      ${detailRow('Nilai Total', `<span style="font-weight:800;color:var(--primary)">${idrFull(totalVal)}</span>`)}
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
   <button class="btn-ghost" data-action="suppStatement" data-id="${escapeHtml(s.id)}">Kartu Hutang</button>
   <button class="btn" data-action="editSupplier" data-id="${escapeHtml(s.id)}">Edit</button>`
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// § 7b  KARTU PIUTANG / HUTANG — per-party running statement
// ────────────────────────────────────────────────────────────────────────────────
// Chronological ledger for one customer (AR) or supplier (AP): each faktur is a
// debit (grand total incl. PPN), each receipt/payment a credit, with a running
// balance ending at the party's outstanding balance. Rows link to the document.
// Matches both the id field and the party name so imported records are covered.
// ════════════════════════════════════════════════════════════════════════════════

function showPartyStatement(kind, id) {
  const isCust = kind === 'customer';
  const party = (isCust ? DB.customers : DB.suppliers).find(p => String(p.id) === String(id));
  if (!party) {
    showToast(isCust ? 'Pelanggan tidak ditemukan' : 'Supplier tidak ditemukan', 'danger');
    return;
  }
  const invColl = isCust ? 'salesInvoices' : 'purchaseInvoices';
  const payColl = isCust ? 'salesReceipts' : 'purchasePayments';
  const idField = isCust ? 'customerId' : 'supplierId';
  const nameField = isCust ? 'customer' : 'supplier';
  const DROP = new Set(['Cancelled', 'Void']);
  const grand = i => {
    const amt = Number(i.amount) || 0;
    return i.taxInclusive ? amt : amt + (Number(i.tax) || 0);
  };
  const matchesParty = d =>
    String(d[idField]) === String(id) || (d[nameField] && d[nameField] === party.name);

  const invoices = (DB[invColl] || []).filter(i => matchesParty(i) && !DROP.has(i.status));
  const invIds = new Set(invoices.map(i => i.id));
  const payments = (DB[payColl] || []).filter(
    p => matchesParty(p) || (p.invoiceId && invIds.has(p.invoiceId))
  );

  const entries = [];
  invoices.forEach(i =>
    entries.push({
      date: i.date || '',
      ref: docNum(i.number, i.id),
      refId: i.id,
      type: isCust ? 'SI' : 'PI',
      label: isCust ? 'Faktur Penjualan' : 'Faktur Pembelian',
      debit: grand(i),
      credit: 0,
    })
  );
  payments.forEach(p =>
    entries.push({
      date: p.date || '',
      ref: docNum(p.number, p.id),
      refId: p.id,
      type: isCust ? 'SR' : 'PP',
      label: isCust ? 'Penerimaan Pembayaran' : 'Pembayaran',
      debit: 0,
      credit: Number(p.amount) || 0,
    })
  );
  // Oldest first; on the same date a faktur (debit) precedes its settlement.
  entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : b.debit - a.debit));

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const outstanding = totalDebit - totalCredit;
  const m = v => idrFull(Math.round(v));
  const cell = (v, color) =>
    v
      ? `<span style="font-weight:700;color:${color}">${m(v)}</span>`
      : '<span style="color:var(--border)">—</span>';

  let bal = 0;
  const rows = entries
    .map(e => {
      bal += e.debit - e.credit;
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 10px;font-size:11px;color:var(--muted);white-space:nowrap">${escapeHtml(e.date)}</td>
        <td style="padding:6px 10px;font-size:12px">${escapeHtml(e.label)}</td>
        <td style="padding:6px 10px;font-size:11px">
          <a data-action="invView" data-id="${escapeHtml(e.refId)}" data-type="${e.type}"
             style="color:var(--primary);cursor:pointer;text-decoration:underline">${escapeHtml(e.ref)}</a></td>
        <td style="padding:6px 10px;font-size:12px;text-align:right">${cell(e.debit, '#FF3B30')}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right">${cell(e.credit, '#34C759')}</td>
        <td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:800">${m(bal)}</td>
      </tr>`;
    })
    .join('');

  const debitHdr = isCust ? 'Tagihan' : 'Hutang';
  const creditHdr = isCust ? 'Terima' : 'Bayar';
  const balLabel = isCust ? 'Saldo Piutang' : 'Saldo Hutang';
  const body = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
      <div><span style="color:var(--muted)">${isCust ? 'Total Tagihan' : 'Total Hutang'}:</span> <strong>${m(totalDebit)}</strong></div>
      <div><span style="color:var(--muted)">${isCust ? 'Total Diterima' : 'Total Dibayar'}:</span> <strong>${m(totalCredit)}</strong></div>
      <div><span style="color:var(--muted)">${balLabel}:</span> <strong style="color:${outstanding > 0 ? 'var(--danger)' : 'var(--primary)'}">${m(outstanding)}</strong></div>
    </div>
    <div style="border:1px solid var(--border);border-radius:10px;overflow:auto;max-height:60vh">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg);position:sticky;top:0">
          <tr>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Tanggal</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Keterangan</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Dokumen</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border);color:#FF3B30">${debitHdr}</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border);color:#34C759">${creditHdr}</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border)">Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows ||
            `<tr><td colspan="6" style="padding:16px;text-align:center;font-size:12px;color:var(--muted)">Belum ada faktur atau pembayaran untuk ${escapeHtml(party.name)}.</td></tr>`
          }
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--border);background:var(--bg)">
            <td colspan="3" style="padding:7px 10px;font-size:12px;font-weight:800;text-align:right">${balLabel}</td>
            <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700">${m(totalDebit)}</td>
            <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700">${m(totalCredit)}</td>
            <td style="padding:7px 10px;font-size:13px;text-align:right;font-weight:800;color:${outstanding > 0 ? 'var(--danger)' : 'var(--primary)'}">${m(outstanding)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  openModal(
    `${isCust ? 'Kartu Piutang' : 'Kartu Hutang'} — ${escapeHtml(party.name)}`,
    body,
    `<button class="btn-ghost" data-action="${isCust ? 'viewCustomer' : 'viewSupplier'}" data-id="${escapeHtml(id)}">← Detail</button>
     <button class="btn" data-action="closeModal">Tutup</button>`
  );
}

function editSupplier(id) {
  const s = DB.suppliers.find(s => String(s.id) === String(id));
  if (!s) {
    showToast('Supplier tidak ditemukan', 'danger');
    return;
  }
  openModal(
    `Edit Supplier — ${escapeHtml(s.name)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama</label>
        <input class="form-input" id="supp-name" type="text" value="${escapeHtml(s.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Nama Kontak</label>
        <input class="form-input" id="supp-contact" type="text" value="${escapeHtml(s.contact || '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Telepon</label>
        <input class="form-input" id="supp-phone" type="text" value="${escapeHtml(s.phone || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Alamat / Kota</label>
        <input class="form-input" id="supp-address" type="text" value="${escapeHtml(s.address || '')}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">NPWP</label>
        <input class="form-input" id="supp-npwp" type="text" value="${escapeHtml(s.npwp || '')}">
      </div>
      <div class="form-group"></div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deleteSupplier" data-id="${escapeHtml(s.id)}">Hapus</button>
   <button class="btn" id="updateSupplier">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('updateSupplier')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('supp-name').value);
      if (!name) {
        showToast('Nama harus diisi', 'warning');
        return;
      }
      // FIX: Cascade name change to related Purchase Orders
      const oldName = s.name;
      s.name = name;
      s.contact = sanitizeInput(document.getElementById('supp-contact').value);
      s.phone = sanitizeInput(document.getElementById('supp-phone').value);
      s.address = sanitizeInput(document.getElementById('supp-address').value);
      s.npwp = sanitizeInput(document.getElementById('supp-npwp').value);
      // Name-sync shim (Phase 1): match by stable supplierId when present, falling
      // back to the old name; opportunistically backfills a missing supplierId.
      DB.purchaseOrders.forEach(o => {
        if (o.supplierId === s.id || o.supplier === oldName) {
          o.supplier = name;
          if (o.supplierId === null) {
            o.supplierId = s.id;
          }
        }
      });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function deleteSupplier(id) {
  const idx = DB.suppliers.findIndex(s => String(s.id) === String(id));
  if (idx === -1) {
    return;
  }
  const deleted = DB.suppliers[idx];

  // FIX: Check referential integrity before deleting
  const hasPO = DB.purchaseOrders.some(o => o.supplier === deleted.name);
  if (hasPO) {
    showToast(
      `Tidak dapat menghapus "${deleted.name}" karena masih memiliki Purchase Order. Hapus atau edit transaksi terkait terlebih dahulu.`,
      'danger'
    );
    return;
  }

  DB.suppliers.splice(idx, 1);
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Use ID-based lookup instead of captured array index
  showUndoToast(`${deleted.name} dihapus`, () => {
    const restoreIdx = DB.suppliers.findIndex(s => s.id > deleted.id);
    const insertAt = restoreIdx === -1 ? DB.suppliers.length : restoreIdx;
    DB.suppliers.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${deleted.name} dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE DETAIL & SETTINGS PANELS
// ═══════════════════════════════════════════════════════════════════════════════

function showFinanceDetail(title, items) {
  openModal(
    title,
    `<ul style="list-style:none;display:flex;flex-direction:column;gap:10px">
       ${items
         .map(
           item => `
         <li style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                    background:var(--bg);border-radius:10px;font-size:13px;font-weight:600">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <polyline points="20 6 9 17 4 12"/>
           </svg>
           ${escapeHtml(item)}
         </li>`
         )
         .join('')}
     </ul>`,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );
}

function showSettingPanel(title, sub) {
  openModal(
    title,
    `<div style="text-align:center;padding:24px 0 12px">
       <div style="width:52px;height:52px;border-radius:14px;background:var(--primary-light);
                   display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
         </svg>
       </div>
       <div style="font-size:15px;font-weight:700;margin-bottom:6px">${escapeHtml(title)}</div>
       <div style="font-size:12px;color:var(--muted);margin-bottom:20px">${escapeHtml(sub)}</div>
       <div style="padding:14px;background:var(--bg);border-radius:10px;font-size:12px;color:var(--muted)">
         Panel pengaturan ini akan tersedia di versi berikutnya.
       </div>
     </div>`,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );
}

function showTaxSettings() {
  const t = (DB.settings && DB.settings.tax) || {};
  const ppnRate = typeof t.ppnRate === 'number' ? t.ppnRate * 100 : 11;
  const pphRate = typeof t.pphRate === 'number' ? t.pphRate * 100 : 0;

  openModal(
    'Pengaturan Pajak',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Status PKP</label>
        <select class="form-select" id="tax-pkp">
          <option value="true" ${t.pkp !== false ? 'selected' : ''}>Terdaftar</option>
          <option value="false" ${t.pkp === false ? 'selected' : ''}>Belum PKP</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">NPWP</label>
        <input class="form-input" id="tax-npwp" type="text" value="${escapeHtml(t.npwp || '')}" placeholder="01.234.567.8-901.000">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tarif PPN (%)</label>
        <input class="form-input" id="tax-ppn" type="number" step="0.01" value="${ppnRate}">
      </div>
      <div class="form-group">
        <label class="form-label">Tarif PPh (%)</label>
        <input class="form-input" id="tax-pph" type="number" step="0.01" value="${pphRate}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Pembulatan Pajak</label>
      <select class="form-select" id="tax-rounding">
        <option value="round" ${t.rounding !== 'floor' && t.rounding !== 'ceil' ? 'selected' : ''}>Bulat normal</option>
        <option value="floor" ${t.rounding === 'floor' ? 'selected' : ''}>Bulat ke bawah</option>
        <option value="ceil" ${t.rounding === 'ceil' ? 'selected' : ''}>Bulat ke atas</option>
      </select>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:8px">
      Tarif PPN/PPh disimpan dalam bentuk persen dan dihitung dari total transaksi non-draft.
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveTaxSettings">Simpan</button>`
  );

  setTimeout(() => {
    const btn = document.getElementById('saveTaxSettings');
    if (!btn) {
      return;
    }
    btn.addEventListener('click', () => {
      const pkp = document.getElementById('tax-pkp').value === 'true';
      let ppn = sanitizeInput(document.getElementById('tax-ppn').value, 'number');
      let pph = sanitizeInput(document.getElementById('tax-pph').value, 'number');
      const npwp = sanitizeInput(document.getElementById('tax-npwp').value);
      const rounding = document.getElementById('tax-rounding').value;

      if (ppn > 1) {
        ppn = ppn / 100;
      }
      if (pph > 1) {
        pph = pph / 100;
      }
      ppn = Math.max(0, Math.min(ppn, 1));
      pph = Math.max(0, Math.min(pph, 1));

      if (!DB.settings) {
        DB.settings = {};
      }
      DB.settings.tax = { pkp, npwp, ppnRate: ppn, pphRate: pph, rounding };
      saveDB();
      closeModal();
      showToast('Pengaturan pajak diperbarui', 'success');
    });
  }, 50);
}

// ── Department → role access (RBAC, option 1: department drives access) ───────
// Departments are stored in DB.settings.departments [{ id, name, role }]. An
// employee belongs to a department and carries an email; the login account whose
// email matches gets that department's role written to users/{uid}.role (the
// rules-facing field — admin-only at the server, so no escalation path).
function getDepartments() {
  if (!DB.settings) {
    DB.settings = {};
  }
  if (!Array.isArray(DB.settings.departments)) {
    DB.settings.departments = [];
  }
  return DB.settings.departments;
}

// Resolve the role for a login email via matched Employee → Department.
// Returns { role, employee, department } or null.
function roleForEmail(email) {
  const mail = (email || '').trim().toLowerCase();
  if (!mail) {
    return null;
  }
  const emp = (DB.employees || []).find(
    e => e && (e.email || '').trim().toLowerCase() === mail
  );
  if (!emp || !emp.departmentId) {
    return null;
  }
  const dept = getDepartments().find(d => d.id === emp.departmentId);
  if (!dept || !dept.role) {
    return null;
  }
  return { role: dept.role, employee: emp, department: dept };
}

// Push department-derived roles to matching login accounts. Admin only (server
// rules also enforce). opts.silent suppresses the "no change" toast.
async function applyDepartmentRoles(opts) {
  opts = opts || {};
  if (!(window.RBAC && window.RBAC.canManageUsers && window.RBAC.canManageUsers())) {
    if (!opts.silent) {
      showToast('Hanya Admin yang dapat menyinkronkan peran.', 'danger');
    }
    return 0;
  }
  if (!window.erpUsers || typeof window.erpUsers.list !== 'function') {
    return 0;
  }
  let users;
  try {
    users = await window.erpUsers.list();
  } catch (e) {
    if (!opts.silent) {
      showToast('Gagal memuat pengguna: ' + (e?.message || e), 'danger');
    }
    return 0;
  }
  let changed = 0;
  for (const u of users) {
    const r = roleForEmail(u.email);
    if (r && r.role !== u.role) {
      try {
        await window.erpUsers.setRole(u.uid, r.role, true);
        changed++;
      } catch (_) {
        /* server rejected — skip */
      }
    }
  }
  if (!opts.silent || changed > 0) {
    showToast(
      changed > 0 ? `${changed} peran disinkronkan dari Departemen` : 'Tidak ada perubahan peran',
      changed > 0 ? 'success' : 'info'
    );
  }
  return changed;
}
window.applyDepartmentRoles = applyDepartmentRoles;

// Admin UI: manage the Department → Role map.
function showDepartments() {
  if (!(window.RBAC && window.RBAC.canManageUsers && window.RBAC.canManageUsers())) {
    showToast('Akses ditolak — hanya Admin.', 'danger');
    return;
  }
  const ROLE_LABELS = (window.erpUsers && window.erpUsers.roleLabels) || {};
  const ROLES = (window.erpUsers && window.erpUsers.roles) || [
    'admin',
    'manajer',
    'akunting',
    'penjualan',
    'viewer',
  ];
  // Work on a copy; commit to DB only on Simpan.
  const depts = JSON.parse(JSON.stringify(getDepartments()));

  const roleOpts = sel =>
    ROLES.map(
      r => `<option value="${escapeHtml(r)}"${r === sel ? ' selected' : ''}>${escapeHtml(ROLE_LABELS[r] || r)}</option>`
    ).join('');

  const rowsHTML = () =>
    depts.length === 0
      ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px">Belum ada departemen.</div>`
      : depts
          .map(
            d => `<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
            <input class="form-input dept-name" data-id="${escapeHtml(d.id)}" value="${escapeHtml(d.name)}" style="font-size:11px;flex:1;padding:4px 8px">
            <select class="form-input dept-role" data-id="${escapeHtml(d.id)}" style="font-size:11px;width:auto;padding:4px 8px">${roleOpts(d.role)}</select>
            <button class="btn-ghost dept-del" data-id="${escapeHtml(d.id)}" style="font-size:11px;padding:4px 8px;color:var(--danger)">Hapus</button>
          </div>`
          )
          .join('');

  openModal(
    'Kelola Departemen',
    `<p style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.5">
       Tiap departemen dipetakan ke satu peran. Karyawan di departemen itu (yang
       emailnya cocok dengan akun login) otomatis mendapat peran tersebut saat
       disinkronkan di Manajemen Pengguna.
     </p>
     <div id="dept-list">${rowsHTML()}</div>
     <button class="btn-ghost" id="dept-add" style="font-size:11px;margin-top:10px">+ Tambah Departemen</button>`,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button><button class="btn" id="dept-save">Simpan</button>`,
    true
  );

  setTimeout(() => {
    const sync = () => {
      // Pull current edits from the DOM into the working array before re-render.
      document.querySelectorAll('.dept-name').forEach(inp => {
        const d = depts.find(x => x.id === inp.dataset.id);
        if (d) {
          d.name = inp.value;
        }
      });
      document.querySelectorAll('.dept-role').forEach(sel => {
        const d = depts.find(x => x.id === sel.dataset.id);
        if (d) {
          d.role = sel.value;
        }
      });
    };
    const rerender = () => {
      const el = document.getElementById('dept-list');
      if (el) {
        el.innerHTML = rowsHTML();
      }
      bindDel();
    };
    const bindDel = () => {
      document.querySelectorAll('.dept-del').forEach(b =>
        b.addEventListener('click', () => {
          sync();
          const i = depts.findIndex(d => d.id === b.dataset.id);
          if (i >= 0) {
            depts.splice(i, 1);
          }
          rerender();
        })
      );
    };
    bindDel();
    document.getElementById('dept-add')?.addEventListener('click', () => {
      sync();
      depts.push({ id: 'DEPT-' + Date.now().toString(36), name: 'Departemen Baru', role: 'viewer' });
      rerender();
    });
    document.getElementById('dept-save')?.addEventListener('click', () => {
      sync();
      DB.settings.departments = depts.filter(d => (d.name || '').trim());
      saveDB();
      closeModal();
      showToast('Departemen disimpan', 'success');
    });
  }, 60);
}
window.showDepartments = showDepartments;

// Real multi-user management. Accounts are created in the Firebase Console
// (no self-service signup); this screen assigns each signed-in user a role and
// activates/deactivates them. Backed by the `users/{uid}` collection via
// window.erpUsers (src/core/user-role.js). Admin-only — enforced here AND by
// firestore.rules (only an admin can write users/{uid}).
function showUserManagement() {
  if (window.RBAC && typeof window.RBAC.canManageUsers === 'function' && !window.RBAC.canManageUsers()) {
    showToast('Akses ditolak — hanya Admin yang dapat mengelola pengguna.', 'danger');
    return;
  }
  if (!window.erpUsers || typeof window.erpUsers.list !== 'function') {
    showToast('Manajemen pengguna belum siap (modul belum dimuat).', 'warning');
    return;
  }

  const ROLE_LABELS = window.erpUsers.roleLabels || {};
  const ROLES = window.erpUsers.roles || ['admin', 'manajer', 'akunting', 'penjualan', 'viewer'];
  const myUid = (window.__ERP_USER && window.__ERP_USER.uid) || null;
  const isLocal = (window.__ERP_USER && window.__ERP_USER.mode) === 'local';

  const intro = isLocal
    ? `<p style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.5">
         Akun login lokal (username + password). Tambah pengguna, atur peran,
         reset password, atau nonaktifkan akun di sini. Password disimpan
         ter-hash di perangkat ini.
       </p>
       <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
         <button class="btn" id="um-add" style="font-size:11px;padding:4px 10px">＋ Tambah User</button>
         <button class="btn-ghost" id="um-log" style="font-size:11px;padding:4px 10px">📋 Log Aktivitas User</button>
       </div>`
    : `<p style="font-size:11px;color:var(--muted);margin-bottom:10px;line-height:1.5">
         Akun dibuat di Firebase Console. Pengguna yang sudah login muncul di sini
         dengan role <strong>pending</strong> hingga Anda menetapkan peran. Peran
         bisa diatur otomatis dari <strong>Departemen</strong> karyawan (cocok via
         email) atau manual di sini. Perubahan tersimpan langsung ke cloud.
       </p>
       <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
         <button class="btn-ghost" id="um-depts" style="font-size:11px;padding:4px 10px">Kelola Departemen</button>
         <button class="btn" id="um-sync" style="font-size:11px;padding:4px 10px">Sinkronkan dari Departemen</button>
         <button class="btn-ghost" id="um-log" style="font-size:11px;padding:4px 10px">📋 Log Aktivitas User</button>
         <button class="btn-ghost" id="um-access-log" style="font-size:11px;padding:4px 10px">🔒 Log Akses (Audit)</button>
       </div>`;

  openModal(
    'Manajemen Pengguna',
    `${intro}
     <div id="um-list" style="min-height:60px">
       <div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Memuat daftar pengguna…</div>
     </div>`,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`,
    true
  );

  function roleOptions(selected) {
    return ['pending']
      .concat(ROLES)
      .map(
        r =>
          `<option value="${escapeHtml(r)}"${r === selected ? ' selected' : ''}>${escapeHtml(ROLE_LABELS[r] || r)}</option>`
      )
      .join('');
  }

  function render(list) {
    const el = document.getElementById('um-list');
    if (!el) {
      return;
    }
    if (!list.length) {
      el.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada pengguna terdaftar.</div>`;
      return;
    }
    el.innerHTML = list
      .map(u => {
        const self = u.uid === myUid;
        const active = u.active !== false;
        const der = u.local ? null : roleForEmail(u.email);
        const deptLine = der
          ? `<div style="font-size:10px;color:${der.role === u.role ? 'var(--muted)' : 'var(--primary,#2563eb)'};margin-top:1px">
               Dept: ${escapeHtml(der.department.name)} → ${escapeHtml((ROLE_LABELS[der.role] || der.role))}${der.role !== u.role ? ' · belum sinkron' : ''}
             </div>`
          : '';
        const subLine = u.local
          ? `@${escapeHtml(u.username || u.uid)}${u.mustChangePassword ? ' · <span style="color:var(--warning,#b45309)">password default</span>' : ''}`
          : escapeHtml(u.email || '—');
        const localActions = u.local
          ? `<button class="btn-ghost um-reset" data-uid="${escapeHtml(u.uid)}" style="font-size:10px;padding:3px 7px">Reset PW</button>
             ${u.uid === 'admin' ? '' : `<button class="btn-ghost um-del" data-uid="${escapeHtml(u.uid)}" style="font-size:10px;padding:3px 7px;color:var(--danger)">Hapus</button>`}`
          : '';
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:700">${escapeHtml(u.displayName || u.email || u.uid)}${self ? ' <span style="color:var(--muted);font-weight:400">(Anda)</span>' : ''}</div>
            <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subLine}</div>
            ${deptLine}
          </div>
          <select class="form-input um-role" data-uid="${escapeHtml(u.uid)}" ${self ? 'disabled title="Anda tidak dapat mengubah peran sendiri"' : ''} style="font-size:11px;width:auto;padding:4px 8px">
            ${roleOptions(u.role || 'pending')}
          </select>
          <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:${self ? 'not-allowed' : 'pointer'}">
            <input type="checkbox" class="um-active" data-uid="${escapeHtml(u.uid)}" ${active ? 'checked' : ''} ${self ? 'disabled' : ''}> Aktif
          </label>
          ${localActions}
        </div>`;
      })
      .join('');

    el.querySelectorAll('.um-reset').forEach(btn =>
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const pw = prompt(`Password baru untuk "${uid}" (minimal 6 karakter):`);
        if (pw == null) return;
        try {
          await window.erpUsers.resetPassword(uid, pw);
          showToast('Password direset', 'success');
          load();
        } catch (e) {
          showToast(e?.message || 'Gagal reset password', 'danger');
        }
      })
    );
    el.querySelectorAll('.um-del').forEach(btn =>
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        if (!confirm(`Hapus user "${uid}"? Tindakan ini tidak dapat dibatalkan.`)) return;
        try {
          await window.erpUsers.remove(uid);
          showToast('User dihapus', 'success');
          load();
        } catch (e) {
          showToast(e?.message || 'Gagal menghapus user', 'danger');
        }
      })
    );

    el.querySelectorAll('.um-role, .um-active').forEach(ctrl => {
      ctrl.addEventListener('change', async () => {
        const uid = ctrl.dataset.uid;
        const roleSel = el.querySelector(`.um-role[data-uid="${uid}"]`);
        const activeBox = el.querySelector(`.um-active[data-uid="${uid}"]`);
        const role = roleSel ? roleSel.value : 'pending';
        const active = activeBox ? activeBox.checked : true;
        try {
          await window.erpUsers.setRole(uid, role, active);
          showToast('Peran pengguna diperbarui', 'success');
        } catch (e) {
          showToast(e?.message || 'Gagal memperbarui peran', 'danger');
          load(); // re-sync UI with server truth
        }
      });
    });
  }

  function load() {
    window.erpUsers
      .list()
      .then(render)
      .catch(e => {
        const el = document.getElementById('um-list');
        if (el) {
          el.innerHTML = `<div style="font-size:12px;color:var(--danger);text-align:center;padding:14px">Gagal memuat: ${escapeHtml(e?.message || String(e))}</div>`;
        }
      });
  }

  setTimeout(() => {
    document.getElementById('um-depts')?.addEventListener('click', showDepartments);
    document.getElementById('um-sync')?.addEventListener('click', async () => {
      await applyDepartmentRoles({});
      load();
    });
    document.getElementById('um-add')?.addEventListener('click', () => showAddLocalUser(load));
    document.getElementById('um-log')?.addEventListener('click', showLoginLog);
    document.getElementById('um-access-log')?.addEventListener('click', showAccessLog);
    load();
  }, 60);
}

// Add a new local user. onDone re-renders the user list when provided.
function showAddLocalUser(onDone) {
  if (!window.erpUsers || typeof window.erpUsers.create !== 'function') {
    showToast('Tambah user tidak tersedia', 'warning');
    return;
  }
  const ROLE_LABELS = window.erpUsers.roleLabels || {};
  const ROLES = window.erpUsers.roles || ['admin', 'manajer', 'akunting', 'penjualan', 'viewer'];
  const roleOpts = ROLES.map(
    r => `<option value="${escapeHtml(r)}"${r === 'admin' ? ' selected' : ''}>${escapeHtml(ROLE_LABELS[r] || r)}</option>`
  ).join('');
  openModal(
    'Tambah User',
    `<div class="form-group">
       <label class="form-label">Username</label>
       <input class="form-input" id="au-username" type="text" autocapitalize="none" placeholder="cth: budi" spellcheck="false">
     </div>
     <div class="form-group">
       <label class="form-label">Nama Tampilan</label>
       <input class="form-input" id="au-name" type="text" placeholder="cth: Budi Santoso">
     </div>
     <div class="form-group">
       <label class="form-label">Password (min. 6 karakter)</label>
       <input class="form-input" id="au-pw" type="text" placeholder="Password awal">
     </div>
     <div class="form-group">
       <label class="form-label">Peran</label>
       <select class="form-select" id="au-role">${roleOpts}</select>
     </div>`,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="au-save">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('au-save')?.addEventListener('click', async () => {
      const username = (document.getElementById('au-username')?.value || '').trim();
      const name = (document.getElementById('au-name')?.value || '').trim();
      const pw = document.getElementById('au-pw')?.value || '';
      const role = document.getElementById('au-role')?.value || 'admin';
      try {
        await window.erpUsers.create(username, name || username, pw, role);
        showToast(`User "${username}" dibuat`, 'success');
        closeModal();
        if (typeof onDone === 'function') {
          // Re-open the user management list so the new user is visible.
          showUserManagement();
        }
      } catch (e) {
        showToast(e?.message || 'Gagal membuat user', 'danger');
      }
    });
  }, 40);
}

// Login activity log — who signed in/out, when.
function showLoginLog() {
  const log =
    window.erpUsers && typeof window.erpUsers.loginLog === 'function'
      ? window.erpUsers.loginLog()
      : [];
  const fmt = ts => {
    try {
      return new Date(ts).toLocaleString('id-ID');
    } catch (_) {
      return String(ts);
    }
  };
  const rows = log.length
    ? log
        .map(
          e => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 8px;font-size:12px;font-weight:600">${escapeHtml(e.displayName || e.username)}</td>
        <td style="padding:6px 8px;font-size:11px;color:var(--muted)">@${escapeHtml(e.username)}</td>
        <td style="padding:6px 8px;font-size:11px">${
          e.event === 'logout'
            ? '<span style="color:var(--muted)">Logout</span>'
            : '<span style="color:var(--success,#16a34a);font-weight:700">Login</span>'
        }</td>
        <td style="padding:6px 8px;font-size:11px;color:var(--muted);white-space:nowrap">${escapeHtml(fmt(e.ts))}</td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Belum ada aktivitas login.</td></tr>';
  openModal(
    'Log Aktivitas User',
    `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Menampilkan ${log.length} aktivitas terakhir (login/logout).</div>
     <div class="table-wrap" style="overflow:auto;max-height:60vh">
       <table style="width:100%;border-collapse:collapse">
         <thead><tr style="border-bottom:1.5px solid var(--border)">
           <th style="text-align:left;padding:6px 8px;font-size:11px">Nama</th>
           <th style="text-align:left;padding:6px 8px;font-size:11px">Username</th>
           <th style="text-align:left;padding:6px 8px;font-size:11px">Aktivitas</th>
           <th style="text-align:left;padding:6px 8px;font-size:11px">Waktu</th>
         </tr></thead>
         <tbody>${rows}</tbody>
       </table>
     </div>`,
    `<button class="btn-ghost" id="ll-clear" style="color:var(--danger)">Bersihkan Log</button>
     <button class="btn-ghost" id="ll-back">Kembali</button>
     <button class="btn" data-action="closeModal">Tutup</button>`,
    true
  );
  setTimeout(() => {
    document.getElementById('ll-back')?.addEventListener('click', showUserManagement);
    document.getElementById('ll-clear')?.addEventListener('click', () => {
      if (!confirm('Bersihkan seluruh log aktivitas login?')) return;
      if (window.erpUsers && typeof window.erpUsers.clearLoginLog === 'function') {
        window.erpUsers.clearLoginLog();
      }
      showToast('Log dibersihkan', 'success');
      showLoginLog();
    });
  }, 40);
}

// Server-enforced audit trail (accessLog): every create/update/delete on a
// business record, plus login/logout/failed-login — written by Cloud Functions
// (functions/access-log.js) via the Admin SDK, so unlike the local login log
// above, this one has no "clear" button: nobody can erase it from the app.
function showAccessLog() {
  openModal(
    'Log Akses (Audit Trail)',
    `<div id="al-list" style="min-height:60px">
       <div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Memuat log akses…</div>
     </div>`,
    `<button class="btn-ghost" id="al-back">Kembali</button>
     <button class="btn" data-action="closeModal">Tutup</button>`,
    true
  );

  const fmt = ts => {
    try {
      return new Date(ts).toLocaleString('id-ID');
    } catch (_) {
      return String(ts);
    }
  };
  const ACTION_LABELS = {
    create: '<span style="color:var(--success,#16a34a);font-weight:700">Tambah</span>',
    update: '<span style="color:var(--primary,#2563eb);font-weight:700">Ubah</span>',
    delete: '<span style="color:var(--danger);font-weight:700">Hapus</span>',
    login: '<span style="color:var(--success,#16a34a);font-weight:700">Login</span>',
    logout: '<span style="color:var(--muted)">Logout</span>',
    login_failed: '<span style="color:var(--danger);font-weight:700">Login Gagal</span>',
  };

  function render(entries) {
    const el = document.getElementById('al-list');
    if (!el) {
      return;
    }
    if (!entries.length) {
      el.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada aktivitas tercatat.</div>`;
      return;
    }
    const rows = entries
      .map(
        e => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 8px;font-size:11px;color:var(--muted);white-space:nowrap">${escapeHtml(fmt(e.at))}</td>
        <td style="padding:6px 8px;font-size:12px;font-weight:600">${escapeHtml(e.actor || '—')}</td>
        <td style="padding:6px 8px;font-size:11px">${ACTION_LABELS[e.action] || escapeHtml(e.action || '')}</td>
        <td style="padding:6px 8px;font-size:11px;color:var(--muted)">${escapeHtml(e.collection || '—')}</td>
        <td style="padding:6px 8px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px">${escapeHtml(e.docId || '')}</td>
      </tr>`
      )
      .join('');
    el.innerHTML = `
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Menampilkan ${entries.length} aktivitas terakhir. Log ini ditulis oleh server — tidak bisa diubah atau dihapus lewat aplikasi.</div>
      <div class="table-wrap" style="overflow:auto;max-height:55vh">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1.5px solid var(--border)">
            <th style="text-align:left;padding:6px 8px;font-size:11px">Waktu</th>
            <th style="text-align:left;padding:6px 8px;font-size:11px">User</th>
            <th style="text-align:left;padding:6px 8px;font-size:11px">Aksi</th>
            <th style="text-align:left;padding:6px 8px;font-size:11px">Koleksi</th>
            <th style="text-align:left;padding:6px 8px;font-size:11px">Dokumen</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  if (window.erpUsers && typeof window.erpUsers.accessLog === 'function') {
    window.erpUsers
      .accessLog(300)
      .then(render)
      .catch(e => {
        const el = document.getElementById('al-list');
        if (el) {
          el.innerHTML = `<div style="font-size:12px;color:var(--danger);text-align:center;padding:14px">Gagal memuat: ${escapeHtml(e?.message || String(e))}</div>`;
        }
      });
  } else {
    render([]);
  }

  setTimeout(() => {
    document.getElementById('al-back')?.addEventListener('click', showUserManagement);
  }, 40);
}

function showAddUser() {
  openModal(
    'Tambah Pengguna',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama</label>
        <input class="form-input" id="user-name" type="text" placeholder="Nama lengkap">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="user-email" type="email" placeholder="user@perusahaan.com">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Peran</label>
        <input class="form-input" id="user-role" type="text" placeholder="Staff">
      </div>
      <div class="form-group">
        <label class="form-label">Akses</label>
        <input class="form-input" id="user-access" type="text" placeholder="Sales / Finance">
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveUser">Simpan</button>`
  );

  setTimeout(() => {
    const btn = document.getElementById('saveUser');
    if (!btn) {
      return;
    }
    btn.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('user-name').value);
      const email = sanitizeInput(document.getElementById('user-email').value);
      const role = sanitizeInput(document.getElementById('user-role').value) || 'Staff';
      const access = sanitizeInput(document.getElementById('user-access').value);

      if (!name) {
        showToast('Nama harus diisi', 'warning');
        return;
      }

      if (!DB.settings) {
        DB.settings = {};
      }
      if (!Array.isArray(DB.settings.users)) {
        DB.settings.users = [];
      }

      const newUser = {
        id: nextId('USR', DB.settings.users, 'id'),
        name,
        email,
        role,
        access,
      };
      DB.settings.users.unshift(newUser);
      saveDB();
      closeModal();
      showToast('Pengguna ditambahkan', 'success');
      showUserManagement();
    });
  }, 50);
}

function showItemCategories() {
  if (!DB.settings) {
    DB.settings = {};
  }
  const derived = [...new Set(DB.inventoryItems.map(i => i.category).filter(Boolean))];
  if (!Array.isArray(DB.settings.itemCategories)) {
    DB.settings.itemCategories = [];
  }
  const categories = [...new Set([...DB.settings.itemCategories, ...derived])];

  openModal(
    'Kategori Item',
    `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">Kategori Tersimpan</div>
      <button class="btn-ghost" id="addCategoryBtn" style="font-size:11px;padding:4px 10px">+ Tambah</button>
    </div>
    ${
      categories.length === 0
        ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada kategori item.</div>`
        : categories
            .map(
              c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:700">${escapeHtml(c)}</div>
        <button class="btn-ghost" data-cat="${escapeHtml(c)}" style="font-size:11px;padding:4px 8px">Hapus</button>
      </div>`
            )
            .join('')
    }
    <div style="font-size:11px;color:var(--muted);margin-top:10px">
      Menghapus kategori tidak mengubah data item yang sudah ada.
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );

  setTimeout(() => {
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
      showAddItemCategory();
    });
    document.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        DB.settings.itemCategories = DB.settings.itemCategories.filter(c => c !== cat);
        saveDB();
        showToast('Kategori dihapus', 'success');
        showItemCategories();
      });
    });
  }, 50);
}

function showAddItemCategory() {
  openModal(
    'Tambah Kategori Item',
    `
    <div class="form-group">
      <label class="form-label">Nama Kategori</label>
      <input class="form-input" id="new-category-name" type="text" placeholder="Contoh: Granit Premium">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveCategory">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveCategory')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('new-category-name').value);
      if (!name) {
        showToast('Nama kategori harus diisi', 'warning');
        return;
      }
      if (!DB.settings) {
        DB.settings = {};
      }
      if (!Array.isArray(DB.settings.itemCategories)) {
        DB.settings.itemCategories = [];
      }
      if (!DB.settings.itemCategories.includes(name)) {
        DB.settings.itemCategories.unshift(name);
      }
      saveDB();
      closeModal();
      showToast('Kategori ditambahkan', 'success');
      showItemCategories();
    });
  }, 50);
}

function showUnitSettings() {
  if (!DB.settings) {
    DB.settings = {};
  }
  const derived = [...new Set(DB.inventoryItems.map(i => i.unit).filter(Boolean))];
  if (!Array.isArray(DB.settings.units)) {
    DB.settings.units = [];
  }
  const units = [...new Set([...DB.settings.units, ...derived])];

  openModal(
    'Satuan Ukur',
    `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">Daftar Satuan</div>
      <button class="btn-ghost" id="addUnitBtn" style="font-size:11px;padding:4px 10px">+ Tambah</button>
    </div>
    ${
      units.length === 0
        ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:14px">Belum ada satuan ukur.</div>`
        : units
            .map(
              u => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:700">${escapeHtml(u)}</div>
        <button class="btn-ghost" data-unit="${escapeHtml(u)}" style="font-size:11px;padding:4px 8px">Hapus</button>
      </div>`
            )
            .join('')
    }
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>`
  );

  setTimeout(() => {
    document.getElementById('addUnitBtn')?.addEventListener('click', () => {
      showAddUnit();
    });
    document.querySelectorAll('[data-unit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        DB.settings.units = DB.settings.units.filter(u => u !== unit);
        saveDB();
        showToast('Satuan dihapus', 'success');
        showUnitSettings();
      });
    });
  }, 50);
}

function showAddUnit() {
  openModal(
    'Tambah Satuan Ukur',
    `
    <div class="form-group">
      <label class="form-label">Nama Satuan</label>
      <input class="form-input" id="new-unit-name" type="text" placeholder="Contoh: box">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveUnit">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveUnit')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('new-unit-name').value);
      if (!name) {
        showToast('Nama satuan harus diisi', 'warning');
        return;
      }
      if (!DB.settings) {
        DB.settings = {};
      }
      if (!Array.isArray(DB.settings.units)) {
        DB.settings.units = [];
      }
      if (!DB.settings.units.includes(name)) {
        DB.settings.units.unshift(name);
      }
      saveDB();
      closeModal();
      showToast('Satuan ditambahkan', 'success');
      showUnitSettings();
    });
  }, 50);
}

function ensureAssetSettings() {
  if (!DB.settings) {
    DB.settings = {};
  }
  if (!Array.isArray(DB.settings.assets)) {
    DB.settings.assets = [];
  }
  if (!Array.isArray(DB.settings.assetCategories)) {
    DB.settings.assetCategories = [];
  }
  if (!Array.isArray(DB.settings.assetFiscalCategories)) {
    DB.settings.assetFiscalCategories = [];
  }
  if (!Array.isArray(DB.settings.assetTransfers)) {
    DB.settings.assetTransfers = [];
  }
  if (!Array.isArray(DB.settings.assetDisposals)) {
    DB.settings.assetDisposals = [];
  }
}

function showAddAsset() {
  ensureAssetSettings();
  const cats = DB.settings.assetCategories || [];
  const fiscal = DB.settings.assetFiscalCategories || [];

  openModal(
    'Tambah Aset Tetap',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Aset</label>
        <input class="form-input" id="asset-name" type="text" placeholder="Contoh: Forklift Komatsu">
      </div>
      <div class="form-group">
        <label class="form-label">Kategori</label>
        <input class="form-input" id="asset-category" type="text" list="asset-category-list" placeholder="Bangunan">
        <datalist id="asset-category-list">
          ${cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal Perolehan</label>
        <input class="form-input" id="asset-date" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Nilai Perolehan</label>
        <input class="form-input" id="asset-cost" type="number" step="0.01" placeholder="150000000">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Lokasi</label>
        <input class="form-input" id="asset-location" type="text" placeholder="Gudang Utama">
      </div>
      <div class="form-group">
        <label class="form-label">Kategori Fiskal</label>
        <input class="form-input" id="asset-fiscal" type="text" list="asset-fiscal-list" placeholder="Golongan 1">
        <datalist id="asset-fiscal-list">
          ${fiscal.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-select" id="asset-status">
        <option value="OK">Normal</option>
        <option value="Maintenance">Servis/Perbaikan</option>
        <option value="Disposed">Dilepas</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Catatan</label>
      <input class="form-input" id="asset-notes" type="text" placeholder="Opsional">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveAsset">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveAsset')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('asset-name').value);
      const category = sanitizeInput(document.getElementById('asset-category').value);
      const acquired = sanitizeInput(document.getElementById('asset-date').value, 'date');
      const cost = sanitizeInput(document.getElementById('asset-cost').value, 'number');
      const location = sanitizeInput(document.getElementById('asset-location').value);
      const fiscalCategory = sanitizeInput(document.getElementById('asset-fiscal').value);
      const status = document.getElementById('asset-status').value;
      const notes = sanitizeInput(document.getElementById('asset-notes').value);

      if (!name) {
        showToast('Nama aset harus diisi', 'warning');
        return;
      }
      if (!acquired) {
        showToast('Tanggal perolehan harus diisi', 'warning');
        return;
      }

      const newAsset = {
        id: nextId('FA', DB.settings.assets, 'id'),
        name,
        category: category || 'Lainnya',
        fiscalCategory: fiscalCategory || '—',
        acquired,
        cost,
        location: location || '—',
        status: status || 'OK',
        notes,
      };

      DB.settings.assets.unshift(newAsset);
      if (category && !DB.settings.assetCategories.includes(category)) {
        DB.settings.assetCategories.unshift(category);
      }
      if (fiscalCategory && !DB.settings.assetFiscalCategories.includes(fiscalCategory)) {
        DB.settings.assetFiscalCategories.unshift(fiscalCategory);
      }
      saveDB();
      closeModal();
      showToast('Aset berhasil ditambahkan', 'success');
      navigate('assets');
    });
  }, 50);
}

function viewAsset(id) {
  ensureAssetSettings();
  const asset = DB.settings.assets.find(a => a.id === id);
  if (!asset) {
    showToast('Aset tidak ditemukan', 'danger');
    return;
  }

  openModal(
    `Detail Aset ${escapeHtml(asset.id)}`,
    `<div class="detail-grid">
      ${detailRow('Nama', escapeHtml(asset.name))}
      ${detailRow('Kategori', escapeHtml(asset.category || '—'))}
      ${detailRow('Kategori Fiskal', escapeHtml(asset.fiscalCategory || '—'))}
      ${detailRow('Tanggal Perolehan', escapeHtml(asset.acquired || '—'))}
      ${detailRow('Nilai Perolehan', idrFull(asset.cost || 0))}
      ${detailRow('Lokasi', escapeHtml(asset.location || '—'))}
      ${detailRow('Status', badge(asset.status || 'OK'))}
      ${detailRow('Catatan', escapeHtml(asset.notes || '—'))}
    </div>`,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
     <button class="btn" data-action="editAsset" data-id="${escapeHtml(asset.id)}">Edit</button>`
  );
}

function editAsset(id) {
  ensureAssetSettings();
  const asset = DB.settings.assets.find(a => a.id === id);
  if (!asset) {
    showToast('Aset tidak ditemukan', 'danger');
    return;
  }

  const cats = DB.settings.assetCategories || [];
  const fiscal = DB.settings.assetFiscalCategories || [];

  openModal(
    `Edit Aset ${escapeHtml(asset.id)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Aset</label>
        <input class="form-input" id="asset-name" type="text" value="${escapeHtml(asset.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Kategori</label>
        <input class="form-input" id="asset-category" type="text" list="asset-category-list" value="${escapeHtml(asset.category || '')}">
        <datalist id="asset-category-list">
          ${cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal Perolehan</label>
        <input class="form-input" id="asset-date" type="date" value="${escapeHtml(asset.acquired || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Nilai Perolehan</label>
        <input class="form-input" id="asset-cost" type="number" step="0.01" value="${asset.cost || 0}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Lokasi</label>
        <input class="form-input" id="asset-location" type="text" value="${escapeHtml(asset.location || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Kategori Fiskal</label>
        <input class="form-input" id="asset-fiscal" type="text" list="asset-fiscal-list" value="${escapeHtml(asset.fiscalCategory || '')}">
        <datalist id="asset-fiscal-list">
          ${fiscal.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-select" id="asset-status">
        <option value="OK" ${asset.status === 'OK' ? 'selected' : ''}>Normal</option>
        <option value="Maintenance" ${asset.status === 'Maintenance' ? 'selected' : ''}>Servis/Perbaikan</option>
        <option value="Disposed" ${asset.status === 'Disposed' ? 'selected' : ''}>Dilepas</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Catatan</label>
      <input class="form-input" id="asset-notes" type="text" value="${escapeHtml(asset.notes || '')}">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn-danger" id="deleteAsset">Hapus</button>
     <button class="btn" id="saveAsset">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveAsset')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('asset-name').value);
      const category = sanitizeInput(document.getElementById('asset-category').value);
      const acquired = sanitizeInput(document.getElementById('asset-date').value, 'date');
      const cost = sanitizeInput(document.getElementById('asset-cost').value, 'number');
      const location = sanitizeInput(document.getElementById('asset-location').value);
      const fiscalCategory = sanitizeInput(document.getElementById('asset-fiscal').value);
      const status = document.getElementById('asset-status').value;
      const notes = sanitizeInput(document.getElementById('asset-notes').value);

      if (!name) {
        showToast('Nama aset harus diisi', 'warning');
        return;
      }
      if (!acquired) {
        showToast('Tanggal perolehan harus diisi', 'warning');
        return;
      }

      asset.name = name;
      asset.category = category || 'Lainnya';
      asset.fiscalCategory = fiscalCategory || '—';
      asset.acquired = acquired;
      asset.cost = cost;
      asset.location = location || '—';
      asset.status = status || 'OK';
      asset.notes = notes;

      if (category && !DB.settings.assetCategories.includes(category)) {
        DB.settings.assetCategories.unshift(category);
      }
      if (fiscalCategory && !DB.settings.assetFiscalCategories.includes(fiscalCategory)) {
        DB.settings.assetFiscalCategories.unshift(fiscalCategory);
      }

      saveDB();
      closeModal();
      showToast('Aset berhasil diperbarui', 'success');
      navigate('assets');
    });

    document.getElementById('deleteAsset')?.addEventListener('click', () => {
      confirmDialog('Hapus Aset', `Hapus aset ${asset.name}?`, () => {
        DB.settings.assets = DB.settings.assets.filter(a => a.id !== asset.id);
        saveDB();
        showToast('Aset dihapus', 'success');
        navigate('assets');
      });
    });
  }, 50);
}

function deleteAsset(id) {
  ensureAssetSettings();
  const asset = DB.settings.assets.find(a => a.id === id);
  if (!asset) {
    showToast('Aset tidak ditemukan', 'danger');
    return;
  }
  confirmDialog('Hapus Aset', `Hapus aset ${asset.name}?`, () => {
    DB.settings.assets = DB.settings.assets.filter(a => a.id !== id);
    saveDB();
    showToast('Aset dihapus', 'success');
    navigate('assets');
  });
}

function showAddAssetCategory() {
  ensureAssetSettings();
  openModal(
    'Tambah Kategori Aset',
    `
    <div class="form-group">
      <label class="form-label">Nama Kategori</label>
      <input class="form-input" id="asset-category-name" type="text" placeholder="Bangunan">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveAssetCategory">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveAssetCategory')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('asset-category-name').value);
      if (!name) {
        showToast('Nama kategori harus diisi', 'warning');
        return;
      }
      if (!DB.settings.assetCategories.includes(name)) {
        DB.settings.assetCategories.unshift(name);
      }
      saveDB();
      closeModal();
      showToast('Kategori aset ditambahkan', 'success');
      navigate('assets');
    });
  }, 50);
}

function showAddAssetFiscalCategory() {
  ensureAssetSettings();
  openModal(
    'Tambah Kategori Fiskal',
    `
    <div class="form-group">
      <label class="form-label">Nama Kategori Fiskal</label>
      <input class="form-input" id="asset-fiscal-name" type="text" placeholder="Golongan 1">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveAssetFiscal">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveAssetFiscal')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('asset-fiscal-name').value);
      if (!name) {
        showToast('Nama kategori fiskal harus diisi', 'warning');
        return;
      }
      if (!DB.settings.assetFiscalCategories.includes(name)) {
        DB.settings.assetFiscalCategories.unshift(name);
      }
      saveDB();
      closeModal();
      showToast('Kategori fiskal ditambahkan', 'success');
      navigate('assets');
    });
  }, 50);
}

function showAddAssetTransfer() {
  ensureAssetSettings();
  const assets = DB.settings.assets;
  if (assets.length === 0) {
    showToast('Tambahkan aset terlebih dahulu', 'warning');
    return;
  }

  openModal(
    'Catat Mutasi Aset',
    `
    <div class="form-group">
      <label class="form-label">Aset</label>
      <select class="form-select" id="asset-transfer-id">
        ${assets.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Dari Lokasi</label>
        <input class="form-input" id="asset-from" type="text" placeholder="Gudang Utama">
      </div>
      <div class="form-group">
        <label class="form-label">Ke Lokasi</label>
        <input class="form-input" id="asset-to" type="text" placeholder="Workshop">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input class="form-input" id="asset-transfer-date" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Catatan</label>
        <input class="form-input" id="asset-transfer-notes" type="text" placeholder="Opsional">
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveAssetTransfer">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveAssetTransfer')?.addEventListener('click', () => {
      const assetId = document.getElementById('asset-transfer-id').value;
      const from = sanitizeInput(document.getElementById('asset-from').value);
      const to = sanitizeInput(document.getElementById('asset-to').value);
      const date = sanitizeInput(document.getElementById('asset-transfer-date').value, 'date');
      const notes = sanitizeInput(document.getElementById('asset-transfer-notes').value);

      if (!assetId || !date) {
        showToast('Aset dan tanggal harus diisi', 'warning');
        return;
      }

      const asset = DB.settings.assets.find(a => a.id === assetId);
      if (!asset) {
        showToast('Aset tidak ditemukan', 'danger');
        return;
      }

      DB.settings.assetTransfers.unshift({
        id: nextId('TRF', DB.settings.assetTransfers, 'id'),
        assetId,
        assetName: asset.name,
        from,
        to,
        date,
        notes,
      });
      if (to) {
        asset.location = to;
      }
      saveDB();
      closeModal();
      showToast('Mutasi aset tersimpan', 'success');
      navigate('assets');
    });
  }, 50);
}

function showAddAssetDisposal() {
  ensureAssetSettings();
  const assets = DB.settings.assets;
  if (assets.length === 0) {
    showToast('Tambahkan aset terlebih dahulu', 'warning');
    return;
  }

  openModal(
    'Catat Disposisi Aset',
    `
    <div class="form-group">
      <label class="form-label">Aset</label>
      <select class="form-select" id="asset-disposal-id">
        ${assets.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input class="form-input" id="asset-disposal-date" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Metode</label>
        <input class="form-input" id="asset-disposal-method" type="text" placeholder="Dijual / Dihapus">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Nilai (opsional)</label>
      <input class="form-input" id="asset-disposal-value" type="number" step="0.01" placeholder="50000000">
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveAssetDisposal">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('saveAssetDisposal')?.addEventListener('click', () => {
      const assetId = document.getElementById('asset-disposal-id').value;
      const date = sanitizeInput(document.getElementById('asset-disposal-date').value, 'date');
      const method = sanitizeInput(document.getElementById('asset-disposal-method').value);
      const value = sanitizeInput(document.getElementById('asset-disposal-value').value, 'number');

      if (!assetId || !date || !method) {
        showToast('Aset, tanggal, dan metode harus diisi', 'warning');
        return;
      }

      const asset = DB.settings.assets.find(a => a.id === assetId);
      if (!asset) {
        showToast('Aset tidak ditemukan', 'danger');
        return;
      }

      DB.settings.assetDisposals.unshift({
        id: nextId('DSP', DB.settings.assetDisposals, 'id'),
        assetId,
        assetName: asset.name,
        date,
        method,
        value,
      });
      asset.status = 'Disposed';
      saveDB();
      closeModal();
      showToast('Disposisi aset tersimpan', 'success');
      navigate('assets');
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLEET (Armada Kendaraan)
// ═══════════════════════════════════════════════════════════════════════════════

const FLEET_STATUSES = [
  ['OK', 'OK'],
  ['In Transit', 'Dalam Pengiriman'],
  ['Maintenance', 'Servis/Perbaikan'],
];

function showAddFleet() {
  openModal(
    'Tambah Kendaraan Baru',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">No. Polisi</label>
        <input class="form-input" id="fleet-plate" type="text" placeholder="B 1234 XY">
      </div>
      <div class="form-group">
        <label class="form-label">Tipe Kendaraan</label>
        <input class="form-input" id="fleet-type" type="text" placeholder="Truk Flatbed 8 Ton">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Driver</label>
        <input class="form-input" id="fleet-driver" type="text" placeholder="Nama driver tetap">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="fleet-status">${statusOptions(FLEET_STATUSES, 'OK')}</select>
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveFleet">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('saveFleet')?.addEventListener('click', () => {
      const plate = sanitizeInput(document.getElementById('fleet-plate').value);
      const type = sanitizeInput(document.getElementById('fleet-type').value);
      const driver = sanitizeInput(document.getElementById('fleet-driver').value);
      const status = document.getElementById('fleet-status').value;
      if (!plate) {
        showToast('No. polisi harus diisi', 'warning');
        return;
      }
      if (!type) {
        showToast('Tipe kendaraan harus diisi', 'warning');
        return;
      }
      const maxId = (DB.fleet || []).reduce(
        (m, v) => Math.max(m, Number.parseInt(v.id, 10) || 0),
        0
      );
      if (!DB.fleet) {
        DB.fleet = [];
      }
      DB.fleet.push({ id: maxId + 1, plate, type, driver, status });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${plate} berhasil ditambahkan`, 'success');
    });
  }, 50);
}

function editFleet(id) {
  const v = (DB.fleet || []).find(v => String(v.id) === String(id));
  if (!v) {
    showToast('Kendaraan tidak ditemukan', 'danger');
    return;
  }
  openModal(
    `Edit Kendaraan — ${escapeHtml(v.plate)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">No. Polisi</label>
        <input class="form-input" id="fleet-plate" type="text" value="${escapeHtml(v.plate)}">
      </div>
      <div class="form-group">
        <label class="form-label">Tipe Kendaraan</label>
        <input class="form-input" id="fleet-type" type="text" value="${escapeHtml(v.type)}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Driver</label>
        <input class="form-input" id="fleet-driver" type="text" value="${escapeHtml(v.driver)}">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="fleet-status">${statusOptions(FLEET_STATUSES, v.status)}</select>
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deleteFleet" data-id="${escapeHtml(id)}">Hapus</button>
   <button class="btn" id="updateFleet">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('updateFleet')?.addEventListener('click', () => {
      const plate = sanitizeInput(document.getElementById('fleet-plate').value);
      const type = sanitizeInput(document.getElementById('fleet-type').value);
      const driver = sanitizeInput(document.getElementById('fleet-driver').value);
      const status = document.getElementById('fleet-status').value;
      if (!plate) {
        showToast('No. polisi harus diisi', 'warning');
        return;
      }
      if (!type) {
        showToast('Tipe kendaraan harus diisi', 'warning');
        return;
      }
      v.plate = plate;
      v.type = type;
      v.driver = driver;
      v.status = status;
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${plate} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function deleteFleet(id) {
  const idx = (DB.fleet || []).findIndex(v => String(v.id) === String(id));
  if (idx === -1) {
    return;
  }
  const deleted = DB.fleet.splice(idx, 1)[0];
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Use ID-based lookup instead of captured array index
  showUndoToast(`${deleted.plate} dihapus`, () => {
    const restoreIdx = (DB.fleet || []).findIndex(v => v.id > deleted.id);
    const insertAt = restoreIdx === -1 ? (DB.fleet || []).length : restoreIdx;
    DB.fleet.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${deleted.plate} dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPEDITION (Ekspedisi Rekanan)
// ═══════════════════════════════════════════════════════════════════════════════

function showAddExpedition() {
  openModal(
    'Tambah Ekspedisi Rekanan',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Ekspedisi</label>
        <input class="form-input" id="exp-name" type="text" placeholder="JNE Trucking, Wahana, dll.">
      </div>
      <div class="form-group">
        <label class="form-label">Tarif</label>
        <input class="form-input" id="exp-rate" type="text" placeholder="Rp 850/kg">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Wilayah Layanan</label>
        <input class="form-input" id="exp-area" type="text" placeholder="Nasional / Jabodetabek / Jawa & Bali">
      </div>
      <div class="form-group"></div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveExpedition">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('saveExpedition')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('exp-name').value);
      const rate = sanitizeInput(document.getElementById('exp-rate').value);
      const area = sanitizeInput(document.getElementById('exp-area').value);
      if (!name) {
        showToast('Nama ekspedisi harus diisi', 'warning');
        return;
      }
      const maxId = (DB.expedition || []).reduce(
        (m, e) => Math.max(m, Number.parseInt(e.id, 10) || 0),
        0
      );
      if (!DB.expedition) {
        DB.expedition = [];
      }
      DB.expedition.push({ id: maxId + 1, name, rate, area });
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil ditambahkan`, 'success');
    });
  }, 50);
}

function editExpedition(id) {
  const e = (DB.expedition || []).find(e => String(e.id) === String(id));
  if (!e) {
    showToast('Ekspedisi tidak ditemukan', 'danger');
    return;
  }
  openModal(
    `Edit Ekspedisi — ${escapeHtml(e.name)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Nama Ekspedisi</label>
        <input class="form-input" id="exp-name" type="text" value="${escapeHtml(e.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">Tarif</label>
        <input class="form-input" id="exp-rate" type="text" value="${escapeHtml(e.rate)}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Wilayah Layanan</label>
        <input class="form-input" id="exp-area" type="text" value="${escapeHtml(e.area)}">
      </div>
      <div class="form-group"></div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deleteExpedition" data-id="${escapeHtml(id)}">Hapus</button>
   <button class="btn" id="updateExpedition">Simpan</button>`
  );
  setTimeout(() => {
    document.getElementById('updateExpedition')?.addEventListener('click', () => {
      const name = sanitizeInput(document.getElementById('exp-name').value);
      const rate = sanitizeInput(document.getElementById('exp-rate').value);
      const area = sanitizeInput(document.getElementById('exp-area').value);
      if (!name) {
        showToast('Nama ekspedisi harus diisi', 'warning');
        return;
      }
      e.name = name;
      e.rate = rate;
      e.area = area;
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${name} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function deleteExpedition(id) {
  const idx = (DB.expedition || []).findIndex(e => String(e.id) === String(id));
  if (idx === -1) {
    return;
  }
  const deleted = DB.expedition.splice(idx, 1)[0];
  saveDB();
  closeModal();
  navigate(activeView);
  // BUG #2.6 FIX: Use ID-based lookup instead of captured array index
  showUndoToast(`${deleted.name} dihapus`, () => {
    const restoreIdx = (DB.expedition || []).findIndex(e => e.id > deleted.id);
    const insertAt = restoreIdx === -1 ? (DB.expedition || []).length : restoreIdx;
    DB.expedition.splice(insertAt, 0, deleted);
    saveDB();
    navigate(activeView);
    showToast(`${deleted.name} dipulihkan`, 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MERGED FROM erp-patch.js (2026-06-10) — document CRUD overrides & extensions
// Payment log, duplicate SO/PO, viewSO/viewPO, DO management (showAddDO/editDO/
// viewDO + SO linkage), bulk Surat Jalan, showAddSO/editSO (reservation +
// customer validation), inline & bulk SO status. These were the live (sole)
// definitions — the patch file no longer shadowed anything in this module.
// ═══════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════════
// § 2  PAYMENT LOG
// ════════════════════════════════════════════════════════════════════════════════
// DB.paymentLogs = [{ id, type:"SO"|"PO", orderId, date, amount, method, note }]

function paymentLogHTML(type, orderId, order) {
  const logs = (DB.paymentLogs || []).filter(p => p.type === type && p.orderId === orderId);
  const totalPaid = logs.reduce((s, p) => s + (p.amount || 0), 0);
  const orderTotal = order ? order.amount || 0 : 0;
  const remaining = orderTotal - totalPaid;

  const logsHtml =
    logs.length === 0
      ? `<div style="font-size:12px;color:var(--muted);padding:12px 0;text-align:center">
         Belum ada log pembayaran — klik <strong>+ Catat Pembayaran</strong> untuk menambah.
       </div>`
      : `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--bg)">
            <tr>
              <th style="padding:6px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Tanggal</th>
              <th style="padding:6px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Metode</th>
              <th style="padding:6px 10px;font-size:11px;font-weight:700;text-align:right;border-bottom:1px solid var(--border)">Jumlah</th>
              <th style="padding:6px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${logs
              .map(
                p => `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:6px 10px;font-size:12px">${escapeHtml(p.date)}</td>
              <td style="padding:6px 10px;font-size:12px">${escapeHtml(p.method)}</td>
              <td style="padding:6px 10px;font-size:12px;font-weight:700;text-align:right;color:#34C759">${idrFull(p.amount)}</td>
              <td style="padding:6px 10px;font-size:12px;color:var(--muted)">${escapeHtml(p.note || '—')}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;
                    border-top:1px solid var(--border);font-size:12px">
          <span style="color:var(--muted)">Total Dibayar: <strong>${idrFull(totalPaid)}</strong></span>
          ${
            remaining > 0
              ? `<span style="color:#FF3B30;font-weight:700">Sisa: ${idrFull(remaining)}</span>`
              : `<span style="color:#34C759;font-weight:700">✓ Lunas</span>`
          }
        </div>
       </div>`;

  return `
  <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="detail-label" style="margin:0;font-size:12px;font-weight:700">Log Pembayaran</div>
      <button class="action-ghost" data-action="addPayment"
        data-type="${type}" data-id="${escapeHtml(orderId)}"
        style="font-size:11px;padding:3px 10px">+ Catat Pembayaran</button>
    </div>
    ${logsHtml}
  </div>`;
}

function showAddPayment(type, orderId) {
  openModal(
    'Catat Pembayaran',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal Pembayaran</label>
        <input class="form-input" id="pay-date" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Jumlah (Rp)</label>
        <input class="form-input" id="pay-amount" type="number" min="1" placeholder="0">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Metode Pembayaran</label>
        <select class="form-select" id="pay-method">
          <option value="Tunai">Tunai</option>
          <option value="Transfer BCA">Transfer BCA</option>
          <option value="Transfer Mandiri">Transfer Mandiri</option>
          <option value="Lainnya">Lainnya</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Catatan / No. Referensi</label>
        <input class="form-input" id="pay-note" type="text" placeholder="No. transfer, cek, dll. (opsional)">
      </div>
    </div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="savePayment">Simpan</button>`
  );

  setTimeout(() => {
    document.getElementById('savePayment')?.addEventListener('click', () => {
      const date = sanitizeInput(document.getElementById('pay-date').value, 'date');
      const amount = sanitizeInput(document.getElementById('pay-amount').value, 'number');
      const method = document.getElementById('pay-method').value;
      const note = sanitizeInput(document.getElementById('pay-note').value);
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      if (!amount || amount <= 0) {
        showToast('Jumlah harus diisi', 'warning');
        return;
      }
      if (!DB.paymentLogs) {
        DB.paymentLogs = [];
      }
      const maxId = DB.paymentLogs.reduce((m, p) => Math.max(m, Number.parseInt(p.id, 10) || 0), 0);
      DB.paymentLogs.push({ id: maxId + 1, type, orderId, date, amount, method, note });

      // BUG #2.7 FIX: Auto-update order status to "Paid" when total
      // payments equal or exceed the order amount. Previously, users
      // had to manually change the status, which was error-prone —
      // fully-paid orders would sit in "Confirmed" indefinitely.
      const order =
        type === 'SO'
          ? DB.salesOrders.find(o => o.id === orderId)
          : DB.purchaseOrders.find(o => o.id === orderId);
      if (
        order &&
        order.status !== 'Paid' &&
        order.status !== 'Delivered' &&
        order.status !== 'Received'
      ) {
        const totalPaid = DB.paymentLogs
          .filter(p => p.type === type && p.orderId === orderId)
          .reduce((s, p) => s + (p.amount || 0), 0);
        if (totalPaid >= (order.amount || 0) && (order.amount || 0) > 0) {
          // If SO was Confirmed, release stock reservation before changing status
          if (type === 'SO' && order.status === 'Confirmed') {
            releaseReservation(orderId);
          }
          order.status = 'Paid';
        }
      }

      saveDB();
      closeModal();
      // Re-open detail view so user sees the updated log immediately
      if (type === 'SO') {
        viewSO(orderId);
      } else {
        viewPO(orderId);
      }
      showToast('Pembayaran berhasil dicatat', 'success');
    });
  }, 50);
}

// ════════════════════════════════════════════════════════════════════════════════
// § 3  DUPLICATE SO / PO
// ════════════════════════════════════════════════════════════════════════════════

function duplicateSO(id) {
  const o = DB.salesOrders.find(o => o.id === id);
  if (!o) {
    showToast('SO tidak ditemukan', 'danger');
    return;
  }
  const lines = (o.lines || []).map(l => ({ ...l }));
  const amount = lines.reduce((s, l) => s + (l.subtotal || 0), 0);
  const soNumber = window.DocEngine
    ? window.DocEngine.nextNumber('SO', today(), { commit: true })
    : null;
  const newSO = {
    id: nextId('SO', DB.salesOrders),
    number: soNumber || undefined,
    customer: o.customer,
    customerId: o.customerId ?? window.DocEngine?.resolvePartyId('SO', o.customer) ?? null,
    date: today(),
    status: 'Draft',
    lines,
    amount,
    stockMutated: false,
  };
  DB.salesOrders.unshift(newSO);
  saveDB();
  closeModal();
  navigate(activeView);
  showToast(
    `${docNum(newSO.number, newSO.id)} dibuat sebagai duplikat dari ${docNum(o.number, id)}`,
    'success'
  );
}

function duplicatePO(id) {
  const o = DB.purchaseOrders.find(o => o.id === id);
  if (!o) {
    showToast('PO tidak ditemukan', 'danger');
    return;
  }
  const lines = (o.lines || []).map(l => ({ ...l }));
  const amount = lines.reduce((s, l) => s + (l.subtotal || 0), 0);
  const poNumber = window.DocEngine
    ? window.DocEngine.nextNumber('PO', today(), { commit: true })
    : null;
  const newPO = {
    id: nextId('PO', DB.purchaseOrders),
    number: poNumber || undefined,
    supplier: o.supplier,
    supplierId: o.supplierId ?? window.DocEngine?.resolvePartyId('PO', o.supplier) ?? null,
    date: today(),
    status: 'Draft',
    lines,
    amount,
    stockMutated: false,
  };
  DB.purchaseOrders.unshift(newPO);
  saveDB();
  closeModal();
  navigate(activeView);
  showToast(
    `${docNum(newPO.number, newPO.id)} dibuat sebagai duplikat dari ${docNum(o.number, id)}`,
    'success'
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// § 3b  DOWN-PAYMENT SUMMARY (shown in SO/PO detail views)
// ════════════════════════════════════════════════════════════════════════════════
function dpSummaryHTML(type, orderId, orderTotal) {
  const collection = type === 'SO' ? 'salesDownPayments' : 'purchaseDownPayments';
  const dps = (DB[collection] || []).filter(d => d.orderId === orderId);
  if (dps.length === 0) return '';
  const totalDP = dps.reduce((s, d) => s + (d.amount || 0), 0);
  const applied = dps.filter(d => d.status === 'Applied').reduce((s, d) => s + (d.amount || 0), 0);
  const unapplied = totalDP - applied;
  const remaining = orderTotal - totalDP;
  const fmt = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');

  return `
  <div style="margin:12px 0 4px;padding:10px 14px;background:var(--bg);border-radius:10px;
              border:1px solid var(--border)">
    <div style="font-weight:700;font-size:12px;margin-bottom:6px;color:var(--muted)">Uang Muka</div>
    <div class="detail-grid" style="gap:2px 12px">
      ${detailRow('Total DP', `<strong>${fmt(totalDP)}</strong>`)}
      ${detailRow('Sudah Diterapkan', fmt(applied))}
      ${unapplied > 0 ? detailRow('Belum Diterapkan', `<span style="color:#FF9500">${fmt(unapplied)}</span>`) : ''}
      ${detailRow('Sisa Tagihan', `<span style="font-weight:700;color:${remaining > 0 ? '#FF3B30' : '#34C759'}">${fmt(remaining)}</span>`)}
    </div>
    <div style="margin-top:6px;font-size:11px;color:var(--muted)">
      ${dps.map(d => `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 4px 2px 0">
        ${escapeHtml(d.id)} · ${fmt(d.amount)} · ${badge(d.status)}</span>`).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// § 4  OVERRIDE: viewSO  — payment log + Duplikat button + DO links
// ════════════════════════════════════════════════════════════════════════════════

function viewSO(id) {
  const o = DB.salesOrders.find(o => o.id === id);
  if (!o) {
    showToast('SO tidak ditemukan', 'danger');
    return;
  }

  // Show any DOs that reference this SO
  const linkedDOs = (DB.deliveryOrders || []).filter(d => d.soId === id);
  const doLinksHtml =
    linkedDOs.length > 0
      ? `<div style="margin:10px 0;padding:8px 12px;background:var(--bg);border-radius:8px;
                  font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--muted)">DO Terkait:</span>
        ${linkedDOs
          .map(
            d =>
              `<button class="action-ghost" data-action="viewDO" data-id="${escapeHtml(d.id)}"
            style="font-size:11px">${escapeHtml(docNum(d.number, d.id))} · ${badge(d.status)}</button>`
          )
          .join('')}
       </div>`
      : '';

  // Back-reference: invoices created from this SO (SI.sourceId === SO.id).
  const linkedSIs = (DB.salesInvoices || []).filter(s => s.sourceId === id);
  const siLinksHtml =
    linkedSIs.length > 0
      ? `<div style="margin:10px 0;padding:8px 12px;background:var(--bg);border-radius:8px;
                  font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--muted)">Faktur Terkait:</span>
        ${linkedSIs
          .map(
            s =>
              `<button class="action-ghost" data-action="viewSI" data-id="${escapeHtml(s.id)}"
            style="font-size:11px">${escapeHtml(docNum(s.number, s.id))} · ${badge(s.status)}</button>`
          )
          .join('')}
       </div>`
      : '';

  openModal(
    `Detail SO — ${escapeHtml(docNum(o.number, o.id))}`,
    `
    <div class="detail-grid">
      ${detailRow('No. SO', escapeHtml(docNum(o.number, o.id)))}
      ${detailRow('Status', badge(o.status))}
      <div class="detail-divider"></div>
      ${detailRow('Pelanggan', escapeHtml(o.customer))}
      ${detailRow('Tanggal', escapeHtml(o.date))}
      ${o.dueDate ? detailRow('Jatuh Tempo', `<span style="font-weight:700;color:${o.dueDate < new Date().toISOString().slice(0, 10) && o.status !== 'Paid' && o.status !== 'Delivered' ? '#FF3B30' : 'var(--text)'}">${escapeHtml(o.dueDate)}</span>`) : ''}
      ${o.warehouseId && window.Warehouse ? detailRow('Gudang', escapeHtml(window.Warehouse.warehouseName(o.warehouseId))) : ''}
    </div>
    ${doLinksHtml}
    ${siLinksHtml}
    ${linesDetailHTML(o.lines, 'Total Penjualan', o)}
    ${dpSummaryHTML('SO', id, o.amount || 0)}
    ${paymentLogHTML('SO', id, o)}
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
   ${window.DocFlow ? window.DocFlow.button('SO', id) : ''}
   <button class="btn-ghost" data-action="createDOFromSO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <rect x="1" y="3" width="15" height="13"/>
       <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
       <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
     </svg>
     Buat DO
   </button>
   <button class="btn-ghost" data-action="createSIFromSO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
       <polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/>
       <line x1="9" y1="14" x2="15" y2="14"/>
     </svg>
     Buat Faktur
   </button>
   <button class="btn-ghost" data-action="duplicateSO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
       <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
     </svg>
     Duplikat
   </button>
   <button class="btn-ghost" data-action="printSO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <polyline points="6 9 6 2 18 2 18 9"/>
       <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
       <rect x="6" y="14" width="12" height="8"/>
     </svg>
     Cetak
   </button>
   <button class="btn" data-action="editSO" data-id="${escapeHtml(id)}">Edit</button>`,
    true
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// § 5  OVERRIDE: viewPO  — payment log + Duplikat button
// ════════════════════════════════════════════════════════════════════════════════

function viewPO(id) {
  const o = DB.purchaseOrders.find(o => o.id === id);
  if (!o) {
    showToast('PO tidak ditemukan', 'danger');
    return;
  }

  const linkedDOs = (DB.deliveryOrders || []).filter(d => d.poId === id);
  const doLinksHtml =
    linkedDOs.length > 0
      ? `<div style="margin:10px 0;padding:8px 12px;background:var(--bg);border-radius:8px;
                  font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--muted)">DO Terkait:</span>
        ${linkedDOs
          .map(
            d =>
              `<button class="action-ghost" data-action="viewDO" data-id="${escapeHtml(d.id)}"
            style="font-size:11px">${escapeHtml(docNum(d.number, d.id))} · ${badge(d.status)}</button>`
          )
          .join('')}
       </div>`
      : '';

  // Back-reference: invoices created from this PO (PI.sourceId === PO.id).
  const linkedPIs = (DB.purchaseInvoices || []).filter(p => p.sourceId === id);
  const piLinksHtml =
    linkedPIs.length > 0
      ? `<div style="margin:10px 0;padding:8px 12px;background:var(--bg);border-radius:8px;
                  font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;color:var(--muted)">Faktur Terkait:</span>
        ${linkedPIs
          .map(
            p =>
              `<button class="action-ghost" data-action="viewPI" data-id="${escapeHtml(p.id)}"
            style="font-size:11px">${escapeHtml(docNum(p.number, p.id))} · ${badge(p.status)}</button>`
          )
          .join('')}
       </div>`
      : '';

  openModal(
    `Detail PO — ${escapeHtml(docNum(o.number, o.id))}`,
    `
    <div class="detail-grid">
      ${detailRow('No. PO', escapeHtml(docNum(o.number, o.id)))}
      ${detailRow('Status', badge(o.status))}
      <div class="detail-divider"></div>
      ${detailRow('Supplier', escapeHtml(o.supplier))}
      ${detailRow('Tanggal', escapeHtml(o.date))}
      ${o.dueDate ? detailRow('Jatuh Tempo', `<span style="font-weight:700;color:${o.dueDate < new Date().toISOString().slice(0, 10) && o.status !== 'Paid' && o.status !== 'Received' ? '#FF3B30' : 'var(--text)'}">${escapeHtml(o.dueDate)}</span>`) : ''}
      ${o.warehouseId && window.Warehouse ? detailRow('Gudang', escapeHtml(window.Warehouse.warehouseName(o.warehouseId))) : ''}
    </div>
    ${doLinksHtml}
    ${piLinksHtml}
    ${linesDetailHTML(o.lines, 'Total Pembelian', o)}
    ${dpSummaryHTML('PO', id, o.amount || 0)}
    ${paymentLogHTML('PO', id, o)}
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
   ${window.DocFlow ? window.DocFlow.button('PO', id) : ''}
   <button class="btn-ghost" data-action="createDOFromPO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <rect x="1" y="3" width="15" height="13"/>
       <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
       <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
     </svg>
     Buat DO
   </button>
   <button class="btn-ghost" data-action="createPIFromPO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
       <polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/>
       <line x1="9" y1="14" x2="15" y2="14"/>
     </svg>
     Buat Faktur
   </button>
   <button class="btn-ghost" data-action="duplicatePO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
       <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
     </svg>
     Duplikat
   </button>
   <button class="btn-ghost" data-action="printPO" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <polyline points="6 9 6 2 18 2 18 9"/>
       <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
       <rect x="6" y="14" width="12" height="8"/>
     </svg>
     Cetak
   </button>
   <button class="btn-ghost" data-action="exportPOForm" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
       <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
     </svg>
     Form Excel
   </button>
   <button class="btn" data-action="editPO" data-id="${escapeHtml(id)}">Edit</button>`,
    true
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// § 6  OVERRIDE: showAddDO + editDO + viewDO  — SO linkage, auto-fill, soId
// ════════════════════════════════════════════════════════════════════════════════

function _getCustomerAddress(name) {
  const c = (DB.customers || []).find(c => c.name === name);
  return c ? c.address || '' : '';
}

/**
 * Detect whether a DO is being delivered somewhere other than the party's
 * address on file. Returns { changed, from, note }. When the entered destination
 * differs from the registered customer/supplier address, the DO is flagged and a
 * note "Tujuan diubah dari X ke Y" is produced so logistics can see the override.
 */
function _detectDestChange(refType, party, destination) {
  const expected = refType === 'PO' ? _getSupplierAddress(party) : _getCustomerAddress(party);
  const norm = s =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  if (!expected || !destination || norm(expected) === norm(destination)) {
    return { changed: false, from: '', note: '' };
  }
  return {
    changed: true,
    from: expected,
    note: `⚠ Tujuan diubah dari "${expected}" ke "${destination}"`,
  };
}

// Statuses that make an SO/PO selectable as a DO reference. Accurate-derived
// statuses (Waiting on Process / Partially Processed / Processed / Paid) must
// be included — otherwise editing a linked DO can't find its own SO in the
// dropdown and saving silently wipes the soId linkage.
const _DO_REF_SO_STATUSES = [
  'Confirmed',
  'Delivered',
  'Paid',
  'Waiting on Process',
  'Partially Processed',
  'Processed',
];
const _DO_REF_PO_STATUSES = [
  'Confirmed',
  'Paid',
  'Received',
  'Waiting on Process',
  'Partially Processed',
  'Processed',
];

/** Builds the SO reference <select> options.
 *  currentSoId: the SO already linked to the DO being edited (always included).
 *  currentDoId: the DO being edited — excluded from the "sudah ada DO" marker. */
function _soRefOptions(currentSoId, currentDoId) {
  const linkedSoIds = new Set(
    (DB.deliveryOrders || []).filter(d => d.soId && d.id !== currentDoId).map(d => d.soId)
  );
  const eligible = (DB.salesOrders || []).filter(
    o =>
      (o._type === undefined || o._type === 'order') &&
      (_DO_REF_SO_STATUSES.indexOf(o.status) !== -1 || o.id === currentSoId)
  );
  // Always offer the currently linked SO, even if its status fell outside the
  // eligible list — losing it from the dropdown means losing the linkage.
  if (currentSoId && !eligible.some(o => o.id === currentSoId)) {
    const cur = (DB.salesOrders || []).find(o => o.id === currentSoId);
    if (cur) eligible.unshift(cur);
  }
  return eligible
    .map(o => {
      const hasDO = linkedSoIds.has(o.id);
      return `<option value="${escapeHtml(o.id)}"
      data-customer="${escapeHtml(o.customer)}"
      data-destination="${escapeHtml(_getCustomerAddress(o.customer))}"
      ${currentSoId === o.id ? 'selected' : ''}
      >${escapeHtml(docNum(o.number, o.id))} · ${escapeHtml(o.customer)}${hasDO ? ' ★ (sudah ada DO)' : ''}</option>`;
    })
    .join('');
}

/** Builds the PO reference <select> options (same contract as _soRefOptions). */
function _poRefOptions(currentPoId, currentDoId) {
  const linkedPoIds = new Set(
    (DB.deliveryOrders || []).filter(d => d.poId && d.id !== currentDoId).map(d => d.poId)
  );
  const eligible = (DB.purchaseOrders || []).filter(
    o =>
      (o._type === undefined || o._type === 'order') &&
      (_DO_REF_PO_STATUSES.indexOf(o.status) !== -1 || o.id === currentPoId)
  );
  if (currentPoId && !eligible.some(o => o.id === currentPoId)) {
    const cur = (DB.purchaseOrders || []).find(o => o.id === currentPoId);
    if (cur) eligible.unshift(cur);
  }
  return eligible
    .map(o => {
      const hasDO = linkedPoIds.has(o.id);
      return `<option value="${escapeHtml(o.id)}"
      data-supplier="${escapeHtml(o.supplier)}"
      data-destination="${escapeHtml(_getSupplierAddress(o.supplier))}"
      ${currentPoId === o.id ? 'selected' : ''}
      >${escapeHtml(docNum(o.number, o.id))} · ${escapeHtml(o.supplier)}${hasDO ? ' ★ (sudah ada DO)' : ''}</option>`;
    })
    .join('');
}

function _getSupplierAddress(name) {
  const s = (DB.suppliers || []).find(s => s.name === name);
  return s ? s.address || '' : '';
}

/** Build lines table for DO form — qty column is editable; shows partial-delivery info. */
function _doLinesTable(lines) {
  if (!lines || lines.length === 0) {
    return `<div id="do-lines-wrap" style="margin:14px 0">
      <div style="font-size:12px;color:var(--muted);text-align:center;padding:16px;
        border:1px dashed var(--border);border-radius:10px">
        Pilih referensi SO atau PO untuk mengisi daftar barang otomatis
      </div>
    </div>`;
  }
  const hasPartial = lines.some(l => (l.qtyDelivered || 0) > 0);
  const allZero = hasPartial && lines.every(l => (l.qty || 0) === 0);
  return `<div id="do-lines-wrap" style="margin:14px 0">
    <div class="form-label" style="margin-bottom:8px;font-size:13px;font-weight:700">Daftar Barang</div>
    ${
      hasPartial
        ? `<div style="font-size:11px;color:#FF9F0A;margin-bottom:6px;padding:6px 10px;
        background:rgba(255,159,10,.1);border-radius:6px;border:1px solid rgba(255,159,10,.3)">
        ⚠ SO ini sudah dikirim sebagian — qty di bawah adalah <strong>sisa belum terkirim</strong>.
      </div>`
        : ''
    }
    ${
      allZero
        ? `<div style="font-size:11px;color:#FF3B30;margin-bottom:6px;padding:6px 10px;
        background:rgba(255,59,48,.1);border-radius:6px;border:1px solid rgba(255,59,48,.3)">
        ✗ Semua item sudah terkirim penuh dari SO ini.
      </div>`
        : ''
    }
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead style="background:var(--bg)">
          <tr>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Item</th>
            ${hasPartial ? `<th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:70px;border-bottom:1px solid var(--border);color:var(--muted)">Sudah Kirim</th>` : ''}
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:90px;border-bottom:1px solid var(--border)">Qty Kirim</th>
            <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:46px;border-bottom:1px solid var(--border)">Sat.</th>
          </tr>
        </thead>
        <tbody>
          ${lines
            .map(l => {
              const delivered = l.qtyDelivered || 0;
              const original = l.qtyOriginal != null ? l.qtyOriginal : l.qty || 0;
              const qty = l.qty != null ? l.qty : original;
              return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:7px 10px;font-size:12px;font-weight:600">${escapeHtml(l.itemName || '')}</td>
              ${hasPartial ? `<td style="padding:7px 10px;font-size:12px;text-align:right;color:var(--muted)">${delivered}</td>` : ''}
              <td style="padding:5px 8px;text-align:right">
                <input type="number" class="do-line-qty form-input"
                  data-item-id="${escapeHtml(l.itemId || '')}"
                  data-item-name="${escapeHtml(l.itemName || '')}"
                  data-item-code="${escapeHtml(l.itemCode || '')}"
                  data-unit="${escapeHtml(l.unit || '')}"
                  value="${qty}" min="0" max="${original}"
                  style="width:74px;padding:4px 6px;font-size:12px;text-align:right">
              </td>
              <td style="padding:7px 10px;font-size:11px;color:var(--muted)">${escapeHtml(l.unit || '')}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

/** Datalist options for the DO site field — every site already used, plus any
 *  configured in settings, deduped and sorted. Keeps the field free-text (the
 *  client may add sites at any time) while still offering the known ones. */
function _siteOptions() {
  const seen = new Set();
  (DB.settings?.sites || []).forEach(s => s && seen.add(String(s).trim()));
  (DB.deliveryOrders || []).forEach(d => d.site && seen.add(String(d.site).trim()));
  return [...seen]
    .sort((a, b) => a.localeCompare(b))
    .map(s => `<option value="${escapeHtml(s)}">`)
    .join('');
}

/** Common DO form body (add & edit share it) */
function _doFormBody(o, opts) {
  // o = existing DO object for edit, null for add
  // opts.preselect = { soId, poId } for pre-selecting a reference
  const pre = (opts && opts.preselect) || {};
  const custOpts = (DB.customers || []).map(c => `<option value="${escapeHtml(c.name)}">`).join('');
  const soOpts = _soRefOptions(o ? o.soId : null, o ? o.id : null);
  const poOpts = _poRefOptions(o ? o.poId : null, o ? o.id : null);
  const cur = o || {};
  const refType = pre.poId ? 'PO' : cur.poId ? 'PO' : cur.soId || pre.soId ? 'SO' : 'none';
  // Accurate-imported DOs store their lines in `items`; native DOs use `lines`.
  const curLines = cur.lines && cur.lines.length ? cur.lines : cur.items || [];
  return `
    <div class="form-row">
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">
          Tipe Referensi
          <span style="font-size:10px;color:var(--muted);font-weight:400">
            — pilih dokumen sumber untuk auto-isi data &amp; barang
          </span>
        </label>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
            <input type="radio" name="do-ref-type" value="none" ${refType === 'none' ? 'checked' : ''}> Manual
          </label>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
            <input type="radio" name="do-ref-type" value="SO" ${refType === 'SO' ? 'checked' : ''}> Sales Order
          </label>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
            <input type="radio" name="do-ref-type" value="PO" ${refType === 'PO' ? 'checked' : ''}> Purchase Order
          </label>
        </div>
        <select class="form-select" id="do-so-ref" style="${refType === 'SO' ? '' : 'display:none'}">
          <option value="">— Pilih Sales Order —</option>
          ${soOpts}
        </select>
        <select class="form-select" id="do-po-ref" style="${refType === 'PO' ? '' : 'display:none'}">
          <option value="">— Pilih Purchase Order —</option>
          ${poOpts}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" id="do-party-label">${refType === 'PO' ? 'Supplier' : 'Pelanggan'}</label>
        <input class="form-input" id="do-customer" type="text"
          value="${escapeHtml(cur.customer || cur.supplier || '')}"
          placeholder="${refType === 'PO' ? 'Nama supplier' : 'Nama pelanggan'}" list="do-cust-list">
        <datalist id="do-cust-list">${custOpts}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">Tujuan / Asal</label>
        <input class="form-input" id="do-destination" type="text"
          value="${escapeHtml(cur.destination || '')}"
          placeholder="Kota / alamat">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Tanggal Kirim</label>
        <input class="form-input" id="do-date" type="date"
          value="${escapeHtml(cur.date || today())}">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="do-status">
          ${statusOptions(DO_STATUSES, cur.status || 'Pending')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Driver</label>
        <input class="form-input" id="do-driver" type="text"
          value="${escapeHtml(cur.driver === '—' ? '' : cur.driver || '')}"
          placeholder="Nama driver">
      </div>
      <div class="form-group">
        <label class="form-label">No. Kendaraan</label>
        <input class="form-input" id="do-vehicle" type="text"
          value="${escapeHtml(cur.vehicle === '—' ? '' : cur.vehicle || '')}"
          placeholder="B 1234 XY">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">No. PO Customer <span style="font-size:10px;color:var(--muted);font-weight:400">(untuk Surat Jalan)</span></label>
        <input class="form-input" id="do-customer-po" type="text"
          value="${escapeHtml(cur.customerPO || '')}"
          placeholder="PO/CUST/2026/...">
      </div>
      <div class="form-group">
        <label class="form-label">Catatan <span style="font-size:10px;color:var(--muted);font-weight:400">(opsional)</span></label>
        <textarea class="form-input" id="do-notes" rows="1"
          placeholder="Catatan pengiriman...">${escapeHtml(cur.notes || '')}</textarea>
      </div>
    </div>
    <div class="form-group" style="margin:6px 0 2px">
      <label class="form-label" style="font-size:11px;color:var(--muted)">Info Surat Jalan &amp; Timbangan</label>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Lokasi / Site</label>
        <input class="form-input" id="do-site" type="text"
          value="${escapeHtml(cur.site || '')}"
          placeholder="cth: TRIAS CIKANDE" list="do-site-list">
        <datalist id="do-site-list">${_siteOptions()}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">No. DO <span style="font-size:10px;color:var(--muted);font-weight:400">(dari supplier)</span></label>
        <input class="form-input" id="do-external-no" type="text"
          value="${escapeHtml(cur.externalDoNo || '')}"
          placeholder="No. DO pengirim">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">No. Timbangan / GJIB</label>
        <input class="form-input" id="do-weigh-no" type="text"
          value="${escapeHtml(cur.weighNo || '')}"
          placeholder="No. tiket timbangan">
      </div>
      <div class="form-group">
        <label class="form-label">No. Surat Jalan</label>
        <input class="form-input" id="do-surat-jalan-no" type="text"
          value="${escapeHtml(cur.suratJalanNo || '')}"
          placeholder="No. Surat Jalan dari pengirim">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Isi (Ton)</label>
        <input class="form-input" id="do-gross-weight" type="number" step="0.01"
          value="${cur.grossWeight != null ? cur.grossWeight : ''}"
          placeholder="Berat isi">
      </div>
      <div class="form-group">
        <label class="form-label">Kosong (Ton)</label>
        <input class="form-input" id="do-tare-weight" type="number" step="0.01"
          value="${cur.tareWeight != null ? cur.tareWeight : ''}"
          placeholder="Berat kosong">
      </div>
    </div>
    ${_doLinesTable(curLines)}`;
}

/** Extract lines from SO/PO for DO (qty + item info only, no prices).
 *  deliveredMap: { [itemId]: alreadyDeliveredQty } — omit for edit-mode fills. */
function _extractDOLines(sourceLines, deliveredMap) {
  if (!sourceLines || sourceLines.length === 0) return [];
  return sourceLines.map(l => {
    const delivered = deliveredMap && l.itemId ? deliveredMap[l.itemId] || 0 : 0;
    const original = l.qty || 0;
    return {
      itemId: l.itemId || null,
      itemName: l.itemName || '',
      itemCode: l.itemCode || '',
      qty: Math.max(0, Math.round((original - delivered) * 1000) / 1000),
      qtyOriginal: original,
      qtyDelivered: delivered,
      unit: l.unit || '',
    };
  });
}

/** Sum qty already in DOs linked to the given SO or PO.
 *  Handles both native DOs (d.lines) and Accurate-imported DOs (d.items). */
function _deliveredQtyMap(refType, refId) {
  const map = {};
  (DB.deliveryOrders || []).forEach(d => {
    const matches = refType === 'SO' ? d.soId === refId : d.poId === refId;
    if (!matches) return;
    const rows = d.lines && d.lines.length ? d.lines : d.items || [];
    rows.forEach(l => {
      if (!l.itemId) return;
      map[l.itemId] = (map[l.itemId] || 0) + (Number(l.qty) || 0);
    });
  });
  return map;
}

/** Wire ref type radios + SO/PO selects → auto-fill fields + lines */
function _wireSoRefSelect() {
  const radios = document.querySelectorAll('input[name="do-ref-type"]');
  const soSel = document.getElementById('do-so-ref');
  const poSel = document.getElementById('do-po-ref');
  const partyLabel = document.getElementById('do-party-label');
  const custInp = document.getElementById('do-customer');
  const destInp = document.getElementById('do-destination');

  function updateLinesUI(lines) {
    const wrap = document.getElementById('do-lines-wrap');
    if (wrap) {
      const tmp = document.createElement('div');
      tmp.innerHTML = _doLinesTable(lines);
      wrap.replaceWith(tmp.firstElementChild);
    }
  }

  radios.forEach(r =>
    r.addEventListener('change', () => {
      const v = r.value;
      if (soSel) soSel.style.display = v === 'SO' ? '' : 'none';
      if (poSel) poSel.style.display = v === 'PO' ? '' : 'none';
      if (partyLabel) partyLabel.textContent = v === 'PO' ? 'Supplier' : 'Pelanggan';
      if (custInp) custInp.placeholder = v === 'PO' ? 'Nama supplier' : 'Nama pelanggan';
      if (v === 'none') {
        if (custInp) custInp.value = '';
        if (destInp) destInp.value = '';
        updateLinesUI([]);
      }
      if (soSel && v !== 'SO') soSel.value = '';
      if (poSel && v !== 'PO') poSel.value = '';
    })
  );

  if (soSel) {
    soSel.addEventListener('change', () => {
      const opt = soSel.options[soSel.selectedIndex];
      if (opt.value) {
        if (custInp && opt.dataset.customer) custInp.value = opt.dataset.customer;
        if (destInp && opt.dataset.destination) destInp.value = opt.dataset.destination;
        const so = (DB.salesOrders || []).find(s => s.id === opt.value);
        const dMap = _deliveredQtyMap('SO', opt.value);
        const lines = so ? _extractDOLines(so.lines, dMap) : [];
        if (lines.length > 0 && lines.every(l => l.qty === 0)) {
          showToast('Semua item SO ini sudah terkirim penuh', 'warning');
        }
        updateLinesUI(lines);
      } else {
        updateLinesUI([]);
      }
    });
  }

  if (poSel) {
    poSel.addEventListener('change', () => {
      const opt = poSel.options[poSel.selectedIndex];
      if (opt.value) {
        if (custInp && opt.dataset.supplier) custInp.value = opt.dataset.supplier;
        if (destInp && opt.dataset.destination) destInp.value = opt.dataset.destination;
        const po = (DB.purchaseOrders || []).find(p => p.id === opt.value);
        const dMap = _deliveredQtyMap('PO', opt.value);
        const lines = po ? _extractDOLines(po.lines, dMap) : [];
        if (lines.length > 0 && lines.every(l => l.qty === 0)) {
          showToast('Semua item PO ini sudah diterima penuh', 'warning');
        }
        updateLinesUI(lines);
      } else {
        updateLinesUI([]);
      }
    });
  }
}

function showAddDO(preselect) {
  openModal(
    'Buat Delivery Order Baru',
    _doFormBody(null, { preselect }),
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="saveDO">Simpan</button>`
  );

  setTimeout(() => {
    _wireSoRefSelect();
    if (preselect && preselect.soId) {
      const soSel = document.getElementById('do-so-ref');
      if (soSel) {
        soSel.value = preselect.soId;
        soSel.dispatchEvent(new Event('change'));
      }
    }
    if (preselect && preselect.poId) {
      const poSel = document.getElementById('do-po-ref');
      if (poSel) {
        poSel.value = preselect.poId;
        poSel.dispatchEvent(new Event('change'));
      }
    }
    document.getElementById('saveDO')?.addEventListener('click', () => {
      const refType = document.querySelector('input[name="do-ref-type"]:checked')?.value || 'none';
      const soId = refType === 'SO' ? document.getElementById('do-so-ref')?.value || null : null;
      const poId = refType === 'PO' ? document.getElementById('do-po-ref')?.value || null : null;
      const customer = sanitizeInput(document.getElementById('do-customer').value);
      const destination = sanitizeInput(document.getElementById('do-destination').value);
      const date = sanitizeInput(document.getElementById('do-date').value, 'date');
      const status = document.getElementById('do-status').value;
      const driver = sanitizeInput(document.getElementById('do-driver').value) || '—';
      const vehicle = sanitizeInput(document.getElementById('do-vehicle').value) || '—';
      const customerPO = sanitizeInput(document.getElementById('do-customer-po')?.value || '');
      const notes = sanitizeInput(document.getElementById('do-notes')?.value || '');
      const weighNo = sanitizeInput(document.getElementById('do-weigh-no')?.value || '');
      const suratJalanNo = sanitizeInput(document.getElementById('do-surat-jalan-no')?.value || '');
      const site = sanitizeInput(document.getElementById('do-site')?.value || '');
      const externalDoNo = sanitizeInput(document.getElementById('do-external-no')?.value || '');
      const grossWeightRaw = document.getElementById('do-gross-weight')?.value;
      const tareWeightRaw = document.getElementById('do-tare-weight')?.value;
      const grossWeight = grossWeightRaw !== '' && grossWeightRaw != null ? Number(grossWeightRaw) : null;
      const tareWeight = tareWeightRaw !== '' && tareWeightRaw != null ? Number(tareWeightRaw) : null;
      if (!customer) {
        showToast(
          refType === 'PO' ? 'Nama supplier harus diisi' : 'Nama pelanggan harus diisi',
          'warning'
        );
        return;
      }
      if (!destination) {
        showToast('Tujuan harus diisi', 'warning');
        return;
      }
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      const lines = [];
      document.querySelectorAll('#do-lines-wrap .do-line-qty').forEach(inp => {
        const qty = Number(inp.value) || 0;
        if (qty <= 0) return;
        lines.push({
          itemId: inp.dataset.itemId || null,
          itemName: inp.dataset.itemName || '',
          itemCode: inp.dataset.itemCode || '',
          qty,
          unit: inp.dataset.unit || '',
        });
      });
      const partyId = soId
        ? (DB.salesOrders.find(s => s.id === soId)?.customerId ?? null)
        : poId
          ? (DB.purchaseOrders.find(p => p.id === poId)?.supplierId ?? null)
          : null;
      // Single canonical DO number: the id IS the formatted number
      // (DO.YYYY.MM.NNNNN), so number mirrors it — no separate counter that can
      // drift from the id sequence.
      const newDoId = nextId('DO', DB.deliveryOrders);
      // Flag deliveries routed to a different address than the party's on file.
      const dc = _detectDestChange(refType, customer, destination);
      const finalNotes = dc.changed ? (notes ? `${dc.note}\n${notes}` : dc.note) : notes;
      const newDO = {
        id: newDoId,
        number: newDoId,
        soId: soId || null,
        poId: poId || null,
        customer,
        customerId: soId ? partyId : null,
        supplierId: poId ? partyId : null,
        destination,
        destChanged: dc.changed,
        destOriginal: dc.changed ? dc.from : '',
        date,
        status,
        driver,
        vehicle,
        customerPO,
        notes: finalNotes,
        weighNo,
        suratJalanNo,
        site,
        externalDoNo,
        grossWeight,
        tareWeight,
        lines,
      };
      DB.deliveryOrders.unshift(newDO);
      saveDB();
      closeModal();
      navigate(activeView);
      const refLabel = soId ? ` — ref: ${soId}` : poId ? ` — ref: ${poId}` : '';
      showToast(`${docNum(newDO.number, newDO.id)} berhasil dibuat${refLabel}`, 'success');
    });
  }, 50);
}

function editDO(id) {
  const o = DB.deliveryOrders.find(o => o.id === id);
  if (!o) {
    showToast('DO tidak ditemukan', 'danger');
    return;
  }
  openModal(
    `Edit DO — ${escapeHtml(id)}`,
    _doFormBody(o),
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn-danger" data-action="deleteDO" data-id="${escapeHtml(id)}">Hapus</button>
     <button class="btn" id="updateDO">Simpan</button>`
  );

  setTimeout(() => {
    _wireSoRefSelect();
    document.getElementById('updateDO')?.addEventListener('click', () => {
      const refType = document.querySelector('input[name="do-ref-type"]:checked')?.value || 'none';
      const soId = refType === 'SO' ? document.getElementById('do-so-ref')?.value || null : null;
      const poId = refType === 'PO' ? document.getElementById('do-po-ref')?.value || null : null;
      const customer = sanitizeInput(document.getElementById('do-customer').value);
      const destination = sanitizeInput(document.getElementById('do-destination').value);
      const date = sanitizeInput(document.getElementById('do-date').value, 'date');
      const status = document.getElementById('do-status').value;
      const driver = sanitizeInput(document.getElementById('do-driver').value) || '—';
      const vehicle = sanitizeInput(document.getElementById('do-vehicle').value) || '—';
      const customerPO = sanitizeInput(document.getElementById('do-customer-po')?.value || '');
      const notes = sanitizeInput(document.getElementById('do-notes')?.value || '');
      const weighNo = sanitizeInput(document.getElementById('do-weigh-no')?.value || '');
      const suratJalanNo = sanitizeInput(document.getElementById('do-surat-jalan-no')?.value || '');
      const site = sanitizeInput(document.getElementById('do-site')?.value || '');
      const externalDoNo = sanitizeInput(document.getElementById('do-external-no')?.value || '');
      const grossWeightRaw = document.getElementById('do-gross-weight')?.value;
      const tareWeightRaw = document.getElementById('do-tare-weight')?.value;
      const grossWeight = grossWeightRaw !== '' && grossWeightRaw != null ? Number(grossWeightRaw) : null;
      const tareWeight = tareWeightRaw !== '' && tareWeightRaw != null ? Number(tareWeightRaw) : null;
      if (!customer) {
        showToast(
          refType === 'PO' ? 'Nama supplier harus diisi' : 'Nama pelanggan harus diisi',
          'warning'
        );
        return;
      }
      if (!destination) {
        showToast('Tujuan harus diisi', 'warning');
        return;
      }
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      const lines = [];
      document.querySelectorAll('#do-lines-wrap .do-line-qty').forEach(inp => {
        const qty = Number(inp.value) || 0;
        if (qty <= 0) return;
        lines.push({
          itemId: inp.dataset.itemId || null,
          itemName: inp.dataset.itemName || '',
          itemCode: inp.dataset.itemCode || '',
          qty,
          unit: inp.dataset.unit || '',
        });
      });
      o.soId = soId || null;
      o.poId = poId || null;
      o.customer = customer;
      o.customerId = soId ? (DB.salesOrders.find(s => s.id === soId)?.customerId ?? null) : null;
      o.supplierId = poId ? (DB.purchaseOrders.find(p => p.id === poId)?.supplierId ?? null) : null;
      o.destination = destination;
      o.date = date;
      o.weighNo = weighNo;
      o.suratJalanNo = suratJalanNo;
      o.site = site;
      o.externalDoNo = externalDoNo;
      o.grossWeight = grossWeight;
      o.tareWeight = tareWeight;
      // Re-evaluate the destination-change flag. Strip any previous auto-note so
      // it isn't stacked on repeated edits, then re-add if still applicable.
      const dcNotes = notes
        .split('\n')
        .filter(l => !l.trim().startsWith('⚠ Tujuan diubah'))
        .join('\n')
        .trim();
      const dc = _detectDestChange(refType, customer, destination);
      o.destChanged = dc.changed;
      o.destOriginal = dc.changed ? dc.from : '';
      o.notes = dc.changed ? (dcNotes ? `${dc.note}\n${dcNotes}` : dc.note) : dcNotes;
      if (
        status !== o.status &&
        window.DocEngine &&
        !window.DocEngine.canTransition('DO', o.status, status)
      ) {
        showToast(`Transisi status DO ${o.status} → ${status} tidak diizinkan`, 'warning');
        return;
      }
      o.status = status;
      o.driver = driver;
      o.vehicle = vehicle;
      o.customerPO = customerPO;
      o.lines = lines;
      // The form was seeded from `items` for Accurate-imported DOs — once the
      // user saves, `lines` is the single source of truth for the line data.
      if (lines.length > 0 && o.items) {
        delete o.items;
      }
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${id} berhasil diperbarui`, 'success');
    });
  }, 50);
}

function viewDO(id) {
  const o = DB.deliveryOrders.find(o => o.id === id);
  if (!o) {
    showToast('DO tidak ditemukan', 'danger');
    return;
  }
  const soRefHtml = o.soId
    ? `<a style="color:var(--primary);cursor:pointer;text-decoration:underline;font-weight:700"
          data-action="viewSO" data-id="${escapeHtml(o.soId)}">${escapeHtml(o.soId)}</a>`
    : '—';
  const poRefHtml = o.poId
    ? `<a style="color:var(--primary);cursor:pointer;text-decoration:underline;font-weight:700"
          data-action="viewPO" data-id="${escapeHtml(o.poId)}">${escapeHtml(o.poId)}</a>`
    : '';
  // Make the DO's origin explicit: it is created either from a PO (purchase
  // delivery) or an SO (sales delivery), or stands alone with no reference.
  function _srcTag(text, color, bg, border) {
    return `<span style="display:inline-block;font-size:9px;font-weight:800;color:${color};background:${bg};border:1px solid ${border};border-radius:99px;padding:1px 7px;margin-right:6px;vertical-align:middle">${text}</span>`;
  }
  const refRow = o.poId
    ? detailRow('Dibuat dari', _srcTag('DARI PO', '#B45309', '#FEF3C7', '#FCD34D') + poRefHtml)
    : o.soId
      ? detailRow('Dibuat dari', _srcTag('DARI SO', '#1D4ED8', '#DBEAFE', '#93C5FD') + soRefHtml)
      : detailRow('Dibuat dari', '<span style="color:var(--muted)">Tanpa referensi (DO manual)</span>');
  const partyLabel = o.poId ? 'Supplier' : 'Pelanggan';

  // Accurate-imported DOs store their lines in `items`; native DOs use `lines`.
  const viewLines = o.lines && o.lines.length > 0 ? o.lines : o.items || [];
  const linesHtml =
    viewLines.length > 0
      ? `<div style="margin-top:14px">
        <div class="detail-label" style="margin-bottom:8px">Daftar Barang</div>
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead style="background:var(--bg)">
              <tr>
                <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border-bottom:1px solid var(--border)">Item</th>
                <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;width:60px;border-bottom:1px solid var(--border)">Qty</th>
                <th style="padding:7px 10px;font-size:11px;font-weight:700;text-align:left;width:46px;border-bottom:1px solid var(--border)">Sat.</th>
              </tr>
            </thead>
            <tbody>
              ${viewLines
                .map(
                  l => `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:7px 10px;font-size:12px;font-weight:600">${escapeHtml(l.itemName || '')}</td>
                <td style="padding:7px 10px;font-size:12px;text-align:right">${l.qty || 0}</td>
                <td style="padding:7px 10px;font-size:11px;color:var(--muted)">${escapeHtml(l.unit || '')}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`
      : '';

  openModal(
    `Detail DO — ${escapeHtml(docNum(o.number, o.id))}`,
    `
    <div class="detail-grid">
      ${detailRow('No. DO', escapeHtml(docNum(o.number, o.id)))}
      ${detailRow('Status', badge(o.status))}
      <div class="detail-divider"></div>
      ${refRow}
      ${detailRow(partyLabel, escapeHtml(o.customer))}
      ${detailRow(
        'Tujuan',
        escapeHtml(o.destination) +
          (o.destChanged
            ? ` <span style="display:inline-block;font-size:9px;font-weight:800;color:#B45309;background:#FEF3C7;border:1px solid #FCD34D;border-radius:99px;padding:1px 6px">⚠ DIUBAH</span>`
            : '')
      )}
      ${o.destChanged && o.destOriginal ? detailRow('Tujuan Asal', escapeHtml(o.destOriginal)) : ''}
      ${detailRow('Tgl. Kirim', escapeHtml(o.date))}
      <div class="detail-divider"></div>
      ${detailRow('Driver', escapeHtml(o.driver))}
      ${detailRow('Kendaraan', `<span style="font-family:monospace;font-weight:700">${escapeHtml(o.vehicle)}</span>`)}
      ${o.notes ? detailRow('Catatan', escapeHtml(o.notes)) : ''}
      ${
        o.needsCorrection
          ? `<div class="detail-divider"></div>
             <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;margin:6px 0">
               <div style="font-size:11px;font-weight:800;color:#92400E;margin-bottom:3px">⚠ PETUGAS LAPANGAN MINTA KOREKSI</div>
               <div style="font-size:12px;color:#78350F">${escapeHtml(o.correctionNote || '')}</div>
               <div style="font-size:10px;color:#92400E;margin-top:4px">
                 ${escapeHtml(o.correctionBy || 'petugas')}${o.correctionAt ? ' · ' + escapeHtml(String(o.correctionAt).slice(0, 16).replace('T', ' ')) : ''}
               </div>
             </div>`
          : ''
      }
      ${o.recordedBy ? detailRow('Diinput oleh', escapeHtml(o.recordedBy)) : ''}
      ${o.site || o.externalDoNo || o.weighNo || o.suratJalanNo || o.grossWeight != null || o.tareWeight != null ? '<div class="detail-divider"></div>' : ''}
      ${o.site ? detailRow('Lokasi / Site', escapeHtml(o.site)) : ''}
      ${o.externalDoNo ? detailRow('No. DO (Supplier)', escapeHtml(o.externalDoNo)) : ''}
      ${o.weighNo ? detailRow('No. Timbangan / GJIB', escapeHtml(o.weighNo)) : ''}
      ${o.suratJalanNo ? detailRow('No. Surat Jalan', escapeHtml(o.suratJalanNo)) : ''}
      ${o.grossWeight != null ? detailRow('Isi', `${o.grossWeight} Ton`) : ''}
      ${o.tareWeight != null ? detailRow('Kosong', `${o.tareWeight} Ton`) : ''}
      ${o.grossWeight != null && o.tareWeight != null ? detailRow('Netto', `<strong>${Math.round((o.grossWeight - o.tareWeight) * 1000) / 1000} Ton</strong>`) : ''}
    </div>
    ${linesHtml}
  `,
    `<button class="btn-ghost" data-action="closeModal">Tutup</button>
   ${window.DocFlow ? window.DocFlow.button('DO', id) : ''}
   <button class="btn-ghost" data-action="bulkSuratJalan" data-id="${escapeHtml(id)}"
     style="display:flex;align-items:center;gap:5px">
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
       <polyline points="14 2 14 8 20 8"/>
       <line x1="16" y1="13" x2="8" y2="13"/>
       <line x1="16" y1="17" x2="8" y2="17"/>
     </svg>
     Cetak Surat Jalan
   </button>
   ${
     o.needsCorrection
       ? `<button class="btn-ghost" data-action="resolveCorrection" data-id="${escapeHtml(id)}"
            style="color:#92400E;font-weight:700">✓ Koreksi Selesai</button>`
       : ''
   }
   <button class="btn" data-action="editDO" data-id="${escapeHtml(id)}">Edit</button>`
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// § 6b  BULK SURAT JALAN — split tonnage across trucks → multi-tab Excel
// ════════════════════════════════════════════════════════════════════════════════

function showBulkSuratJalan(doId) {
  const o = DB.deliveryOrders.find(d => d.id === doId);
  if (!o) {
    showToast('DO tidak ditemukan', 'danger');
    return;
  }

  const lines = o.lines || [];
  const totalQty = lines.reduce((s, l) => s + (l.qty || 0), 0);
  const mainUnit = lines.length > 0 ? lines[0].unit || 'ton' : 'ton';
  const itemNames = lines.map(l => l.itemName || '').join(', ');

  // Extract DO sequence number for Surat Jalan numbering (e.g. DO-2026-039 → 039)
  const doSeqMatch = (o.id || '').match(/(\d+)$/);
  const doSeq = doSeqMatch ? doSeqMatch[1] : '001';

  openModal(
    'Bulk Surat Jalan — Bagi per Truck',
    `
    <div style="margin-bottom:14px;padding:10px 14px;background:var(--bg);border-radius:10px;font-size:12px">
      <div style="font-weight:700;margin-bottom:4px">Referensi: ${escapeHtml(docNum(o.number, o.id))} ${o.soId ? '→ ' + escapeHtml(o.soId) : ''} ${o.poId ? '→ ' + escapeHtml(o.poId) : ''}</div>
      <div>Pelanggan: <strong>${escapeHtml(o.customer)}</strong></div>
      <div>Barang: <strong>${escapeHtml(itemNames)}</strong></div>
      <div>Total Qty: <strong>${totalQty.toLocaleString('id-ID')} ${escapeHtml(mainUnit)}</strong></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Kapasitas per Truck (${escapeHtml(mainUnit)})</label>
        <input class="form-input" id="bulk-truck-cap" type="number" step="0.01" min="0.01"
          placeholder="cth: 30" value="">
      </div>
      <div class="form-group">
        <label class="form-label">Jumlah Trip</label>
        <input class="form-input" id="bulk-trip-count" type="number" readonly
          style="background:var(--bg);font-weight:700;font-size:16px" value="0">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Prefix No. Surat Jalan</label>
        <input class="form-input" id="bulk-sj-prefix" type="text"
          value="SJ-${new Date().getFullYear().toString().slice(-2)}-${doSeq}"
          placeholder="SJ-26-039">
      </div>
      <div class="form-group">
        <label class="form-label">No. PO Customer <span style="font-size:10px;color:var(--muted)">(opsional)</span></label>
        <input class="form-input" id="bulk-cust-po" type="text"
          value="${escapeHtml(o.customerPO || '')}"
          placeholder="PO/CUST/2026/...">
      </div>
    </div>
    <div id="bulk-preview" style="margin-top:10px;font-size:12px;color:var(--muted)"></div>
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
     <button class="btn" id="bulkExportBtn" disabled>Download Excel</button>`
  );

  setTimeout(() => {
    const capInp = document.getElementById('bulk-truck-cap');
    const tripInp = document.getElementById('bulk-trip-count');
    const prefixInp = document.getElementById('bulk-sj-prefix');
    const preview = document.getElementById('bulk-preview');
    const exportBtn = document.getElementById('bulkExportBtn');

    function recalc() {
      const cap = parseFloat(capInp.value) || 0;
      if (cap <= 0 || totalQty <= 0) {
        tripInp.value = 0;
        preview.innerHTML = '';
        exportBtn.disabled = true;
        return;
      }
      const trips = Math.ceil(totalQty / cap);
      tripInp.value = trips;
      exportBtn.disabled = false;

      const prefix = prefixInp.value.trim() || 'SJ';
      let previewItems = [];
      for (let i = 1; i <= Math.min(trips, 5); i++) {
        const num = String(i).padStart(3, '0');
        previewItems.push(`${prefix}-${num}`);
      }
      const ellipsis = trips > 5 ? ` ... ${prefix}-${String(trips).padStart(3, '0')}` : '';
      preview.innerHTML =
        `<strong>${trips} Surat Jalan:</strong> ${previewItems.join(', ')}${ellipsis}` +
        `<br>Masing-masing ${cap.toLocaleString('id-ID')} ${escapeHtml(mainUnit)} per truck` +
        (totalQty % cap !== 0
          ? `<br><em>Trip terakhir: ${(totalQty % cap).toLocaleString('id-ID')} ${escapeHtml(mainUnit)}</em>`
          : '');
    }

    capInp.addEventListener('input', recalc);
    prefixInp.addEventListener('input', recalc);

    exportBtn.addEventListener('click', () => {
      const cap = parseFloat(capInp.value) || 0;
      if (cap <= 0) return;
      const trips = Math.ceil(totalQty / cap);
      const prefix = prefixInp.value.trim() || 'SJ';
      const custPO = document.getElementById('bulk-cust-po')?.value || '';
      const topPO = o.poId || o.soId || '';

      const company = (DB.settings && DB.settings.company) || {};
      const companyNameXlsx = (company.name || 'DEMO').toUpperCase();
      const addr1Xlsx = company.address || 'Jl. Contoh No. 1, Jakarta, Indonesia';
      const phone = company.phone || '021-0000-0000';

      const fmtDate = iso => {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return String(iso);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      };

      function _b64(s) {
        const r = atob(s),
          a = new Uint8Array(r.length);
        for (let i = 0; i < r.length; i++) a[i] = r.charCodeAt(i);
        return a;
      }
      const _LOGO = _b64(
        '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'
      );
      const _STAMP = _b64(
        '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'
      );

      const sheets = [];
      for (let i = 0; i < trips; i++) {
        const num = String(i + 1).padStart(3, '0');
        const sjNo = `${prefix}-${num}`;
        const tripQty = i < trips - 1 ? cap : totalQty - cap * (trips - 1);
        const tabName = sjNo.length > 31 ? sjNo.slice(-31) : sjNo;

        const cells = [],
          merges = ['I3:I4', 'J3:K4', 'A6:K6', 'B15:F15', 'G15:H15', 'I15:K15'];
        const ck = (ref, v, s) => cells.push({ c: ref, v: v == null ? '' : String(v), s: s || {} });

        // Company header
        ck('B2', companyNameXlsx, { sz: 12 });
        ck('B3', addr1Xlsx, { sz: 12 });
        ck('B4', '', { sz: 12 });
        ck('B5', '', { sz: 12 });
        ck('F5', 'Telp: ' + phone, { sz: 12 });

        // PO reference box I3:I4 | J3:K4
        ck('I3', 'PO: ', { sz: 24, bl: 'medium', bt: 'medium', h: 'center', v: 'center' });
        ck('J3', topPO, { sz: 22, bt: 'medium', h: 'center', v: 'center' });
        ck('K3', '', { sz: 22, br: 'medium', bt: 'medium', h: 'center', v: 'center' });
        ck('I4', '', { sz: 24, bl: 'medium', bb: 'medium', h: 'center', v: 'center' });
        ck('J4', '', { sz: 22, bb: 'medium', h: 'center', v: 'center' });
        ck('K4', '', { sz: 22, br: 'medium', bb: 'medium', h: 'center', v: 'center' });

        // SURAT JALAN title A6:K6
        ck('A6', 'SURAT JALAN', {
          sz: 12,
          b: true,
          bl: 'medium',
          bt: 'medium',
          bb: 'medium',
          h: 'center',
        });
        ck('B6', '', { bt: 'medium', bb: 'medium' });
        ck('C6', '', { bt: 'medium', bb: 'medium' });
        ck('D6', '', { bt: 'medium', bb: 'medium' });
        ck('E6', '', { bt: 'medium', bb: 'medium' });
        ck('F6', '', { bt: 'medium', bb: 'medium' });
        ck('G6', '', { bt: 'medium', bb: 'medium' });
        ck('H6', '', { bt: 'medium', bb: 'medium' });
        ck('I6', '', { bt: 'medium', bb: 'medium' });
        ck('J6', '', { bt: 'medium', bb: 'medium' });
        ck('K6', '', { br: 'medium', bt: 'medium', bb: 'medium' });

        // Info box row 7 (top border)
        ck('A7', 'Tgl. Surat Jalan', { sz: 12, bl: 'medium', bt: 'medium' });
        ck('B7', '', { bt: 'medium' });
        ck('C7', ': ' + fmtDate(o.date), { sz: 12, bt: 'medium' });
        ck('D7', '', { bt: 'medium' });
        ck('E7', '', { bt: 'medium' });
        ck('F7', '', { bt: 'medium' });
        ck('G7', '', { bt: 'medium' });
        ck('H7', '', { bt: 'medium' });
        ck('I7', '', { bt: 'medium' });
        ck('J7', '', { bt: 'medium' });
        ck('K7', '', { br: 'medium', bt: 'medium' });

        // Info box rows 8-9
        ck('A8', 'No. Surat Jalan', { sz: 12, bl: 'medium' });
        ck('C8', ': ' + sjNo, { sz: 12 });
        ck('G8', 'NO. POLISI', { sz: 12 });
        ck('H8', ': ', { sz: 12 });
        ck('K8', '', { br: 'medium' });

        ck('A9', 'No. PO', { sz: 12, bl: 'medium' });
        ck('C9', ': ' + custPO, { sz: 12 });
        ck('G9', 'NAMA SUPIR', { sz: 12 });
        ck('H9', ': ', { sz: 12 });
        ck('K9', '', { br: 'medium' });

        // Info box row 10 (bottom border)
        ck('A10', 'QTY PO', { sz: 12, bl: 'medium', bb: 'medium' });
        ck('B10', '', { bb: 'medium' });
        ck('C10', ': ' + totalQty.toLocaleString('id-ID') + ' ' + mainUnit, {
          sz: 12,
          bb: 'medium',
        });
        ck('D10', '', { bb: 'medium' });
        ck('E10', '', { bb: 'medium' });
        ck('F10', '', { bb: 'medium' });
        ck('G10', '', { bb: 'medium' });
        ck('H10', '', { bb: 'medium' });
        ck('I10', '', { bb: 'medium' });
        ck('J10', '', { bb: 'medium' });
        ck('K10', '', { br: 'medium', bb: 'medium' });

        // Customer / destination box rows 11-14
        ck('A11', 'Kepada Yth:', { sz: 12, bl: 'medium', bt: 'medium' });
        ck('B11', '', { bt: 'medium' });
        ck('C11', '', { bt: 'medium' });
        ck('D11', '', { bt: 'medium' });
        ck('E11', '', { br: 'medium', bt: 'medium' });
        ck('F11', 'Alamat Kirim:', { sz: 12, bl: 'medium', bt: 'medium' });
        ck('G11', '', { bt: 'medium' });
        ck('H11', '', { bt: 'medium' });
        ck('I11', '', { bt: 'medium' });
        ck('J11', '', { bt: 'medium' });
        ck('K11', '', { br: 'medium', bt: 'medium' });

        ck('A12', o.customer || '', { sz: 12, bl: 'medium' });
        ck('E12', '', { br: 'medium' });
        ck('F12', o.destination || '', { sz: 12, bl: 'medium' });
        ck('K12', '', { br: 'medium' });
        ck('A13', '', { bl: 'medium' });
        ck('E13', '', { br: 'medium' });
        ck('F13', '', { bl: 'medium' });
        ck('K13', '', { br: 'medium' });
        ck('A14', '', { bl: 'medium' });
        ck('E14', '', { br: 'medium' });
        ck('F14', '', { bl: 'medium' });
        ck('K14', '', { br: 'medium' });

        // Table header row 15
        const _FBX = {
          sz: 12,
          bl: 'medium',
          br: 'medium',
          bt: 'medium',
          bb: 'medium',
          h: 'center',
        };
        const _BTBB = { bt: 'medium', bb: 'medium', h: 'center' };
        ck('A15', 'No.', { sz: 12, bl: 'medium', br: 'medium' });
        ck('B15', 'NAMA BARANG', { sz: 12, bl: 'medium', bt: 'medium', bb: 'medium', h: 'center' });
        ck('C15', '', _BTBB);
        ck('D15', '', _BTBB);
        ck('E15', '', _BTBB);
        ck('F15', '', { bt: 'medium', bb: 'medium', br: 'medium', h: 'center' });
        ck('G15', 'JUMLAH', _BTBB);
        ck('H15', '', _BTBB);
        ck('I15', 'Keterangan', { sz: 12, bl: 'medium', bt: 'medium', bb: 'medium', h: 'center' });
        ck('J15', '', _BTBB);
        ck('K15', '', { bt: 'medium', bb: 'medium', br: 'medium', h: 'center' });

        // Item rows (4 per item: name + P= + L= + T=)
        let R = 16;
        const rowHeights = { 2: 16.2, 3: 15.6, 4: 16.35, 5: 16.2, 6: 14.25, 14: 16.2, 15: 16.2 };

        lines.forEach((l, idx) => {
          const iQ = lines.length === 1 ? '' : String(l.qty || '');
          // item name row
          ck('A' + R, String(idx + 1), { sz: 12, bl: 'medium', br: 'medium' });
          ck('B' + R, (l.itemName || '').toUpperCase(), { sz: 12, bl: 'medium' });
          ck('F' + R, '', { br: 'medium' });
          ck('G' + R, iQ, { sz: 12 });
          ck('H' + R, l.unit || '', { sz: 12 });
          ck('I' + R, '', { bl: 'medium' });
          ck('K' + R, '', { br: 'medium' });
          R++;
          // P= row
          ck('A' + R, '', { bl: 'medium', br: 'medium' });
          ck('B' + R, '', { bl: 'medium' });
          ck('F' + R, '', { br: 'medium' });
          ck('G' + R, 'P=', { sz: 12, h: 'right' });
          ck('I' + R, '', { bl: 'medium' });
          ck('K' + R, '', { br: 'medium' });
          R++;
          // L= row
          ck('A' + R, '', { bl: 'medium', br: 'medium' });
          ck('B' + R, '', { bl: 'medium' });
          ck('F' + R, '', { br: 'medium' });
          ck('G' + R, 'L=', { sz: 12, h: 'right' });
          ck('I' + R, '', { bl: 'medium' });
          ck('K' + R, '', { br: 'medium' });
          R++;
          // T= row with bottom border
          ck('A' + R, '', { bl: 'medium', br: 'medium', bb: 'medium' });
          ck('B' + R, '', { bl: 'medium', bb: 'medium' });
          ck('C' + R, '', { bb: 'medium' });
          ck('D' + R, '', { bb: 'medium' });
          ck('E' + R, '', { bb: 'medium' });
          ck('F' + R, '', { br: 'medium', bb: 'medium' });
          ck('G' + R, 'T=', { sz: 12, h: 'right' });
          ck('I' + R, '', { bl: 'medium', bb: 'medium' });
          ck('J' + R, '', { bb: 'medium' });
          ck('K' + R, '', { br: 'medium', bb: 'medium' });
          rowHeights[R] = 16.2;
          R++;
        });

        // Signature section
        const sigR = R;
        merges.push('A' + sigR + ':D' + sigR, 'E' + sigR + ':H' + sigR, 'I' + sigR + ':K' + sigR);
        ck('A' + sigR, 'PENERIMA', _FBX);
        ck('B' + sigR, '', _FBX);
        ck('C' + sigR, '', _FBX);
        ck('D' + sigR, '', _FBX);
        ck('E' + sigR, 'PENGIRIM', _FBX);
        ck('F' + sigR, '', _FBX);
        ck('G' + sigR, '', _FBX);
        ck('H' + sigR, '', _FBX);
        ck('I' + sigR, 'HORMAT KAMI', _FBX);
        ck('J' + sigR, '', _FBX);
        ck('K' + sigR, '', _FBX);
        rowHeights[sigR] = 15;

        for (let sr = 1; sr <= 4; sr++) {
          const bR = sigR + sr;
          ck('A' + bR, '', { bl: 'medium' });
          ck('D' + bR, '', { br: 'medium' });
          ck('I' + bR, '', { bl: 'medium' });
          ck('K' + bR, '', { br: 'medium' });
        }
        rowHeights[sigR + 4] = 16.2;

        const nameR = sigR + 5;
        merges.push(
          'A' + nameR + ':D' + nameR,
          'E' + nameR + ':H' + nameR,
          'I' + nameR + ':K' + nameR
        );
        ck('A' + nameR, '', _FBX);
        ck('B' + nameR, '', _FBX);
        ck('C' + nameR, '', _FBX);
        ck('D' + nameR, '', _FBX);
        ck('E' + nameR, '', _FBX);
        ck('F' + nameR, '', _FBX);
        ck('G' + nameR, '', _FBX);
        ck('H' + nameR, '', _FBX);
        ck('I' + nameR, companyNameXlsx, _FBX);
        ck('J' + nameR, '', _FBX);
        ck('K' + nameR, '', _FBX);
        rowHeights[nameR] = 15;

        sheets.push({
          name: tabName,
          cells,
          merges,
          cols: [
            { i: 0, width: 8.78 },
            { i: 1, width: 8.78 },
            { i: 2, width: 8.78 },
            { i: 3, width: 8.78 },
            { i: 4, width: 8.78 },
            { i: 5, width: 10 },
            { i: 6, width: 15.55 },
            { i: 7, width: 8.78 },
            { i: 8, width: 8.78 },
            { i: 9, width: 8.78 },
            { i: 10, width: 8.78 },
          ],
          rowHeights,
          images: [
            {
              bytes: _LOGO,
              ext: 'png',
              col: 0,
              row: 0,
              colOff: 38160,
              rowOff: 56160,
              w: 58,
              h: 80,
            },
            {
              bytes: _STAMP,
              ext: 'jpeg',
              col: 8,
              row: sigR,
              colOff: 537480,
              rowOff: 48960,
              w: 77,
              h: 70,
            },
          ],
        });
      }

      const filename = `Surat-Jalan_${o.customer.replace(/[^a-zA-Z0-9]/g, '-')}_${prefix}`;
      try {
        window.NSAXlsx.download(filename, sheets);
        showToast(`${trips} Surat Jalan diekspor ke Excel`, 'success');
      } catch (e) {
        showToast('Gagal ekspor: ' + e.message, 'danger');
      }
    });
  }, 50);
}

// ════════════════════════════════════════════════════════════════════════════════
// § 7  OVERRIDE: showAddSO — customer validation + reservation
// ════════════════════════════════════════════════════════════════════════════════

function showAddSO() {
  const custOpts = (DB.customers || []).map(c => `<option value="${escapeHtml(c.name)}">`).join('');
  openModal(
    'Buat Sales Order Baru',
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Pelanggan</label>
        <input class="form-input" id="so-customer" type="text"
          placeholder="Nama pelanggan" list="so-cust-list" autocomplete="off">
        <datalist id="so-cust-list">${custOpts}</datalist>
        <div id="so-cust-hint" style="font-size:10px;margin-top:3px;min-height:14px"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input class="form-input" id="so-date" type="date" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Jatuh Tempo <span style="font-size:10px;color:var(--muted);font-weight:400">(opsional)</span></label>
        <input class="form-input" id="so-due-date" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="so-status">
          ${statusOptions(SO_STATUSES, 'Draft')}
        </select>
      </div>
      ${warehouseSelectHTML()}
    </div>
    ${lineItemsHTML()}
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn" id="saveSO">Simpan SO</button>`,
    true
  );

  setTimeout(() => {
    // Customer validation hint
    const custInp = document.getElementById('so-customer');
    const custHint = document.getElementById('so-cust-hint');
    if (custInp && custHint) {
      custInp.addEventListener('blur', () => {
        const name = custInp.value.trim();
        if (!name) {
          custHint.innerHTML = '';
          return;
        }
        const match = (DB.customers || []).find(c => c.name === name);
        custHint.innerHTML = match
          ? `<span style="color:#34C759">✓ Rekaman pelanggan ditemukan</span>`
          : `<span style="color:#FF9F0A">⚠ Tidak cocok rekaman — tambah di <strong>Master Data</strong> jika pelanggan baru</span>`;
      });
    }

    const collectLines = initLineItems('sell', []);
    document.getElementById('saveSO')?.addEventListener('click', () => {
      const customer = sanitizeInput(document.getElementById('so-customer').value);
      const date = sanitizeInput(document.getElementById('so-date').value, 'date');
      const status = document.getElementById('so-status').value;
      if (!customer) {
        showToast('Nama pelanggan harus diisi', 'warning');
        return;
      }
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      const lines = collectLines();
      if (lines.length === 0) {
        showToast('Tambahkan minimal 1 item', 'warning');
        return;
      }
      const dueDate = sanitizeInput(document.getElementById('so-due-date')?.value || '', 'date');
      const dpp = lines.reduce((s, l) => s + l.subtotal, 0);
      const ppnChk = document.getElementById('ppnToggle');
      const taxCfg = (DB.settings && DB.settings.tax) || {};
      const soTaxRate = ppnChk && ppnChk.checked ? (typeof taxCfg.ppnRate === 'number' ? taxCfg.ppnRate : 0.11) : 0;
      const soTax = soTaxRate > 0 ? Math.round(dpp * soTaxRate) : 0;
      const amount = dpp + soTax;
      const soNumber = window.DocEngine
        ? window.DocEngine.nextNumber('SO', date, { commit: true })
        : null;
      const whSel = document.getElementById('order-warehouse');
      const newSO = {
        id: nextId('SO', DB.salesOrders),
        number: soNumber || undefined,
        customer,
        customerId: window.DocEngine?.resolvePartyId('SO', customer) ?? null,
        date,
        dueDate: dueDate || null,
        amount,
        taxRate: soTaxRate,
        tax: soTax,
        status,
        lines,
        warehouseId: whSel ? whSel.value : undefined,
        stockMutated: false,
      };
      // Reservation when Confirmed
      if (status === 'Confirmed') {
        const problems = checkOversell(lines, null);
        if (problems.length > 0) {
          showToast(
            'Peringatan stok tidak cukup: ' +
              problems.map(p => `${p.itemName} (tersedia ${p.available})`).join(', '),
            'warning'
          );
        }
        reserveStock(newSO.id, lines);
      }
      if (status === 'Delivered') {
        applyStockMutation(newSO, 'out');
      }
      DB.salesOrders.unshift(newSO);
      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${docNum(newSO.number, newSO.id)} berhasil dibuat`, 'success');
    });
  }, 50);
}

// ════════════════════════════════════════════════════════════════════════════════
// § 8  OVERRIDE: editSO — reservation transitions + customer validation
// ════════════════════════════════════════════════════════════════════════════════

function editSO(id) {
  const o = DB.salesOrders.find(o => o.id === id);
  if (!o) {
    showToast('SO tidak ditemukan', 'danger');
    return;
  }
  const custOpts = (DB.customers || []).map(c => `<option value="${escapeHtml(c.name)}">`).join('');
  openModal(
    `Edit SO — ${escapeHtml(id)}`,
    `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Pelanggan</label>
        <input class="form-input" id="so-customer" type="text"
          value="${escapeHtml(o.customer)}" list="so-cust-list" autocomplete="off">
        <datalist id="so-cust-list">${custOpts}</datalist>
        <div id="so-cust-hint" style="font-size:10px;margin-top:3px;min-height:14px"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Tanggal</label>
        <input class="form-input" id="so-date" type="date" value="${escapeHtml(o.date)}">
      </div>
      <div class="form-group">
        <label class="form-label">Jatuh Tempo <span style="font-size:10px;color:var(--muted);font-weight:400">(opsional)</span></label>
        <input class="form-input" id="so-due-date" type="date" value="${escapeHtml(o.dueDate || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="so-status">
          ${statusOptions(SO_STATUSES, o.status)}
        </select>
      </div>
      ${warehouseSelectHTML(o.warehouseId)}
    </div>
    ${lineItemsHTML()}
  `,
    `<button class="btn-ghost" data-action="closeModal">Batal</button>
   <button class="btn-danger" data-action="deleteSO" data-id="${escapeHtml(id)}">Hapus</button>
   <button class="btn" id="updateSO">Simpan</button>`,
    true
  );

  setTimeout(() => {
    // Customer validation hint
    const custInp = document.getElementById('so-customer');
    const custHint = document.getElementById('so-cust-hint');
    if (custInp && custHint) {
      custInp.addEventListener('blur', () => {
        const name = custInp.value.trim();
        if (!name) {
          custHint.innerHTML = '';
          return;
        }
        const match = (DB.customers || []).find(c => c.name === name);
        custHint.innerHTML = match
          ? `<span style="color:#34C759">✓ Rekaman pelanggan ditemukan</span>`
          : `<span style="color:#FF9F0A">⚠ Tidak cocok rekaman — tambah di <strong>Master Data</strong> jika pelanggan baru</span>`;
      });
    }

    const ppnChkEdit = document.getElementById('ppnToggle');
    if (ppnChkEdit && o.taxRate > 0) { ppnChkEdit.checked = true; }
    const collectLines = initLineItems('sell', o.lines || []);
    document.getElementById('updateSO')?.addEventListener('click', () => {
      const customer = sanitizeInput(document.getElementById('so-customer').value);
      const date = sanitizeInput(document.getElementById('so-date').value, 'date');
      const status = document.getElementById('so-status').value;
      if (!customer) {
        showToast('Nama pelanggan harus diisi', 'warning');
        return;
      }
      if (!date) {
        showToast('Tanggal harus diisi', 'warning');
        return;
      }
      const lines = collectLines();
      if (lines.length === 0) {
        showToast('Tambahkan minimal 1 item', 'warning');
        return;
      }

      const wasDelivered = o.status === 'Delivered';
      const nowDelivered = status === 'Delivered';
      const wasConfirmed = o.status === 'Confirmed';
      const nowConfirmed = status === 'Confirmed';

      const dueDate = sanitizeInput(document.getElementById('so-due-date')?.value || '', 'date');
      // ── Stock mutation (same logic as original editSO) ─────────────────────
      const oldLines = wasDelivered && o.stockMutated ? o.lines || [] : [];
      const dpp = lines.reduce((s, l) => s + l.subtotal, 0);
      const ppnChk = document.getElementById('ppnToggle');
      const taxCfg2 = (DB.settings && DB.settings.tax) || {};
      // Preserve an existing rate (e.g. legacy 12% imports) and the
      // tax-inclusive nature so editing doesn't silently restate the total.
      const soTaxRate = ppnChk && ppnChk.checked
        ? (o.taxRate > 0 ? o.taxRate : (typeof taxCfg2.ppnRate === 'number' ? taxCfg2.ppnRate : 0.11))
        : 0;
      const soIncl = soTaxRate > 0 && !!o.taxInclusive;
      const soTax = soTaxRate > 0
        ? Math.round(soIncl ? (dpp * soTaxRate) / (1 + soTaxRate) : dpp * soTaxRate)
        : 0;

      const whSelEdit = document.getElementById('order-warehouse');
      o.customer = customer;
      o.customerId = window.DocEngine?.resolvePartyId('SO', customer) ?? null;
      o.date = date;
      o.dueDate = dueDate || null;
      o.status = status;
      o.lines = lines;
      o.taxRate = soTaxRate;
      o.taxInclusive = soIncl;
      o.tax = soTax;
      o.amount = soIncl ? dpp : dpp + soTax;
      if (whSelEdit) o.warehouseId = whSelEdit.value;

      if (!wasDelivered && nowDelivered && !o.stockMutated) {
        applyStockMutation(o, 'out');
        releaseReservation(id);
        showToast('Stok inventori diperbarui otomatis', 'info');
      } else if (wasDelivered && nowDelivered && o.stockMutated) {
        oldLines.forEach(line => {
          if (line.itemId === 'custom') {
            return;
          }
          const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
          // FIX: Guard against negative inventory with Math.max(0, ...)
          if (item) {
            item.stock = Math.max(0, item.stock + line.qty);
          }
        });
        o.stockMutated = false;
        applyStockMutation(o, 'out');
        showToast('Stok diperbarui sesuai perubahan item', 'info');
      } else if (wasDelivered && !nowDelivered && o.stockMutated) {
        oldLines.forEach(line => {
          if (line.itemId === 'custom') {
            return;
          }
          const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
          // FIX: Guard against negative inventory with Math.max(0, ...)
          if (item) {
            item.stock = Math.max(0, item.stock + line.qty);
          }
        });
        o.stockMutated = false;
        showToast('Stok dikembalikan karena status berubah dari Terkirim', 'info');
      }

      // ── Reservation transitions ────────────────────────────────────────────
      if (nowConfirmed) {
        // Always refresh reservation when Confirmed (covers new + line changes)
        const problems = checkOversell(lines, id);
        if (problems.length > 0) {
          showToast(
            'Peringatan stok tidak cukup: ' +
              problems.map(p => `${p.itemName} (tersedia ${p.available})`).join(', '),
            'warning'
          );
        }
        reserveStock(id, lines);
      } else if (wasConfirmed && !nowConfirmed && !nowDelivered) {
        releaseReservation(id);
      }

      saveDB();
      closeModal();
      navigate(activeView);
      showToast(`${id} berhasil diperbarui`, 'success');
    });
  }, 50);
}

// ════════════════════════════════════════════════════════════════════════════════
// § 9  INLINE STATUS (single SO row, no modal)
// ════════════════════════════════════════════════════════════════════════════════

function inlineSOStatus(id, newStatus) {
  const o = DB.salesOrders.find(o => o.id === id);
  if (!o) {
    return;
  }
  const old = o.status;

  if (
    old !== newStatus &&
    window.DocEngine &&
    !window.DocEngine.canTransition('SO', old, newStatus)
  ) {
    showToast(`Transisi ${old} → ${newStatus} tidak diizinkan`, 'warning');
    navigate(activeView);
    return;
  }

  // Stock deduction
  if (old !== 'Delivered' && newStatus === 'Delivered' && !o.stockMutated) {
    applyStockMutation(o, 'out');
    releaseReservation(id);
  } else if (old === 'Delivered' && newStatus !== 'Delivered' && o.stockMutated) {
    (o.lines || []).forEach(l => {
      if (l.itemId === 'custom') {
        return;
      }
      const item = DB.inventoryItems.find(i => String(i.id) === String(l.itemId));
      // FIX: Guard against negative inventory with Math.max(0, ...)
      if (item) {
        item.stock = Math.max(0, item.stock + l.qty);
      }
    });
    o.stockMutated = false;
  }

  // FIX 4.1: Release reservation for ANY transition away from Confirmed —
  // including Confirmed → Delivered.  Previously the condition excluded
  // Delivered, relying on the stock-mutation block above to call
  // releaseReservation.  But if stockMutated was already true (stale data)
  // that block was skipped entirely, leaving the reservation permanently
  // locked.  Calling releaseReservation twice is harmless (it is idempotent).
  if (newStatus === 'Confirmed') {
    const problems = checkOversell(o.lines || [], id);
    if (problems.length > 0) {
      showToast(
        '⚠ Stok tidak cukup: ' +
          problems.map(p => `${p.itemName} tersedia ${p.available}`).join(', '),
        'warning'
      );
    }
    reserveStock(id, o.lines || []);
  } else if (old === 'Confirmed') {
    releaseReservation(id);
  }

  o.status = newStatus;
  saveDB();
  navigate(activeView);
  const statusLabel = SO_STATUSES.find(([v]) => v === newStatus)?.[1] || newStatus;
  showToast(`${id} → ${statusLabel}`, 'success');
}

// ════════════════════════════════════════════════════════════════════════════════
// § 10  BULK STATUS + SELECTION STATE
// ════════════════════════════════════════════════════════════════════════════════

window.soSelection = new Set();

window.updateBulkBar = function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (!bar) {
    return;
  }
  bar.style.display = window.soSelection.size > 0 ? 'flex' : 'none';
  const countEl = document.getElementById('bulkCount');
  if (countEl) {
    countEl.textContent = `${window.soSelection.size} SO dipilih`;
  }
};

function bulkSOStatus(newStatus) {
  if (soSelection.size === 0) {
    return;
  }

  // FIX #2: Check for oversell when bulk-confirming
  if (newStatus === 'Confirmed') {
    const reservations = {};
    Object.entries(DB.reservations || {}).forEach(([soId, lines]) => {
      reservations[String(soId)] = Array.isArray(lines)
        ? lines
            .filter(l => l && l.itemId !== 'custom')
            .map(l => ({ itemId: l.itemId, qty: Math.max(0, Number(l.qty) || 0) }))
        : [];
    });

    const allProblems = [];
    soSelection.forEach(id => {
      const o = DB.salesOrders.find(o => String(o.id) === String(id));
      if (!o || o.status === 'Confirmed') {
        return;
      } // Skip if already confirmed

      const soId = String(o.id);
      const problems = [];
      (o.lines || []).forEach(line => {
        if (!line || line.itemId === 'custom') {
          return;
        }
        const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
        if (!item) {
          return;
        }

        let reservedByOthers = 0;
        Object.entries(reservations).forEach(([resSoId, lines]) => {
          if (resSoId === soId) {
            return;
          }
          lines.forEach(l => {
            if (String(l.itemId) === String(line.itemId)) {
              reservedByOthers += Math.max(0, Number(l.qty) || 0);
            }
          });
        });

        const available = (Number(item.stock) || 0) - reservedByOthers;
        const needed = Math.max(0, Number(line.qty) || 0);
        if (needed > available) {
          problems.push({
            itemName: item.name,
            needed,
            available: Math.max(0, available),
          });
        }
      });

      if (problems.length > 0) {
        allProblems.push({ id: o.id, problems });
        return;
      }

      reservations[soId] = (o.lines || [])
        .filter(l => l && l.itemId !== 'custom')
        .map(l => ({ itemId: l.itemId, qty: Math.max(0, Number(l.qty) || 0) }));
    });

    if (allProblems.length > 0) {
      const msg = allProblems
        .map(
          p =>
            `${p.id}: ${p.problems.map(pr => `${pr.itemName} (tersedia ${pr.available})`).join(', ')}`
        )
        .join('\n');
      if (!confirm(`⚠ Peringatan stok tidak cukup:\n\n${msg}\n\nLanjutkan konfirmasi?`)) {
        return;
      }
    }
  }

  let count = 0;
  let skipped = 0;
  soSelection.forEach(id => {
    const o = DB.salesOrders.find(o => o.id === id);
    if (!o) {
      return;
    }
    const old = o.status;
    if (
      old !== newStatus &&
      window.DocEngine &&
      !window.DocEngine.canTransition('SO', old, newStatus)
    ) {
      skipped++;
      return;
    }
    // FIX 4.2: Use independent `if` blocks instead of if/else so that
    // stock-mutation reversal for Delivered orders is always evaluated,
    // even when another condition (e.g. new→Delivered) would otherwise
    // be matched first in an if/else chain.
    if (old !== 'Delivered' && newStatus === 'Delivered' && !o.stockMutated) {
      applyStockMutation(o, 'out');
      releaseReservation(id);
    }
    if (old === 'Delivered' && newStatus !== 'Delivered' && o.stockMutated) {
      (o.lines || []).forEach(l => {
        if (l.itemId === 'custom') {
          return;
        }
        const item = DB.inventoryItems.find(i => String(i.id) === String(l.itemId));
        // FIX: Guard against negative inventory with Math.max(0, ...)
        if (item) {
          item.stock = Math.max(0, item.stock + l.qty);
        }
      });
      o.stockMutated = false;
    }
    // FIX 4.1: Release reservation for ANY transition away from Confirmed
    // (including → Delivered).  Idempotent, so double-release is safe.
    if (newStatus === 'Confirmed' && old !== 'Confirmed') {
      reserveStock(id, o.lines || []);
    } else if (old === 'Confirmed' && newStatus !== 'Confirmed') {
      releaseReservation(id);
    }
    o.status = newStatus;
    count++;
  });
  saveDB();
  soSelection.clear();
  navigate(activeView);
  const statusLabel = SO_STATUSES.find(([v]) => v === newStatus)?.[1] || newStatus;
  if (skipped > 0) {
    showToast(
      `${count} SO diperbarui → ${statusLabel}. ${skipped} dilewati (transisi tidak valid)`,
      'warning'
    );
  } else {
    showToast(`${count} SO diperbarui → ${statusLabel}`, 'success');
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// § 13  EVENT DELEGATION — new actions for this patch
// ════════════════════════════════════════════════════════════════════════════════

// ── change events (inline status select + checkboxes) ─────────────────────────
// REMOVED: This listener has been merged into erp-view.js to avoid duplicate
// document-level change listeners that would conflict with each other.
// The handlers (inlineSOStatus, toggleSOCheck, checkAllSO) are now called
// from the unified change listener in erp-view.js.

// ── click events ──────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) {
    return;
  }
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  switch (action) {
    case 'duplicateSO':
      duplicateSO(id);
      break;

    case 'duplicatePO':
      duplicatePO(id);
      break;

    case 'addPayment':
      showAddPayment(btn.dataset.type, id);
      break;

    case 'bulkSOStatus':
      bulkSOStatus(btn.dataset.status);
      break;

    case 'clearSOSelection':
      window.soSelection.clear();

      // Force uncheck all checkboxes immediately
      document.querySelectorAll('.so-check').forEach(cb => {
        cb.checked = false;
      });

      // Update bulk bar
      updateBulkBar();

      // Then navigate to refresh the view
      navigate(activeView);
      break;

    case 'createDOFromSO':
      closeModal();
      setTimeout(() => showAddDO({ soId: id }), 300);
      break;

    case 'createDOFromPO':
      closeModal();
      setTimeout(() => showAddDO({ poId: id }), 300);
      break;

    case 'createSIFromSO':
      closeModal();
      setTimeout(() => {
        if (window._invoiceExtras && window._invoiceExtras.createFromSource) {
          window._invoiceExtras.createFromSource('SI', id);
        } else {
          showToast('Modul faktur belum siap', 'warning');
        }
      }, 300);
      break;

    case 'createPIFromPO':
      closeModal();
      setTimeout(() => {
        if (window._invoiceExtras && window._invoiceExtras.createFromSource) {
          window._invoiceExtras.createFromSource('PI', id);
        } else {
          showToast('Modul faktur belum siap', 'warning');
        }
      }, 300);
      break;

    case 'viewSI':
      closeModal();
      setTimeout(() => window.viewInvoiceDoc && window.viewInvoiceDoc('SI', id), 220);
      break;

    case 'viewPI':
      closeModal();
      setTimeout(() => window.viewInvoiceDoc && window.viewInvoiceDoc('PI', id), 220);
      break;

    case 'bulkSuratJalan':
      closeModal();
      setTimeout(() => showBulkSuratJalan(id), 300);
      break;

    default:
      break;
  }
});
