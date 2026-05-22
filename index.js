import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateReportPdf } from './src/generator.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'pehlix-pdf-service',
    env: process.env.NODE_ENV || 'development'
  });
});

/**
 * POST /generate
 * Endpoint hit by QStash to trigger PDF report generation.
 * Protected by shared secret token.
 */
app.post('/generate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn('[Generate] Rejecting request: Authorization header missing.');
      return res.status(401).json({ error: 'Authorization header missing' });
    }
    
    const token = authHeader.replace('Bearer ', '').trim();
    if (token !== process.env.PDF_SERVICE_SECRET) {
      console.warn('[Generate] Rejecting request: Invalid credentials.');
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const { visitId, labId, reportId } = req.body;
    if (!visitId || !labId || !reportId) {
      console.warn('[Generate] Rejecting request: Missing body fields.', req.body);
      return res.status(400).json({ error: 'Missing required body fields: visitId, labId, reportId' });
    }

    console.log(`[Generate] Accepted PDF generation job. Report ID: ${reportId}`);
    
    // Synchronous execution for QStash retry support
    const result = await generateReportPdf(visitId, labId, reportId);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('[Generate] PDF Generation route failed:', error);
    return res.status(500).json({ 
      error: 'PDF generation failed internally', 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});
