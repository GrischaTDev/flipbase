import { expect, it } from 'vitest';
import { vintedAccountLabels } from './vinted-account-labels';

it('kennzeichnet gleichnamige Konten auch bei gleichem gekürzten Suffix eindeutig', () => {
  const accounts = [
    { connectionId: 'account-a654321', displayName: 'Wiehen Store' },
    { connectionId: 'account-b654321', displayName: 'Wiehen Store' },
    { connectionId: 'unrelated', displayName: 'Flipbase' },
  ];
  const labels = vintedAccountLabels(accounts);

  expect(labels.get(accounts[0].connectionId)).toBe('Wiehen Store · a654321');
  expect(labels.get(accounts[1].connectionId)).toBe('Wiehen Store · b654321');
  expect(labels.get(accounts[2].connectionId)).toBe('Flipbase');
  expect(vintedAccountLabels([...accounts].reverse())).toEqual(labels);
});
