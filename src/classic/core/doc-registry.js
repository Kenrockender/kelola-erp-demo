// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Document Registry
// Phase 0 scaffolding for the V4 document-flow engine.
//
// Migrated from public/classic/core/doc-registry.js (IIFE) to a proper ES
// module. This eliminates the global-scope redeclaration risk and makes the
// registry tree-shakeable.
//
// Consumers in the classic bundle still access window.DocRegistry (assigned
// below). New code should import DocRegistry directly from this module.
// ═══════════════════════════════════════════════════════════════════════════════
'use strict';

const STATUS = {
  SQ: [
    ['Draft', 'Draft'],
    ['Sent', 'Dikirim'],
    ['Accepted', 'Diterima'],
    ['Rejected', 'Ditolak'],
  ],
  PQ: [
    ['Draft', 'Draft'],
    ['Sent', 'Dikirim'],
    ['Accepted', 'Diterima'],
    ['Rejected', 'Ditolak'],
  ],
  SO: [
    ['Draft', 'Draft'],
    ['Confirmed', 'Dikonfirmasi'],
    ['Paid', 'Lunas'],
    ['Delivered', 'Terkirim'],
  ],
  PO: [
    ['Draft', 'Draft'],
    ['Confirmed', 'Dikonfirmasi'],
    ['Paid', 'Lunas'],
    ['Received', 'Diterima'],
  ],
  DO: [
    ['Pending', 'Pending'],
    ['Sent', 'Terkirim'],
    ['Partially invoiced', 'Faktur Sebagian'],
    ['Invoiced', 'Difakturkan'],
    // legacy delivery-lifecycle statuses, kept for backward compatibility
    ['In Transit', 'Dalam Pengiriman'],
    ['Delivered', 'Terkirim'],
  ],
  SI: [
    ['Draft', 'Draft'],
    ['Outstanding', 'Belum Lunas'],
    ['Paid', 'Lunas'],
  ],
  PI: [
    ['Draft', 'Draft'],
    ['Outstanding', 'Belum Lunas'],
    ['Paid', 'Lunas'],
  ],
  SR: [
    ['Draft', 'Draft'],
    ['Posted', 'Diposting'],
  ],
  PP: [
    ['Draft', 'Draft'],
    ['Posted', 'Diposting'],
  ],
  SRN: [
    ['Draft', 'Draft'],
    ['Posted', 'Diposting'],
  ],
  PRN: [
    ['Draft', 'Draft'],
    ['Posted', 'Diposting'],
  ],
  IT: [['Posted', 'Diposting']],
};

// Intended happy-path forward transitions. DocEngine.canTransition validates
// against these in later phases.
const TRANSITIONS = {
  SQ: {
    Draft: ['Sent'],
    Sent: ['Accepted', 'Rejected', 'Draft'],
    Accepted: [],
    Rejected: [],
  },
  PQ: {
    Draft: ['Sent'],
    Sent: ['Accepted', 'Rejected', 'Draft'],
    Accepted: [],
    Rejected: [],
  },
  SO: {
    Draft: ['Confirmed', 'Paid', 'Delivered'],
    Confirmed: ['Paid', 'Delivered', 'Draft'],
    Paid: ['Delivered', 'Confirmed'],
    Delivered: ['Paid'],
  },
  PO: {
    Draft: ['Confirmed', 'Paid', 'Received'],
    Confirmed: ['Paid', 'Received', 'Draft'],
    Paid: ['Received', 'Confirmed'],
    Received: ['Paid'],
  },
  DO: {
    Pending: ['Sent', 'In Transit', 'Delivered'],
    Sent: ['Partially invoiced', 'Invoiced', 'Pending'],
    'Partially invoiced': ['Invoiced', 'Sent'],
    Invoiced: ['Partially invoiced'],
    // legacy delivery-lifecycle transitions
    'In Transit': ['Delivered', 'Pending'],
    Delivered: ['In Transit', 'Invoiced'],
  },
  SI: {
    Draft: ['Outstanding'],
    Outstanding: ['Paid', 'Draft'],
    Paid: [],
  },
  PI: {
    Draft: ['Outstanding'],
    Outstanding: ['Paid', 'Draft'],
    Paid: [],
  },
  SR: { Draft: ['Posted'], Posted: [] },
  PP: { Draft: ['Posted'], Posted: [] },
  SRN: { Draft: ['Posted'], Posted: [] },
  PRN: { Draft: ['Posted'], Posted: [] },
  IT: { Posted: [] },
};

