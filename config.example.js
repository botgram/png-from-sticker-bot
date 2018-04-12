// Telegram API token here
exports.api_token = "<API TOKEN>"

// -----------------------

// Location of the cache database
exports.cache_db = __dirname + "/cache.db"

// maximum buffer size for converted output
exports.maxBuffer = 10 * 1024 * 1024  // 10MB

// maximum number of unused sockets left open to Telegram API
exports.maxFreeSockets = 10
