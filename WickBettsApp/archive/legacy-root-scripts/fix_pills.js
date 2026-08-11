const fs = require('fs');

let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

// The instruction: 10px bold uppercase pills.
// Tags use option-tag and asset-tag.

css = css.replace(/\.asset-tag { padding:4px 6px; background:var\(--muted-foreground\); color:var\(--muted-foreground\); font:9px var\(--font-inter\); }/g, ".asset-tag { padding:4px 9px; background:var(--secondary); color:var(--accent); font:700 10px var(--font-inter); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.8px; }");

// And plan switch selected
css = css.replace(/\.plan-switch > div\.selected { background: var\(--foreground\); color: var\(--background\); border-color: var\(--foreground\); }/g, ".plan-switch > div.selected { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }");

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);

