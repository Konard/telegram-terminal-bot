import VirtualTerminal from '../virtual-terminal.js';

// Debug cursor position after writing lines
const term = new VirtualTerminal(10, 5);
console.log('Initial cursor:', term.getCursorPosition());

term.write('Line1');
console.log('After Line1:', term.getCursorPosition());

term.write('\n');
console.log('After \\n:', term.getCursorPosition());

term.write('Line2');
console.log('After Line2:', term.getCursorPosition());

term.write('\n');
console.log('After \\n:', term.getCursorPosition());

term.write('Line3');
console.log('After Line3:', term.getCursorPosition());

console.log('\nScreen:');
console.log(JSON.stringify(term.toString()));

// Test line clear
const term2 = new VirtualTerminal(10, 3);
term2.write('Hello World\nSecond Line\nThird Line');
console.log('\nBefore position - Screen:');
console.log(term2.toString());
console.log('Cursor:', term2.getCursorPosition());

term2.write('\x1B[2;6H'); // Move to second line, position 6
console.log('\nAfter position - Cursor:', term2.getCursorPosition());

term2.write('\x1B[K');    // Clear from cursor to end of line
console.log('\nAfter clear - Screen:');
console.log(term2.toString());