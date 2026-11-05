/** Simulation prototype only. Not connected to Kisara's production browser transport. */
class AccountRouter {
  constructor(accounts, submit) {
    this.accounts = accounts.filter(a => a.connected && a.imageEnabled);
    this.submit = submit;
    this.current = 0;
    this.exhausted = new Set();
    this.transitions = [];
  }
  async generate(clipId, signal) {
    while (this.current < this.accounts.length) {
      signal.throwIfAborted();
      const account = this.accounts[this.current];
      let result;
      try { result = await this.submit(account.id, clipId, signal); }
      catch { throw new Error('result_uncertain'); }
      signal.throwIfAborted();
      if (result.status === 'completed' && typeof result.assetId === 'string' && result.assetId) return result.assetId;
      // Retrying is only allowed with explicit evidence that no generation was accepted.
      if (result.status === 'rejected' && result.code === 'quota_exhausted' && result.accepted === false) {
        this.exhausted.add(account.id);
        this.current++;
        this.transitions.push({ from: account.id, to: this.accounts[this.current]?.id ?? null, clipId });
        continue;
      }
      throw new Error(result.code || 'result_uncertain');
    }
    throw new Error('all_accounts_exhausted');
  }
}
module.exports = { AccountRouter };
