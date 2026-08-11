const fs = require('fs');
let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

css = css.replace(/background: #fff; color: #3c4043; border: 1\.5px solid #dadce0;/g, "background: var(--secondary); color: var(--foreground); border: 1px solid var(--border);");

// Let's also check if .button-signin hover has a box-shadow that clashes.
css = css.replace(/box-shadow: 0 1px 6px rgba\(0,0,0,\.15\);/g, "opacity: 0.8; box-shadow: none;");

// Update --shadow var or uses of var(--shadow)
// Actually we set --shadow to none, so it won't show.

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);
console.log("signin button fixed");
