import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import dotenv from 'dotenv';
import axios from 'axios';
import { connectDB } from './db.js';
import Report from './models/Report.js';
import Visit from './models/Visit.js';
import Patient from './models/Patient.js';
import Lab from './models/Lab.js';
import Result from './models/Result.js';
import User from './models/User.js';
import Doctor from './models/Doctor.js';
import LabTest from './models/LabTest.js';
import TestMaster from './models/TestMaster.js';
import R2Service from './r2.js';
import generateReportHtml from './template/report.template.js';

dotenv.config();

/**
 * Launch Puppeteer browser instance dynamically depending on OS/environment
 */
async function getBrowser() {
  const isLocal = process.platform === 'win32';
  
  const launchArgs = {
    args: isLocal ? [] : chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (isLocal 
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' 
      : await chromium.executablePath()),
    headless: isLocal ? true : chromium.headless,
  };

  console.log(`[Puppeteer] Launching with executable path: ${launchArgs.executablePath}`);
  return await puppeteer.launch(launchArgs);
}

export async function generateReportPdf(visitId, labId, reportId) {
  let browser = null;
  try {
    // 1. Connect to DB
    await connectDB();

    console.log(`[Generator] Fetching data for Report: ${reportId}, Visit: ${visitId}, Lab: ${labId}`);

    // 2. Fetch Report
    const report = await Report.findById(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    // 3. Fetch Lab
    const lab = await Lab.findById(labId);
    if (!lab) {
      throw new Error(`Lab not found: ${labId}`);
    }

    // 4. Fetch Patient
    const patient = await Patient.findById(report.patientId);
    if (!patient) {
      throw new Error(`Patient not found: ${report.patientId}`);
    }

    // 5. Fetch Visit and populate Doctor
    const visit = await Visit.findById(visitId).populate('referredBy');
    if (!visit) {
      throw new Error(`Visit not found: ${visitId}`);
    }

    // 6. Fetch Results and populate TestMaster and ApprovedBy Pathologist
    const results = await Result.find({ visitId, isDeleted: { $ne: true } })
      .populate({
        path: 'testId',
        model: 'TestMaster'
      })
      .populate({
        path: 'approvedBy',
        model: 'User'
      });

    if (!results || results.length === 0) {
      throw new Error(`No results found for visit: ${visitId}`);
    }

    // Determine the pathologist who approved the results
    const pathologist = results.find(r => r.approvedBy)?.approvedBy;

    // 7. Fetch patient historical results for trend line charts
    // Get all approved visits for this patient
    const patientVisits = await Visit.find({ patientId: patient._id }).select('_id createdAt');
    const visitIds = patientVisits.map(v => v._id);
    const visitIdToDate = patientVisits.reduce((acc, v) => {
      acc[v._id.toString()] = v.createdAt;
      return acc;
    }, {});

    const historicalTrends = {};

    for (const res of results) {
      const testIdStr = res.testId?._id?.toString();
      if (!testIdStr) continue;

      // Find other approved results for the same testMaster across patient's visits
      const histResults = await Result.find({
        visitId: { $in: visitIds },
        testId: res.testId._id,
        isApproved: true,
        isDeleted: { $ne: true }
      }).populate('visitId').sort({ createdAt: 1 });

      const trendPoints = [];
      const primaryParamName = res.parameters[0]?.parameterName;

      for (const hr of histResults) {
        const paramVal = hr.parameters.find(p => p.parameterName === primaryParamName)?.value;
        const parsedVal = parseFloat(paramVal);

        if (!isNaN(parsedVal)) {
          const visitDate = hr.visitId?.createdAt || visitIdToDate[hr.visitId?.toString()] || hr.createdAt;
          const dateLabel = new Date(visitDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

          trendPoints.push({
            date: visitDate,
            value: parsedVal,
            dateLabel
          });
        }
      }

      // If we have at least 2 historical points, we include them for charting
      if (trendPoints.length >= 2) {
        // Keep the last 5 points to keep chart clean and relevant
        historicalTrends[testIdStr] = trendPoints.slice(-5);
      }
    }

    // 8. Generate HTML report string
    console.log('[Generator] Building report HTML layout...');
    const htmlContent = await generateReportHtml({
      report,
      patient,
      visit,
      lab,
      doctor: visit.referredBy,
      results,
      pathologist,
      historicalTrends
    });

    // 9. Generate PDF via Puppeteer
    console.log('[Generator] Launching Puppeteer...');
    browser = await getBrowser();
    const page = await browser.newPage();

    // Set page content
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Render to PDF
    console.log('[Generator] Rendering page to PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="height: 0px;"></div>',
      footerTemplate: `
        <div style="font-family: 'Outfit', sans-serif; font-size: 8px; color: #94a3b8; width: 100%; display: flex; justify-content: space-between; padding-left: 20mm; padding-right: 20mm;">
          <div>Powered by <strong>Pehlix</strong></div>
          <div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
        </div>
      `,
      margin: {
        top: '15mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      }
    });

    await browser.close();
    browser = null;

    // 10. Upload PDF buffer to Cloudflare R2
    const key = `labs/${labId}/reports/${report.reportCode}.pdf`;
    console.log(`[Generator] Uploading PDF buffer to R2: ${key}...`);
    await R2Service.uploadBuffer(key, pdfBuffer);

    // 11. Update MongoDB Report state
    console.log('[Generator] Updating report record status to generated...');
    report.pdfUrl = key;
    report.status = 'generated';
    report.generatedAt = new Date();
    await report.save();

    // 12. Send Callback to Main Application
    const mainAppCallback = `${process.env.NEXT_PUBLIC_APP_URL}/api/internal/pdf/generated`;
    console.log(`[Generator] Triggering callback back to main app: ${mainAppCallback}`);
    
    await axios.post(mainAppCallback, {
      reportId: report._id.toString(),
      pdfUrl: key,
      qrVerificationId: report.qrVerificationId
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.PDF_SERVICE_SECRET}`
      }
    });

    console.log('[Generator] PDF generation process complete!');
    return { success: true, key };

  } catch (error) {
    console.error('[Generator] Error in generateReportPdf:', error);
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        console.error('[Generator] Failed to close browser on error:', err);
      }
    }
    throw error;
  }
}
