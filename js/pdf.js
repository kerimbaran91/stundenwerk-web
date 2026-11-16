// PDF im Tabellen-Look (wie die Android-App): A4 hoch, Rahmen um jede Zelle, Wochenenden markiert, Summe fett.
// Jeder Monat beginnt auf einer neuen Seite. Nutzt jsPDF (vendor/jspdf.umd.min.js).

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;
const ROW_H = 15.5;
const HEADER_H = 17;
const FONT = 8.6;
const FAMILY = 'LiberationSans';

// Eingebettete Schrift (Liberation Sans, sieht aus wie Helvetica/Arial) – damit auch türkische Buchstaben
// wie ş, ğ, ı, İ im PDF stimmen. Die Standardschrift von PDF kann nur westeuropäische Zeichen.
let fonts = null; // { normal, bold } als Base64
let fontsLoading = null;

function toBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Schrift vorab laden (beim Öffnen der Teilen-Seite), damit das Teilen direkt im Antippen klappt. */
export function loadFonts() {
  if (fonts) return Promise.resolve(true);
  if (!fontsLoading) {
    const get = (f) => fetch('fonts/' + f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('Schrift fehlt')))).then(toBase64);
    fontsLoading = Promise.all([get('LiberationSans-Regular.ttf'), get('LiberationSans-Bold.ttf')])
      .then(([normal, bold]) => { fonts = { normal, bold }; return true; })
      .catch(() => { fontsLoading = null; return false; });
  }
  return fontsLoading;
}

const TRANSLIT = { ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ć: 'c', Ć: 'C', č: 'c', Č: 'C', ž: 'z', Ž: 'Z', đ: 'd', Đ: 'D', ł: 'l', Ł: 'L' };

/** Nur Zeichen behalten, die die Schrift darstellen kann (Emojis usw. fallen weg). */
export function cleanText(text, embedded) {
  let s = String(text ?? '').normalize('NFC');
  if (!embedded) s = s.replace(/[^\u0000-\u00FF]/g, (c) => TRANSLIT[c] ?? c).replace(/[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018-\u201E\u2026\u20AC]/g, '');
  else s = s.replace(/[^\u0020-\u007E\u00A0-\u024F\u2010-\u2026\u20AC]/gu, '');
  return s.replace(/ {2,}/g, ' ').trim();
}

