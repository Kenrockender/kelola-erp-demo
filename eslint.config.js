import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Flat config ignores .eslintignore, so build artifacts must be listed here.
  // Without this, ESLint lints the minified dist/ bundle and reports thousands
  // of false positives.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '**/*.min.js',
      'eslint-report.json',
      'analyze-lint.mjs',
      // Legacy classic JS bundle — enforced separately if needed
      'public/classic/**',
      // Utility scripts (CJS, Node-only, not part of the app bundle)
      'scripts/**',
    ],
  },
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        // Custom globals - Core
        DB: 'writable',
        activeView: 'writable',
        filters: 'writable',
        Chart: 'readonly',
        firebase: 'readonly',
        ERP: 'writable',
        charts: 'writable',
        _renderedViews: 'writable',
        _filterCloseCtrl: 'writable',
        _chartInitTimer: 'writable',
        soSelection: 'writable',
        // Helper functions
        escapeHtml: 'readonly',
        sanitizeInput: 'readonly',
        idr: 'readonly',
        idrFull: 'readonly',
        today: 'readonly',
        badge: 'readonly',
        secHdr: 'readonly',
        statRow: 'readonly',
        tblHdr: 'readonly',
        actionBtns: 'readonly',
        detailRow: 'readonly',
        nextId: 'readonly',
        // Modal and toast
        openModal: 'readonly',
        closeModal: 'readonly',
        showToast: 'readonly',
        showUndoToast: 'readonly',
        confirmDialog: 'readonly',
        // Stock management
        applyStockMutation: 'readonly',
        getReservedQty: 'readonly',
        reserveStock: 'readonly',
        releaseReservation: 'readonly',
        checkOversell: 'readonly',
        getAvailableStock: 'readonly',
        // Database
        loadDB: 'readonly',
        saveDB: 'readonly',
        resetDB: 'readonly',
        normalizeImportedDB: 'readonly',
        // Navigation
        navigate: 'readonly',
        getRenderer: 'readonly',
        // Charts
        destroyCharts: 'readonly',
        initCharts: 'readonly',
        // CRUD - Sales Orders
        showAddSO: 'readonly',
        viewSO: 'readonly',
        editSO: 'readonly',
        deleteSO: 'readonly',
        // CRUD - Purchase Orders
        showAddPO: 'readonly',
        viewPO: 'readonly',
        editPO: 'readonly',
        deletePO: 'readonly',
        // CRUD - Items
        showAddItem: 'readonly',
        viewItem: 'readonly',
        editItem: 'readonly',
        deleteItem: 'readonly',
        // CRUD - Delivery Orders
        showAddDO: 'readonly',
        viewDO: 'readonly',
        editDO: 'readonly',
        deleteDO: 'readonly',
        // CRUD - Customers
        showAddCustomer: 'readonly',
        viewCustomer: 'readonly',
        editCustomer: 'readonly',
        deleteCustomer: 'readonly',
        // CRUD - Suppliers
        showAddSupplier: 'readonly',
        viewSupplier: 'readonly',
        editSupplier: 'readonly',
        deleteSupplier: 'readonly',
        // CRUD - Fleet
        showAddFleet: 'readonly',
        editFleet: 'readonly',
        deleteFleet: 'readonly',
        // CRUD - Expedition
        showAddExpedition: 'readonly',
        editExpedition: 'readonly',
        deleteExpedition: 'readonly',
        // View renderers
        renderSales: 'readonly',
        renderPurchase: 'readonly',
        renderInventory: 'readonly',
        // Monkey-patched (wrapped) in erp-patch.js, so it must be writable.
        renderFinance: 'writable',
        renderLogistics: 'readonly',
        renderMasterData: 'readonly',
        renderDashboard: 'readonly',
        // Utility functions
        printDocument: 'readonly',
        linesDetailHTML: 'readonly',
        lineItemsHTML: 'readonly',
        initLineItems: 'readonly',
        exportBtn: 'readonly',
        filterBtn: 'readonly',
        dateFilterBar: 'readonly',
        sortTh: 'readonly',
        pagerHTML: 'readonly',
        emptyRow: 'readonly',
        applyDateFilter: 'readonly',
        applySorted: 'readonly',
        applyPage: 'readonly',
        handleSearch: 'readonly',
        // Status constants
        SO_STATUSES: 'readonly',
        PO_STATUSES: 'readonly',
        DO_STATUSES: 'readonly',
        statusOptions: 'readonly',
        // Settings & Finance
        showFinanceDetail: 'readonly',
        showSettingPanel: 'readonly',
        editAccounts: 'readonly',
        showTaxSettings: 'readonly',
        showUserManagement: 'readonly',
        showAddUser: 'readonly',
        showItemCategories: 'readonly',
        showAddItemCategory: 'readonly',
        showUnitSettings: 'readonly',
        showAddUnit: 'readonly',
        showAddAsset: 'readonly',
        viewAsset: 'readonly',
        editAsset: 'readonly',
        deleteAsset: 'readonly',
        showAddAssetCategory: 'readonly',
        showAddAssetFiscalCategory: 'readonly',
        showAddAssetTransfer: 'readonly',
        showAddAssetDisposal: 'readonly',
        // Notifications
        markAllRead: 'readonly',
        readNotif: 'readonly',
        toggleNotifPanel: 'readonly',
        updateNotifDot: 'readonly',
        // Bulk operations
        inlineSOStatus: 'readonly',
        updateBulkBar: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-undef': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-empty': 'warn',
    },
  },
  // Service worker runs in ServiceWorkerGlobalScope, not window — give it the
  // right globals (self, clients, caches, skipWaiting, ...).
  {
    files: ['public/sw.js', '**/sw.js', 'src/workers/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  // TypeScript files: use the TS parser so they can be linted at all.
  // The base no-undef / no-unused-vars rules misread type-only syntax, so the
  // TypeScript compiler (tsc --noEmit) owns those checks for .ts files instead.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
