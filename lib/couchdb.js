var Promise = require('bluebird'),
    cradle = require('cradle');

var METHODS_TO_PROMISIFY = [
    'all',
    'info',
    'changes'
];

cradle.setup({
    host: 'skimdb.npmjs.com',
    port: 443,
    cache: true,
    raw: false
});

var couchdb = new (cradle.Connection)().database('registry');

function promisifyClientMethods(client) {
    var oldMethods = [];
    for (var i = METHODS_TO_PROMISIFY.length; i--;) {
        oldMethods.unshift(client[METHODS_TO_PROMISIFY[i]]);
        client[METHODS_TO_PROMISIFY[i]] = Promise.promisify(oldMethods[0]);
    }
}

promisifyClientMethods(couchdb);

exports.client = couchdb;