const TYPES = {
  SQ: {
    docType: 'SQ',
    label: 'Sales Quotation',
    collection: 'salesQuotations',
    idPrefix: 'SQ',
    numberPrefix: 'SQ',
    party: 'customer',
    partyCollection: 'customers',
    priceField: 'sell',
    statuses: STATUS.SQ,
    transitions: TRANSITIONS.SQ,
    getFrom: [],
    flowsTo: ['SO'],
  },
  PQ: {
    docType: 'PQ',
    label: 'Purchase Quotation',
    collection: 'purchaseQuotations',
    idPrefix: 'PQ',
    numberPrefix: 'PQ',
    party: 'supplier',
    partyCollection: 'suppliers',
    priceField: 'cost',
    statuses: STATUS.PQ,
    transitions: TRANSITIONS.PQ,
    getFrom: [],
    flowsTo: ['PO'],
  },
  SO: {
    docType: 'SO',
    label: 'Sales Order',
    collection: 'salesOrders',
    idPrefix: 'SO',
    numberPrefix: 'SO',
    party: 'customer',
    partyCollection: 'customers',
    priceField: 'sell',
    statuses: STATUS.SO,
    transitions: TRANSITIONS.SO,
    getFrom: ['SQ'],
    flowsTo: ['DO', 'SI'],
  },
  PO: {
    docType: 'PO',
    label: 'Purchase Order',
    collection: 'purchaseOrders',
    idPrefix: 'PO',
    numberPrefix: 'PO',
    party: 'supplier',
    partyCollection: 'suppliers',
    priceField: 'cost',
    statuses: STATUS.PO,
    transitions: TRANSITIONS.PO,
    getFrom: ['PQ'],
    flowsTo: ['DO', 'PI'],
  },
  SI: {
    docType: 'SI',
    label: 'Sales Invoice',
    collection: 'salesInvoices',
    idPrefix: 'SI',
    numberPrefix: 'SI',
    party: 'customer',
    partyCollection: 'customers',
    priceField: 'sell',
    statuses: STATUS.SI,
    transitions: TRANSITIONS.SI,
    getFrom: ['SO'],
    flowsTo: ['SR'],
  },
  PI: {
    docType: 'PI',
    label: 'Purchase Invoice',
    collection: 'purchaseInvoices',
    idPrefix: 'PI',
    numberPrefix: 'PI',
    party: 'supplier',
    partyCollection: 'suppliers',
    priceField: 'cost',
    statuses: STATUS.PI,
    transitions: TRANSITIONS.PI,
    getFrom: ['PO'],
    flowsTo: ['PP'],
  },
  SR: {
    docType: 'SR',
    label: 'Sales Receipt',
    collection: 'salesReceipts',
    idPrefix: 'SR',
    numberPrefix: 'SR',
    party: 'customer',
    partyCollection: 'customers',
    priceField: null,
    statuses: STATUS.SR,
    transitions: TRANSITIONS.SR,
    getFrom: ['SI'],
    flowsTo: [],
  },
  PP: {
    docType: 'PP',
    label: 'Purchase Payment',
    collection: 'purchasePayments',
    idPrefix: 'PP',
    numberPrefix: 'PP',
    party: 'supplier',
    partyCollection: 'suppliers',
    priceField: null,
    statuses: STATUS.PP,
    transitions: TRANSITIONS.PP,
    getFrom: ['PI'],
    flowsTo: [],
  },
  SRN: {
    docType: 'SRN',
    label: 'Sales Return',
    collection: 'salesReturns',
    idPrefix: 'SRN',
    numberPrefix: 'SRN',
    party: 'customer',
    partyCollection: 'customers',
    priceField: 'sell',
    statuses: STATUS.SRN,
    transitions: TRANSITIONS.SRN,
    getFrom: ['SO', 'SI'],
    flowsTo: [],
  },
  PRN: {
    docType: 'PRN',
    label: 'Purchase Return',
    collection: 'purchaseReturns',
    idPrefix: 'PRN',
    numberPrefix: 'PRN',
    party: 'supplier',
    partyCollection: 'suppliers',
    priceField: 'cost',
    statuses: STATUS.PRN,
    transitions: TRANSITIONS.PRN,
    getFrom: ['PO', 'PI'],
    flowsTo: [],
  },
  IT: {
    docType: 'IT',
    label: 'Item Transfer',
    collection: 'itemTransfers',
    idPrefix: 'IT',
    numberPrefix: 'IT',
    party: null,
    partyCollection: null,
    priceField: null,
    statuses: STATUS.IT,
    transitions: TRANSITIONS.IT,
    getFrom: [],
    flowsTo: [],
  },
  DO: {
    docType: 'DO',
    label: 'Delivery Order',
    collection: 'deliveryOrders',
    idPrefix: 'DO',
    numberPrefix: 'DO',
    party: 'customer',
    partyCollection: 'customers',
    priceField: null,
    statuses: STATUS.DO,
    transitions: TRANSITIONS.DO,
    getFrom: ['SO', 'PO'],
    flowsTo: [],
  },
};

export const DocRegistry = {
  types: TYPES,
  get(docType) {
    return TYPES[docType] || null;
  },
  has(docType) {
    return Object.prototype.hasOwnProperty.call(TYPES, docType);
  },
  list() {
    return Object.keys(TYPES);
  },
  statuses(docType) {
    return (TYPES[docType] && TYPES[docType].statuses) || [];
  },
  statusValues(docType) {
    return this.statuses(docType).map(s => s[0]);
  },
};

export default DocRegistry;

// Browser global — consumed by classic bundle scripts (doc-engine.js etc.)
if (typeof window !== 'undefined') {
  window.DocRegistry = DocRegistry;
  try {
    if (!window.ERP) {
      window.ERP = {};
    }
    window.ERP.docRegistry = DocRegistry;
  } catch {
    /* ERP namespace not ready yet */
  }
}
