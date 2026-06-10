import QRCode from 'qrcode';
import axios from 'axios';
import R2Service from '../r2.js';

// Helper to convert remote image URLs to base64 data URIs
export async function imageToBase64(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    const buffer = Buffer.from(response.data, 'binary');
    const contentType = response.headers['content-type'] || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error(`[Template] Failed to convert image to base64: ${url}`, error.message);
    return url; // fallback to original url
  }
}

// Helper to format dates
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Calculate the clinical trend direction and return appropriate badge
function getTrendDetails(history, normalLow, normalHigh) {
  if (history.length < 2) return null;
  const prev = history[history.length - 2].value;
  const curr = history[history.length - 1].value;

  if (isNaN(prev) || isNaN(curr)) return null;

  if (normalLow !== undefined && normalHigh !== undefined) {
    const prevDist = prev < normalLow ? (normalLow - prev) : (prev > normalHigh ? (prev - normalHigh) : 0);
    const currDist = curr < normalLow ? (normalLow - curr) : (curr > normalHigh ? (curr - normalHigh) : 0);
    
    if (currDist < prevDist) {
      return { status: 'improving', color: '#10b981', text: 'Improving (Returning to normal)' };
    } else if (currDist > prevDist) {
      return { status: 'worsening', color: '#ef4444', text: 'Worsening (Moving away from normal)' };
    } else {
      return { status: 'stable', color: '#64748b', text: 'Stable' };
    }
  }

  // Fallback to simple direction
  const diffPct = ((curr - prev) / (prev || 1)) * 100;
  if (Math.abs(diffPct) < 5) {
    return { status: 'stable', color: '#64748b', text: 'Stable' };
  } else {
    // Hemoglobin, thyroid hormones, etc. have different clinical directions,
    // so we just label it as Stable unless we can check reference ranges.
    return { status: 'stable', color: '#64748b', text: 'Stable' };
  }
}

// Phase 3.4 — Selects the most demographically specific reference range for a parameter.
function selectReferenceRange(paramTemplate, patientAge, patientAgeUnit, patientGender) {
  let ageInYears = parseFloat(patientAge) || 0;
  if (patientAgeUnit === 'months') ageInYears = ageInYears / 12;
  if (patientAgeUnit === 'days') ageInYears = ageInYears / 365.25;

  const defaultRange = {
    normalLow: paramTemplate.normalLow,
    normalHigh: paramTemplate.normalHigh,
    criticalLow: paramTemplate.criticalLow,
    criticalHigh: paramTemplate.criticalHigh,
    label: 'Standard'
  };

  if (!paramTemplate.referenceRanges || paramTemplate.referenceRanges.length === 0) {
    return defaultRange;
  }

  const gender = patientGender || 'other';

  const agematched = paramTemplate.referenceRanges.filter(r => {
    let rangeMinYears = parseFloat(r.ageMin) || 0;
    let rangeMaxYears = parseFloat(r.ageMax) ?? 150;
    const rUnit = r.ageUnit || 'years';
    if (rUnit === 'months') { rangeMinYears /= 12; rangeMaxYears /= 12; }
    if (rUnit === 'days') { rangeMinYears /= 365.25; rangeMaxYears /= 365.25; }
    return ageInYears >= rangeMinYears && ageInYears <= rangeMaxYears;
  });

  if (agematched.length === 0) return defaultRange;

  const genderSpecific = agematched.filter(r =>
    r.genderMatch && r.genderMatch.length > 0 &&
    !r.genderMatch.includes('any') &&
    r.genderMatch.includes(gender)
  );

  const best = genderSpecific.length > 0
    ? genderSpecific[0]
    : (agematched.find(r => !r.genderMatch || r.genderMatch.includes('any') || r.genderMatch.length === 0) || agematched[0]);

  return {
    normalLow: best.normalLow ?? defaultRange.normalLow,
    normalHigh: best.normalHigh ?? defaultRange.normalHigh,
    criticalLow: best.criticalLow ?? defaultRange.criticalLow,
    criticalHigh: best.criticalHigh ?? defaultRange.criticalHigh,
    label: best.label || 'Standard'
  };
}

