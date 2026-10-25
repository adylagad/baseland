# Anthropic API key

The engine's Brain calls the Claude API: Sonnet for decisions, Haiku for
turning sentences into chips and for writing the Deck.

1. Go to console.anthropic.com → **API Keys** → **Create Key**, and name it
   `baseland`.
2. Make sure the workspace has credits. A hackathon's worth of decisions costs
   a few dollars at most.
3. Put it in `apps/engine/.env` as `ANTHROPIC_API_KEY=...` (gitignored) and,
   once Render exists, in the Render service's Environment.

Don't paste the key into chat. Say "the Anthropic key is in
apps/engine/.env".
