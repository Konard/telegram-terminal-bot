import VirtualTerminal from './VirtualTerminal.js';

// Debug line clearing
const term = new VirtualTerminal(10, 3);
term.write('Hello World\nSecond Line\nThird Line');

console.log('Initial screen:');
console.log(term.toString());
console.log('Cursor:', term.getCursorPosition());

// Move to second line, position 6 (row 2, col 6 in 1-indexed)
term.write('\x1B[2;6H');
console.log('\nAfter positioning to 2;6H:');
console.log('Cursor:', term.getCursorPosition());

// Clear from cursor to end of line
term.write('\x1B[K');
console.log('\nAfter clearing line:');
console.log(term.toString());
console.log('Expected line 1: "Secon     "');
console.log('Actual line 1:  "' + term.toString().split('\n')[1] + '"');