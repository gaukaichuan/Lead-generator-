const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });

// Colors
const PRIMARY = '2563EB';
const SECONDARY = '6366F1';
const DARK = '1E293B';
const ACCENT = '10B981';
const AMBER = 'F59E0B';
const RED = 'EF4444';
const WHITE = 'FFFFFF';
const GRAY = '64748B';
const LIGHT_BG = 'F8FAFC';

// Helper: Title Slide
function addTitleSlide(title, subtitle) {
  const slide = pptx.addSlide();
  slide.background = { fill: DARK };
  slide.addText(title, {
    x: 1, y: 2, w: 11.33, h: 2,
    fontSize: 40, color: WHITE, bold: true, align: 'center',
    fontFace: 'Segoe UI',
    shadow: { type: 'outer', color: '000000', blur: 10, angle: 90, distance: 3 }
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 1, y: 4, w: 11.33, h: 1,
      fontSize: 18, color: '94A3B8', align: 'center',
      fontFace: 'Segoe UI'
    });
  }
  // Accent line
  slide.addShape(pptx.ShapeType.rect, {
    x: 4.5, y: 4.8, w: 4.33, h: 0.05,
    fill: { color: PRIMARY, type: 'solid' }
  });
  return slide;
}

// Helper: Content Slide
function addContentSlide(title, items, options = {}) {
  const slide = pptx.addSlide();
  slide.background = { fill: WHITE };
  // Top accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 13.33, h: 0.12,
    fill: { color: PRIMARY, type: 'solid' }
  });
  // Title
  slide.addText(title, {
    x: 0.7, y: 0.5, w: 11.93, h: 0.8,
    fontSize: 28, color: DARK, bold: true,
    fontFace: 'Segoe UI'
  });
  // Items
  if (options.type === 'table') {
    slide.addTable(items, {
      x: 0.7, y: 1.5, w: 11.93,
      fontSize: 12, color: DARK,
      fontFace: 'Segoe UI',
      border: { pt: 0.5, color: 'E2E8F0' },
      rowH: 0.5,
      autoPage: true,
      autoPageBreak: true,
      colW: options.colWidths || [3, 3, 5.93],
      headerRow: true,
      fillHeader: { color: PRIMARY },
      colorHeader: WHITE,
      boldHeader: true,
      valign: 'middle'
    });
  } else {
    const startY = options.startY || 1.5;
    items.forEach((item, i) => {
      const y = startY + (i * (item.bullet ? 0.55 : 0.45));
      if (item.type === 'heading') {
        slide.addText(item.text, {
          x: 0.7, y: y, w: 11.93, h: 0.5,
          fontSize: item.size || 16, color: item.color || DARK, bold: true,
          fontFace: 'Segoe UI'
        });
      } else if (item.type === 'bullet') {
        slide.addText(item.text, {
          x: 1.1, y: y, w: 11.53, h: 0.5,
          fontSize: item.size || 13, color: GRAY,
          fontFace: 'Segoe UI',
          bullet: { type: 'number', style: 'circle', color: PRIMARY },
          paraSpaceBefore: 4
        });
      } else if (item.type === 'subbullet') {
        slide.addText(item.text, {
          x: 1.7, y: y, w: 10.93, h: 0.5,
          fontSize: item.size || 12, color: '94A3B8',
          fontFace: 'Segoe UI',
          bullet: { type: 'bullet', style: 'dot', color: ACCENT },
          paraSpaceBefore: 2
        });
      } else if (item.type === 'text') {
        slide.addText(item.text, {
          x: item.x || 0.7, y: y, w: item.w || 11.93, h: item.h || 0.5,
          fontSize: item.size || 13, color: item.color || GRAY,
          fontFace: 'Segoe UI', bold: item.bold, align: item.align
        });
      }
    });
  }
  return slide;
}

// Slide 1: Title
addTitleSlide('Sales Lead Generator AI', 'Proposal — Lead Sources, Limitations & Scaling Strategy');

// Slide 2: Current Obstacle
addContentSlide('Current Obstacle: Google Maps API Limitation', [
  { type: 'heading', text: 'The Challenge', color: RED },
  { type: 'bullet', text: 'Google Places API has a hard cap of 60 results per search' },
  { type: 'subbullet', text: 'Each page returns max 20 results' },
  { type: 'subbullet', text: 'API allows only 3 pages via nextPageToken (20 × 3 = 60)' },
  { type: 'text', text: 'No subscription or paid tier can increase this limit', size: 13, color: AMBER, bold: true },
  { type: 'heading', text: 'Workarounds Within Google Maps', color: PRIMARY },
  { type: 'bullet', text: 'Change the search query (e.g., "retail shops" → "hardware stores")' },
  { type: 'bullet', text: 'Change the location / radius' },
  { type: 'bullet', text: 'Narrow the category search' },
], { startY: 1.6 });

// Slide 3: Strategy - Don't Depend Solely on Google Maps
addContentSlide('Strategy: Diversify Lead Sources', [
  { type: 'text', text: 'To scale beyond the 60-result ceiling, we integrate multiple data sources:', size: 15, color: DARK, bold: true },
  { type: 'bullet', text: 'Google Maps (Google Places API) — Local businesses with contact info' },
  { type: 'bullet', text: 'OutScraper — Google Maps at scale, pay-per-use, API access' },
  { type: 'bullet', text: 'D7 Lead Finder — 1,200+ leads per search, social signals included' },
  { type: 'bullet', text: 'Social Media APIs — Facebook, Instagram, LinkedIn, Twitter/X, YouTube' },
  { type: 'heading', text: 'Why Diversify?', color: PRIMARY },
  { type: 'bullet', text: 'Higher lead volume without hitting per-source caps' },
  { type: 'bullet', text: 'Richer lead profiles (social links, email providers, ad status)' },
  { type: 'bullet', text: 'Cross-platform deduplication for better data quality' },
], { startY: 1.4 });

