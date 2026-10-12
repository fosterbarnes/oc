| Model | Provider | Input | Cache write | Cache read | Output | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| [Claude Opus 5.5](https://example.test) | Anthropic | $4 | $5 | $0.2 | $20 | Up to 1M tokens with extended context at the same per-token rates |
| [Grok 4.7](https://example.test) | Cursor | $2 | - | $0.5 | $6 | Long context (>256k input tokens) is billed at 2x standard rates |
| [Grok 4.7 (Fast)](https://example.test) | Cursor | $4 | - | $1 | $12 | Fast mode is available at 2x pricing |
| [Grok 4.7 500k](https://example.test) | Cursor | $4 | - | $1 | $12 | Long context |
| [Grok 4.7 500k (Fast)](https://example.test) | Cursor | $6 | - | $1.5 | $18 | Fast mode for long context |
| [Grok 4.7 1M](https://example.test) | Cursor | $8 | - | $2 | $24 | 1M context |
