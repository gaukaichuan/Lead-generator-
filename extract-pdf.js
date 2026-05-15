const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const data = new Uint8Array(fs.readFileSync('C:/Users/MyUser/Desktop/Materials for the Sales lead generator AI.pdf'));
const pdf = new PDFParse(data);
pdf.getText().then(text => console.log(text)).catch(e => console.error(e));
