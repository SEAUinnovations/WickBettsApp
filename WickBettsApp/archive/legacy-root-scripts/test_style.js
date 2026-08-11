const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

// The toggle span fix above. Let's make sure the active state dot goes white/foreground instead of just primary.
css = css.replace(/\.toggle\.on span { transform:translateX\(17px\); background:var\(--primary\); }/, ".toggle.on span { transform:translateX(17px); background:var(--primary-foreground); }");

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);

