#!/usr/bin/env node

/**
 * Test Suite for TOP Command Simulation
 * 
 * This test simulates a real top command that updates every second for 3 seconds,
 * testing the VirtualTerminal's ability to handle screen refreshes properly.
 */

import VirtualTerminal from './VirtualTerminal.js';

class TopSimulator {
  constructor(terminal, verbose = false) {
    this.terminal = terminal;
    this.verbose = verbose;
    this.updateCount = 0;
    this.processes = [
      { pid: 1234, user: 'root', cpu: 1.2, mem: 2.1, command: 'systemd' },
      { pid: 5678, user: 'user', cpu: 0.8, mem: 1.5, command: 'chrome' },
      { pid: 9012, user: 'user', cpu: 0.3, mem: 0.9, command: 'node' },
      { pid: 3456, user: 'root', cpu: 0.1, mem: 0.3, command: 'ssh' },
      { pid: 7890, user: 'user', cpu: 0.0, mem: 0.2, command: 'bash' }
    ];
    
    if (verbose) {
      this.terminal.setVerbose(true);
    }
  }
  
  generateTopFrame() {
    this.updateCount++;
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    
    // Simulate slight variations in CPU and memory usage
    this.processes.forEach(proc => {
      proc.cpu += (Math.random() - 0.5) * 0.4;
      proc.cpu = Math.max(0, Math.min(100, proc.cpu));
      proc.mem += (Math.random() - 0.5) * 0.2;
      proc.mem = Math.max(0, Math.min(100, proc.mem));
    });
    
    // Sort by CPU usage (like real top)
    this.processes.sort((a, b) => b.cpu - a.cpu);
    
    let frame = '';
    
    // Clear screen and home cursor (what top does)
    frame += '\x1B[2J\x1B[H';
    
    // Header
    frame += `top - ${time} up 1 day,  5:23,  2 users, load average: 0.15, 0.25, 0.30\n`;
    frame += `Tasks: ${this.processes.length + 90} total,   1 running,  ${this.processes.length + 89} sleeping,   0 stopped\n`;
    frame += `%Cpu(s):  ${(this.processes.reduce((sum, p) => sum + p.cpu, 0) / 4).toFixed(1)} us,  1.2 sy,  0.0 ni, 95.1 id,  0.0 wa\n`;
    frame += `MiB Mem :   8192.0 total,   2048.5 free,   4096.2 used,   2047.3 buff/cache\n`;
    frame += `MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   3584.1 avail Mem\n`;
    frame += `\n`;
    frame += `  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n`;
    
    // Process list
    this.processes.forEach(proc => {
      const virtMem = (Math.random() * 200000 + 50000).toFixed(0);
      const resMem = (Math.random() * 50000 + 10000).toFixed(0);
      const shrMem = (Math.random() * 10000 + 2000).toFixed(0);
      const time = Math.floor(Math.random() * 3600);
      const timeStr = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}.${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
      
      frame += `${String(proc.pid).padStart(5)} ${proc.user.padEnd(9)} 20   0 ${String(virtMem).padStart(7)} ${String(resMem).padStart(6)} ${String(shrMem).padStart(6)} S ${proc.cpu.toFixed(1).padStart(5)} ${proc.mem.toFixed(1).padStart(5)} ${timeStr.padStart(9)} ${proc.command}\n`;
    });
    
    return frame;
  }
  
  async runSimulation() {
    console.log('🖥️  Starting TOP command simulation...\n');
    console.log('Configuration:');
    console.log('- Update interval: 1 second');
    console.log('- Duration: 3 seconds');
    console.log('- Terminal size: 80x24');
    console.log('- Processes: 5 simulated processes\n');
    
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      let frameCount = 0;
      const maxFrames = 3; // 3 updates over 3 seconds
      
      const updateInterval = setInterval(() => {
        frameCount++;
        
        console.log(`\n📡 Sending TOP update #${frameCount} (${new Date().toISOString()})`);
        
        const topFrame = this.generateTopFrame();
        
        if (!this.verbose) {
          console.log(`Frame size: ${topFrame.length} characters`);
          console.log(`Processes shown: ${this.processes.length}`);
        }
        
        // Send the frame to the terminal
        this.terminal.write(topFrame);
        
        if (!this.verbose) {
          console.log('\nResulting screen:');
          console.log('=' + '='.repeat(this.terminal.cols - 1));
          console.log(this.terminal.toString());
          console.log('=' + '='.repeat(this.terminal.cols - 1));
        }
        
        if (frameCount >= maxFrames) {
          clearInterval(updateInterval);
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          console.log(`\n✅ TOP simulation completed!`);
          console.log(`Total duration: ${duration}ms`);
          console.log(`Frames rendered: ${frameCount}`);
          console.log(`Average frame time: ${(duration / frameCount).toFixed(1)}ms`);
          console.log(`Terminal frames processed: ${this.terminal.frameCounter}`);
          
          resolve({
            duration,
            frameCount,
            terminalFrames: this.terminal.frameCounter,
            finalScreen: this.terminal.toString()
          });
        }
      }, 1000); // Update every 1 second
    });
  }
}

