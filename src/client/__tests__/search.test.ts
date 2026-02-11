import { describe, expect, it } from 'vitest';
import { SearchMode, searchTweets } from '../search';

describe('searchTweets', () => {
  it('maps conversation_id from Twitter API into conversationId', async () => {
    const mockIterator = {
      includes: {
        users: [{ id: '42', username: 'alice', name: 'Alice' }],
      },
      async *[Symbol.asyncIterator]() {
        yield {
          id: '100',
          text: 'reply tweet',
          author_id: '42',
          conversation_id: '55',
          created_at: '2026-01-01T00:00:00.000Z',
          entities: {},
          public_metrics: {},
          referenced_tweets: [{ type: 'replied_to', id: '55' }],
        };
      },
    };

    const auth = {
      getV2Client: async () => ({
        v2: {
          search: async () => mockIterator,
        },
      }),
    };

    const tweets = [];
    for await (const tweet of searchTweets('test', 5, SearchMode.Latest, auth as any)) {
      tweets.push(tweet);
    }

    expect(tweets).toHaveLength(1);
    expect(tweets[0].conversationId).toBe('55');
    expect(tweets[0].isReply).toBe(true);
  });
});
