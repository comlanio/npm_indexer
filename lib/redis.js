var Promise = require('bluebird'),
    redis = require('redis');

var METHODS_TO_PROMISIFY = [
    'hscan',
    'hset',
    'hget',
    'hmset',
    'hgetall',
    'keys',
    'set',
    'del',
    'get'
];

function promisifyClientMethods(client) {
    var oldMethods = [];
    for (var i = METHODS_TO_PROMISIFY.length; i--;) {
        oldMethods.unshift(client[METHODS_TO_PROMISIFY[i]]);
        client[METHODS_TO_PROMISIFY[i]] = Promise.promisify(oldMethods[0]);
    }
}

exports.createClient = function createClient(arg0, arg1, arg2) {
    var client;
    if (arguments.length == 0) {
        client = redis.createClient();
    } else {
        client = redis.createClient(arg0, arg1, arg2);
    }
    promisifyClientMethods(client);
    return client;
};