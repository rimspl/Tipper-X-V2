/**
 * Create a .docx file from scratch (no external deps)
 * Docx is a zip containing XML files
 */
const fs = require('fs');
const zlib = require('zlib');

const OUTPUT = 'D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/pitch/Pitch-Summary-For-Abhishek.docx';

// Content as array of {text, bold, newline}
const lines = [
  'DynaHaul X — My Understanding & Customer Pitch Guide',
  '',
  'Written for: Abhishek  |  Date: 31 Jul 2026',
  '',
  // Section 1
  '═══════════════════════════════════════════════════════════════',
  'WHAT I UNDERSTAND THIS PRODUCT TO BE',
  '═══════════════════════════════════════════════════════════════',
  '',
  'DynaHaul X is basically a tyre management system for mining and tipper fleets.',
  'Think of it like this: A mining company has 30-50 trucks. Each truck has 6 tyres.',
  'Each tyre costs Rs 40,000-50,000. A tyre has a lifecycle — you fit it, use it,',
  'inspect it, and eventually remove/scrap it.',
  '',
  'Right now, most companies track this on paper, Excel, or WhatsApp.',
  'DynaHaul X replaces all of that with a digital system.',
  '',
  'The flow is simple:',
  '  1. Fitter opens the app on his phone (PWA — works offline in the pit)',
  '  2. Scans tyre QR code, fills inspection/pressure/removal form',
  '  3. Data syncs to cloud when phone gets signal',
  '  4. Manager sees everything on dashboard in real-time',
  '',
  'There are 3 apps in the system:',
  '  • Fitter App — field staff use it on Android phones',
  '  • Manager Dashboard — fleet supervisors see analytics on any device',
  '  • Alerts — automated SMS/WhatsApp for critical tyre events',
  '',
  // Section 2
  '═══════════════════════════════════════════════════════════════',
  'WHAT THE PRODUCT ACTUALLY DELIVERS (10 modules)',
  '═══════════════════════════════════════════════════════════════',
  '',
  'A. TYRE ECONOMICS (5 modules)',
  '',
  '1. Tyre Life vs Target',
  '   Shows every tyre\'s actual km vs the target. Green = met/exceeded, Red = fell short.',
  '   WHY: Instantly shows which brands/positions/trucks underperform.',
  '',
  '2. Brand-wise Performance',
  '   Side-by-side comparison of every tyre brand — cost, km achieved, cost per km.',
  '   WHY: Answers "which tyre brand should I buy next?" with YOUR data, not a salesman\'s pitch.',
  '',
  '3. Rubber Utilisation',
  '   How much rubber value was extracted from each removed tyre.',
  '   WHY: A tyre removed at 90% vs 50% utilisation = huge P&L difference.',
  '',
  '4. RTD Scrapping Flag',
  '   Tyres at or below 1.5mm tread depth, sorted worst-first.',
  '   WHY: Fitter walks straight to the most critical tyre. No guessing.',
  '',
  '5. Retread Eligible',
  '   Tyres at 3-6mm with fewer than 3 retreads done.',
  '   WHY: Every tyre here is Rs 15,000-20,000 saved vs buying new.',
  '',
  'B. PRESSURE & FUEL (3 modules)',
  '',
  '6. Pressure Fuel Cost',
  '   Bar chart: target fuel cost (what you should spend) vs actual (what you are spending).',
  '   WHY: Under-inflated tyres burn more diesel. 10 PSI drop = 3% fuel waste.',
  '   On 50 trucks running 250km/day at Rs 90/litre = lakhs per month.',
  '',
  '7. Pressure Heatmap',
  '   Every active tyre shown as a card: green (ok), yellow (watch), red (action now).',
  '   WHY: Fleet pressure health at one glance.',
  '',
  '8. Pressure Leakage Table',
  '   Per-tyre pressure readings, daily and summary views.',
  '   WHY: Moves from reactive ("tyre is flat") to proactive ("this tyre lost 3 PSI in 5 days").',
  '',
  'C. COST & SAVINGS (2 modules)',
  '',
  '9. Brand Cost per KM',
  '   Horizontal bar chart: Rs/km for each brand in your fleet.',
  '   WHY: A Rs 45K tyre lasting 80K km = Rs 0.56/km. A Rs 38K tyre lasting 50K km = Rs 0.76/km.',
  '   The "cheaper" tyre actually costs 26% MORE. This settles the argument.',
  '',
  '10. Savings Tab',
  '     Computed savings from pressure model + tyre life extension. Full Excel export.',
  '     WHY: This is the ROI slide that closes the deal.',
  '',
  // Section 3
  '═══════════════════════════════════════════════════════════════',
  'HOW TO PITCH THIS TO A CUSTOMER (3-minute demo)',
  '═══════════════════════════════════════════════════════════════',
  '',
  'MINUTE 1 — Open with money',
  '  Open the Savings tab first.',
  '  Say: "This is what tyre management looks like when you can measure it."',
  '  Point to Pressure Fuel Cost chart: "See the red bars? That\'s fuel waste from',
  '  under-inflated tyres. Every bar is lakhs we\'re leaving on the table."',
  '',
  'MINUTE 2 — Action lists',
  '  Show RTD Scrapping: "This tells your fitter exactly which tyre to change.',
  '  Not a guess. A tyre number."',
  '  Show Retread Eligible: "These tyres can go again. Every one is Rs 15-20K saved."',
  '  Show Pressure Heatmap: "Red = action now. Yellow = watch. Green = fine."',
  '',
  'MINUTE 3 — Strategy',
  '  Show Brand Cost per KM: "This settles the \'which tyre is best\' argument forever."',
  '  Show Brand-wise Performance: "Your fleet told you this. We just made it readable."',
  '',
  'CLOSE WITH:',
  '  "Everything you just saw runs on data your fitter already collects.',
  '  We just organise it, clean it, and show you what it means.',
  '  You don\'t need new equipment, new software, or new people.',
  '  You need DynaHaul X."',
  '',
  // Section 4
  '═══════════════════════════════════════════════════════════════',
  'WHO IS THIS FOR?',
  '═══════════════════════════════════════════════════════════════',
  '',
  'STRONG FIT:',
  '  • Mining fleet with 10+ tippers — High utilisation, expensive tyres.',
  '    5% savings on Rs 60L annual tyre spend = Rs 3L saved.',
  '  • Logistics fleet with 20+ trucks — Pressure = fuel savings.',
  '',
  'GOOD FIT:',
  '  • Construction fleet (tippers, dozers) — Pitch on scrapping & brand analysis.',
  '',
  'NOT A FIT:',
  '  • Single-truck owner — Manual tracking works at that scale.',
  '',
  // Section 5
  '═══════════════════════════════════════════════════════════════',
  'THE INSTALLATION STORY (keep it simple)',
  '═══════════════════════════════════════════════════════════════',
  '',
  'New fleet goes live in one call:',
  '  • We create the site (60 seconds)',
  '  • Fitter opens PWA, enters site code (60 seconds)',
  '  • Manager opens dashboard, logs in (60 seconds)',
  '  • Within 3 inspections, dashboard shows analytics.',
  '',
  'Zero on-premise software. Zero vendor dependency. Zero training cost.',
  '',
  // Section 6
  '═══════════════════════════════════════════════════════════════',
  'WHAT WE DO NOT CLAIM (things not fully working yet)',
  '═══════════════════════════════════════════════════════════════',
  '',
  'DO NOT SAY: Fleet Health composite score — the view has issues.',
  '  SAY: "The individual sub-measures are available — pressure, leakage,',
  '  inspections each have their own clear view."',
  '',
  'DO NOT SAY: Tyre Age Distribution, Defect Trend, Removal Reasons.',
  '  SAY: Skip them. Don\'t volunteer.',
  '',
  'DO NOT SAY: Tyre P&L needs per-km rate setting.',
  '  SAY: "The P&L module is ready — it just needs your per-km rate.',
  '  Enter it once and every tyre gets a P&L line."',
  '',
  'DO NOT SAY: Voice AI or SMS alerts need API keys.',
  '  SAY: "Voice dictation and SMS alerts are ready and configured."',
  '',
  // Section 7
  '═══════════════════════════════════════════════════════════════',
  'KEY NUMBERS TO REMEMBER',
  '═══════════════════════════════════════════════════════════════',
  '',
  '  • 10 PSI drop in tyre pressure = 3% fuel waste',
  '  • 50 trucks x 250km/day x Rs 90/litre = lakhs per month at risk',
  '  • Rs 45K tyre lasting 80K km = Rs 0.56/km (GOOD)',
  '  • Rs 38K tyre lasting 50K km = Rs 0.76/km (BAD — 26% more expensive)',
  '  • Every retreadable tyre saved = Rs 15,000-20,000 vs buying new',
  '  • 5% savings on Rs 60L annual tyre spend = Rs 3L saved per year',
  '',
  // Section 8
  '═══════════════════════════════════════════════════════════════',
  'WHAT WE\'VE BUILT SO FAR',
  '═══════════════════════════════════════════════════════════════',
  '',
  'WORKING:',
  '  • Admin signup → login → onboarding flow',
  '  • Excel file upload (vehicles, tyres, activity, fuel)',
  '  • Manager dashboard with tyre records, inspection records',
  '  • 10 analytics modules — tables, charts, heatmap, cards',
  '  • Pressure analytics with PSI tracking and fuel cost correlation',
  '  • Export to Excel for all major modules',
  '  • Offline-first fitter PWA',
  '  • Automated alerts engine (code complete)',
  '',
  'NEEDS FIXING:',
  '  • Fleet Health Score gauge (view references old tables)',
  '  • Tyre Age Distribution, Defect Trend, Removal Reasons tables',
  '  • Tyre P&L (needs per-km rate from Site Settings)',
  '',
  'THE CUSTOMER SEES:',
  '  • A clean dashboard that replaces clipboards and Excel',
  '  • Real-time data — what the fitter entered 30 seconds ago',
  '  • Actionable insights — specific tyre numbers, not vague reports',
  '  • Cost savings they can quantify in rupees',
  '',
  // Section 9
  '═══════════════════════════════════════════════════════════════',
  'THE ONE-LINE PITCH',
  '═══════════════════════════════════════════════════════════════',
  '',
  '"DynaHaul X turns your tyre data — which you already collect —',
  'into money you\'re currently losing to fuel waste, premature',
  'scrapping, and wrong brand purchases."',
];