// Slide 4: Lead Scraper Comparison
addContentSlide('Lead Scraper Comparison', [
  [{ text: 'Feature', bold: true, color: WHITE }, { text: 'OutScraper', bold: true, color: WHITE }, { text: 'D7 Lead Finder', bold: true, color: WHITE }],
  [{ text: 'Max per Search', bold: true }, 'Unlimited', '~1,200 leads'],
  ['Pricing', '$3 / 1,000 records (free 500)', '$44.99–$119.99/month'],
  ['API Access', 'Included (Medium+)', 'Available'],
  ['Data Depth', 'Google Maps only', 'Maps + Social Signals'],
  ['Best For', 'Google Maps at scale, pay-as-you-go', 'High volume + social enrichment'],
], { type: 'table', colWidths: [3.5, 4, 4.43] });

// Slide 5: OutScraper Pricing Detail
addContentSlide('OutScraper Pricing Details', [
  [{ text: 'Tier', bold: true, color: WHITE }, { text: 'Price', bold: true, color: WHITE }, { text: 'Details', bold: true, color: WHITE }],
  ['Free', '$0', 'First 500 businesses'],
  ['Medium Tier', '$3 / 1,000 records', 'Up to 100k records. API access included.'],
  ['Business Tier', '$1 / 1,000 records', 'After 100k records. No hard cap.'],
], { type: 'table', colWidths: [2.5, 3.5, 5.93] });

// Slide 6: D7 Lead Finder Pricing Detail
addContentSlide('D7 Lead Finder Pricing Details', [
  [{ text: 'Tier', bold: true, color: WHITE }, { text: 'Price', bold: true, color: WHITE }, { text: 'Details', bold: true, color: WHITE }],
  ['Starter', '$44.99/month', '~3,500 daily leads • 10 daily searches'],
  ['Agency', '$54.99/month', '~10,000 daily leads • 30 daily searches\n• Detect FB/Google Pixel\n• Business Ranking\n• IG following/likes data\n• Website scan data'],
  ['Professional', '$119.99/month', '~30,000 daily leads • 100 daily searches\n• All Agency features\n• 5 sub-accounts\n• Bulk search\n• Main category for business'],
], { type: 'table', colWidths: [2.5, 3.5, 5.93] });

// Slide 7: Social Media Lead Sources
addContentSlide('Social Media as Lead Sources', [
  [{ text: 'Platform', bold: true, color: WHITE }, { text: 'What You Get', bold: true, color: WHITE }, { text: 'Difficulty / Cost', bold: true, color: WHITE }],
  ['LinkedIn', 'Company search by industry/region via Sales Navigator API\n• Limited profile data\n• Contact info not directly available', 'HIGH — Expensive API, requires enterprise access'],
  ['Facebook Pages', 'Public business page info (name, category, phone, website, hours) via Graph API\n• No personal contact info', 'MEDIUM — API available, mostly free'],
  ['Instagram', 'Business profiles via Graph API (name, website, phone, category)\n• Similar to Facebook', 'MEDIUM — Same as Facebook'],
  ['Twitter / X', 'Public business profiles, followers, tweets\n• Limited contact info', 'MEDIUM — Free tier but very limited'],
  ['YouTube', 'Channel info, contact emails sometimes in "about" section', 'LOW-MEDIUM — Scraping or Data API'],
], { type: 'table', colWidths: [2.2, 5, 3.73] });

// Slide 8: Social Media API Pricing
addContentSlide('Social Media API Pricing', [
  [{ text: 'Platform', bold: true, color: WHITE }, { text: 'Cost', bold: true, color: WHITE }],
  ['Facebook / Instagram', 'Free (business page data)'],
  ['LinkedIn Sales Navigator', '~$99–$149 / month'],
  ['YouTube Data API', 'Free (within quotas)'],
], { type: 'table', colWidths: [5, 6.93] });

// Slide 9: Recommended Approach
addContentSlide('Recommended Approach', [
  { type: 'heading', text: 'Phase 1: Maximize Google Maps + OutScraper', color: PRIMARY },
  { type: 'bullet', text: 'Increase Google Maps search cap to 60 (already done)' },
  { type: 'bullet', text: 'Deduplicate results to avoid re-importing same leads (already done)' },
  { type: 'bullet', text: 'Integrate OutScraper API for higher-volume Google Maps extraction' },
  { type: 'heading', text: 'Phase 2: Add D7 Lead Finder', color: PRIMARY },
  { type: 'bullet', text: '1,200 leads per search — massive volume increase' },
  { type: 'bullet', text: 'Social signals included (FB/IG following, ad status, email provider)' },
  { type: 'heading', text: 'Phase 3: Social Media Integration', color: PRIMARY },
  { type: 'bullet', text: 'Start with Facebook/Instagram Graph API (free)' },
  { type: 'bullet', text: 'Add LinkedIn Sales Navigator for B2B leads if needed' },
  { type: 'heading', text: 'Phase 4: Cross-Platform Deduplication', color: PRIMARY },
  { type: 'bullet', text: 'Unify leads from all sources, deduplicate by email/phone/company' },
  { type: 'bullet', text: 'Single source of truth in the CRM' },
], { startY: 0.6 });

// Slide 10: Closing
addTitleSlide('Thank You', 'Questions & Discussion');

// Save
const outputPath = path.join(__dirname, 'Sales_Lead_Generator_Proposal.pptx');
pptx.writeFile({ fileName: outputPath }).then(() => {
  console.log('PPT saved to:', outputPath);
}).catch(err => console.error(err));
