// Treachery：When Completed (完成時一次) 與 legacy (完成後整局，KC-12e)。
import { defineCard } from '../effects';
import { advanceCorruption } from '../ops';

defineCard('Hidden Pitfalls', [
  {
    key: 'Hidden Pitfalls/when',
    label: '腐化 +1',
    whenCompleted: (ctx) => advanceCorruption(ctx, 1, 'TR-01', 'Hidden Pitfalls'),
  },
  {
    key: 'Hidden Pitfalls/legacy',
    label: '移動時距離 +2',
    modify: (_s, _src, q, v) => (q.stat === 'distance' ? v + 2 : v),
  },
]);
