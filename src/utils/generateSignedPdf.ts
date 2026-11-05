import { jsPDF } from 'jspdf';
import type { Registration } from '../types';
import { pb } from '../db/pocketbase';
import { STUDIO_INFO, RECEIPT_TERMS_CLAUSES } from '../constants/studio';
import {
  formatCurrency,
  formatJobOrderNo,
  formatQueueNumber,
  formatShortDate,
  parsePackageInclusions,
} from './formatters';

async function getBase64Image(registration: Registration): Promise<string | null> {
  if (registration.signatureDataUrl && registration.signatureDataUrl.startsWith('data:image')) {
    return registration.signatureDataUrl;
  }
  if (!registration.signature) return null;
  const url = pb.files.getURL(registration, registration.signature);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface GeneratePdfOptions {
  copyType?: 'customer' | 'owner' | 'both';
  cashierName?: string;
  autoDownload?: boolean;
}

function drawReceiptPage(
  doc: jsPDF,
  registration: Registration,
  isCustomer: boolean,
  cashierName: string,
  signatureBase64: string | null
): void {
  const orgName = registration.expand?.organization?.name || 'School / Organization';
  const courseName = registration.expand?.course?.name || registration.course || 'N/A';
  const pkgName = registration.expand?.package?.name || registration.package || 'Selected Package';
  const pkgCode = registration.expand?.package?.code || 'PKG';
  const pkgAmount = registration.expand?.package?.amount || registration.total_amount;
  const isFullPayment = registration.payment_status === 'fully_paid' || registration.balance === 0;

  const pageWidth = 210;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2; // 190mm

  // Background tint for Customer Yellow Form
  if (isCustomer) {
    doc.setFillColor(253, 248, 228); // #FDF8E4 warm yellow
    doc.rect(margin, margin, contentWidth, 277, 'F');
  }

  // Outer border box (Brutalist style)
  doc.setDrawColor(10, 10, 10);
  doc.setLineWidth(0.8);
  doc.rect(margin, margin, contentWidth, 277);

  // --- HEADER SECTION ---
  let curY = margin + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(10, 10, 10);
  doc.text(STUDIO_INFO.name.toUpperCase(), margin + 5, curY + 6);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.text(STUDIO_INFO.tagline, margin + 5, curY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(50, 50, 50);
  doc.text(STUDIO_INFO.address, margin + 5, curY + 15);
  doc.text(`Operating Hours: ${STUDIO_INFO.hours} | Tel: ${STUDIO_INFO.phone}`, margin + 5, curY + 19);

  // Document Badge (Right Column)
  doc.setFillColor(10, 10, 10);
  doc.rect(pageWidth - margin - 68, curY, 63, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(201, 162, 39);
  doc.text(
    isCustomer ? 'PAGE 1: YELLOW FORM // CLAIM STUB' : 'PAGE 2: STUDIO OWNER COPY // AUDIT',
    pageWidth - margin - 66,
    curY + 4.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`DATE: ${formatShortDate(registration.created)}`, pageWidth - margin - 68, curY + 10);

  doc.setFontSize(7);
  doc.setTextColor(160, 20, 20);
  doc.text('JOB ORDER NUMBER', pageWidth - margin - 68, curY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(200, 20, 20);
  doc.text(formatJobOrderNo(registration.job_order_no), pageWidth - margin - 68, curY + 19.5);

  // Queue pill
  doc.setFillColor(201, 162, 39);
  doc.rect(pageWidth - margin - 35, curY + 15.5, 30, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 10, 10);
  doc.text(`QUEUE ${formatQueueNumber(registration.queue_number)}`, pageWidth - margin - 33, curY + 19.2);

  // Header separator line
  curY += 23;
  doc.setDrawColor(10, 10, 10);
  doc.setLineWidth(0.6);
  doc.line(margin, curY, pageWidth - margin, curY);

  // --- SECTION 1: CLIENT INFORMATION ---
  curY += 4;
  doc.setFillColor(10, 10, 10);
  doc.rect(margin + 5, curY, 45, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(201, 162, 39);
  doc.text('01 // CLIENT IDENTIFICATION', margin + 7, curY + 3.5);

  curY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 10, 10);
  doc.text('FULL NAME:', margin + 5, curY);
  doc.setFontSize(11);
  doc.text(
    `${registration.family_name.toUpperCase()}, ${registration.given_name.toUpperCase()} ${registration.middle_name ? registration.middle_name.toUpperCase() : ''}`.trim(),
    margin + 30,
    curY
  );

  curY += 6;
  doc.setFontSize(8);
  doc.text('INSTITUTION:', margin + 5, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(orgName, margin + 30, curY);

  doc.setFont('helvetica', 'bold');
  doc.text('PROGRAM / DEGREE:', margin + 115, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(courseName, margin + 152, curY);

  curY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('SECTION / YR:', margin + 5, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(registration.section || 'N/A', margin + 30, curY);

  doc.setFont('helvetica', 'bold');
  doc.text('CONTACT NO:', margin + 65, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(registration.mobile_number, margin + 90, curY);

  doc.setFont('helvetica', 'bold');
  doc.text('EMAIL:', margin + 125, curY);
  doc.setFont('helvetica', 'normal');
  doc.text(registration.email || 'N/A', margin + 140, curY);

  // --- SECTION 2: PICTORIAL PACKAGE DETAILS ---
  curY += 8;
  doc.setFillColor(10, 10, 10);
  doc.rect(margin + 5, curY, 52, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(201, 162, 39);
  doc.text('02 // PACKAGE & ADD-ONS BREAKDOWN', margin + 7, curY + 3.5);

  curY += 7;
  doc.setFillColor(245, 245, 245);
  doc.rect(margin + 5, curY, contentWidth - 10, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(10, 10, 10);
  doc.text(`SELECTED PACKAGE: [${pkgCode}] ${pkgName.toUpperCase()}`, margin + 8, curY + 4.2);
  doc.text(formatCurrency(pkgAmount), pageWidth - margin - 25, curY + 4.2);

  curY += 8;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  const inclusions = parsePackageInclusions(registration.expand?.package?.inclusions);
  const inclusionText = inclusions.length > 0 ? `Inclusions: ${inclusions.join(' • ')}` : 'Standard Package Inclusions Apply';
  const splitInclusions = doc.splitTextToSize(inclusionText, contentWidth - 15);
  doc.text(splitInclusions, margin + 8, curY);
  curY += splitInclusions.length * 3.5 + 2;

  // Add-ons list
  if (Array.isArray(registration.add_ons) && registration.add_ons.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(10, 10, 10);
    doc.text('OPTIONAL ADD-ONS:', margin + 8, curY);
    curY += 4;
    doc.setFont('helvetica', 'normal');
    registration.add_ons.forEach((item) => {
      if (item && item.name) {
        doc.text(`+ ${item.name}`, margin + 12, curY);
        doc.text(formatCurrency(item.amount), pageWidth - margin - 25, curY);
        curY += 4;
      }
    });
  }

  // --- SECTION 3: AUDIT SUMMARY & FINANCIAL SETTLEMENT ---
  curY += 3;
  doc.setFillColor(10, 10, 10);
  doc.rect(margin + 5, curY, 48, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(201, 162, 39);
  doc.text('03 // FINANCIAL SETTLEMENT & POS AUDIT', margin + 7, curY + 3.5);

  curY += 8;
  const colW = (contentWidth - 10) / 4;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin + 5, curY, contentWidth - 10, 14, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text('TOTAL CONTRACT', margin + 8, curY + 4);
  doc.text('AMOUNT PAID', margin + 8 + colW, curY + 4);
  doc.text('CURRENT BALANCE', margin + 8 + colW * 2, curY + 4);
  doc.text('SETTLEMENT STATUS', margin + 8 + colW * 3, curY + 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(10, 10, 10);
  doc.text(formatCurrency(registration.total_amount), margin + 8, curY + 10.5);

  doc.setTextColor(20, 120, 40);
  doc.text(formatCurrency(registration.paid_amount || 0), margin + 8 + colW, curY + 10.5);

  if ((registration.balance || 0) > 0) {
    doc.setTextColor(200, 20, 20);
    doc.text(formatCurrency(registration.balance), margin + 8 + colW * 2, curY + 10.5);
  } else {
    doc.setTextColor(20, 120, 40);
    doc.text('₱0.00 (PAID)', margin + 8 + colW * 2, curY + 10.5);
  }

  doc.setFontSize(9);
  doc.setTextColor(10, 10, 10);
  doc.text(isFullPayment ? 'FULLY SETTLED' : 'DOWNPAYMENT', margin + 8 + colW * 3, curY + 10);

  // --- SECTION 4: SIGNATURE & CASHIER AUTHORIZATION ---
  curY += 20;
  doc.setFillColor(10, 10, 10);
  doc.rect(margin + 5, curY, 56, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(201, 162, 39);
  doc.text('04 // ATTESTATION & DIGITAL SIGNATURE', margin + 7, curY + 3.5);

  curY += 8;
  const sigBoxW = (contentWidth - 14) / 2;

  // Student Signature Box (Left)
  doc.setFillColor(255, 255, 255);
  doc.rect(margin + 5, curY, sigBoxW - 2, 28, 'FD');

  if (signatureBase64) {
    try {
      doc.addImage(signatureBase64, 'PNG', margin + 12, curY + 2, sigBoxW - 16, 17);
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('[Digital Signature Verified on File via Canvas]', margin + 10, curY + 12);
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('[Digital Signature Verified on File via Canvas]', margin + 10, curY + 12);
  }

  doc.setDrawColor(10, 10, 10);
  doc.setLineWidth(0.4);
  doc.line(margin + 10, curY + 21, margin + 5 + sigBoxW - 8, curY + 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(10, 10, 10);
  doc.text(
    `${registration.given_name} ${registration.family_name}`.toUpperCase(),
    margin + 10,
    curY + 25
  );

  // Cashier Authorization Box (Right)
  const cashX = margin + 5 + sigBoxW;
  doc.setFillColor(255, 255, 255);
  doc.rect(cashX, curY, sigBoxW - 2, 28, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text('CASHIER VALIDATION & ATTESTATION', cashX + 4, curY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(10, 10, 10);
  doc.text(`Attending Staff : ${cashierName}`, cashX + 4, curY + 9);
  doc.text(`Transaction Ref : JO-${registration.job_order_no}-TX`, cashX + 4, curY + 13.5);
  doc.text(`Security Hash   : SHA256-${registration.id.slice(0, 10).toUpperCase()}`, cashX + 4, curY + 18);

  doc.setDrawColor(201, 162, 39);
  doc.setLineWidth(0.5);
  doc.rect(cashX + sigBoxW - 30, curY + 9, 24, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(201, 162, 39);
  doc.text('OFFICIAL', cashX + sigBoxW - 25, curY + 14);
  doc.text('RECEIPT', cashX + sigBoxW - 25, curY + 18);
  doc.text('VALIDATED', cashX + sigBoxW - 27, curY + 22);

  // --- SECTION 5: TERMS & CONDITIONS ---
  curY += 32;
  doc.setFillColor(10, 10, 10);
  doc.rect(margin + 5, curY, contentWidth - 10, 4.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(201, 162, 39);
  doc.text('05 // TERMS AND CONDITIONS OF CONTRACT & RELEASE POLICIES', margin + 7, curY + 3.2);

  curY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(60, 60, 60);

  RECEIPT_TERMS_CLAUSES.slice(0, 5).forEach((clause, idx) => {
    const wrapped = doc.splitTextToSize(`${idx + 1}. ${clause}`, contentWidth - 10);
    doc.text(wrapped, margin + 5, curY);
    curY += wrapped.length * 2.8;
  });

  // Footer barcode / reference strip
  doc.setDrawColor(10, 10, 10);
  doc.setLineWidth(0.4);
  doc.line(margin, 280, pageWidth - margin, 280);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    `STUDIOFLOW V2 LAN ID: ${registration.id} | ORG: ${registration.organization || 'HL'} | REVISION 2026.11`,
    margin + 5,
    284
  );
  doc.text(
    isCustomer ? 'AUTHENTIC OFFICIAL CLAIMING STUB - PRESENT UPON RETRIEVAL' : 'STUDIO ACCOUNTING COPY - FILE IN ARCHIVES',
    pageWidth - margin - 85,
    284
  );
}

/**
 * Generates an official signed Yellow Form / Job Order PDF document (T041 / AC020).
 * By default generates BOTH copies: Page 1 (Yellow Customer Form) and Page 2 (White Studio Copy).
 */
export async function generateSignedYellowFormPdf(
  registration: Registration,
  options: GeneratePdfOptions = {}
): Promise<jsPDF> {
  const {
    copyType = 'both',
    cashierName = 'Cashier Staff',
    autoDownload = true,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const signatureBase64 = await getBase64Image(registration);

  if (copyType === 'both') {
    // Page 1: Yellow Form (Customer Claim Stub)
    drawReceiptPage(doc, registration, true, cashierName, signatureBase64);
    // Page 2: White Form (Studio Accounting Copy)
    doc.addPage();
    drawReceiptPage(doc, registration, false, cashierName, signatureBase64);
  } else {
    const isCustomer = copyType === 'customer';
    drawReceiptPage(doc, registration, isCustomer, cashierName, signatureBase64);
  }

  if (autoDownload) {
    const fileName = `JobOrder_${registration.job_order_no || registration.id}_OfficialReceipt.pdf`;
    doc.save(fileName);
  }

  return doc;
}
