import { appendFileSync } from 'node:fs';

let nextMediaId = 0;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.hostname === 'x.com' && !url.pathname.startsWith('/i/api/')) {
    const authenticated = init.headers?.cookie === 'auth_token=test-token; ct0=test-csrf';
    appendFileSync(process.env.MOCK_X_REQUESTS, JSON.stringify({ operation: 'discovery-page', authenticated }) + '\n');
    return new Response(authenticated
      ? '<script src="https://abs.twimg.com/responsive-web/client-web/main.test.js"></script>'
      : '<script src="https://abs.twimg.com/x-web/x-web/entry-client-logged-out.js"></script>');
  }
  if (url.hostname === 'abs.twimg.com') {
    if (init.headers?.cookie || init.headers?.authorization) throw new Error('Credentials leaked to a public bundle');
    appendFileSync(process.env.MOCK_X_REQUESTS, JSON.stringify({ operation: 'discovery-bundle' }) + '\n');
    return new Response('e.exports={queryId:"fresh-query-id",operationName:"CreateTweet"}');
  }
  if (url.hostname === 'upload.x.com') {
    appendFileSync(process.env.MOCK_X_REQUESTS, JSON.stringify({
      operation: 'upload',
      name: init.body.get('media').name,
    }) + '\n');
    if (process.env.MOCK_X_SCENARIO === 'upload-error') {
      return new Response('Upload rejected', { status: 403 });
    }
    return Response.json({ media_id_string: String(++nextMediaId) });
  }
  if (url.hostname === 'x.com' && url.pathname.endsWith('/CreateTweet')) {
    const body = JSON.parse(init.body);
    appendFileSync(process.env.MOCK_X_REQUESTS, JSON.stringify({
      operation: 'CreateTweet',
      queryId: body.queryId,
      variables: body.variables,
    }) + '\n');
    if ((process.env.MOCK_X_SCENARIO === 'stale-id' && body.queryId === 'test-query-id') ||
        (process.env.MOCK_X_SCENARIO === 'refresh-id' && body.queryId !== 'fresh-query-id')) {
      return new Response('Query not found', { status: 404 });
    }
    if (process.env.MOCK_X_SCENARIO === 'http-error') {
      return new Response('Authentication failed', { status: 401 });
    }
    if (process.env.MOCK_X_SCENARIO === 'graphql-error') {
      return Response.json({ errors: [{ message: 'Posting is not allowed', code: 226 }] });
    }
    if (process.env.MOCK_X_SCENARIO === 'missing-id') {
      return Response.json({ data: {} });
    }
    if (process.env.MOCK_X_SCENARIO === 'required-features') {
      // Required by the CreateTweet metadata in X's November 2026 client.
      const required = [
        'rweb_cashtags_composer_attachment_enabled', 'rweb_sports_post_context_enabled',
        'x_elections_post_context_enabled', 'responsive_web_grok_annotations_enabled',
        'rweb_conversational_replies_downvote_enabled', 'content_disclosure_indicator_enabled',
        'content_disclosure_ai_generated_indicator_enabled', 'post_ctas_fetch_enabled',
        'responsive_web_nested_quote_preview_enabled', 'rweb_cashtags_enabled',
        'responsive_web_made_on_x_label_enabled',
      ];
      const missing = required.filter(key => typeof body.features?.[key] !== 'boolean');
      if (missing.length) return new Response(`Missing feature flags: ${missing.join(', ')}`, { status: 400 });
    }
    return Response.json({ data: { create_tweet: { tweet_results: { result: {
      rest_id: '987654321',
      legacy: { full_text: body.variables.tweet_text },
      core: { user_results: { result: { core: { screen_name: 'testuser' } } } },
    } } } } });
  }
  throw new Error(`Unexpected test HTTP request: ${url.origin}${url.pathname}`);
};
