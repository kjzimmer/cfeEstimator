// Generates the customer-facing Work Order PDF. This module only ever
// receives line items from workOrderService.getLineItemsForPdf(), which
// does not select `cost` -- so there is no cost field in scope anywhere in
// this file to accidentally render. See docs/requirements/work-orders.md.
//
// Layout/branding constants here are specific to this one document type for
// now. If a generalized reporting feature (shared header/footer, company
// branding) gets scoped later, these are the values to lift out first.
import PDFDocument from 'pdfkit';

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter, points
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const COLOR = {
  text: '#111111',
  muted: '#5b5b5b',
  accent: '#E8871E',
  tableHeaderBg: '#1a1a1a',
  tableHeaderText: '#ffffff',
  rule: '#dddddd',
};
// Widths tuned so "$XX,XXX.XX"-scale amounts and units like "linear ft"
// never wrap -- a too-narrow amount column was the original bug here
// (numbers wrapping to a second line and throwing off every row/rule
// position below it). Numeric cells also pass lineBreak:false as a second
// guardrail against wrapping regardless of width.
const COLS = { name: MARGIN, qty: MARGIN + 220, unit: MARGIN + 260, rate: MARGIN + 320, amount: MARGIN + 405 };

function money(n) {
  return CURRENCY.format(n);
}

function workOrderNumber(workOrder) {
  const year = new Date(workOrder.finalized_at || workOrder.created_at || Date.now()).getFullYear();
  return `WO-${year}-${String(workOrder.id).padStart(4, '0')}`;
}

function sectionHeading(doc, text) {
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.accent);
  // Explicit x -- doc.x otherwise carries over from whichever column
  // (left or right) last wrote text, e.g. the Site Location block above.
  doc.text(text.toUpperCase(), MARGIN, doc.y, { width: CONTENT_WIDTH, characterSpacing: 0.3 });
  doc.moveDown(0.2);
}

function rule(doc, y) {
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor(COLOR.rule).lineWidth(1).stroke();
}

