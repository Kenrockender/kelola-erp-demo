// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — General Ledger Engine  (gl.js)
// Phase 2a of the V4 plan (see docs/ARCHITECTURE_ERP_V4.md).
//
// Data-driven double-entry posting. Journals are DERIVED from documents, never hand
// kept in sync: `reconcileAll()` rebuilds every auto-journal from the current state
// of SO/PO + paymentLogs, so it is safe to run on every save (idempotent, stable
// ids — no sequence burn). Manual Journal Vouchers (source === 'manual') are
// preserved across reconciles.
//
// Posting model (status-driven, per the Phase 2 decision):
//   • SO status 'Delivered'  → Dr Receivable (net) + Dr Sales Discount (disc)
//                              Cr Sales (gross); and Dr COGS / Cr Inventory (cost).
//   • SO paymentLogs         → Dr Cash/Bank / Cr Receivable (per payment).
//   • PO status 'Received'   → Dr Inventory (inv lines) + Dr Expense (other lines)
//                              Cr Payable (total).
//   • PO paymentLogs         → Dr Payable / Cr Cash/Bank (per payment).
// Cash is taken from the real payment records (paymentLogs), which also drive the
// 'Paid' status — this lets a Delivered-and-paid order show both AR and its
// settlement. Known simplification: paying before delivery shows as negative AR
// (a customer advance); down-payment modelling comes with the invoice doc types.
//
// COGS uses item.cost (Phase 3 swaps in perpetual moving-average cost).
//
// Global-scope rule: classic <script>, IIFE-wrapped, exposes ONLY window.GL.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Default Chart of Accounts (Accurate-style, Indonesian) ──────────────────
  // Seeded into DB.accountsChart by db.js when empty. Editable in-app later.
  const DEFAULT_CHART = [
    { no: '110101', name: 'Kas', type: 'CASH_BANK' },
    { no: '110102', name: 'Bank BCA', type: 'CASH_BANK' },
    { no: '110103', name: 'Bank Mandiri', type: 'CASH_BANK' },
    { no: '110201', name: 'Piutang Usaha', type: 'ACCOUNT_RECEIVABLE' },
    { no: '110401', name: 'Persediaan Barang', type: 'INVENTORY' },
    { no: '130101', name: 'PPN Masukan', type: 'OTHER_CURRENT_ASSET' },
    { no: '210101', name: 'Hutang Usaha', type: 'ACCOUNT_PAYABLE' },
    { no: '210201', name: 'Hutang PPN (PPN Keluaran)', type: 'OTHER_CURRENT_LIABILITY' },
    { no: '310101', name: 'Modal Disetor', type: 'EQUITY' },
    { no: '320101', name: 'Laba Ditahan', type: 'EQUITY' },
    { no: '400001', name: 'Penjualan', type: 'REVENUE' },
    { no: '400004', name: 'Diskon Penjualan', type: 'REVENUE' },
    { no: '510101', name: 'Beban Pokok Penjualan', type: 'COGS' },
    { no: '610101', name: 'Beban Operasional Lain', type: 'EXPENSE' },
    { no: '610201', name: 'Beban Penyesuaian Persediaan', type: 'EXPENSE' },
    { no: '210301', name: 'Uang Muka Penjualan', type: 'OTHER_CURRENT_LIABILITY' },
    { no: '130201', name: 'Uang Muka Pembelian', type: 'OTHER_CURRENT_ASSET' },
    { no: '610301', name: 'Beban Gaji', type: 'EXPENSE' },
    { no: '610302', name: 'Beban Tunjangan', type: 'EXPENSE' },
    { no: '210401', name: 'Hutang Gaji', type: 'OTHER_CURRENT_LIABILITY' },
  ];

  // Company-level default account per posting slot (3-layer resolution falls back
  // here after per-item accountMap and per-party glOverrides).
  const COMPANY_DEFAULTS = {
    cash: '110101',
    receivable: '110201',
    payable: '210101',
    inventory: '110401',
    sales: '400001',
    salesDiscount: '400004',
    cogs: '510101',
    purchaseExpense: '610101',
    inventoryAdjustment: '610201',
    ppnOut: '210201',
    ppnIn: '130101',
    advanceReceived: '210301',
    advancePaid: '130201',
    salaryExpense: '610301',
    allowanceExpense: '610302',
    salaryPayable: '210401',
  };

  // Payment-method → cash/bank account.
  const METHOD_ACCOUNTS = {
    Tunai: '110101',
    'Transfer BCA': '110102',
    'Transfer Mandiri': '110103',
  };

  function db() {
    return window.DB || {};
  }

  // Seed the Chart of Accounts if the DB doesn't have one yet. Self-contained so it
  // works regardless of script load order (db.js applyDefaults runs before this
  // classic script loads, when window.GL isn't defined yet).
  function ensureChart() {
    const data = db();
    if (!Array.isArray(data.accountsChart) || data.accountsChart.length === 0) {
      data.accountsChart = DEFAULT_CHART.map(a => ({ ...a, balance: 0, currency: 'IDR' }));
      return data.accountsChart;
    }
    // Add-only merge: an existing chart (e.g. from a DB created before a new default
    // account was introduced) gets any missing DEFAULT_CHART accounts appended.
    // Never overwrites user edits. Without this, a journal could reference an account
    // absent from the chart and silently drop out of the trial balance.
    const have = new Set(data.accountsChart.map(a => a.no));
    DEFAULT_CHART.forEach(a => {
      if (!have.has(a.no)) {
        data.accountsChart.push({ ...a, balance: 0, currency: 'IDR' });
      }
    });
    return data.accountsChart;
  }

  function chart() {
    return db().accountsChart || [];
  }

  function accountName(no) {
    const a = chart().find(x => x.no === no);
    return a ? a.name : no;
  }

  // 3-layer account resolution: per-item → per-party → company default.
  function resolveAccount(slot, ctx) {
    ctx = ctx || {};
    if (ctx.item && ctx.item.accountMap && ctx.item.accountMap[slot]) {
      return ctx.item.accountMap[slot];
    }
    if (ctx.party && ctx.party.glOverrides && ctx.party.glOverrides[slot]) {
      return ctx.party.glOverrides[slot];
    }
    return COMPANY_DEFAULTS[slot] || null;
  }

  function cashAccountForMethod(method) {
    return METHOD_ACCOUNTS[method] || COMPANY_DEFAULTS.cash;
  }

  function docTaxRate(doc) {
    if (typeof doc.taxRate === 'number' && doc.taxRate > 0) return doc.taxRate;
    return 0;
  }

  function docPPN(doc, dpp) {
    const rate = docTaxRate(doc);
    if (rate <= 0) return 0;
    if (typeof doc.tax === 'number') return round(doc.tax);
    return round(dpp * rate);
  }

  function round(n) {
    return Math.round(Number(n) || 0);
  }

  // Build a balanced journal object from raw {accountNo, debit, credit} entries.
  // Returns null if it carries no movement.
  function makeJournal(id, number, date, source, rawLines) {
    const lines = rawLines
      .filter(l => round(l.debit) !== 0 || round(l.credit) !== 0)
      .map(l => ({
        accountNo: l.accountNo,
        accountName: accountName(l.accountNo),
        debit: round(l.debit),
        credit: round(l.credit),
        memo: l.memo || '',
      }));
    if (lines.length === 0) {
      return null;
    }
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    return { id, number, date, source, lines, totals: { debit, credit } };
  }

  function lineGross(l) {
    return (Number(l.qty) || 0) * (Number(l.price) || 0);
  }

  function inventoryItem(itemId) {
    if (itemId === 'custom') {
      return null;
    }
    return (db().inventoryItems || []).find(i => String(i.id) === String(itemId)) || null;
  }

  // ── Sales Order posting ─────────────────────────────────────────────────────
  function buildSOJournals(o) {
    const out = [];
    const lines = o.lines || [];
    const gross = lines.reduce((s, l) => s + lineGross(l), 0);
    const net = lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    const disc = gross - net;
    const party = (db().customers || []).find(c => c.id === o.customerId) || null;

    if (o.status === 'Delivered') {
      // Phase 3a: COGS from the perpetual moving-average cost ledger when available;
      // fall back to static item.cost (the Phase 2 behaviour) otherwise.
      let cogs = null;
      if (window.CostLedger && typeof window.CostLedger.cogsForSO === 'function') {
        cogs = window.CostLedger.cogsForSO(o.id);
      }
      if (cogs === null || cogs === undefined) {
        cogs = lines.reduce((s, l) => {
          const item = inventoryItem(l.itemId);
          return item ? s + (Number(l.qty) || 0) * (Number(item.cost) || 0) : s;
        }, 0);
      }
      cogs = round(cogs);

      const ppn = docPPN(o, net);
      const raw = [
        { accountNo: resolveAccount('receivable', { party }), debit: net + ppn, memo: `Piutang ${o.id}` },
        {
          accountNo: resolveAccount('salesDiscount', { party }),
          debit: disc,
          memo: 'Diskon penjualan',
        },
        { accountNo: resolveAccount('sales', { party }), credit: gross, memo: `Penjualan ${o.id}` },
        { accountNo: resolveAccount('ppnOut', { party }), credit: ppn, memo: `PPN Keluaran ${o.id}` },
        { accountNo: resolveAccount('cogs', { party }), debit: cogs, memo: 'HPP' },
        {
          accountNo: resolveAccount('inventory', { party }),
          credit: cogs,
          memo: 'Pengurangan persediaan',
        },
      ];
      const j = makeJournal(`J:SO:${o.id}:rev`, o.id, o.date, { docType: 'SO', docId: o.id }, raw);
      if (j) {
        out.push(j);
      }
    }

    // Cash receipts from real payment records.
    (db().paymentLogs || [])
      .filter(p => p.type === 'SO' && p.orderId === o.id)
      .forEach(p => {
        const j = makeJournal(
          `J:SO:${o.id}:pay:${p.id}`,
          o.id,
          p.date || o.date,
          { docType: 'SO', docId: o.id },
          [
            {
              accountNo: cashAccountForMethod(p.method),
              debit: p.amount,
              memo: `Penerimaan ${o.id}`,
            },
            {
              accountNo: resolveAccount('receivable', { party }),
              credit: p.amount,
              memo: `Pelunasan ${o.id}`,
            },
          ]
        );
        if (j) {
          out.push(j);
        }
      });

    return out;
  }

  // ── Purchase Order posting ──────────────────────────────────────────────────
  function buildPOJournals(o) {
    const out = [];
    const lines = o.lines || [];
    const party = (db().suppliers || []).find(s => s.id === o.supplierId) || null;

    if (o.status === 'Received') {
      let invAmt = 0;
      let otherAmt = 0;
      lines.forEach(l => {
        const sub = Number(l.subtotal) || 0;
        if (inventoryItem(l.itemId)) {
          invAmt += sub;
        } else {
          otherAmt += sub;
        }
      });
      const total = invAmt + otherAmt;
      const ppn = docPPN(o, total);
      const j = makeJournal(`J:PO:${o.id}:recv`, o.id, o.date, { docType: 'PO', docId: o.id }, [
        {
          accountNo: resolveAccount('inventory', { party }),
          debit: invAmt,
          memo: `Persediaan ${o.id}`,
        },
        {
          accountNo: resolveAccount('purchaseExpense', { party }),
          debit: otherAmt,
          memo: `Pembelian lain ${o.id}`,
        },
        { accountNo: resolveAccount('ppnIn', { party }), debit: ppn, memo: `PPN Masukan ${o.id}` },
        { accountNo: resolveAccount('payable', { party }), credit: total + ppn, memo: `Hutang ${o.id}` },
      ]);
      if (j) {
        out.push(j);
      }
    }

    (db().paymentLogs || [])
      .filter(p => p.type === 'PO' && p.orderId === o.id)
      .forEach(p => {
        const j = makeJournal(
          `J:PO:${o.id}:pay:${p.id}`,
          o.id,
          p.date || o.date,
          { docType: 'PO', docId: o.id },
          [
            {
              accountNo: resolveAccount('payable', { party }),
              debit: p.amount,
              memo: `Pelunasan ${o.id}`,
            },
            {
              accountNo: cashAccountForMethod(p.method),
              credit: p.amount,
              memo: `Pembayaran ${o.id}`,
            },
          ]
        );
        if (j) {
          out.push(j);
        }
      });

    return out;
  }

  // ── Sales Invoice posting (Phase 4) ─────────────────────────────────────────
  // When status is Outstanding or Paid: Dr Receivable / Cr Sales (+ discount split).
  // COGS via cost ledger (same as SO Delivered).
  function buildSIJournals(inv) {
    const out = [];
    if (inv.status !== 'Outstanding' && inv.status !== 'Paid') {
      return out;
    }
    const lines = inv.lines || [];
    const gross = lines.reduce((s, l) => s + lineGross(l), 0);
    const net = lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    const disc = gross - net;
    const party = (db().customers || []).find(c => c.id === inv.customerId) || null;

    let cogs = null;
    if (window.CostLedger && typeof window.CostLedger.cogsForSO === 'function') {
      cogs = window.CostLedger.cogsForSO(inv.id);
    }
    if (cogs === null || cogs === undefined) {
      cogs = lines.reduce((s, l) => {
        const item = inventoryItem(l.itemId);
        return item ? s + (Number(l.qty) || 0) * (Number(item.cost) || 0) : s;
      }, 0);
    }
    cogs = round(cogs);

    const ppn = docPPN(inv, net);
    const raw = [
      {
        accountNo: resolveAccount('receivable', { party }),
        debit: net + ppn,
        memo: `Piutang ${inv.number || inv.id}`,
      },
      {
        accountNo: resolveAccount('salesDiscount', { party }),
        debit: disc,
        memo: 'Diskon penjualan',
      },
      {
        accountNo: resolveAccount('sales', { party }),
        credit: gross,
        memo: `Penjualan ${inv.number || inv.id}`,
      },
      { accountNo: resolveAccount('ppnOut', { party }), credit: ppn, memo: `PPN Keluaran ${inv.number || inv.id}` },
      { accountNo: resolveAccount('cogs', { party }), debit: cogs, memo: 'HPP' },
      {
        accountNo: resolveAccount('inventory', { party }),
        credit: cogs,
        memo: 'Pengurangan persediaan',
      },
    ];
    const j = makeJournal(
      `J:SI:${inv.id}:rev`,
      inv.number || inv.id,
      inv.date,
      { docType: 'SI', docId: inv.id },
      raw
    );
    if (j) {
      out.push(j);
    }
    return out;
  }

  // ── Purchase Invoice posting (Phase 4) ─────────────────────────────────────
  function buildPIJournals(inv) {
    const out = [];
    if (inv.status !== 'Outstanding' && inv.status !== 'Paid') {
      return out;
    }
    const lines = inv.lines || [];
    const party = (db().suppliers || []).find(s => s.id === inv.supplierId) || null;
    let invAmt = 0;
    let otherAmt = 0;
    lines.forEach(l => {
      const sub = Number(l.subtotal) || 0;
      if (inventoryItem(l.itemId)) {
        invAmt += sub;
      } else {
        otherAmt += sub;
      }
    });
    const total = invAmt + otherAmt;
    const ppn = docPPN(inv, total);
    const j = makeJournal(
      `J:PI:${inv.id}:recv`,
      inv.number || inv.id,
      inv.date,
      { docType: 'PI', docId: inv.id },
      [
        {
          accountNo: resolveAccount('inventory', { party }),
          debit: invAmt,
          memo: `Persediaan ${inv.number || inv.id}`,
        },
        {
          accountNo: resolveAccount('purchaseExpense', { party }),
          debit: otherAmt,
          memo: `Pembelian lain ${inv.number || inv.id}`,
        },
        { accountNo: resolveAccount('ppnIn', { party }), debit: ppn, memo: `PPN Masukan ${inv.number || inv.id}` },
        {
          accountNo: resolveAccount('payable', { party }),
          credit: total + ppn,
          memo: `Hutang ${inv.number || inv.id}`,
        },
      ]
    );
    if (j) {
      out.push(j);
    }
    return out;
  }

  // ── Sales Receipt posting (Phase 4) ────────────────────────────────────────
  function buildSRJournals(r) {
    if (r.status !== 'Posted') {
      return [];
    }
    const party = (db().customers || []).find(c => c.id === r.customerId) || null;
    const j = makeJournal(
      `J:SR:${r.id}`,
      r.number || r.id,
      r.date,
      { docType: 'SR', docId: r.id },
      [
        {
          accountNo: cashAccountForMethod(r.paymentMethod || 'Tunai'),
          debit: round(r.amount),
          memo: `Penerimaan ${r.number || r.id}`,
        },
        {
          accountNo: resolveAccount('receivable', { party }),
          credit: round(r.amount),
          memo: `Pelunasan ${r.number || r.id}`,
        },
      ]
    );
    return j ? [j] : [];
  }

  // ── Purchase Payment posting (Phase 4) ─────────────────────────────────────
  function buildPPJournals(p) {
    if (p.status !== 'Posted') {
      return [];
    }
    const party = (db().suppliers || []).find(s => s.id === p.supplierId) || null;
    const j = makeJournal(
      `J:PP:${p.id}`,
      p.number || p.id,
      p.date,
      { docType: 'PP', docId: p.id },
      [
        {
          accountNo: resolveAccount('payable', { party }),
          debit: round(p.amount),
          memo: `Pelunasan ${p.number || p.id}`,
        },
        {
          accountNo: cashAccountForMethod(p.paymentMethod || 'Tunai'),
          credit: round(p.amount),
          memo: `Pembayaran ${p.number || p.id}`,
        },
      ]
    );
    return j ? [j] : [];
  }

  // ── Sales Return posting (Phase 5) ───────────────────────────────────────────
  // When status is Posted: reverses the revenue + COGS entries of the original sale.
  //   Dr Sales (gross) / Cr Receivable (net) + Cr Sales Discount (disc)
  //   Dr Inventory (cost) / Cr COGS (cost)
  function buildSRNJournals(r) {
    if (r.status !== 'Posted') {
      return [];
    }
    const lines = r.lines || [];
    const gross = lines.reduce((s, l) => s + lineGross(l), 0);
    const net = lines.reduce((s, l) => s + (Number(l.subtotal) || 0), 0);
    const disc = gross - net;
    const party = (db().customers || []).find(c => c.id === r.customerId) || null;

    // COGS reversal: use static cost for returned items
    let cogs = lines.reduce((s, l) => {
      const item = inventoryItem(l.itemId);
      return item ? s + (Number(l.qty) || 0) * (Number(item.cost) || 0) : s;
    }, 0);
    cogs = round(cogs);

    const ppn = docPPN(r, net);
    const raw = [
      {
        accountNo: resolveAccount('sales', { party }),
        debit: gross,
        memo: 'Retur penjualan ' + r.id,
      },
      { accountNo: resolveAccount('ppnOut', { party }), debit: ppn, memo: 'Reversal PPN Keluaran ' + r.id },
      {
        accountNo: resolveAccount('receivable', { party }),
        credit: net + ppn,
        memo: 'Pengurangan piutang ' + r.id,
      },
      {
        accountNo: resolveAccount('salesDiscount', { party }),
        credit: disc,
        memo: 'Reversal diskon',
      },
      {
        accountNo: resolveAccount('inventory', { party }),
        debit: cogs,
        memo: 'Pengembalian persediaan ' + r.id,
      },
      { accountNo: resolveAccount('cogs', { party }), credit: cogs, memo: 'Reversal HPP ' + r.id },
    ];
    const j = makeJournal(
      'J:SRN:' + r.id,
      r.number || r.id,
      r.date,
      { docType: 'SRN', docId: r.id },
      raw
    );
    return j ? [j] : [];
  }

  // ── Purchase Return posting (Phase 5) ──────────────────────────────────────
  // When status is Posted: reverses the purchase receipt entries.
  //   Dr Payable / Cr Inventory (inv lines) + Cr Expense (other lines)
  function buildPRNJournals(r) {
    if (r.status !== 'Posted') {
      return [];
    }
    const lines = r.lines || [];
    const party = (db().suppliers || []).find(s => s.id === r.supplierId) || null;

    let invAmt = 0;
    let otherAmt = 0;
    lines.forEach(l => {
      const sub = Number(l.subtotal) || 0;
      if (inventoryItem(l.itemId)) {
        invAmt += sub;
      } else {
        otherAmt += sub;
      }
    });
    const total = invAmt + otherAmt;
    const ppn = docPPN(r, total);
    const j = makeJournal(
      'J:PRN:' + r.id,
      r.number || r.id,
      r.date,
      { docType: 'PRN', docId: r.id },
      [
        {
          accountNo: resolveAccount('payable', { party }),
          debit: total + ppn,
          memo: 'Retur pembelian ' + r.id,
        },
        {
          accountNo: resolveAccount('inventory', { party }),
          credit: invAmt,
          memo: 'Pengurangan persediaan ' + r.id,
        },
        {
          accountNo: resolveAccount('purchaseExpense', { party }),
          credit: otherAmt,
          memo: 'Reversal beban ' + r.id,
        },
        { accountNo: resolveAccount('ppnIn', { party }), credit: ppn, memo: 'Reversal PPN Masukan ' + r.id },
      ]
    );
    return j ? [j] : [];
  }

  // ── Item Adjustment posting (Phase 3a) ──────────────────────────────────────
  // Inventory increase  → Dr Inventory / Cr Beban Penyesuaian (a gain).
  // Inventory decrease  → Dr Beban Penyesuaian / Cr Inventory (a loss).
  // The signed value comes from the cost ledger (moving-average for outs).
  function buildAdjustmentJournals(a) {
    let value = 0;
    if (window.CostLedger && typeof window.CostLedger.valueForAdjustment === 'function') {
      value = round(window.CostLedger.valueForAdjustment(a.id));
    }
    if (value === 0) {
      return [];
    }
    const inv = resolveAccount('inventory', {});
    const adj = resolveAccount('inventoryAdjustment', {});
    const raw =
      value > 0
        ? [
            { accountNo: inv, debit: value, memo: `Penyesuaian + ${a.id}` },
            { accountNo: adj, credit: value, memo: 'Selisih persediaan (lebih)' },
          ]
        : [
            { accountNo: adj, debit: -value, memo: 'Selisih persediaan (kurang)' },
            { accountNo: inv, credit: -value, memo: `Penyesuaian − ${a.id}` },
          ];
    const j = makeJournal(
      `J:ADJ:${a.id}`,
      a.number || a.id,
      a.date,
      { docType: 'ADJ', docId: a.id },
      raw
    );
    return j ? [j] : [];
  }

  // ── Down Payment posting ─────────────────────────────────────────────────
  // Sales DP (Received):  Dr Cash / Cr Uang Muka Penjualan
  // Sales DP (Applied):   Dr Uang Muka Penjualan / Cr Receivable
  // Purchase DP (Paid):   Dr Uang Muka Pembelian / Cr Cash
  // Purchase DP (Applied): Dr Payable / Cr Uang Muka Pembelian
  function buildSalesDPJournals(dp) {
    const out = [];
    const amt = round(dp.amount);
    if (amt <= 0) return out;
    const adv = resolveAccount('advanceReceived', {});
    if (dp.status === 'Received' || dp.status === 'Applied') {
      const j = makeJournal(
        `J:SDP:${dp.id}:recv`,
        dp.id,
        dp.date,
        { docType: 'SDP', docId: dp.id },
        [
          { accountNo: cashAccountForMethod(dp.method || 'Tunai'), debit: amt, memo: `DP diterima ${dp.id}` },
          { accountNo: adv, credit: amt, memo: `Uang muka ${dp.orderId}` },
        ]
      );
      if (j) out.push(j);
    }
    if (dp.status === 'Applied') {
      const party = (db().customers || []).find(c => c.name === dp.customerName) || null;
      const j = makeJournal(
        `J:SDP:${dp.id}:apply`,
        dp.id,
        dp.appliedDate || dp.date,
        { docType: 'SDP', docId: dp.id },
        [
          { accountNo: adv, debit: amt, memo: `Penerapan DP ${dp.id}` },
          { accountNo: resolveAccount('receivable', { party }), credit: amt, memo: `Potong piutang ${dp.orderId}` },
        ]
      );
      if (j) out.push(j);
    }
    return out;
  }

  function buildPurchaseDPJournals(dp) {
    const out = [];
    const amt = round(dp.amount);
    if (amt <= 0) return out;
    const adv = resolveAccount('advancePaid', {});
    if (dp.status === 'Paid' || dp.status === 'Applied') {
      const j = makeJournal(
        `J:PDP:${dp.id}:paid`,
        dp.id,
        dp.date,
        { docType: 'PDP', docId: dp.id },
        [
          { accountNo: adv, debit: amt, memo: `Uang muka ${dp.orderId}` },
          { accountNo: cashAccountForMethod(dp.method || 'Tunai'), credit: amt, memo: `DP dibayar ${dp.id}` },
        ]
      );
      if (j) out.push(j);
    }
    if (dp.status === 'Applied') {
      const party = (db().suppliers || []).find(s => s.name === dp.supplierName) || null;
      const j = makeJournal(
        `J:PDP:${dp.id}:apply`,
        dp.id,
        dp.appliedDate || dp.date,
        { docType: 'PDP', docId: dp.id },
        [
          { accountNo: resolveAccount('payable', { party }), debit: amt, memo: `Potong hutang ${dp.orderId}` },
          { accountNo: adv, credit: amt, memo: `Penerapan DP ${dp.id}` },
        ]
      );
      if (j) out.push(j);
    }
    return out;
  }

  // ── Payroll posting ──────────────────────────────────────────────────────────
  function buildPayrollJournals(run) {
    if (!run.posted || !run.totalAmount) return [];
    const salary = (run.details || []).reduce((s, d) => s + (d.salary || 0), 0);
    const allowance = (run.details || []).reduce((s, d) => s + (d.transport || 0) + (d.meal || 0), 0);
    const total = round(salary + allowance);
    if (total <= 0) return [];
    const lines = [];
    if (salary > 0) lines.push({ accountNo: resolveAccount('salaryExpense', {}), debit: round(salary), memo: `Gaji ${run.period}` });
    if (allowance > 0) lines.push({ accountNo: resolveAccount('allowanceExpense', {}), debit: round(allowance), memo: `Tunjangan ${run.period}` });
    lines.push({ accountNo: resolveAccount('salaryPayable', {}), credit: total, memo: `Hutang gaji ${run.period}` });
    const j = makeJournal(`J:PAY:${run.id}`, run.id, run.date, { docType: 'PAY', docId: run.id }, lines);
    return j ? [j] : [];
  }

  // ── Reconcile: rebuild all auto-journals, preserve manual + Accurate ones ───
  function isManual(j) {
    return j.source === 'manual' || (j.source && j.source.docType === 'JV');
  }
  function isAccurate(j) {
    return !!j._accurateId;
  }

  function reconcileAll() {
    const data = db();
    ensureChart();
    // Phase 3a: drop the cost-ledger cache so COGS reflects current stock state.
    if (window.CostLedger && typeof window.CostLedger.invalidate === 'function') {
      window.CostLedger.invalidate();
    }
    const manual = (data.journals || []).filter(isManual);
    const accurate = (data.journals || []).filter(isAccurate);
    const auto = [];
    (data.salesOrders || []).forEach(o => buildSOJournals(o).forEach(j => auto.push(j)));
    (data.purchaseOrders || []).forEach(o => buildPOJournals(o).forEach(j => auto.push(j)));
    (data.itemAdjustments || []).forEach(a =>
      buildAdjustmentJournals(a).forEach(j => auto.push(j))
    );
    // Phase 4 doc types
    (data.salesInvoices || []).forEach(d => buildSIJournals(d).forEach(j => auto.push(j)));
    (data.purchaseInvoices || []).forEach(d => buildPIJournals(d).forEach(j => auto.push(j)));
    (data.salesReceipts || []).forEach(d => buildSRJournals(d).forEach(j => auto.push(j)));
    (data.purchasePayments || []).forEach(d => buildPPJournals(d).forEach(j => auto.push(j)));
    // Phase 5: Sales/Purchase Returns
    (data.salesReturns || []).forEach(d => buildSRNJournals(d).forEach(j => auto.push(j)));
    (data.purchaseReturns || []).forEach(d => buildPRNJournals(d).forEach(j => auto.push(j)));
    // Phase 6: Down Payments
    (data.salesDownPayments || []).forEach(d => buildSalesDPJournals(d).forEach(j => auto.push(j)));
    (data.purchaseDownPayments || []).forEach(d => buildPurchaseDPJournals(d).forEach(j => auto.push(j)));
    // Phase 7: Payroll
    (data.payrollRuns || []).forEach(r => buildPayrollJournals(r).forEach(j => auto.push(j)));
    data.journals = [...accurate, ...manual, ...auto];
    return auto.length;
  }

  // ── Trial Balance (computed live from journals) ─────────────────────────────
  function trialBalance() {
    ensureChart();
    const sums = new Map(); // no -> {debit, credit}
    (db().journals || []).forEach(j => {
      (j.lines || []).forEach(l => {
        const cur = sums.get(l.accountNo) || { debit: 0, credit: 0 };
        cur.debit += Number(l.debit) || 0;
        cur.credit += Number(l.credit) || 0;
        sums.set(l.accountNo, cur);
      });
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;
    // Iterate the union of chart accounts and any account that actually appears in a
    // journal. The latter guards against a journal line referencing an account that
    // is missing from the chart — it must still show (and keep the TB balanced)
    // rather than being silently dropped.
    const order = chart().map(a => a.no);
    const seen = new Set(order);
    sums.forEach((_v, no) => {
      if (!seen.has(no)) {
        order.push(no);
        seen.add(no);
      }
    });
    order.forEach(no => {
      const acc = chart().find(a => a.no === no) || { no, name: accountName(no), type: 'UNKNOWN' };
      const s = sums.get(acc.no);
      if (!s) {
        return;
      }
      // Net the account, then present it on a single side. A positive net lands
      // in the Debit column, a negative net in the Credit column — this keeps the
      // trial balance totals equal as long as every journal is balanced,
      // regardless of each account's "normal" side (contra accounts included).
      const net = s.debit - s.credit;
      const debit = round(net > 0 ? net : 0);
      const credit = round(net < 0 ? -net : 0);
      // A fully-settled account (net zero) is omitted from the trial balance.
      if (debit === 0 && credit === 0) {
        return;
      }
      rows.push({ no: acc.no, name: acc.name, type: acc.type, debit, credit });
      totalDebit += debit;
      totalCredit += credit;
    });

    return {
      rows,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit,
    };
  }

  // ── Manual Journal Voucher (double-entry enforced) ──────────────────────────
  function postJournalVoucher(date, rawLines, memo) {
    const data = db();
    if (!Array.isArray(data.journals)) {
      data.journals = [];
    }
    const number =
      window.DocEngine && typeof window.DocEngine.nextNumber === 'function'
        ? window.DocEngine.nextNumber('JV', date, { sequences: data.numberSequences, commit: true })
        : `JV-${Date.now()}`;
    const j = makeJournal(`J:JV:${number}`, number, date, 'manual', rawLines);
    if (!j) {
      throw new Error('Jurnal kosong — tidak ada nilai debit/kredit');
    }
    if (j.totals.debit !== j.totals.credit) {
      throw new Error(`Jurnal tidak seimbang: debit ${j.totals.debit} ≠ kredit ${j.totals.credit}`);
    }
    if (memo) {
      j.memo = memo;
    }
    data.journals.push(j);
    return j;
  }

  const GL = {
    DEFAULT_CHART,
    COMPANY_DEFAULTS,
    ensureChart,
    resolveAccount,
    accountName,
    buildSOJournals,
    buildPOJournals,
    buildSIJournals,
    buildPIJournals,
    buildSRJournals,
    buildPPJournals,
    buildAdjustmentJournals,
    buildSRNJournals,
    buildPRNJournals,
    buildSalesDPJournals,
    buildPurchaseDPJournals,
    reconcileAll,
    trialBalance,
    postJournalVoucher,
  };

  window.GL = GL;
  try {
    if (!window.ERP) {
      window.ERP = {};
    }
    window.ERP.gl = GL;
  } catch {
    /* window.GL is the canonical handle */
  }
})();
