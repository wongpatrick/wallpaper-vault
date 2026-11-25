/**
 * @file
 * Tests for PowerShellDaemon service.
 */
/* eslint-disable no-magic-numbers, @typescript-eslint/no-explicit-any */
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { extractJsonArray, PowerShellDaemon } from './powerShellDaemon';

class MockChildProcess extends EventEmitter {
    public pid = 12345;
    public stdin = {
        write: vi.fn(),
        end: vi.fn()
    };
    public stdout = new EventEmitter();
    public stderr = new EventEmitter();
    public kill = vi.fn(() => {
        this.emit('exit', 0, null);
    });
}

function extractNonceFromWrittenCmd(written: string): string {
    const match = /Write-Output \("__CMD_DONE_" \+ "(\d+_[a-z0-9]+__)"\)/.exec(written);
    if (!match) {
        throw new Error(`Could not extract nonce from written command: ${written}`);
    }
    return `__CMD_DONE_${match[1]}`;
}

describe('powerShellDaemon', () => {
    describe('extractJsonArray', () => {
        it('extracts valid json array line from multi-line stdout', () => {
            const stdout = 'Some log\r\n[{"winNum":1,"x":0,"y":0,"w":1920,"h":1080}]\r\nExtra info';
            expect(extractJsonArray(stdout)).toBe('[{"winNum":1,"x":0,"y":0,"w":1920,"h":1080}]');
        });

        it('returns empty array fallback when no json array is present', () => {
            const stdout = 'Error occurred\r\nNo data';
            expect(extractJsonArray(stdout)).toBe('[]');
        });
    });

    describe('PowerShellDaemon instance', () => {
        it('throws immediately when run on unsupported platform', async () => {
            const daemon = new PowerShellDaemon({ autoInit: false, isSupported: false });
            await expect(daemon.run('Write-Host "test"')).rejects.toThrow(
                /Native wallpaper control is not supported/
            );
        });

        it('wraps commands in scriptblocks and resolves on matching nonce delimiter', async () => {
            const mockProc = new MockChildProcess();
            const mockSpawn = vi.fn().mockReturnValue(mockProc as any);

            const daemon = new PowerShellDaemon({
                autoInit: true,
                isSupported: true,
                timeoutMs: 2000,
                spawn: mockSpawn as any
            });

            // Complete bootstrap and wait for microtasks
            mockProc.stdout.emit('data', Buffer.from('__BOOTSTRAP_DONE__\r\n'));
            await Promise.resolve();

            // Run command
            const runPromise = daemon.run('[Test]::Method()');
            await Promise.resolve();

            // Verify stdin wrote the wrapped scriptblock
            expect(mockProc.stdin.write).toHaveBeenCalledTimes(2);
            const lastCallArg = mockProc.stdin.write.mock.calls[1][0];
            expect(lastCallArg).toContain('& {\r\n[Test]::Method()\r\n}\r\nWrite-Output ("__CMD_DONE_" + "');

            // Extract the generated nonce from the written script
            const nonce = extractNonceFromWrittenCmd(lastCallArg);

            // Emit echoed command first (simulating PowerShell interactive stdin echo), then actual output + nonce
            mockProc.stdout.emit('data', Buffer.from(`PS> ${lastCallArg}`));
            mockProc.stdout.emit('data', Buffer.from(`{"result":"ok"}\r\n${nonce}\r\n`));

            const result = await runPromise;
            expect(result).toContain('{"result":"ok"}');
        });

        it('ignores stale output and only resolves on the active command nonce', async () => {
            const mockProc = new MockChildProcess();
            const mockSpawn = vi.fn().mockReturnValue(mockProc as any);

            const daemon = new PowerShellDaemon({
                autoInit: true,
                isSupported: true,
                timeoutMs: 2000,
                spawn: mockSpawn as any
            });
            mockProc.stdout.emit('data', Buffer.from('__BOOTSTRAP_DONE__\r\n'));
            await Promise.resolve();

            const runPromise = daemon.run('[Test]::Method()');
            await Promise.resolve();

            const lastCallArg = mockProc.stdin.write.mock.calls[1][0];
            const activeNonce = extractNonceFromWrittenCmd(lastCallArg);

            // Emit stale output with an old nonce from a previous command
            mockProc.stdout.emit('data', Buffer.from('old_stale_output\r\n__CMD_DONE_99999_stale__\r\n'));

            // The promise should not be resolved yet
            let isResolved = false;
            void runPromise.then(() => { isResolved = true; });
            await new Promise((r) => setTimeout(r, 20));
            expect(isResolved).toBe(false);

            // Now emit active nonce
            mockProc.stdout.emit('data', Buffer.from(`actual_output\r\n${activeNonce}\r\n`));
            const result = await runPromise;
            expect(result).toContain('actual_output');
        });

        it('kills process, rejects command, and respawns on timeout', async () => {
            const mockProc1 = new MockChildProcess();
            const mockProc2 = new MockChildProcess();
            const mockSpawn = vi.fn().mockReturnValueOnce(mockProc1 as any).mockReturnValueOnce(mockProc2 as any);

            const daemon = new PowerShellDaemon({
                autoInit: true,
                isSupported: true,
                timeoutMs: 50,
                spawn: mockSpawn as any
            });
            mockProc1.stdout.emit('data', Buffer.from('__BOOTSTRAP_DONE__\r\n'));
            await Promise.resolve();

            // Run a hanging command that will timeout in 50ms
            const hangingPromise = daemon.run('Start-Sleep -Seconds 100');
            await Promise.resolve();

            await expect(hangingPromise).rejects.toThrow(/PowerShell command timed out/);
            expect(mockProc1.kill).toHaveBeenCalled();

            // Bootstrap the respawned process (mockProc2)
            mockProc2.stdout.emit('data', Buffer.from('__BOOTSTRAP_DONE__\r\n'));
            await new Promise((r) => setTimeout(r, 10));

            // Run next command on the newly respawned daemon
            const nextPromise = daemon.run('[Test]::NextMethod()');
            await new Promise((r) => setTimeout(r, 10));

            expect(mockProc2.stdin.write).toHaveBeenCalledTimes(2);
            const lastCallArg = mockProc2.stdin.write.mock.calls[1][0];
            const nextNonce = extractNonceFromWrittenCmd(lastCallArg);

            mockProc2.stdout.emit('data', Buffer.from(`next_success\r\n${nextNonce}\r\n`));
            const result = await nextPromise;
            expect(result).toBe('next_success');
        });

        it('does not resolve early on echoed Write-Output when two commands are queued via Promise.all', async () => {
            const mockProc = new MockChildProcess();
            const mockSpawn = vi.fn().mockReturnValue(mockProc as any);

            const daemon = new PowerShellDaemon({
                autoInit: true,
                isSupported: true,
                timeoutMs: 2000,
                spawn: mockSpawn as any
            });
            mockProc.stdout.emit('data', Buffer.from('__BOOTSTRAP_DONE__\r\n'));
            await Promise.resolve();

            const p1 = daemon.run('[WinDisplayHelper]::GetDisplays()');
            const p2 = daemon.run('[ComDisplayHelper]::GetLayout()');
            await Promise.resolve();

            // First command is written
            expect(mockProc.stdin.write).toHaveBeenCalledTimes(2);
            const cmd1Written = mockProc.stdin.write.mock.calls[1][0];
            const nonce1 = extractNonceFromWrittenCmd(cmd1Written);

            // PowerShell echoes cmd1 before running it
            mockProc.stdout.emit('data', Buffer.from(`>> ${cmd1Written}`));
            let p1Resolved = false;
            void p1.then(() => { p1Resolved = true; });
            await new Promise((r) => setTimeout(r, 10));
            expect(p1Resolved).toBe(false);

            // Cmd1 finishes and outputs its JSON + evaluated nonce1
            mockProc.stdout.emit('data', Buffer.from(`[{"winNum":11}]\r\n${nonce1}\r\n`));
            const res1 = await p1;
            expect(extractJsonArray(res1)).toBe('[{"winNum":11}]');

            // Second command should now be written
            expect(mockProc.stdin.write).toHaveBeenCalledTimes(3);
            const cmd2Written = mockProc.stdin.write.mock.calls[2][0];
            const nonce2 = extractNonceFromWrittenCmd(cmd2Written);

            mockProc.stdout.emit('data', Buffer.from(`>> ${cmd2Written}`));
            mockProc.stdout.emit('data', Buffer.from(`[{"comIndex":0}]\r\n${nonce2}\r\n`));
            const res2 = await p2;
            expect(extractJsonArray(res2)).toBe('[{"comIndex":0}]');
        });
    });
});
