# Screenshot Automation Scripts

Automated screenshot capture for the codesession-cli dashboard.

## Quick Start

### 1. Install Dependencies

```bash
cd C:\Users\Nesh\Desktop\projects\devsession
npm install
```

This installs Puppeteer (headless Chrome) for automated screenshot capture.

### 2. Setup Demo Data

Create sample sessions with agent tracking to showcase the dashboard:

**Windows:**
```bash
npm run screenshots:setup
# Or directly:
scripts\setup-demo-data.bat
```

**Mac/Linux:**
```bash
npm run screenshots:setup
# Or directly:
bash scripts/setup-demo-data.sh
```

This creates:
- 4 completed sessions with varying costs
- 1 active session
- Multiple AI calls with different agents (Bug Fixer, Test Writer, Research Agent, etc.)
- Total ~$0.75 in mock costs

### 3. Start Dashboard

In a separate terminal:

```bash
cs dashboard --no-open
```

Wait for the message: `codesession dashboard -> http://localhost:3737`

### 4. Capture Screenshots

Back in your main terminal:

```bash
npm run screenshots
```

This will:
- Launch headless Chrome
- Navigate through the dashboard pages
- Capture full-page screenshots
- Save to `docs/screenshots/`:
  - `dashboard-overview.png` - Overview page with KPIs and charts
  - `session-detail.png` - Session detail with timeline
  - `agent-tracking.png` - AI usage table showing agent names
  - `cost-charts.png` - Models page with cost breakdown
  - `insights.png` - Insights page (bonus)

### 5. Review & Commit

```bash
# Check the screenshots
start docs\screenshots  # Windows
# Or: open docs/screenshots  # Mac

# Commit if they look good
git add docs/screenshots/
git commit -m "Add dashboard screenshots"
git push origin main
```

## Troubleshooting

### Dashboard not responding
- Make sure `cs dashboard --no-open` is running
- Check that port 3737 is not in use: `netstat -ano | findstr :3737`

### No sessions found
- Run `npm run screenshots:setup` again to create demo data
- Verify with: `cs list`

### Puppeteer installation issues
```bash
# Windows: May need to install dependencies
npm install puppeteer --force

# Linux: Install Chrome dependencies
sudo apt-get install -y libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0
```

### Screenshots too large
Edit `scripts/capture-screenshots.js` and change:
```javascript
deviceScaleFactor: 1, // Was 2 for Retina
```

### Custom port
If your dashboard is on a different port:
```bash
node scripts/capture-screenshots.js 4000  # For port 4000
```

## Manual Cleanup

Remove demo data after screenshots:
```bash
# End active session
cs end -n "Demo complete"

# Or remove specific sessions
cs list  # Get session IDs
# Then manually delete from ~/.codesession/sessions.db if needed
```

## Script Details

### capture-screenshots.js
- Uses Puppeteer to automate Chrome
- Captures full-page screenshots (scrolls automatically)
- Waits for charts/content to load
- High-quality 2x resolution (Retina)
- Saves to `docs/screenshots/`

### setup-demo-data.sh / .bat
- Creates 5 sample sessions
- Varies costs ($0.01 - $0.52)
- Uses different agents
- Includes notes and annotations
- Leaves one session active

## Customization

### Change Screenshot Size

Edit `capture-screenshots.js`:
```javascript
defaultViewport: {
  width: 1920,  // Was 1600
  height: 1080, // Was 1000
  deviceScaleFactor: 2,
}
```

### Add More Screenshots

In `capture-screenshots.js`, add:
```javascript
// Custom screenshot
await page.goto(`${BASE_URL}/your-page`);
await page.screenshot({
  path: path.join(OUTPUT_DIR, 'your-screenshot.png'),
  fullPage: true,
});
```

### Modify Demo Data

Edit `setup-demo-data.sh` or `.bat` to:
- Change session names
- Adjust costs (modify token counts)
- Add different agents
- Include more notes

## CI/CD Integration

For automated screenshot updates on releases:

```yaml
# .github/workflows/screenshots.yml
name: Update Screenshots
on:
  release:
    types: [published]

jobs:
  screenshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run screenshots:setup
      - run: cs dashboard --no-open &
      - run: sleep 5
      - run: npm run screenshots
      - run: git add docs/screenshots/
      - run: git commit -m "Update screenshots for ${{ github.event.release.tag_name }}"
      - run: git push
```
