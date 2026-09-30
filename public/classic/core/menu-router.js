// ══════════════════════════════════════════════════════════════════════════════
//  MENU ROUTER  (window.NSAMenu)
//  ----------------------------------------------------------------------------
//  Bridges sidebar flyout menu clicks (nav.js) to the specialised feature
//  renderers exposed by the *-extras modules. Without this glue, those 11
//  features were coded but unreachable: nav.js called `window.NSAMenu.handle()`,
//  but nothing ever defined NSAMenu, so every click fell back to the generic
//  host view (Sales / Purchase / Finance) instead of the real feature.
//
//  Each menu item is keyed by its (unique) label, mapping to:
//    [ <window global holding the extras object>, <open function name> ]
//  The open*() functions handle their own navigation via injectView(), so the
//  router just needs to invoke the right one.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // label → [ extras-global, method ]
  var ROUTES = {
    // ── Budget & General Ledger extras ──────────────────────────────────────
    Budget: ['_budgetGLExtras', 'openBudget'],
    'Budget Monitor': ['_budgetGLExtras', 'openBudgetMonitor'],
    'Budget Transfer': ['_budgetGLExtras', 'openBudgetTransfer'],
    'Account History': ['_budgetGLExtras', 'openAccountHistory'],
    'Expense Accrual': ['_budgetGLExtras', 'openExpenseAccrual'],
    'Employee Payroll': ['_budgetGLExtras', 'openPayroll'],
    'Audit Journal': ['_budgetGLExtras', 'openAuditJournal'],

    // ── Sales & Purchase extras ─────────────────────────────────────────────
    'Sales Down Payment': ['_salesPurchaseExtras', 'openSalesDP'],
    'Purchase Down Payment': ['_salesPurchaseExtras', 'openPurchaseDP'],
    'Sales Target': ['_salesPurchaseExtras', 'openSalesTarget'],
    'Receive Item': ['_salesPurchaseExtras', 'openReceiveItem'],
    'Supplier Price': ['_salesPurchaseExtras', 'openSupplierPrice'],

    // ── Company profile ──────────────────────────────────────────────────────
    'Profil Perusahaan': ['_companyProfile', 'open'],

    // ── Settings extras ─────────────────────────────────────────────────────
    Currency: ['_settingsExtras', 'openCurrency'],
    'Payment Term': ['_settingsExtras', 'openPaymentTerm'],
    Shipment: ['_settingsExtras', 'openShipment'],
    Calendar: ['_settingsExtras', 'openCalendar'],
    'Activity Log': ['_settingsExtras', 'openActivityLog'],
    'Favorite Transaction': ['_settingsExtras', 'openFavTransaction'],
    'Recycle Bin': ['_trashExtras', 'openRecycleBin'],

    // ── Inventory extras ────────────────────────────────────────────────────
    'Item Unit': ['_inventoryExtras', 'openItemUnit'],
    'Item Category': ['_inventoryExtras', 'openItemCategory'],
    'Item Brand': ['_inventoryExtras', 'openItemBrand'],
    'Item Requisition': ['_inventoryExtras', 'openItemRequisition'],
    'Job Costing': ['_inventoryExtras', 'openJobCosting'],

    // ── Master extras ────────────────────────────────────────────────────────
    Employee: ['_masterExtras', 'openEmployee'],
    Contact: ['_masterExtras', 'openContact'],
    'Customer Category': ['_masterExtras', 'openCustomerCategory'],
    'Supplier Category': ['_masterExtras', 'openSupplierCategory'],

    // ── Settings extras (extended) ──────────────────────────────────────────
    'Sales Category': ['_settingsExtras', 'openSalesCategory'],

    // ── Asset extras ────────────────────────────────────────────────────────
    'Asset per Location': ['_assetExtras', 'openAssetPerLocation'],
    'Fixed Asset Category': ['_assetExtras', 'openAssetCategory'],
    'Fiscal FA Category': ['_assetExtras', 'openFiscalCategory'],
    'Fixed Asset Edited': ['_assetExtras', 'openAssetEdited'],
    'FA Disposition': ['_assetExtras', 'openFADisposition'],
    'Asset Transfer': ['_assetExtras', 'openAssetTransfer'],

    // ── Bank extras ─────────────────────────────────────────────────────────
    'Other Payment': ['_bankExtras', 'openOtherPayment'],
    'Other Deposit': ['_bankExtras', 'openOtherDeposit'],
    'Bank Transfer': ['_bankExtras', 'openBankTransfer'],
    'SmartLink e-Banking': ['_bankExtras', 'openSmartLink'],
    'Bank Statement': ['_bankExtras', 'openBankStatement'],
    'Bank History': ['_bankExtras', 'openBankHistory'],
    'Bank Reconcile': ['_bankExtras', 'openBankReconcile'],

    // ── Tax extras ──────────────────────────────────────────────────────────
    'e-Faktur CTAS': ['_taxExtras', 'openEFakturCTAS'],
    'Tax Invoice Email': ['_taxExtras', 'openTaxInvoiceEmail'],
    'e-Faktur Legacy': ['_taxExtras', 'openEFakturLegacy'],

    // ── Report extras ───────────────────────────────────────────────────────
    'Report List': ['_reportExtras', 'openReportList'],
    'SPT PPN / PPNBM': ['_reportExtras', 'openSPTPPN'],
    'AI Analysis': ['_reportExtras', 'openAIAnalysis'],

    // ── Invoice / Receipt / Payment tab routing ──────────────────────────────
    'Sales Invoice':    ['_invoiceExtras', 'openSalesInvoice'],
    'Purchase Invoice': ['_invoiceExtras', 'openPurchaseInvoice'],
    'Sales Receipt':    ['_invoiceExtras', 'openSalesReceipt'],
    'Purchase Payment': ['_invoiceExtras', 'openPurchasePayment'],

    // ── Quotation tab routing ────────────────────────────────────────────────
    'Sales Quotation':    ['_quotationExtras', 'openSalesQuotation'],
    'Purchase Quotation': ['_quotationExtras', 'openPurchaseQuotation'],

    // ── Return tab routing ───────────────────────────────────────────────────
    'Sales Return':    ['_returnExtras', 'openSalesReturn'],
    'Purchase Return': ['_returnExtras', 'openPurchaseReturn'],

    // ── Financial report tab routing ─────────────────────────────────────────
    'Laba Rugi (P/L)':          ['_financialExtras', 'openPL'],
    'Neraca (Balance Sheet)':   ['_financialExtras', 'openBS'],
    'Arus Kas (Cash Flow)':     ['_financialExtras', 'openCF'],
  };

  // handle(viewId, label) → true if the click was fully handled, false to let
  // nav.js fall back to a plain navigate(viewId).
  function handle(viewId, label) {
    var route = ROUTES[label];
    if (!route) return false;

    var extras = window[route[0]];
    var fn = extras && extras[route[1]];
    if (typeof fn !== 'function') {
      // Extras module not loaded yet — let nav.js navigate normally.
      console.warn(
        '[NSAMenu] handler not ready for "' + label + '" (' + route[0] + '.' + route[1] + ')'
      );
      return false;
    }

    try {
      fn();
      return true;
    } catch (e) {
      console.error('[NSAMenu] error rendering "' + label + '":', e);
      return false;
    }
  }

  window.NSAMenu = { handle: handle, routes: ROUTES };
  console.log('[NSAMenu] Menu router ready (' + Object.keys(ROUTES).length + ' routed features)');
})();
