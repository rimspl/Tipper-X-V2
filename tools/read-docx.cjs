const fs = require('fs');
const zlib = require('zlib');

const buf = fs.readFileSync('D:/DX_User/Data_Abhishek/Abhishek/Dynahaul given by Amit sir 15july/pitch/markdown-export-2026-07-31.docx');

// Parse ZIP entries
const entries = [];
let pos = 0;
while (pos < buf.length - 4) {
  if (buf.readUInt32LE(pos) === 0x04034b50) {
    const comp = buf.readUInt16LE(pos + 8);
    const fnameLen = buf.readUInt16LE(pos + 26);
    const exLen = buf.readUInt16LE(pos + 28);
    const compSize = buf.readUInt32LE(pos + 18);
    const fname = buf.slice(pos + 30, pos + 30 + fnameLen).toString();
    const dataStart = pos + 30 + fnameLen + exLen;
    entries.push({ fname, comp, dataStart, compSize });
    pos = dataStart + compSize;
  } else {
    pos++;
  }
}

// Find document.xml
const docEntry = entries.find(e => e.fname === 'word/document.xml');
if (!docEntry) {
  console.error('document.xml not found');
  process.exit(1);
}

const compressedData = buf.slice(docEntry.dataStart, docEntry.dataStart + docEntry.compSize);

let xml;
if (docEntry.comp === 8) {
  // Deflate
  xml = zlib.inflateRawSync(compressedData).toString('utf8');
} else if (docEntry.comp === 0) {
  xml = compressedData.toString('utf8');
} else {
  console.error('Unknown compression:', docEntry.comp);
  process.exit(1);
}

// Extract text from XML - handle w:t tags and paragraph breaks
let text = xml;
// Replace paragraph ends with newlines
text = text.replace(/<\/w:p>/g, '\n');
// Replace runs with spaces
text = text.replace(/<\/w:r>/g, ' ');
// Remove all XML tags
text = text.replace(/<[^>]+>/g, '');
// Decode XML entities
text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
// Clean up whitespace
text = text.replace(/[ \t]+/g, ' ');
// Collapse multiple newlines
text = text.replace(/\n\s*\n/g, '\n\n');

console.log(text);