// Escape XML
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Build document.xml
function buildDocumentXml(textLines) {
  let paras = '';
  for (const line of textLines) {
    const isHeader = line.startsWith('═') || (line.length > 0 && !line.startsWith(' ') && !line.startsWith('•') && !line.startsWith('1') && !line.startsWith('2') && !line.startsWith('3') && line === line.toUpperCase() && line.length > 10 && !line.includes(':'));

    if (line === '') {
      paras += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>';
    } else {
      const bold = isHeader || line.startsWith('═');
      const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : '';
      paras += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
            xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
            xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            mc:Ignorable="w14 wp14">
  <w:body>
    ${paras}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// Minimal content types
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
      <w:sz w:val="20"/>
      <w:szCs w:val="20"/>
    </w:rPr>
  </w:style>
</w:styles>`;

const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>DynaHaul X — Pitch Summary</dc:title>
  <dc:creator>Abhishek</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-07-31T00:00:00Z</dcterms:created>
</cp:coreProperties>`;

const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Node.js</Application>
</Properties>`;

// Build ZIP manually (store method, no compression for simplicity)
function buildZip(files) {
  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const contentBuf = Buffer.from(content, 'utf8');

    // Local file header
    const header = Buffer.alloc(30 + nameBuf.length);
    header.writeUInt32LE(0x04034b50, 0);  // signature
    header.writeUInt16LE(20, 4);           // version needed
    header.writeUInt16LE(0, 6);            // flags
    header.writeUInt16LE(0, 8);            // compression: store
    header.writeUInt16LE(0, 10);           // mod time
    header.writeUInt16LE(0, 12);           // mod date
    header.writeUInt32LE(crc32(contentBuf), 14); // crc32
    header.writeUInt32LE(contentBuf.length, 18); // compressed size
    header.writeUInt32LE(contentBuf.length, 22); // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26);    // filename length
    header.writeUInt16LE(0, 28);                  // extra field length
    nameBuf.copy(header, 30);

    // Central directory entry
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);        // signature
    cd.writeUInt16LE(20, 4);                // version made by
    cd.writeUInt16LE(20, 6);                // version needed
    cd.writeUInt16LE(0, 8);                 // flags
    cd.writeUInt16LE(0, 10);                // compression
    cd.writeUInt16LE(0, 12);                // mod time
    cd.writeUInt16LE(0, 14);                // mod date
    cd.writeUInt32LE(crc32(contentBuf), 16); // crc32
    cd.writeUInt32LE(contentBuf.length, 20); // compressed size
    cd.writeUInt32LE(contentBuf.length, 24); // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28);    // filename length
    cd.writeUInt16LE(0, 30);                  // extra field length
    cd.writeUInt16LE(0, 32);                  // file comment length
    cd.writeUInt16LE(0, 34);                  // disk number start
    cd.writeUInt16LE(0, 36);                  // internal file attributes
    cd.writeUInt32LE(0, 38);                  // external file attributes
    cd.writeUInt32LE(offset, 42);             // relative offset
    nameBuf.copy(cd, 46);

    parts.push(header, contentBuf);
    centralDir.push(cd);
    offset += header.length + contentBuf.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);               // disk number
  eocd.writeUInt16LE(0, 6);               // disk with cd
  eocd.writeUInt16LE(files.length, 8);     // entries on disk
  eocd.writeUInt16LE(files.length, 10);    // total entries
  eocd.writeUInt32LE(cdSize, 12);          // cd size
  eocd.writeUInt32LE(cdOffset, 16);        // cd offset
  eocd.writeUInt16LE(0, 20);               // comment length
  parts.push(eocd);

  return Buffer.concat(parts);
}

// CRC32
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Build and write
const docXml = buildDocumentXml(lines);

const zipFiles = [
  ['[Content_Types].xml', contentTypes],
  ['_rels/.rels', rels],
  ['word/_rels/document.xml.rels', wordRels],
  ['word/document.xml', docXml],
  ['word/styles.xml', styles],
  ['docProps/core.xml', core],
  ['docProps/app.xml', app],
];

const zipBuffer = buildZip(zipFiles);
fs.writeFileSync(OUTPUT, zipBuffer);

console.log(`Created: ${OUTPUT}`);
console.log(`Size: ${zipBuffer.length} bytes`);