export async function generateWorkOrderPdf({ identity, customer, project, workOrder, lineItems }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // --- Header: company block (left) / work order metadata (right) ---
  const headerTop = MARGIN;
  const rightColX = MARGIN + 320;
  const rightColWidth = CONTENT_WIDTH - 320;

  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR.text);
  doc.text(identity?.company_name || 'Company Name Not Set', MARGIN, headerTop, { width: 300 });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
  if (identity?.address) doc.text(identity.address, MARGIN, doc.y, { width: 300 });
  const contactLine = [identity?.phone, identity?.email, identity?.website].filter(Boolean).join('  ·  ');
  if (contactLine) doc.text(contactLine, MARGIN, doc.y, { width: 300 });

  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR.text);
  doc.text('WORK ORDER', rightColX, headerTop, { width: rightColWidth, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.muted);
  doc.text(`No. ${workOrderNumber(workOrder)}`, rightColX, doc.y + 2, { width: rightColWidth, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
  doc.text(`Issued: ${new Date(workOrder.finalized_at || Date.now()).toLocaleDateString()}`, rightColX, doc.y, {
    width: rightColWidth,
    align: 'right',
  });
  doc.text(`Project ref: ${project.name}`, rightColX, doc.y, { width: rightColWidth, align: 'right' });

  doc.y = Math.max(doc.y, headerTop + 70) + 12;
  rule(doc, doc.y);
  doc.strokeColor(COLOR.accent).lineWidth(2).moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).stroke();
  doc.y += 16;

  // --- Customer / Site Location two-column block ---
  const blockTop = doc.y;
  const colWidth = CONTENT_WIDTH / 2 - 15;

  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.text);
  doc.text('Customer', MARGIN, blockTop, { width: colWidth });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted);
  doc.text(customer?.name || 'No customer on file', MARGIN, doc.y, { width: colWidth });
  if (customer?.primary_contact_name) doc.text(`Attn: ${customer.primary_contact_name}`, MARGIN, doc.y, { width: colWidth });
  if (customer?.address) doc.text(customer.address, MARGIN, doc.y, { width: colWidth });
  const custContact = [customer?.phone, customer?.email].filter(Boolean).join('  ·  ');
  if (custContact) doc.text(custContact, MARGIN, doc.y, { width: colWidth });
  const leftColBottom = doc.y;

  const rightColX2 = MARGIN + CONTENT_WIDTH / 2 + 15;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.text);
  doc.text('Site Location', rightColX2, blockTop, { width: colWidth });
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted);
  doc.text(workOrder.site_location || customer?.address || '(same as customer address)', rightColX2, doc.y, { width: colWidth });
  if (workOrder.requested_start) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR.text);
    doc.text('Requested Start', rightColX2, doc.y, { width: colWidth });
    doc.font('Helvetica').fontSize(10).fillColor(COLOR.muted);
    doc.text(workOrder.requested_start, rightColX2, doc.y, { width: colWidth });
  }
  const rightColBottom = doc.y;

  doc.y = Math.max(leftColBottom, rightColBottom);

  // --- Scope of Work ---
  if (workOrder.scope_text) {
    sectionHeading(doc, 'Scope of Work');
    doc.font('Helvetica').fontSize(10).fillColor(COLOR.text);
    doc.text(workOrder.scope_text, MARGIN, doc.y, { width: CONTENT_WIDTH });
  }

  // --- Line items table ---
  sectionHeading(doc, 'Labor, Materials & Equipment');
  let y = doc.y + 4;

  function drawTableHeader(atY) {
    doc.rect(MARGIN, atY, CONTENT_WIDTH, 22).fill(COLOR.tableHeaderBg);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR.tableHeaderText);
    doc.text('Description', COLS.name + 8, atY + 6, { width: COLS.qty - COLS.name - 10 });
    doc.text('Qty', COLS.qty, atY + 6, { width: COLS.unit - COLS.qty - 5, lineBreak: false });
    doc.text('Unit', COLS.unit, atY + 6, { width: COLS.rate - COLS.unit - 5, lineBreak: false });
    doc.text('Rate', COLS.rate, atY + 6, { width: COLS.amount - COLS.rate - 10, align: 'right', lineBreak: false });
    doc.text('Amount', COLS.amount, atY + 6, { width: PAGE_WIDTH - MARGIN - COLS.amount - 8, align: 'right', lineBreak: false });
    return atY + 22;
  }

  y = drawTableHeader(y);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR.text);
  for (const li of lineItems) {
    if (y > 680) {
      doc.addPage();
      y = MARGIN;
      y = drawTableHeader(y);
      doc.font('Helvetica').fontSize(10).fillColor(COLOR.text);
    }
    y += 8;
    doc.text(li.name, COLS.name + 8, y, { width: COLS.qty - COLS.name - 10 });
    doc.text(String(li.qty), COLS.qty, y, { width: COLS.unit - COLS.qty - 5, lineBreak: false });
    doc.text(li.unit || '', COLS.unit, y, { width: COLS.rate - COLS.unit - 5, lineBreak: false });
    doc.text(money(li.rate), COLS.rate, y, { width: COLS.amount - COLS.rate - 10, align: 'right', lineBreak: false });
    doc.text(money(li.amount), COLS.amount, y, {
      width: PAGE_WIDTH - MARGIN - COLS.amount - 8,
      align: 'right',
      lineBreak: false,
    });
    y += 12;
    rule(doc, y);
    y += 2;
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const contingencyAmount = subtotal * (Number(workOrder.contingency_percent) / 100);
  const total = subtotal + contingencyAmount;

  y += 10;
  const totalsLabelX = COLS.rate - 90;
  function totalsRow(label, value, opts = {}) {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 10).fillColor(COLOR.text);
    doc.text(label, totalsLabelX, y, { width: COLS.amount - totalsLabelX - 10, align: 'right', lineBreak: false });
    doc.text(value, COLS.amount, y, {
      width: PAGE_WIDTH - MARGIN - COLS.amount - 8,
      align: 'right',
      lineBreak: false,
    });
    y += opts.bold ? 20 : 16;
  }
  totalsRow('Subtotal', money(subtotal));
  totalsRow(`Contingency (${Number(workOrder.contingency_percent)}%)`, money(contingencyAmount));
  rule(doc, y - 4);
  totalsRow('Estimated Total', money(total), { bold: true });

  doc.y = y + 10;

  // --- Terms ---
  if (workOrder.terms) {
    sectionHeading(doc, 'Terms');
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
    doc.text(workOrder.terms, MARGIN, doc.y, { width: CONTENT_WIDTH });
  }

  // --- Signatures ---
  if (doc.y > 660) doc.addPage();
  const sigY = Math.max(doc.y + 40, 640);
  const sigColWidth = CONTENT_WIDTH / 2 - 15;
  const sigRightX = MARGIN + CONTENT_WIDTH / 2 + 15;

  doc.font('Helvetica').fontSize(10).fillColor(COLOR.text);
  doc.text('_______________________________', MARGIN, sigY, { width: sigColWidth });
  doc.text('_______________________________', sigRightX, sigY, { width: sigColWidth });
  doc.fontSize(9).fillColor(COLOR.muted);
  doc.text(`Authorized Signature — ${identity?.company_name || 'CFE'}`, MARGIN, sigY + 14, { width: sigColWidth });
  doc.text('Authorized Signature — Customer', sigRightX, sigY + 14, { width: sigColWidth });

  doc.text('_______________________________', MARGIN, sigY + 44, { width: sigColWidth });
  doc.text('_______________________________', sigRightX, sigY + 44, { width: sigColWidth });
  doc.text('Print Name / Date', MARGIN, sigY + 58, { width: sigColWidth });
  doc.text('Print Name / Date', sigRightX, sigY + 58, { width: sigColWidth });

  doc.end();
  return done;
}
