// Shared PDF generation helpers
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const BRAND_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif; color: #1A1A1A; padding: 40px; }
  .brand { font-size: 28px; font-weight: 900; letter-spacing: 6px; color: #123524; }
  .tag { font-size: 10px; letter-spacing: 3px; color: #5C6159; margin-top: 2px; }
  .h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .pill { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 1px; }
  .paid { background: #DFF3EA; color: #2D7A5C; }
  .pending { background: #FFF4D9; color: #F2A900; }
  .k { font-size: 10px; letter-spacing: 2px; color: #5C6159; font-weight: 700; }
  .v { font-size: 14px; font-weight: 600; color: #1A1A1A; }
  .divider { height: 1px; background: #EAE7E0; margin: 16px 0; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; }
  .big-total { background: #123524; color: #fff; padding: 16px; border-radius: 14px; display: flex; justify-content: space-between; }
  .total-lbl { color: rgba(255,255,255,0.7); font-size: 11px; letter-spacing: 2px; font-weight: 700; }
  .total-val { color: #fff; font-size: 22px; font-weight: 800; }
  .med { padding: 10px 0; border-bottom: 1px solid #EAE7E0; }
  .med-name { font-weight: 700; font-size: 15px; }
  .med-meta { color: #5C6159; font-size: 12px; margin-top: 2px; }
  .sig { color: #2D7A5C; font-size: 11px; font-weight: 700; margin-top: 8px; }
`;

export function prescriptionHtml(rx: any) {
  const meds = (rx.medications || [])
    .map(
      (m: any, i: number) =>
        `<div class="med"><div class="med-name">${i + 1}. ${escapeHtml(
          m.name,
        )}</div><div class="med-meta">${[
          m.dosage,
          m.frequency,
          m.duration,
        ]
          .filter(Boolean)
          .map(escapeHtml)
          .join(' · ')}</div></div>`,
    )
    .join('');
  return `<!doctype html><html><head><style>${BRAND_CSS}</style></head><body>
    <div class="h">
      <div><div class="brand">NURTIX</div><div class="tag">E-PRESCRIPTION</div></div>
      <div class="k">Rx #${rx.id.slice(0, 8).toUpperCase()}</div>
    </div>
    <div class="row"><div><div class="k">PATIENT</div><div class="v">${escapeHtml(rx.patient_name)}</div></div>
    <div><div class="k">DATE</div><div class="v">${new Date(rx.created_at).toLocaleDateString()}</div></div></div>
    <div class="divider"></div>
    <div class="k">DIAGNOSIS</div>
    <div style="font-size:17px;font-weight:700;margin-top:6px;">${escapeHtml(rx.diagnosis)}</div>
    <div class="divider"></div>
    <div class="k">MEDICATIONS</div>
    ${meds}
    ${rx.notes ? `<div class="divider"></div><div class="k">NOTES</div><div style="margin-top:6px;line-height:1.6;">${escapeHtml(rx.notes)}</div>` : ''}
    <div class="divider"></div>
    <div class="k">PRESCRIBED BY</div>
    <div class="v" style="font-size:16px;margin-top:4px;">${escapeHtml(rx.doctor_name)}</div>
    <div class="sig">✓ Digitally signed · NURTIX verified doctor</div>
  </body></html>`;
}

export function invoiceHtml(inv: any) {
  const paid = inv.status === 'paid';
  return `<!doctype html><html><head><style>${BRAND_CSS}</style></head><body>
    <div class="h">
      <div><div class="brand">NURTIX</div><div class="tag">HOME HEALTHCARE · E-INVOICE</div></div>
      <span class="pill ${paid ? 'paid' : 'pending'}">${(inv.status || '').toUpperCase()}</span>
    </div>
    <div class="row">
      <div><div class="k">INVOICE</div><div class="v">#${inv.id.slice(0, 8).toUpperCase()}</div></div>
      <div><div class="k">DATE</div><div class="v">${new Date(inv.issued_at).toLocaleDateString()}</div></div>
    </div>
    <div class="divider"></div>
    <div class="row"><span>Billed to</span><span class="v">${escapeHtml(inv.patient_name)}</span></div>
    <div class="row"><span>Doctor</span><span class="v">${escapeHtml(inv.doctor_name)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>Consultation fee</span><span class="v">₹${inv.consultation_fee}</span></div>
    <div class="row"><span>Service charge (5%)</span><span class="v">₹${inv.service_charge}</span></div>
    <div class="row"><span>Tax (GST 18%)</span><span class="v">₹${inv.tax}</span></div>
    <div class="divider"></div>
    <div class="big-total"><span class="total-lbl">TOTAL ${paid ? 'PAID' : 'DUE'}</span><span class="total-val">₹${inv.total.toLocaleString()}</span></div>
    <p style="text-align:center;margin-top:30px;color:#5C6159;font-size:13px;">Thank you for choosing NURTIX. · support@nurtix.com</p>
  </body></html>`;
}

function escapeHtml(s: any) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sharePdf(html: string, filename: string) {
  if (Platform.OS === 'web') {
    // fallback: open a print dialog with the html
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      UTI: 'com.adobe.pdf',
      mimeType: 'application/pdf',
      dialogTitle: filename,
    });
  }
}
