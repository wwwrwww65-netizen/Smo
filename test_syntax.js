try {
  const content = require('fs').readFileSync('js/ono.js', 'utf8');
  // Simple syntax check
  new Function(content.replace(/import .*/g, '').replace(/export .*/g, ''));
  console.log("Syntax is valid");
} catch(e) {
  console.error("Syntax error:", e);
}
