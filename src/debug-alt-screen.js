import VirtualTerminal from './VirtualTerminal.js';

const term = new VirtualTerminal(5, 3);

// Write to main screen
term.write('Main\nScreen\nText');
console.log('Main screen:');
console.log(JSON.stringify(term.toString()));
const mainScreen = term.toString();

// Switch to alt screen
console.log('\nSwitching to alt screen...');
term.write('\x1B[?1049h');
console.log('Alt screen (empty):');
console.log(JSON.stringify(term.toString()));

term.write('Alt\nBuffer\nMode');
console.log('Alt screen (with content):');
console.log(JSON.stringify(term.toString()));
const altScreen = term.toString();

// Switch back to main screen
console.log('\nSwitching back to main screen...');
term.write('\x1B[?1049l');
console.log('Restored main screen:');
console.log(JSON.stringify(term.toString()));
const restoredScreen = term.toString();

console.log('\nComparison:');
console.log('Original main:', JSON.stringify(mainScreen));
console.log('Alt screen:   ', JSON.stringify(altScreen));
console.log('Restored main:', JSON.stringify(restoredScreen));
console.log('Match:', mainScreen === restoredScreen);