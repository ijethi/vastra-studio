process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.APP_URL ??= "http://localhost:3000";
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
