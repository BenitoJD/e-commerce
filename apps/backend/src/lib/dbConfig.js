// Postgres pool configuration.
//
// Previously the pool was `new Pool({ connectionString })`, no maximum, no connection
// timeout and no statement timeout. Under load (or one slow query) requests would queue
// indefinitely instead of failing fast, and nothing bounded how many clients a single
// container opened against Postgres.
function intFrom(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function buildPoolConfig(env = process.env) {
  return {
    connectionString: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ecommerce',
    application_name: 'e-commerce-api',
    // Cap concurrent clients so the API can't exhaust Postgres connection slots.
    max: intFrom(env.DB_POOL_MAX, 10),
    // Give up waiting for a slot/connection instead of hanging the request forever.
    connectionTimeoutMillis: intFrom(env.DB_CONNECT_TIMEOUT_MS, 5000),
    idleTimeoutMillis: intFrom(env.DB_IDLE_TIMEOUT_MS, 30000),
    // A single runaway query must not pin a connection: the server aborts it.
    statement_timeout: intFrom(env.DB_STATEMENT_TIMEOUT_MS, 15000),
    query_timeout: intFrom(env.DB_STATEMENT_TIMEOUT_MS, 15000),
  };
}

module.exports = { buildPoolConfig };
