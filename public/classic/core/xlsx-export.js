// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — XLSX Export  (xlsx-export.js)
// Phase 7: real .xlsx (OOXML) export with ZERO dependencies, fully offline.
//
// Builds a genuine SpreadsheetML workbook (a stored/uncompressed ZIP of XML
// parts) directly in the browser — so it works inside the offline PWA without a
// CDN library, and Excel/LibreOffice/Sheets open it natively with no "format
// differs from extension" warning that the old HTML-as-xls trick produces.
//
// Public API (window.NSAXlsx):
//   download(filename, sheets)   sheets = [{ name, columns, rows }]
//     columns = [{ header, width?, type? }]  type: 'text'|'int'|'currency'
//     rows    = [[v, v, ...], ...]           (cell order matches columns)
//
//   — OR — form-style sheets (no header row / frozen pane), for documents
//   that need merged cells, borders, bold fonts and an embedded logo such as
//   the Surat Jalan replica of 039-brik loco.xlsx:
//   download(filename, sheets) where a sheet = {
//     name,
//     cols:       [{ i, width }]                 explicit column widths (0-based i)
//     rowHeights: { rowNumber: height }          1-based row → points
//     merges:     ['A6:K6', ...]
//     images:     [{ bytes, ext:'jpeg'|'png', col, row, w, h }]   (w/h in px)
//     cells:      [{ c:'A6', v, t:'int'|'text', s:{ b, sz, h, v, wrap, bl,br,bt,bb } }]
//                   bl/br/bt/bb = border side style ('medium'|'thin')
//   }
//   A sheet is treated as form-style when it has a `cells` array.
//
// IIFE-wrapped classic <script>; exposes ONLY window.NSAXlsx.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── CRC-32 ─────────────────────────────────────────────────────────────────
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = new TextEncoder();
  function xmlEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  function colLetter(n) {
    // 0-based index → A, B, ... Z, AA, ...
    let s = '';
    n = n + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  function refToRC(ref) {
    // 'A6' → { col: 0, row: 5 } (0-based)
    const m = /^([A-Z]+)(\d+)$/.exec(String(ref).trim().toUpperCase());
    if (!m) return { col: 0, row: 0 };
    let col = 0;
    for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { col: col - 1, row: parseInt(m[2], 10) - 1 };
  }

  // ── dynamic style registry ───────────────────────────────────────────────────
  // Pre-seeds the 5 legacy cellXfs (indices 0-4) so existing callers that
  // reference s="0".."4" keep working, then appends form styles on demand.
  function makeStyleRegistry() {
    // fonts: 0 = default, 1 = bold white (legacy header)
    const fonts = [
      '<font><sz val="11"/><name val="Calibri"/></font>',
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    ];
    const fontCache = new Map();

    // fills: 0 none, 1 gray125, 2 solid blue (legacy header)
    const fills = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
      '<fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>',
    ];

    // borders: 0 none, 1 thin bottom (legacy body)
    const borders = [
      '<border><left/><right/><top/><bottom/><diagonal/></border>',
      '<border><left/><right/><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>',
    ];
    // NOTE: legacy border 1 originally had only a bottom edge. Keeping a top edge
    // too is harmless for the existing list exports and preserves index parity.
    borders[1] =
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>';
    const borderCache = new Map();

    // cellXfs: 0 plain, 1 header, 2 currency, 3 integer, 4 body text (legacy)
    const xfs = [
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>',
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>',
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>',
    ];
    const xfCache = new Map();

    function fontId(spec) {
      const b = !!spec.b;
      const sz = spec.sz || 11;
      const key = 'f|' + b + '|' + sz;
      if (fontCache.has(key)) return fontCache.get(key);
      const xml =
        '<font>' +
        (b ? '<b/>' : '') +
        '<sz val="' +
        sz +
        '"/>' +
        '<color rgb="FF000000"/>' +
        '<name val="Calibri"/>' +
        '</font>';
      const id = fonts.push(xml) - 1;
      fontCache.set(key, id);
      return id;
    }

    function borderId(spec) {
      const sides = { left: spec.bl, right: spec.br, top: spec.bt, bottom: spec.bb };
      const key =
        'b|' +
        (sides.left || '') +
        '|' +
        (sides.right || '') +
        '|' +
        (sides.top || '') +
        '|' +
        (sides.bottom || '');
      if (key === 'b||||') return 0;
      if (borderCache.has(key)) return borderCache.get(key);
      const side = name =>
        sides[name]
          ? '<' + name + ' style="' + sides[name] + '"><color rgb="FF000000"/></' + name + '>'
          : '<' + name + '/>';
      const xml =
        '<border>' +
        side('left') +
        side('right') +
        side('top') +
        side('bottom') +
        '<diagonal/></border>';
      const id = borders.push(xml) - 1;
      borderCache.set(key, id);
      return id;
    }

    // returns a cellXfs index for a form-cell style spec
    function xfId(spec) {
      spec = spec || {};
      const fId = fontId(spec);
      const bId = borderId(spec);
      const numFmtId = spec.t === 'int' ? 3 : 0;
      const hasAlign = spec.h || spec.v || spec.wrap;
      const key =
        'x|' +
        fId +
        '|' +
        bId +
        '|' +
        numFmtId +
        '|' +
        (spec.h || '') +
        '|' +
        (spec.v || '') +
        '|' +
        (spec.wrap ? 1 : 0);
      if (xfCache.has(key)) return xfCache.get(key);
      let xml =
        '<xf numFmtId="' +
        numFmtId +
        '" fontId="' +
        fId +
        '" fillId="0" borderId="' +
        bId +
        '" xfId="0" applyFont="1" applyBorder="1"' +
        (numFmtId ? ' applyNumberFormat="1"' : '') +
        (hasAlign ? ' applyAlignment="1"' : '') +
        '>';
      if (hasAlign) {
        xml +=
          '<alignment' +
          (spec.h ? ' horizontal="' + spec.h + '"' : '') +
          (spec.v ? ' vertical="' + spec.v + '"' : '') +
          (spec.wrap ? ' wrapText="1"' : '') +
          '/>';
      }
      xml += '</xf>';
      const id = xfs.push(xml) - 1;
      xfCache.set(key, id);
      return id;
    }

    function toXml() {
      return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot;\\ #,##0"/></numFmts>' +
        '<fonts count="' +
        fonts.length +
        '">' +
        fonts.join('') +
        '</fonts>' +
        '<fills count="' +
        fills.length +
        '">' +
        fills.join('') +
        '</fills>' +
        '<borders count="' +
        borders.length +
        '">' +
        borders.join('') +
        '</borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="' +
        xfs.length +
        '">' +
        xfs.join('') +
        '</cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>'
      );
    }

    return { xfId: xfId, toXml: toXml };
  }

  // ── worksheet builder — legacy (header row + frozen pane) ────────────────────
  function buildSheetXml(sheet) {
    const cols = sheet.columns || [];
    const rows = sheet.rows || [];

    let colsXml = '<cols>';
    cols.forEach(function (c, i) {
      const w = c.width || Math.max(10, Math.min(40, String(c.header || '').length + 4));
      colsXml +=
        '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    });
    colsXml += '</cols>';

    let data = '<sheetData>';
    // header
    data += '<row r="1">';
    cols.forEach(function (c, i) {
      data +=
        '<c r="' +
        colLetter(i) +
        '1" s="1" t="inlineStr"><is><t xml:space="preserve">' +
        xmlEsc(c.header) +
        '</t></is></c>';
    });
    data += '</row>';
    // body
    rows.forEach(function (row, ri) {
      const r = ri + 2;
      data += '<row r="' + r + '">';
      cols.forEach(function (c, ci) {
        const ref = colLetter(ci) + r;
        const v = row[ci];
        const type = c.type || 'text';
        if ((type === 'int' || type === 'currency') && v !== '' && v != null && !isNaN(v)) {
          const s = type === 'currency' ? 2 : 3;
          data += '<c r="' + ref + '" s="' + s + '"><v>' + Number(v) + '</v></c>';
        } else {
          data +=
            '<c r="' +
            ref +
            '" s="4" t="inlineStr"><is><t xml:space="preserve">' +
            xmlEsc(v) +
            '</t></is></c>';
        }
      });
      data += '</row>';
    });
    data += '</sheetData>';

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      colsXml +
      data +
      '</worksheet>'
    );
  }

  // ── worksheet builder — form-style (cells / merges / borders / image) ────────
  function buildFormSheetXml(sheet, styleReg, drawingRid) {
    const cells = sheet.cells || [];
    const merges = sheet.merges || [];
    const colDefs = sheet.cols || [];
    const rowHeights = sheet.rowHeights || {};

    // columns
    let colsXml = '';
    if (colDefs.length) {
      colsXml = '<cols>';
      colDefs.forEach(function (c) {
        colsXml +=
          '<col min="' +
          (c.i + 1) +
          '" max="' +
          (c.i + 1) +
          '" width="' +
          c.width +
          '" customWidth="1"/>';
      });
      colsXml += '</cols>';
    }

    // group cells by row
    const byRow = {};
    cells.forEach(function (cell) {
      const rc = refToRC(cell.c);
      (byRow[rc.row] = byRow[rc.row] || []).push({ rc: rc, cell: cell });
    });

    const rowNums = Object.keys(byRow)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    let data = '<sheetData>';
    rowNums.forEach(function (rIdx) {
      const r = rIdx + 1;
      const ht = rowHeights[r];
      data += '<row r="' + r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>';
      byRow[rIdx]
        .sort(function (a, b) {
          return a.rc.col - b.rc.col;
        })
        .forEach(function (entry) {
          const cell = entry.cell;
          const ref = colLetter(entry.rc.col) + r;
          const s = styleReg.xfId(cell.s || {});
          const v = cell.v;
          if (cell.t === 'int' && v !== '' && v != null && !isNaN(v)) {
            data += '<c r="' + ref + '" s="' + s + '"><v>' + Number(v) + '</v></c>';
          } else {
            data +=
              '<c r="' +
              ref +
              '" s="' +
              s +
              '" t="inlineStr"><is><t xml:space="preserve">' +
              xmlEsc(v) +
              '</t></is></c>';
          }
        });
      data += '</row>';
    });
    data += '</sheetData>';

    let mergeXml = '';
    if (merges.length) {
      mergeXml = '<mergeCells count="' + merges.length + '">';
      merges.forEach(function (m) {
        mergeXml += '<mergeCell ref="' + m + '"/>';
      });
      mergeXml += '</mergeCells>';
    }

    const drawingXml = drawingRid ? '<drawing r:id="' + drawingRid + '"/>' : '';
    const wsAttrs =
      'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      (drawingRid
        ? ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
        : '');

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet ' +
      wsAttrs +
      '>' +
      '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      colsXml +
      data +
      mergeXml +
      drawingXml +
      '</worksheet>'
    );
  }

  // ── drawing XML for embedded images (one-cell anchors) ──────────────────────
  // imgArr: [{ col, row, colOff, rowOff (EMU), w, h (px), rid }]
  const EMU = 9525; // EMUs per pixel at 96 DPI
  function buildDrawingXml(imgArr) {
    let anchors = '';
    imgArr.forEach(function (img, idx) {
      const cx = Math.round((img.w || 64) * EMU);
      const cy = Math.round((img.h || 64) * EMU);
      anchors +=
        '<xdr:oneCellAnchor>' +
        '<xdr:from><xdr:col>' +
        (img.col || 0) +
        '</xdr:col><xdr:colOff>' +
        (img.colOff || 0) +
        '</xdr:colOff>' +
        '<xdr:row>' +
        (img.row || 0) +
        '</xdr:row><xdr:rowOff>' +
        (img.rowOff || 0) +
        '</xdr:rowOff></xdr:from>' +
        '<xdr:ext cx="' +
        cx +
        '" cy="' +
        cy +
        '"/>' +
        '<xdr:pic>' +
        '<xdr:nvPicPr><xdr:cNvPr id="' +
        (idx + 2) +
        '" name="Img' +
        (idx + 1) +
        '"/>' +
        '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
        '<xdr:blipFill>' +
        '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="' +
        img.rid +
        '"/>' +
        '<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
        '<xdr:spPr>' +
        '<a:xfrm><a:off x="0" y="0"/><a:ext cx="' +
        cx +
        '" cy="' +
        cy +
        '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
        '</xdr:spPr>' +
        '</xdr:pic>' +
        '<xdr:clientData/>' +
        '</xdr:oneCellAnchor>';
    });
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      anchors +
      '</xdr:wsDr>'
    );
  }

  function safeSheetName(name, used) {
    let n =
      String(name || 'Sheet')
        .replace(/[\\/?*\[\]:]/g, ' ')
        .slice(0, 31)
        .trim() || 'Sheet';
    let base = n;
    let i = 2;
    while (used.has(n.toLowerCase())) {
      n = (base.slice(0, 28) + ' ' + i).slice(0, 31);
      i++;
    }
    used.add(n.toLowerCase());
    return n;
  }

  // ── ZIP (stored / no compression) ──────────────────────────────────────────────
  function buildZip(files) {
    // files: [{ name, bytes }]
    const chunks = [];
    const central = [];
    let offset = 0;

    function pushU16(arr, v) {
      arr.push(v & 0xff, (v >>> 8) & 0xff);
    }
    function pushU32(arr, v) {
      arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    }

    files.forEach(function (f) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.bytes);
      const size = f.bytes.length;

      // local file header
      const lh = [];
      pushU32(lh, 0x04034b50);
      pushU16(lh, 20); // version needed
      pushU16(lh, 0); // flags
      pushU16(lh, 0); // method: stored
      pushU16(lh, 0); // mod time
      pushU16(lh, 0x21); // mod date (1980-01-01)
      pushU32(lh, crc);
      pushU32(lh, size); // compressed
      pushU32(lh, size); // uncompressed
      pushU16(lh, nameBytes.length);
      pushU16(lh, 0); // extra len
      const lhBytes = new Uint8Array(lh);

      chunks.push(lhBytes, nameBytes, f.bytes);

      // central directory record
      const cd = [];
      pushU32(cd, 0x02014b50);
      pushU16(cd, 20); // version made by
      pushU16(cd, 20); // version needed
      pushU16(cd, 0); // flags
      pushU16(cd, 0); // method
      pushU16(cd, 0); // mod time
      pushU16(cd, 0x21); // mod date
      pushU32(cd, crc);
      pushU32(cd, size);
      pushU32(cd, size);
      pushU16(cd, nameBytes.length);
      pushU16(cd, 0); // extra
      pushU16(cd, 0); // comment
      pushU16(cd, 0); // disk start
      pushU16(cd, 0); // internal attrs
      pushU32(cd, 0); // external attrs
      pushU32(cd, offset); // local header offset
      central.push(new Uint8Array(cd), nameBytes);

      offset += lhBytes.length + nameBytes.length + f.bytes.length;
    });

    const cdStart = offset;
    let cdSize = 0;
    central.forEach(function (c) {
      cdSize += c.length;
    });

    const eocd = [];
    pushU32(eocd, 0x06054b50);
    pushU16(eocd, 0); // disk
    pushU16(eocd, 0); // cd disk
    pushU16(eocd, files.length); // entries this disk
    pushU16(eocd, files.length); // entries total
    pushU32(eocd, cdSize);
    pushU32(eocd, cdStart);
    pushU16(eocd, 0); // comment len

    const all = chunks.concat(central).concat([new Uint8Array(eocd)]);
    let total = 0;
    all.forEach(function (a) {
      total += a.length;
    });
    const out = new Uint8Array(total);
    let p = 0;
    all.forEach(function (a) {
      out.set(a, p);
      p += a.length;
    });
    return out;
  }

  // ── public: build the raw zip bytes (Uint8Array) ─────────────────────────────
  function buildBytes(sheets) {
    if (!Array.isArray(sheets) || !sheets.length) {
      throw new Error('NSAXlsx: tidak ada sheet untuk diekspor');
    }
    const used = new Set();
    const named = sheets.map(function (s) {
      return Object.assign({}, s, { name: safeSheetName(s.name, used) });
    });

    const styleReg = makeStyleRegistry();
    const files = [];

    // ── media: dedupe identical image payloads across sheets ──────────────────
    const mediaList = []; // { name, ext, bytes }
    const mediaIndexByKey = new Map();
    let hasJpeg = false;
    let hasPng = false;
    function registerMedia(img) {
      const ext = (img.ext || 'png').toLowerCase();
      // dedupe by byte length + first/last bytes (cheap, good enough for one logo)
      const key =
        ext + '|' + img.bytes.length + '|' + img.bytes[0] + '|' + img.bytes[img.bytes.length - 1];
      if (mediaIndexByKey.has(key)) return mediaIndexByKey.get(key);
      const idx = mediaList.length + 1;
      const name = 'xl/media/image' + idx + '.' + ext;
      mediaList.push({ name: name, ext: ext, bytes: img.bytes });
      if (ext === 'jpeg' || ext === 'jpg') hasJpeg = true;
      else if (ext === 'png') hasPng = true;
      mediaIndexByKey.set(key, name);
      return name;
    }

    // ── build each worksheet (+ drawing parts when it carries an image) ───────
    let wbSheets = '';
    let wbRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    let contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';

    let drawingCount = 0;

    named.forEach(function (s, i) {
      const n = i + 1;
      const part = 'xl/worksheets/sheet' + n + '.xml';
      contentTypes +=
        '<Override PartName="/' +
        part +
        '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wbSheets += '<sheet name="' + xmlEsc(s.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      wbRels +=
        '<Relationship Id="rId' +
        n +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
        n +
        '.xml"/>';

      const isForm = Array.isArray(s.cells);
      let sheetXml;

      if (isForm && Array.isArray(s.images) && s.images.length) {
        drawingCount++;
        const dn = drawingCount;
        const drawingPart = 'xl/drawings/drawing' + dn + '.xml';
        const imgArr = s.images.map(function (img, ii) {
          const mediaName = registerMedia(img);
          return {
            col: img.col || 0,
            row: img.row || 0,
            colOff: img.colOff || 0,
            rowOff: img.rowOff || 0,
            w: img.w || 64,
            h: img.h || 64,
            rid: 'rId' + (ii + 1),
            mediaName: mediaName,
          };
        });
        sheetXml = buildFormSheetXml(s, styleReg, 'rId1');
        files.push({
          name: 'xl/worksheets/_rels/sheet' + n + '.xml.rels',
          bytes: enc.encode(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
              '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
              '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' +
              dn +
              '.xml"/></Relationships>'
          ),
        });
        files.push({ name: drawingPart, bytes: enc.encode(buildDrawingXml(imgArr)) });
        let drawRels =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        imgArr.forEach(function (img) {
          drawRels +=
            '<Relationship Id="' +
            img.rid +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"' +
            ' Target="../' +
            img.mediaName.replace(/^xl\//, '') +
            '"/>';
        });
        drawRels += '</Relationships>';
        files.push({
          name: 'xl/drawings/_rels/drawing' + dn + '.xml.rels',
          bytes: enc.encode(drawRels),
        });
        contentTypes +=
          '<Override PartName="/' +
          drawingPart +
          '" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
      } else if (isForm) {
        sheetXml = buildFormSheetXml(s, styleReg, null);
      } else {
        sheetXml = buildSheetXml(s);
      }

      files.push({ name: part, bytes: enc.encode(sheetXml) });
    });

    // media defaults + payloads
    if (hasPng) contentTypes += '<Default Extension="png" ContentType="image/png"/>';
    if (hasJpeg) contentTypes += '<Default Extension="jpeg" ContentType="image/jpeg"/>';
    mediaList.forEach(function (m) {
      files.push({ name: m.name, bytes: m.bytes });
    });

    contentTypes += '</Types>';

    // styles relationship comes after the sheet relationships
    const stylesRid = 'rId' + (named.length + 1);
    wbRels +=
      '<Relationship Id="' +
      stylesRid +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const workbook =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      wbSheets +
      '</sheets></workbook>';

    const pkg = [
      { name: '[Content_Types].xml', bytes: enc.encode(contentTypes) },
      { name: '_rels/.rels', bytes: enc.encode(RELS_ROOT) },
      { name: 'xl/workbook.xml', bytes: enc.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', bytes: enc.encode(wbRels) },
      { name: 'xl/styles.xml', bytes: enc.encode(styleReg.toXml()) },
    ].concat(files);

    return buildZip(pkg);
  }

  const RELS_ROOT =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  // ── public: build a Blob ────────────────────────────────────────────────────────
  function buildBlob(sheets) {
    return new Blob([buildBytes(sheets)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  function download(filename, sheets) {
    const blob = buildBlob(sheets);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.xlsx$/i.test(filename) ? filename : filename + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.NSAXlsx = { buildBytes: buildBytes, buildBlob: buildBlob, download: download };
  console.log('[NSAXlsx] offline .xlsx writer ready');
})();
