const fs = require('fs');
let css = fs.readFileSync('artifacts/wick-betts/src/index.css', 'utf8');

css = css.replace(/border-color:rgba\(244,240,232,\.3\);/g, "border-color:var(--border);");
css = css.replace(/color:rgba\(244,240,232,\.6\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.62\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.65\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.7\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.73\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.5\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.55\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.42\);/g, "color:var(--muted-foreground);");
css = css.replace(/color:rgba\(244,240,232,\.44\);/g, "color:var(--muted-foreground);");
css = css.replace(/border-bottom:1px solid rgba\(244,240,232,\.15\);/g, "border-bottom:1px solid var(--border);");
css = css.replace(/border-top:1px solid rgba\(244,240,232,\.15\);/g, "border-top:1px solid var(--border);");
css = css.replace(/border-top:1px solid rgba\(244,240,232,\.14\);/g, "border-top:1px solid var(--border);");
css = css.replace(/background:rgba\(244,240,232,\.07\);/g, "background:var(--secondary);");
css = css.replace(/background:rgba\(244,240,232,\.09\);/g, "background:var(--input);");
css = css.replace(/border:1px solid rgba\(244,240,232,\.2\);/g, "border:1px solid var(--border);");
css = css.replace(/border:1px solid rgba\(216,237,117,\.18\);/g, "border:1px solid var(--border);");
css = css.replace(/border:1px solid rgba\(216,237,117,\.25\);/g, "border:1px solid var(--border);");
css = css.replace(/background:rgba\(216,237,117,\.12\);/g, "background:var(--muted);");
css = css.replace(/color:rgba\(24,37,31,\.68\);/g, "color:var(--primary-foreground); opacity:0.8;");

// Update topbar brand background
css = css.replace(/\.topbar \.mobile-brand .brand-mark { background:var\(--primary\); color:var\(--primary-foreground\); }/g, ".topbar .mobile-brand .brand-mark { background:var(--primary); color:var(--primary-foreground); }");

fs.writeFileSync('artifacts/wick-betts/src/index.css', css);
console.log("Cleanup done");
