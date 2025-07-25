#!/usr/bin/env node

/**
 * Test Verbose Mode functionality
 * This shows detailed logging of all terminal operations
 */

import VirtualTerminal from './VirtualTerminal.js';

console.log('🔍 Testing VirtualTerminal Verbose Mode\n');

// Test 1: Basic verbose operations
console.log('='.repeat(60));
console.log('TEST 1: Basic Operations with Verbose Mode');
console.log('='.repeat(60));

const term1 = new VirtualTerminal(20, 5);
term1.setVerbose(true);

console.log('\n--- Writing simple text ---');
term1.write('Hello World');

console.log('\n--- Adding newline ---');
term1.write('\nSecond Line');

console.log('\n--- Clear screen sequence ---');
term1.write('\x1B[2J\x1B[H');

console.log('\n--- Writing after clear ---');
term1.write('After Clear');

console.log('\n='.repeat(60));
console.log('TEST 2: TOP-like Screen Updates');
console.log('='.repeat(60));

const term2 = new VirtualTerminal(40, 8);
term2.setVerbose(true);

console.log('\n--- Initial TOP display ---');
term2.write('\x1B[2J\x1B[H');
term2.write('top - 12:34:56 up 1 day\n');
term2.write('Tasks: 95 total\n');
term2.write('  PID USER  %CPU\n');
term2.write(' 1234 root   1.2\n');

console.log('\n--- TOP update (cursor home) ---');
term2.write('\x1B[H');
term2.write('top - 12:34:57 up 1 day\n');
term2.write('Tasks: 96 total\n');
term2.write('  PID USER  %CPU\n');
term2.write(' 1234 root   1.8\n');

console.log('\n='.repeat(60));
console.log('TEST 3: Complex ANSI Sequences');
console.log('='.repeat(60));

const term3 = new VirtualTerminal(15, 4);
term3.setVerbose(true);

console.log('\n--- Cursor positioning ---');
term3.write('ABCDEFGHIJKLMNO\nPQRSTUVWXYZ\n');
term3.write('\x1B[1;5H'); // Move to row 1, col 5
term3.write('X'); // Should overwrite 'E'

console.log('\n--- Line clearing ---');
term3.write('\x1B[2;3H'); // Move to row 2, col 3
term3.write('\x1B[K'); // Clear from cursor to end of line

console.log('\n='.repeat(60));
console.log('VERBOSE MODE TEST COMPLETED');
console.log('='.repeat(60));

console.log('\n🎯 What verbose mode shows:');
console.log('  ✅ Input data (raw bytes)');
console.log('  ✅ Cursor position changes');
console.log('  ✅ Screen state before/after');
console.log('  ✅ Frame-by-frame changes');
console.log('  ✅ ANSI escape sequence processing');

console.log('\n✨ This mode is perfect for:');
console.log('  • Debugging terminal rendering issues');
console.log('  • Understanding how interactive commands work');
console.log('  • Optimizing screen update performance');
console.log('  • Validating ANSI escape sequence handling');