export function buildPdf(doc) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
  const embedded = !!fonts;
  if (embedded) {
    pdf.addFileToVFS('LiberationSans-Regular.ttf', fonts.normal);
    pdf.addFont('LiberationSans-Regular.ttf', FAMILY, 'normal');
    pdf.addFileToVFS('LiberationSans-Bold.ttf', fonts.bold);
    pdf.addFont('LiberationSans-Bold.ttf', FAMILY, 'bold');
  }
  const family = embedded ? FAMILY : 'helvetica';
  const setFont = pdf.setFont.bind(pdf);
  pdf.setFont = (_name, style) => setFont(family, style);
  const text = pdf.text.bind(pdf);
  pdf.text = (t, ...rest) => text(cleanText(t, embedded), ...rest);
  pdf.swClean = (t) => cleanText(t, embedded);
  pdf.setProperties({ title: doc.fileBaseName, creator: 'Stundenwerk' });
  let pageNo = 0;
  let first = true;

  const newPage = () => {
    if (!first) pdf.addPage();
    first = false;
    pageNo++;
  };

  if (!doc.sections.length) {
    newPage();
    pdf.setFont('helvetica', 'bold').setFontSize(12).text('Keine Daten', MARGIN, MARGIN + 20);
  }

  for (const s of doc.sections) {
    newPage();
    const usable = PAGE_W - 2 * MARGIN;
    const tableW = (usable * Math.min(100, Math.max(30, doc.widthPercent))) / 100;
    const x0 = (PAGE_W - tableW) / 2;
    const weights = s.columns.map((c) => Math.max(10, c.pdfWidth));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const widths = weights.map((w) => (w / sum) * tableW);
    let y = MARGIN;

    s.titleLines.forEach((t, i) => {
      const size = i === s.titleLines.length - 1 ? 20 : 14;
      y += size + 4;
      pdf.setFont('helvetica', 'bold').setFontSize(size).setTextColor(0);
      pdf.text(t, PAGE_W / 2, y, { align: 'center' });
    });
    if (s.titleLines.length) y += 10;
    pdf.setFont('helvetica', 'normal').setFontSize(10);
    for (const line of s.infoLines) {
      y += 13;
      pdf.text(line, x0, y);
    }
    if (s.infoLines.length) y += 10;

    const drawHeader = () => {
      let x = x0;
      s.columns.forEach((col, i) => {
        pdf.setFillColor(232, 232, 232).rect(x, y, widths[i], HEADER_H, 'F');
        pdf.setDrawColor(0).setLineWidth(0.6).rect(x, y, widths[i], HEADER_H, 'S');
        cellText(pdf, col.title, x, widths[i], y, HEADER_H, col.align, true);
        x += widths[i];
      });
      y += HEADER_H;
    };
    const drawRow = (row) => {
      let x = x0;
      row.cells.forEach((text, i) => {
        if (row.highlight) pdf.setFillColor(255, 243, 205).rect(x, y, widths[i], ROW_H, 'F');
        pdf.setDrawColor(0).setLineWidth(0.6).rect(x, y, widths[i], ROW_H, 'S');
        cellText(pdf, text, x, widths[i], y, ROW_H, s.columns[i].align, row.bold);
        x += widths[i];
      });
      y += ROW_H;
    };
    const continuePage = () => {
      footer(pdf, pageNo);
      newPage();
      y = MARGIN;
      drawHeader();
    };

    drawHeader();
    const bottom = PAGE_H - MARGIN - 14;
    for (const row of s.rows) {
      if (y + ROW_H > bottom) continuePage();
      drawRow(row);
    }
    if (y + ROW_H > bottom) continuePage();
    drawRow(s.total);

    if (s.signatures.length) {
      if (y + 70 > bottom) {
        footer(pdf, pageNo);
        newPage();
        y = MARGIN;
      }
      y += 50;
      const gap = 30;
      const n = s.signatures.length;
      const sigW = Math.min(220, (tableW - gap * (n - 1)) / n);
      let x = x0;
      pdf.setFont('helvetica', 'normal').setFontSize(9);
      for (const label of s.signatures) {
        pdf.setLineWidth(0.6).line(x, y, x + sigW, y);
        pdf.text(label, x, y + 12);
        x += sigW + gap;
      }
    }
    footer(pdf, pageNo);
  }
  return pdf;
}

function cellText(pdf, text, x, w, y, h, align, bold) {
  if (!text) return;
  const pad = 3;
  pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(FONT).setTextColor(0);
  const fitted = ellipsize(pdf, pdf.swClean(text), w - 2 * pad);
  const baseline = y + h / 2 + FONT * 0.35;
  if (align === 'LEFT') pdf.text(fitted, x + pad, baseline);
  else if (align === 'RIGHT') pdf.text(fitted, x + w - pad, baseline, { align: 'right' });
  else pdf.text(fitted, x + w / 2, baseline, { align: 'center' });
}

function ellipsize(pdf, text, maxW) {
  if (maxW <= 0) return '';
  if (pdf.getTextWidth(text) <= maxW) return text;
  let end = text.length;
  while (end > 0 && pdf.getTextWidth(text.slice(0, end)) + pdf.getTextWidth('…') > maxW) end--;
  return end <= 0 ? '' : text.slice(0, end).trimEnd() + '…';
}

function footer(pdf, pageNo) {
  const label = `Seite ${pageNo}`;
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(128);
  pdf.text(label, PAGE_W - MARGIN, PAGE_H - MARGIN / 2, { align: 'right' });
  pdf.setTextColor(0);
}

export function safeFileName(name) {
  return name.replace(/[^\wäöüÄÖÜß-]+/g, '_');
}
