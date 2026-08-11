const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');
css = css.replace(/\.direction { font:600 10px var\(--font-inter\); text-transform:uppercase; }/g, ".direction { font:700 10px var(--font-inter); text-transform:uppercase; letter-spacing: 0.8px; }");
fs.writeFileSync('artifacts/wick-betts/src/index.css', css);

