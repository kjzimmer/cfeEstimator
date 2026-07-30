// Generates the customer-facing Work Order PDF. This module only ever
// receives line items from workOrderService.getLineItemsForPdf(), which
// does not select `cost` -- so there is no cost field in scope anywhere in
// this file to accidentally render. See docs/requirements/work-orders.md.
import PDFDocument from 'pdfkit';

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const MARGIN = 50;
const COLS = { name: MARGIN, qty: 300, unit: 350, rate: 410, amount: 470 };
const PAGE_WIDTH = 612; // US Letter, points

function money(n) {
  return CURRENCY.format(n);
}

function drawTableHeader(doc, y) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555');
  doc.text('Description', COLS.name, y, { width: COLS.qty - COLS.name - 10 });
  doc.text('Qty', COLS.qty, y, { width: COLS.unit - COLS.qty - 5 });
  doc.text('Unit', COLS.unit, y, { width: COLS.rate - COLS.unit - 5 });
  doc.text('Rate', COLS.rate, y, { width: COLS.amount - COLS.rate - 5, align: 'right' });
  doc.text('Amount', COLS.amount, y, { width: PAGE_WIDTH - MARGIN - COLS.amount, align: 'right' });
  doc.moveTo(MARGIN, y + 14).lineTo(PAGE_WIDTH - MARGIN, y + 14).strokeColor('#ccc').stroke();
}

export async function generateWorkOrderPdf({ identity, customer, project, workOrder, lineItems }) {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Header
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111');
  doc.text(identity?.company_name || 'Company Name Not Set', MARGIN, MARGIN);
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  const headerLines = [identity?.address, identity?.phone, identity?.email, identity?.website].filter(Boolean);
  if (headerLines.length) doc.text(headerLines.join('  ·  '));

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111');
  doc.text(`Work Order — ${project.name}`);
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  doc.text(`Revision ${workOrder.revision} · ${new Date(workOrder.finalized_at || Date.now()).toLocaleDateString()}`);

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Customer');
  doc.font('Helvetica').fontSize(10).fillColor('#333');
  doc.text(customer?.name || 'No customer on file');
  if (customer?.address) doc.text(customer.address);
  if (customer?.phone || customer?.email) {
    doc.text([customer.phone, customer.email].filter(Boolean).join('  ·  '));
  }
  const siteLocation = workOrder.site_location || customer?.address || '';
  if (siteLocation && siteLocation !== customer?.address) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('Site Location');
    doc.font('Helvetica').fontSize(10).text(siteLocation);
  }

  if (workOrder.scope_text) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Scope of Work');
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(workOrder.scope_text, { width: PAGE_WIDTH - MARGIN * 2 });
  }

  doc.moveDown(1);
  let y = doc.y;
  drawTableHeader(doc, y);
  y += 20;

  doc.font('Helvetica').fontSize(10).fillColor('#333');
  for (const li of lineItems) {
    if (y > 700) {
      doc.addPage();
      y = MARGIN;
      drawTableHeader(doc, y);
      y += 20;
    }
    doc.text(li.name, COLS.name, y, { width: COLS.qty - COLS.name - 10 });
    doc.text(String(li.qty), COLS.qty, y, { width: COLS.unit - COLS.qty - 5 });
    doc.text(li.unit || '', COLS.unit, y, { width: COLS.rate - COLS.unit - 5 });
    doc.text(money(li.rate), COLS.rate, y, { width: COLS.amount - COLS.rate - 5, align: 'right' });
    doc.text(money(li.amount), COLS.amount, y, { width: PAGE_WIDTH - MARGIN - COLS.amount, align: 'right' });
    y += 18;
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const contingencyAmount = subtotal * (Number(workOrder.contingency_percent) / 100);
  const total = subtotal + contingencyAmount;

  y += 8;
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor('#ccc').stroke();
  y += 10;

  function totalsRow(label, value, opts = {}) {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111');
    doc.text(label, COLS.rate - 100, y, { width: 90, align: 'right' });
    doc.text(value, COLS.amount, y, { width: PAGE_WIDTH - MARGIN - COLS.amount, align: 'right' });
    y += 16;
  }
  totalsRow('Subtotal', money(subtotal));
  totalsRow(`Contingency (${Number(workOrder.contingency_percent)}%)`, money(contingencyAmount));
  totalsRow('Total', money(total), { bold: true });

  if (workOrder.terms) {
    doc.y = y + 20;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Terms');
    doc.font('Helvetica').fontSize(9).fillColor('#333').text(workOrder.terms, { width: PAGE_WIDTH - MARGIN * 2 });
  }

  doc.moveDown(3);
  const sigY = Math.max(doc.y, 620);
  doc.font('Helvetica').fontSize(10).fillColor('#111');
  doc.text('Customer Signature: _______________________________', MARGIN, sigY);
  doc.text('Date: ______________', 380, sigY);
  doc.text('CFE Representative: _______________________________', MARGIN, sigY + 40);
  doc.text('Date: ______________', 380, sigY + 40);

  doc.end();
  return done;
}
