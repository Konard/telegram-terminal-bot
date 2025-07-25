import VirtualTerminal from '../virtual-terminal.js';

const term = new VirtualTerminal(5, 3);
term.debug = true; // Enable debug mode

console.log('=== WRITING TO MAIN SCREEN ===');
term.write('Main\nScreen\nText');
console.log('Main screen result:', JSON.stringify(term.toString()));

console.log('\n=== SWITCHING TO ALT SCREEN ===');
term.write('\x1B[?1049h');
console.log('After alt screen switch:', JSON.stringify(term.toString()));

console.log('\n=== WRITING TO ALT SCREEN ===');
term.write('Alt\nBuffer\nMode');
console.log('Alt screen result:', JSON.stringify(term.toString()));

console.log('\n=== SWITCHING BACK TO MAIN ===');
term.write('\x1B[?1049l');
console.log('After main screen switch:', JSON.stringify(term.toString()));