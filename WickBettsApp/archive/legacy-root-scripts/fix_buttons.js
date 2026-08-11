const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

css = css.replace(/min-height: 52px;\n/, "");
css = css.replace(/\.button-primary { background: var\(--primary\); color: var\(--primary-foreground\); }/, ".button-primary { background: var(--primary); color: var(--primary-foreground); min-height: 52px; }");
css = css.replace(/\.button-dark { color: var\(--primary\); background: var\(--secondary\); border-color: var\(--border\); }/, ".button-dark { color: var(--primary); background: var(--secondary); border-color: var(--border); min-height: 52px; }");

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);
console.log("Button min-height fixed");
