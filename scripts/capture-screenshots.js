#!/usr/bin/env node

/**
 * Automated screenshot capture for codesession-cli dashboard
 *
 * Usage:
 *   node scripts/capture-screenshots.js [port]
 *
 * Prerequisites:
 *   npm install --save-dev puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DASHBOARD_PORT = process.argv[2] || 3737;
const BASE_URL = `http://localhost:${DASHBOARD_PORT}`;
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function captureScreenshots() {
  console.log('🚀 Starting screenshot capture...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 2, // Retina quality
    }
  });

  try {
    const page = await browser.newPage();

    // Wait for network to be idle
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    // ========================================
    // 1. Dashboard Overview
    // ========================================
    console.log('📸 Capturing dashboard overview...');
    await page.goto(`${BASE_URL}`, { waitUntil: 'networkidle0' });

    // Wait for charts to render
    await page.waitForSelector('.card', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Extra wait for charts

    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'dashboard-overview.png'),
      fullPage: true,
    });
    console.log('  ✓ Saved dashboard-overview.png');

    // ========================================
    // 2. Session Detail View
    // ========================================
    console.log('\n📸 Capturing session detail...');

    // Navigate to sessions page first
    await page.goto(`${BASE_URL}/sessions`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Click on the first session (most recent)
    const firstSessionRow = await page.$('table tbody tr');
    if (firstSessionRow) {
      await firstSessionRow.click();
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for timeline

      await page.screenshot({
        path: path.join(OUTPUT_DIR, 'session-detail.png'),
        fullPage: true,
      });
      console.log('  ✓ Saved session-detail.png');
    } else {
      console.log('  ⚠ No sessions found - skipping session-detail.png');
    }

    // ========================================
    // 3. AI Usage with Agent Tracking (Zoomed)
    // ========================================
    console.log('\n📸 Capturing agent tracking table...');

    // Still on session detail page
    const aiUsageTable = await page.$('table'); // Find AI usage table
    if (aiUsageTable) {
      // Scroll to the AI usage section
      await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('h2, h3'));
        const aiHeader = headers.find(h => h.textContent.includes('AI Usage'));
        if (aiHeader) {
          aiHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Take screenshot of just the AI usage section
      const aiSection = await page.$('table');
      if (aiSection) {
        await aiSection.screenshot({
          path: path.join(OUTPUT_DIR, 'agent-tracking.png'),
        });
        console.log('  ✓ Saved agent-tracking.png');
      }
    } else {
      console.log('  ⚠ No AI usage table found - skipping agent-tracking.png');
    }

    // ========================================
    // 4. Cost Charts & Analytics (Models page)
    // ========================================
    console.log('\n📸 Capturing cost charts...');

    await page.goto(`${BASE_URL}/models`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.card', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for charts

    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'cost-charts.png'),
      fullPage: true,
    });
    console.log('  ✓ Saved cost-charts.png');

    // ========================================
    // Optional: Insights Page
    // ========================================
    console.log('\n📸 Capturing insights page...');

    await page.goto(`${BASE_URL}/insights`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.card', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'insights.png'),
      fullPage: true,
    });
    console.log('  ✓ Saved insights.png');

    console.log('\n✅ All screenshots captured successfully!');
    console.log(`📁 Location: ${OUTPUT_DIR}`);

  } catch (error) {
    console.error('\n❌ Error capturing screenshots:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Main execution
(async () => {
  try {
    console.log(`🌐 Dashboard URL: ${BASE_URL}`);
    console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);

    await captureScreenshots();

    console.log('\n📝 Next steps:');
    console.log('  1. Review screenshots in docs/screenshots/');
    console.log('  2. Commit: git add docs/screenshots/ && git commit -m "Add dashboard screenshots"');
    console.log('  3. Push: git push origin main');

  } catch (error) {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  }
})();
