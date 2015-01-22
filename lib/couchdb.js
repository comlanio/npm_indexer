var promisifier = require('./promisifier'),
    cradle = require('cradle');


function promisifyClient(couchdb) {
    var METHODS_TO_PROMISIFY = [
        'all',
        'info',
        'changes'
    ];
    return promisifier.promisifyClientMethods(couchdb, METHODS_TO_PROMISIFY);
}

exports.client = function(options) {
    if (!options) {
        options = {};
    }

    var couchdb = new (cradle.Connection)(
        options.host || 'localhost',
        options.port || 80,
        {
            cache: true,
            raw: false
        })
        .database(options.db || 'registry');
    return promisifyClient(couchdb);
};