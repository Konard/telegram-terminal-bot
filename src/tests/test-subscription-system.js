#!/usr/bin/env node

/**
 * Test Suite for VirtualTerminal Subscription System
 * 
 * Tests the change notification system and traffic optimization features
 */

import VirtualTerminal from '../virtual-terminal.js';

class SubscriptionTester {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log('🧪 Testing VirtualTerminal Subscription System\n');

    for (const { name, testFn } of this.tests) {
      try {
        await testFn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   ${error.message}\n`);
        this.failed++;
      }
    }

    console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

const tester = new SubscriptionTester();

// Test 1: Basic subscription functionality
tester.test('Basic subscription and unsubscription', async () => {
  const term = new VirtualTerminal(20, 5);
  let changeCount = 0;
  let lastChange = null;

  const unsubscribe = term.onScreenChange((changeData) => {
    changeCount++;
    lastChange = changeData;
  });

  if (term.changeListeners.size !== 1) {
    throw new Error('Listener not added correctly');
  }

  term.write('Hello');
  
  if (changeCount !== 1) {
    throw new Error(`Expected 1 change, got ${changeCount}`);
  }

  if (!lastChange || !lastChange.screenAfter.includes('Hello')) {
    throw new Error('Change data not correct');
  }

  unsubscribe();
  
  if (term.changeListeners.size !== 0) {
    throw new Error('Listener not removed correctly');
  }

  term.write(' World');
  
  if (changeCount !== 1) {
    throw new Error('Listener not properly unsubscribed');
  }
});

// Test 2: Multiple subscribers
tester.test('Multiple subscribers receive changes', async () => {
  const term = new VirtualTerminal(20, 5);
  let changes1 = 0;
  let changes2 = 0;
  let changes3 = 0;

  term.onScreenChange(() => changes1++);
  term.onScreenChange(() => changes2++);
  term.onScreenChange(() => changes3++);

  if (term.changeListeners.size !== 3) {
    throw new Error('Not all listeners added');
  }

  term.write('Test');

  if (changes1 !== 1 || changes2 !== 1 || changes3 !== 1) {
    throw new Error('Not all listeners received change notification');
  }
});

// Test 3: No changes = no notifications
tester.test('No notifications when screen does not change', async () => {
  const term = new VirtualTerminal(20, 5);
  let changeCount = 0;

  term.onScreenChange(() => changeCount++);

  // Write something first
  term.write('Hello');
  if (changeCount !== 1) {
    throw new Error('Expected 1 change after initial write');
  }

  // Clear screen (this changes the screen)
  term.write('\x1B[2J\x1B[H');
  if (changeCount !== 2) {
    throw new Error('Expected 2 changes after clear');
  }

  // Try operations that don't change visible screen
  term.write('\x1B[H'); // Just move cursor to home (screen already empty)
  if (changeCount !== 2) {
    throw new Error('Cursor move on empty screen should not create change');
  }

  // Move cursor to position (no visible change)
  term.write('\x1B[5;5H');
  if (changeCount !== 2) {
    throw new Error('Cursor position change should not create notification when screen unchanged');
  }
});

// Test 4: Traffic optimization with hasChangedSinceLastRead
tester.test('Traffic optimization with change flags', async () => {
  const term = new VirtualTerminal(20, 5);

  // Initially no changes
  if (term.hasChangedSinceLastRead()) {
    throw new Error('Should not have changes initially');
  }

  // Write something
  term.write('Hello');
  
  if (!term.hasChangedSinceLastRead()) {
    throw new Error('Should have changes after write');
  }

  // Check again - flag should be reset
  if (term.hasChangedSinceLastRead()) {
    throw new Error('Flag should be reset after read');
  }

  // Write more
  term.write(' World');
  
  if (!term.hasChangedSinceLastRead()) {
    throw new Error('Should have changes after second write');
  }

  // Mark as read manually
  term.markAsRead();
  
  if (term.hasChangedSinceLastRead()) {
    throw new Error('Flag should be reset after markAsRead');
  }
});

// Test 5: Change data structure validation
tester.test('Change data contains all required fields', async () => {
  const term = new VirtualTerminal(20, 5);
  let receivedChangeData = null;

  term.onScreenChange((changeData) => {
    receivedChangeData = changeData;
  });

  term.write('Test Data');

  if (!receivedChangeData) {
    throw new Error('No change data received');
  }

  const requiredFields = ['frameNumber', 'timestamp', 'screenBefore', 'screenAfter', 'cursorPosition', 'inputData'];
  
  for (const field of requiredFields) {
    if (!(field in receivedChangeData)) {
      throw new Error(`Missing field: ${field}`);
    }
  }

  if (receivedChangeData.frameNumber !== 1) {
    throw new Error('Incorrect frame number');
  }

  if (!receivedChangeData.screenAfter.includes('Test Data')) {
    throw new Error('Incorrect screen content');
  }

  if (receivedChangeData.inputData !== 'Test Data') {
    throw new Error('Incorrect input data');
  }
});

// Test 6: TOP simulation with subscription (traffic optimization)
tester.test('TOP simulation with optimized notifications', async () => {
  const term = new VirtualTerminal(40, 8);
  const changes = [];
  let notificationCount = 0;

  term.onScreenChange((changeData) => {
    changes.push({
      frame: changeData.frameNumber,
      timestamp: changeData.timestamp,
      hasContent: changeData.screenAfter.includes('top -')
    });
    notificationCount++;
  });

  // Simulate TOP command with updates
  console.log('  Simulating TOP command with 3 updates...');
  
  const startTime = Date.now();
  
  // First update
  term.write('\x1B[2J\x1B[H'); // Clear screen
  term.write('top - 12:34:56 up 1 day\n');
  term.write('Tasks: 95 total\n');
  term.write(' 1234 root  1.2\n');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 100));

  // Second update (cursor home + overwrite)
  term.write('\x1B[H');
  term.write('top - 12:34:57 up 1 day\n');
  term.write('Tasks: 96 total\n');
  term.write(' 1234 root  1.8\n');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 100));

  // Third update
  term.write('\x1B[H');
  term.write('top - 12:34:58 up 1 day\n');
  term.write('Tasks: 97 total\n');
  term.write(' 1234 root  2.1\n');

  const endTime = Date.now();
  
  console.log(`  Total time: ${endTime - startTime}ms`);
  console.log(`  Notifications received: ${notificationCount}`);
  console.log(`  Frame counter: ${term.frameCounter}`);

  // Validate results
  if (changes.length === 0) {
    throw new Error('No changes recorded');
  }

  if (changes.length !== term.frameCounter) {
    throw new Error(`Mismatch: ${changes.length} notifications vs ${term.frameCounter} frames`);
  }

  // Check that all changes have content
  const contentChanges = changes.filter(c => c.hasContent);
  if (contentChanges.length === 0) {
    throw new Error('No content changes detected');
  }

  console.log(`  Content changes: ${contentChanges.length}/${changes.length}`);
});

// Test 7: Long period with no changes
tester.test('Long period with no changes does not generate traffic', async () => {
  const term = new VirtualTerminal(20, 5);
  let changeCount = 0;

  term.onScreenChange(() => changeCount++);

  // Initial state
  term.write('Static Content\n');
  const initialChanges = changeCount;

  // Simulate operations that don't change screen
  for (let i = 0; i < 100; i++) {
    term.write('\x1B[H'); // Move cursor to home
    term.write('\x1B[s'); // Save cursor
    term.write('\x1B[u'); // Restore cursor
  }

  if (changeCount !== initialChanges) {
    throw new Error(`Expected ${initialChanges} changes, got ${changeCount} after no-op operations`);
  }

  // Now make a real change
  term.write('New Content');
  
  if (changeCount !== initialChanges + 1) {
    throw new Error('Real change not detected');
  }
});

// Test 8: Error handling in listeners
tester.test('Error handling in change listeners', async () => {
  const term = new VirtualTerminal(20, 5);
  let goodListenerCalled = false;

  // Add a listener that throws an error
  term.onScreenChange(() => {
    throw new Error('Test error in listener');
  });

  // Add a good listener
  term.onScreenChange(() => {
    goodListenerCalled = true;
  });

  // This should not crash despite the error in first listener
  term.write('Test');

  if (!goodListenerCalled) {
    throw new Error('Good listener was not called due to error in bad listener');
  }
});

// Test 9: Performance test with many changes
tester.test('Performance with rapid changes', async () => {
  const term = new VirtualTerminal(60, 20);
  let changeCount = 0;

  term.onScreenChange(() => changeCount++);

  const startTime = Date.now();
  
  // Generate many changes rapidly
  for (let i = 0; i < 100; i++) {
    term.write(`Line ${i}\n`);
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`  Processed 100 changes in ${duration}ms`);
  console.log(`  Notifications: ${changeCount}`);
  console.log(`  Frames: ${term.frameCounter}`);

  if (changeCount !== term.frameCounter) {
    throw new Error('Notification count does not match frame count');
  }

  if (duration > 1000) {
    throw new Error('Performance too slow for rapid changes');
  }
});

// Test 10: Integration scenario - Telegram bot simulation
tester.test('Telegram bot integration scenario', async () => {
  const term = new VirtualTerminal(60, 12);
  const messageUpdates = [];
  let lastMessageSent = null;

  // Simulate Telegram bot behavior
  const sendTelegramUpdate = (screen) => {
    if (lastMessageSent !== screen) {
      messageUpdates.push({
        timestamp: Date.now(),
        screen: screen,
        length: screen.length
      });
      lastMessageSent = screen;
    }
  };

  // Subscribe to changes
  term.onScreenChange((changeData) => {
    // Only send update if screen actually changed
    sendTelegramUpdate(changeData.screenAfter);
  });

  console.log('  Simulating Telegram bot scenario...');

  // Initial command
  term.write('$ top\n');
  
  // TOP starts - clear screen and initial display
  term.write('\x1B[2J\x1B[H');
  term.write('top - 12:34:56 up 1 day\n');
  term.write('Tasks: 95 total\n');
  term.write(' 1234 root  1.2\n');

  // Simulate some cursor movements (no screen change)
  term.write('\x1B[H'); // Home cursor
  term.write('\x1B[s'); // Save cursor
  term.write('\x1B[u'); // Restore cursor

  // Update display
  term.write('\x1B[H');
  term.write('top - 12:34:57 up 1 day\n');
  term.write('Tasks: 96 total\n');
  term.write(' 1234 root  1.8\n');

  // More no-op operations
  term.write('\x1B[2;1H'); // Move cursor (no visible change)
  
  // Another update
  term.write('\x1B[H');
  term.write('top - 12:34:58 up 1 day\n');
  term.write('Tasks: 97 total\n');
  term.write(' 1234 root  2.1\n');

  console.log(`  Total Telegram messages sent: ${messageUpdates.length}`);
  console.log(`  Terminal frame changes: ${term.frameCounter}`);
  
  // Validate that we didn't send unnecessary updates
  if (messageUpdates.length === 0) {
    throw new Error('No Telegram updates sent');
  }

  if (messageUpdates.length > term.frameCounter + 2) {
    throw new Error('Too many Telegram updates - traffic not optimized');
  }

  console.log('  ✅ Traffic optimized - only real changes sent to Telegram');
});

// Run all tests
async function main() {
  try {
    const success = await tester.run();
    
    if (success) {
      console.log('\n🎉 All subscription system tests passed!');
      console.log('\n🚀 Key features validated:');
      console.log('  ✅ Change subscription and unsubscription');
      console.log('  ✅ Multiple subscribers support');
      console.log('  ✅ No notifications for non-changes');
      console.log('  ✅ Traffic optimization flags');
      console.log('  ✅ Complete change data structure');
      console.log('  ✅ TOP simulation with optimized notifications');
      console.log('  ✅ Long periods without changes');
      console.log('  ✅ Error handling in listeners');
      console.log('  ✅ Performance with rapid changes');
      console.log('  ✅ Telegram bot integration scenario');
      
      console.log('\n💡 The subscription system is ready for production use!');
      console.log('   - Reduces unnecessary traffic');
      console.log('   - Provides real-time change notifications');
      console.log('   - Handles errors gracefully');
      console.log('   - Optimized for performance');
    } else {
      console.log('\n💥 Some tests failed. Check the output above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

main();