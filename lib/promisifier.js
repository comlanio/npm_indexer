var Promise = require('bluebird');

exports.promisifyClientMethods = function promisifyClientMethods(client, methodsNames) {
    var oldMethods = [];
    for (var i = methodsNames.length; i--;) {
        oldMethods.unshift(client[methodsNames[i]]);
        client[methodsNames[i]] = Promise.promisify(oldMethods[0]);
    }
    return client;
};
