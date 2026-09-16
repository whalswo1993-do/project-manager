const fs = require('fs');
let txt = fs.readFileSync('src/App.jsx', 'utf8');
txt = txt.replace(/\{p\.manufacturingNo\}/g, "{p.manufacturingNo?.replace(/-[a-f0-9]{4}$/i, '')}");
fs.writeFileSync('src/App.jsx', txt);
console.log('Done');
