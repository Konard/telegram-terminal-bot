import VirtualTerminal from '../virtual-terminal.js';

// Debug text layout
const term = new VirtualTerminal(10, 3);

console.log('Writing: "Hello World"');
term.write('Hello World');
console.log('Screen after "Hello World":');
console.log(term.toString());
console.log('Cursor:', term.getCursorPosition());

console.log('\nWriting: \\n');
term.write('\n');
console.log('Screen after \\n:');
console.log(term.toString());
console.log('Cursor:', term.getCursorPosition());

console.log('\nWriting: "Second Line"');
term.write('Second Line');
console.log('Screen after "Second Line":');
console.log(term.toString());
console.log('Cursor:', term.getCursorPosition());

console.log('\nWriting: \\n');
term.write('\n');
console.log('Screen after \\n:');
console.log(term.toString());
console.log('Cursor:', term.getCursorPosition());

console.log('\nWriting: "Third Line"');
term.write('Third Line');
console.log('Final screen:');
console.log(term.toString());
console.log('Cursor:', term.getCursorPosition());