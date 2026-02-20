// Cleanup is no longer needed — bash-tool uses an in-memory virtual filesystem.
// This file is kept for backwards compatibility but is a no-op.
export async function cleanupSandbox(): Promise<void> {
  // No-op: just-bash sandbox is garbage collected automatically
}