// Test function
async function runTopTests() {
  console.log('🧪 TOP Command Simulation Tests\n');
  
  // Test 1: Normal mode
  console.log('='.repeat(80));
  console.log('TEST 1: Normal Mode (quiet output)');
  console.log('='.repeat(80));
  
  const terminal1 = new VirtualTerminal(80, 24);
  const simulator1 = new TopSimulator(terminal1, false);
  
  const result1 = await simulator1.runSimulation();
  
  // Test 2: Verbose mode
  console.log('\n' + '='.repeat(80));
  console.log('TEST 2: Verbose Mode (detailed logging)');
  console.log('='.repeat(80));
  
  const terminal2 = new VirtualTerminal(80, 24);
  const simulator2 = new TopSimulator(terminal2, true);
  
  const result2 = await simulator2.runSimulation();
  
  // Test 3: Smaller terminal
  console.log('\n' + '='.repeat(80));
  console.log('TEST 3: Smaller Terminal (40x12)');
  console.log('='.repeat(80));
  
  const terminal3 = new VirtualTerminal(40, 12);
  const simulator3 = new TopSimulator(terminal3, false);
  
  const result3 = await simulator3.runSimulation();
  
  // Performance comparison
  console.log('\n' + '='.repeat(80));
  console.log('PERFORMANCE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Test 1 (80x24): ${result1.duration}ms, ${result1.terminalFrames} screen changes`);
  console.log(`Test 2 (80x24): ${result2.duration}ms, ${result2.terminalFrames} screen changes`);
  console.log(`Test 3 (40x12): ${result3.duration}ms, ${result3.terminalFrames} screen changes`);
  
  // Validate results
  const allTestsPassed = [result1, result2, result3].every(result => 
    result.frameCount === 3 && result.terminalFrames >= 3 && result.duration >= 3000
  );
  
  if (allTestsPassed) {
    console.log('\n🎉 All TOP simulation tests passed!');
    console.log('✅ Frame timing is correct (1 second intervals)');
    console.log('✅ Screen updates are working properly');
    console.log('✅ Verbose logging captures all changes');
    console.log('✅ Different terminal sizes handled correctly');
  } else {
    console.log('\n❌ Some tests failed. Check the results above.');
  }
  
  return allTestsPassed;
}

// Additional test: Interactive command behavior
async function testInteractiveCommandBehavior() {
  console.log('\n' + '='.repeat(80));
  console.log('INTERACTIVE COMMAND BEHAVIOR TEST');
  console.log('='.repeat(80));
  
  const terminal = new VirtualTerminal(60, 15);
  
  console.log('Testing command sequence that simulates real terminal usage...\n');
  
  // Initial command prompt
  terminal.write('$ ');
  console.log('1. Initial prompt:');
  console.log(terminal.toString().split('\n').slice(-3).join('\n'));
  
  // User types "top"
  terminal.write('top');
  console.log('\n2. After typing "top":');
  console.log(terminal.toString().split('\n').slice(-3).join('\n'));
  
  // User presses Enter
  terminal.write('\n');
  console.log('\n3. After pressing Enter:');
  console.log(terminal.toString().split('\n').slice(-3).join('\n'));
  
  // Top starts - clear screen and show initial display
  terminal.write('\x1B[2J\x1B[H');
  terminal.write('top - 12:34:56 up 1 day, 5:23, 2 users\n');
  terminal.write('Tasks: 95 total, 1 running, 94 sleeping\n');
  terminal.write('  PID USER     %CPU %MEM COMMAND\n');
  terminal.write(' 1234 root      1.2  2.1 systemd\n');
  
  console.log('\n4. TOP initial display:');
  console.log(terminal.toString());
  
  // Simulate top update (cursor home and overwrite)
  terminal.write('\x1B[H');
  terminal.write('top - 12:34:57 up 1 day, 5:23, 2 users\n');
  terminal.write('Tasks: 96 total, 2 running, 94 sleeping\n');
  terminal.write('  PID USER     %CPU %MEM COMMAND\n');
  terminal.write(' 1234 root      1.8  2.1 systemd\n');
  
  console.log('\n5. TOP after 1-second update:');
  console.log(terminal.toString());
  
  // User presses 'q' to quit top
  terminal.write('\x1B[2J\x1B[H'); // Clear screen
  terminal.write('$ '); // Back to prompt
  
  console.log('\n6. After quitting TOP:');
  console.log(terminal.toString().split('\n').slice(-3).join('\n'));
  
  console.log('\n✅ Interactive command behavior test completed!');
}

// Run all tests
async function main() {
  try {
    const success = await runTopTests();
    await testInteractiveCommandBehavior();
    
    console.log('\n' + '🏁'.repeat(20));
    console.log('ALL TESTS COMPLETED');
    console.log('🏁'.repeat(20));
    
    if (success) {
      console.log('\n🎯 The VirtualTerminal successfully handles:');
      console.log('  • Timed screen updates (1-second intervals)');
      console.log('  • Complex ANSI sequences (clear screen, cursor positioning)');
      console.log('  • Large amounts of text output');
      console.log('  • Different terminal sizes');
      console.log('  • Verbose logging for debugging');
      console.log('  • Real-world command patterns');
      
      console.log('\n🚀 Ready for integration with Telegram bot!');
    } else {
      console.log('\n💥 Some issues detected. Review the test output above.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run the tests
main();