// Generate inline SVG for the historical values trend
function generateTrendSvg(history) {
  const numericPoints = history
    .map(p => ({ date: new Date(p.date), value: parseFloat(p.value), label: p.dateLabel }))
    .filter(p => !isNaN(p.value));

  if (numericPoints.length < 2) return '';

  const width = 450;
  const height = 140;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const values = numericPoints.map(p => p.value);
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);

  // Buffer space
  if (minVal === maxVal) {
    minVal -= 10;
    maxVal += 10;
  } else {
    const range = maxVal - minVal;
    minVal -= range * 0.15;
    maxVal += range * 0.15;
  }

  const points = numericPoints.map((p, idx) => {
    const x = paddingLeft + (idx / (numericPoints.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((p.value - minVal) / (maxVal - minVal)) * chartHeight;
    return { ...p, x, y };
  });

  // SVG Line path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  // Grid lines (y-axis)
  const gridLinesCount = 3;
  let gridLines = '';
  for (let i = 0; i < gridLinesCount; i++) {
    const gridY = paddingTop + (i / (gridLinesCount - 1)) * chartHeight;
    const gridVal = maxVal - (i / (gridLinesCount - 1)) * (maxVal - minVal);
    gridLines += `
      <line x1="${paddingLeft}" y1="${gridY}" x2="${width - paddingRight}" y2="${gridY}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4" />
      <text x="${paddingLeft - 8}" y="${gridY + 3}" font-size="8" font-family="'Outfit', sans-serif" fill="#64748b" text-anchor="end">${gridVal.toFixed(1)}</text>
    `;
  }

  // Draw points, value labels, date labels
  let pointElements = '';
  points.forEach((p, idx) => {
    const isCurrent = idx === points.length - 1;
    pointElements += `
      <circle cx="${p.x}" cy="${p.y}" r="${isCurrent ? 6 : 4}" fill="${isCurrent ? '#2563eb' : '#64748b'}" stroke="#ffffff" stroke-width="1.5" />
      <text x="${p.x}" y="${p.y - 8}" font-size="9" font-family="'Outfit', sans-serif" font-weight="${isCurrent ? 'bold' : 'normal'}" fill="${isCurrent ? '#1e3a8a' : '#475569'}" text-anchor="middle">${p.value.toFixed(1)}</text>
      <text x="${p.x}" y="${height - 10}" font-size="8" font-family="'Outfit', sans-serif" fill="#64748b" text-anchor="middle">${p.label}</text>
    `;
  });

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #f8fafc; border-radius: 8px; margin-top: 10px; border: 1px solid #e2e8f0;">
      ${gridLines}
      <path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${pointElements}
    </svg>
  `;
}

export async function generateReportHtml(data) {
  const {
    report,
    patient,
    visit,
    lab,
    doctor,
    results,
    pathologist,
    historicalTrends = {}, // Format: { [testId]: [{ date: Date, value: number, dateLabel: string }] }
    noLetterhead = false
  } = data;

  // Convert URLs to Base64 to make Puppeteer independent of external network requests
  const logoBase64 = lab.logo && !noLetterhead ? await imageToBase64(lab.logo) : '';
  const reportHeaderBase64 = lab.reportHeader && !noLetterhead && lab.reportSettings?.backgroundMode === 'header_footer' ? await imageToBase64(lab.reportHeader) : '';
  const reportFooterBase64 = lab.reportFooter && !noLetterhead && lab.reportSettings?.backgroundMode === 'header_footer' ? await imageToBase64(lab.reportFooter) : '';
  
  let signatureBase64 = '';
  if (pathologist) {
    if (pathologist.signatureImageKey) {
      try {
        console.log(`[Template] Fetching signature from R2 key: ${pathologist.signatureImageKey}`);
        const signatureBuffer = await R2Service.getObjectBuffer(pathologist.signatureImageKey);
        signatureBase64 = `data:image/png;base64,${signatureBuffer.toString('base64')}`;
      } catch (err) {
        console.error('[Template] Failed to fetch signature from R2:', err.message);
        if (pathologist.signature) {
          signatureBase64 = await imageToBase64(pathologist.signature);
        }
      }
    } else if (pathologist.signature) {
      signatureBase64 = await imageToBase64(pathologist.signature);
    }
  }

  // Generate QR Code pointing to verification URL
  const verificationUrl = `https://verify.pehlix.in/r/${report.qrVerificationId}`;
  const qrCodeBase64 = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 120 });

  // NABL Status check
  const isNabl = !!(visit.isNabl || visit.nablRequired || lab.nablNumber);

  // Background images logic
  let bodyStyle = 'background-color: #ffffff;';
  if (!noLetterhead && lab.reportSettings) {
    if (lab.reportSettings.backgroundMode === 'full_page' && lab.reportSettings.fullBackgroundImage) {
      const fullBgBase64 = await imageToBase64(lab.reportSettings.fullBackgroundImage);
      bodyStyle += `background-image: url('${fullBgBase64}'); background-size: cover; background-position: center;`;
    }
  }

  // Group results by department
  const resultsByDept = {};
  results.forEach(res => {
    const dept = res.testId?.department || 'General Diagnostics';
    if (!resultsByDept[dept]) {
      resultsByDept[dept] = [];
    }
    resultsByDept[dept].push(res);
  });

  // Construct HTML
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Lab Report - ${report.reportCode}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      font-size: 11pt;
      line-height: 1.4;
      ${bodyStyle}
    }
    
    .report-wrapper {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px 40px;
    }

    /* Header Styling */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      border-bottom: 3px solid #1e3a8a;
      padding-bottom: 15px;
    }

    .header-logo-container {
      width: 25%;
      vertical-align: middle;
    }

    .header-logo {
      max-width: 130px;
      max-height: 80px;
      object-fit: contain;
    }

    .header-lab-info {
      width: 50%;
      text-align: center;
      vertical-align: middle;
    }

    .lab-name {
      font-size: 18pt;
      font-weight: 700;
      color: #1e3a8a;
      margin: 0 0 4px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .lab-address {
      font-size: 9pt;
      color: #475569;
      margin: 0;
      line-height: 1.3;
    }

    .lab-contact {
      font-size: 9pt;
      color: #0f172a;
      font-weight: 500;
      margin: 4px 0 0 0;
    }

    .header-qr-container {
      width: 25%;
      text-align: right;
      vertical-align: middle;
    }

    .qr-image {
      width: 85px;
      height: 85px;
      border: 1px solid #e2e8f0;
      padding: 2px;
      border-radius: 4px;
    }

    .qr-text {
      font-size: 7.5pt;
      color: #64748b;
      margin: 4px 0 0 0;
      text-align: right;
    }

    /* Patient Info Block */
    .patient-info-table {
      width: 100%;
      border-collapse: collapse;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 25px;
    }

    .patient-info-table td {
      padding: 10px 14px;
      font-size: 9.5pt;
      vertical-align: top;
      width: 50%;
    }

    .patient-info-table tr:first-child td {
      border-bottom: 1px solid #e2e8f0;
    }

    .patient-info-table td:first-child {
      border-right: 1px solid #e2e8f0;
    }

    .info-row {
      margin-bottom: 6px;
      display: flex;
    }
    
    .info-row:last-child {
      margin-bottom: 0;
    }

    .info-label {
      width: 140px;
      color: #64748b;
      font-weight: 500;
    }

    .info-value {
      color: #0f172a;
      font-weight: 600;
      flex: 1;
    }

    .nabl-badge {
      display: inline-block;
      background-color: #fee2e2;
      color: #991b1b;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      margin-left: 8px;
    }

    /* Result Tables */
    .department-section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }

    .department-title {
      font-size: 13pt;
      font-weight: 700;
      color: #1e3a8a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 6px;
      margin: 0 0 15px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .test-container {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .test-header {
      background-color: #f1f5f9;
      padding: 6px 12px;
      font-weight: 600;
      font-size: 10.5pt;
      color: #0f172a;
      border-left: 4px solid #2563eb;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }

    .results-table th {
      background-color: #ffffff;
      color: #475569;
      font-weight: 600;
      font-size: 9pt;
      text-align: left;
      padding: 8px 12px;
      border-bottom: 2px solid #cbd5e1;
      text-transform: uppercase;
    }

    .results-table td {
      padding: 10px 12px;
      font-size: 9.5pt;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    .results-table tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    .param-name {
      font-weight: 500;
      color: #0f172a;
      width: 35%;
    }

    .param-value {
      font-weight: 700;
      color: #0f172a;
      width: 20%;
    }

    .param-unit {
      color: #475569;
      font-size: 9pt;
      width: 15%;
    }

    .param-range {
      color: #475569;
      font-size: 9pt;
      width: 20%;
    }

    .param-flag {
      width: 10%;
      text-align: center;
    }

    /* Flags & Alert colors */
    .flag-indicator {
      display: inline-block;
      font-weight: 700;
      font-size: 10pt;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .flag-high {
      color: #ef4444; /* High */
    }

    .flag-low {
      color: #2563eb; /* Low */
    }

    .flag-critical {
      color: #ffffff;
      background-color: #b91c1c; /* Bold Critical */
      font-weight: 800;
      animation: pulse 2s infinite;
    }
    
    .value-critical {
      color: #b91c1c;
      font-weight: 800;
    }

    /* Trend Charts */
    .trend-chart-container {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-top: 15px;
      page-break-inside: avoid;
    }

    .trend-title {
      font-size: 10pt;
      font-weight: 600;
      color: #1e3a8a;
      margin: 0 0 10px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .trend-badge {
      font-size: 8pt;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 9999px;
      color: white;
      text-transform: uppercase;
    }

    /* Pathologist interpretation */
    .interpretation-container {
      margin-top: 25px;
      background-color: #fcfcfd;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #64748b;
      border-radius: 4px;
      padding: 12px 16px;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }

    .interpretation-title {
      font-weight: 600;
      color: #334155;
      margin-bottom: 6px;
      text-transform: uppercase;
      font-size: 9pt;
      letter-spacing: 0.5px;
    }

    .interpretation-text {
      color: #475569;
      white-space: pre-line;
      margin: 0;
    }

    /* Approver Signature Area */
    .approver-section-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 40px;
      border-top: 2px solid #cbd5e1;
      padding-top: 20px;
      page-break-inside: avoid;
    }

    .approver-details {
      width: 60%;
      vertical-align: top;
      padding-top: 15px;
      font-size: 9pt;
      color: #475569;
      line-height: 1.4;
    }

    .approver-name {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 2px;
    }

    .approver-signature {
      width: 40%;
      text-align: right;
      vertical-align: top;
      padding-top: 15px;
    }

    .signature-img {
      max-height: 60px;
      max-width: 160px;
      object-fit: contain;
    }

    .approval-timestamp {
      font-size: 8pt;
      color: #64748b;
      margin-top: 6px;
    }

    /* Disclaimer / Footer info */
    .disclaimer-text {
      font-size: 8pt;
      color: #64748b;
      text-align: justify;
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      line-height: 1.4;
    }

    .powered-by {
      font-size: 7.5pt;
      color: #94a3b8;
      text-align: center;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="report-wrapper">
    
    <!-- Phase 3.6 — Amended Report Banner -->
    ${report.isAmended ? `
      <div style="background-color: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; color: #b45309; font-size: 9.5pt; page-break-inside: avoid; display: block; font-family: 'Outfit', sans-serif;">
        <div style="font-weight: 700; font-size: 11pt; margin-bottom: 4px; text-transform: uppercase;">
          ⚠️ Amended Report (Version ${report.version})
        </div>
        <div style="line-height: 1.4;">
          This report has been amended to correct previous diagnostic values.
          <br/><strong>Amendment Reason:</strong> ${report.amendmentReason || 'Clinical review correction'}.
          <br/><strong>Amended On:</strong> ${formatDate(report.amendedAt || new Date())}
        </div>
      </div>
    ` : ''}

    ${noLetterhead || lab.reportSettings?.backgroundMode === 'full_page' ? '' : `
      ${reportHeaderBase64 ? `
        <!-- Custom Image Header -->
        <div style="width: 100%; margin-bottom: 10px;">
          <img src="${reportHeaderBase64}" style="width: 100%; height: auto; display: block;" alt="Lab Header" />
        </div>
      ` : `
        <!-- Default Textual Report Header -->
        <table class="header-table">
          <tr>
            <td class="header-logo-container">
              ${logoBase64 ? `<img src="${logoBase64}" class="header-logo" alt="Lab Logo" />` : ''}
            </td>
            <td class="header-lab-info">
              <h1 class="lab-name">${lab.name}</h1>
              <p class="lab-address">
                ${lab.address ? `${lab.address.street || ''}, ${lab.address.city || ''}, ${lab.address.state || ''} - ${lab.address.pincode || ''}` : ''}
              </p>
              <p class="lab-contact">
                Phone: ${lab.phone} ${lab.email ? `| Email: ${lab.email}` : ''}
                ${isNabl && lab.nablNumber ? `<br/><span style="color: #1e3a8a; font-weight: 600;">NABL Reg: ${lab.nablNumber}</span>` : ''}
              </p>
            </td>
            <td class="header-qr-container">
              <img src="${qrCodeBase64}" class="qr-image" alt="Verification QR Code" />
              <p class="qr-text">Scan to Verify Report</p>
            </td>
          </tr>
        </table>
      `}
    `}

    <!-- Patient and Visit Metadata -->
    <table class="patient-info-table">
      <tr>
        <td>
          <div class="info-row">
            <span class="info-label">Patient Name</span>
            <span class="info-value">
              ${patient.firstName} ${patient.lastName || ''}
              ${isNabl ? '<span class="nabl-badge">NABL</span>' : ''}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Age / Gender</span>
            <span class="info-value">${patient.age || 'N/A'} ${patient.ageUnit || 'years'} / ${patient.gender ? patient.gender.toUpperCase() : 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Patient Code</span>
            <span class="info-value">${patient.patientCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Referred By</span>
            <span class="info-value">${doctor ? `${doctor.name}${doctor.qualification ? `, ${doctor.qualification}` : ''}` : 'Self Referral'}</span>
          </div>
        </td>
        <td>
          <div class="info-row">
            <span class="info-label">Visit ID</span>
            <span class="info-value">${visit.visitCode}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Sample Collected</span>
            <span class="info-value">${formatDate(visit.createdAt)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Report Generated</span>
            <span class="info-value">${formatDate(report.generatedAt || new Date())}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value" style="color: #16a34a; text-transform: uppercase;">Final Report</span>
          </div>
        </td>
      </tr>
    </table>

    <!-- Diagnostics Results -->
    ${Object.keys(resultsByDept).map(dept => `
      <div class="department-section">
        <h2 class="department-title">${dept}</h2>
        
        ${resultsByDept[dept].map(res => {
          const testName = res.testId?.name || 'Diagnostic Test';
          const testCode = res.testId?.code ? res.testId.code.split('-')[0] : '';
          
          return `
            <div class="test-container">
              <div class="test-header">
                <span>${testName} (${testCode})</span>
                ${res.testId?.sampleType ? `<span style="font-size: 8.5pt; font-weight: normal; color: #475569;">Specimen: ${res.testId.sampleType}</span>` : ''}
              </div>

              <table class="results-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Result Value</th>
                    <th>Unit</th>
                    <th>Reference Interval</th>
                    <th style="text-align: center;">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  ${res.parameters.map(param => {
                    const isCrit = param.status === 'criticalLow' || param.status === 'criticalHigh';
                    const isHigh = param.status === 'high' || param.status === 'criticalHigh';
                    const isLow = param.status === 'low' || param.status === 'criticalLow';
                    
                    let flagHtml = '';
                    let valueClass = '';
                    
                    if (isCrit) {
                      flagHtml = `<span class="flag-indicator flag-critical">CRIT</span>`;
                      valueClass = 'value-critical';
                    } else if (isHigh) {
                      flagHtml = `<span class="flag-indicator flag-high">↑ High</span>`;
                    } else if (isLow) {
                      flagHtml = `<span class="flag-indicator flag-low">↓ Low</span>`;
                    } else {
                      flagHtml = `<span style="color: #10b981; font-weight: 600;">Normal</span>`;
                    }

                    // Reference range text
                    let refText = 'N/A';
                    let appliedLabel = '';
                    // Find parameter template range details
                    const paramTemplate = res.testId?.parameters?.find(p => p.name === param.parameterName);
                    if (paramTemplate) {
                      // Phase 3.4 — Select demographics-aware range on-the-fly
                      const range = selectReferenceRange(paramTemplate, patient.age, patient.ageUnit, patient.gender);
                      if (range.normalLow !== undefined && range.normalHigh !== undefined) {
                        refText = `${range.normalLow} - ${range.normalHigh}`;
                      } else if (range.normalLow !== undefined) {
                        refText = `> ${range.normalLow}`;
                      } else if (range.normalHigh !== undefined) {
                        refText = `< ${range.normalHigh}`;
                      }
                      if (range.label && range.label !== 'Standard') {
                        appliedLabel = `<br/><span style="font-size: 7.5pt; color: #64748b; font-weight: normal;">(${range.label})</span>`;
                      }
                    }

                    return `
                      <tr>
                        <td class="param-name">${param.parameterName}</td>
                        <td class="param-value ${valueClass}">${param.value}</td>
                        <td class="param-unit">${param.unit || paramTemplate?.unit || 'N/A'}</td>
                        <td class="param-range">${refText}</td>
                        <td class="param-flag">${flagHtml}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>

              <!-- Historical Trend Integration -->
              ${(() => {
                const history = historicalTrends[res.testId?._id?.toString() || ''];
                if (history && history.length >= 2) {
                  // Grab normal low / high for the first parameter of the test as a reference
                  const firstParam = res.testId?.parameters?.[0];
                  const trendInfo = getTrendDetails(history, firstParam?.normalLow, firstParam?.normalHigh);
                  
                  return `
                    <div class="trend-chart-container">
                      <div class="trend-title">
                        <span>Clinical Historical Trend (${res.parameters[0]?.parameterName || 'Primary Parameter'})</span>
                        ${trendInfo ? `<span class="trend-badge" style="background-color: ${trendInfo.color}">${trendInfo.text}</span>` : ''}
                      </div>
                      ${generateTrendSvg(history)}
                    </div>
                  `;
                }
                return '';
              })()}
            </div>
          `;
        }).join('')}
      </div>
    `).join('')}

    <!-- Pathologist interpretation notes -->
    ${report.pathologistNote ? `
      <div class="interpretation-container">
        <h3 class="interpretation-title">Pathologist Interpretation / Notes</h3>
        <p class="interpretation-text">${report.pathologistNote}</p>
      </div>
    ` : ''}

    <!-- Approvals & Signatures -->
    <table class="approver-section-table">
      <tr>
        <td class="approver-details">
          ${pathologist ? `
            <div class="approver-name">Approved By: ${pathologist.name}</div>
            <div>${pathologist.qualifications || pathologist.qualification || 'Consultant Pathologist'}</div>
            ${pathologist.registrationNumber ? `<div>Reg No: ${pathologist.registrationNumber}</div>` : ''}
          ` : `
            <div class="approver-name">Approved By: Chief Pathologist</div>
            <div>Consultant Pathologist</div>
          `}
          <div class="approval-timestamp">
            Approved On: ${formatDate(results[0]?.approvedAt || report.generatedAt || new Date())}
          </div>
        </td>
        <td class="approver-signature">
          ${signatureBase64 ? `
            <img src="${signatureBase64}" class="signature-img" alt="Pathologist Signature" /><br/>
          ` : ''}
          <span style="font-size: 8.5pt; color: #64748b; font-style: italic;">Digitally Signed</span>
        </td>
      </tr>
    </table>

    <!-- Legal Disclaimer -->
    <div class="disclaimer-text">
      <strong>Disclaimer:</strong> This report is to be interpreted by a registered medical practitioner only. 
      The results relate only to the sample received and tested. Diagnostic tests are subject to clinical correlation 
      and physiological variations. In case of any query or critical values, please contact the laboratory immediately. 
      This is a digitally verified report. You can scan the QR code at the top-right to verify its authenticity online.
    </div>

    <!-- Branding footer -->
    <div class="powered-by">
      Built for Indian Labs &bull; Powered by <strong>Pehlix</strong>
    </div>

  </div>
</body>
</html>
  `;

  return html;
}

export default generateReportHtml;
