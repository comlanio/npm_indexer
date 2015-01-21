#!/usr/bin/env node
var Promise = require('bluebird'),
    couchdb = require('./lib/couchdb').client,
    argv = require('minimist')(process.argv.slice(2)),
    redis = require('./lib/redis').createClient(),
    log = require('logging').from(__filename);

function addDocumentToCache(document) {
    if (document.name) {
        var searchTokens = [document.name];
        var pkg = {
            name: document.name
        };
        if (document.description) {
            pkg.desc = document.description;
            searchTokens.push(document.description);
        }
        if (document.keywords) {
            pkg.kw = document.keywords;
            searchTokens.concat(document.keywords);
        }
        if (document.versions) {
            pkg.ver = Object.keys(document.versions);
        }
        return redis.hmset(document.name, pkg)
            .then(function() {
                redis.hset('search_index', searchTokens.join(' '), document.name);
            }, function(err) {
                console.log(err, document.name, pkg);
            });
    }
    return Promise.resolve();
}

function getDocumentsSlice(start, size) {
    log('Getting ' + size + ' document(s) from ' + start);
    return couchdb.all({limit: size, skip: start, include_docs: true})
        .map(function (document) {
            addDocumentToCache(document.doc);
        });
}

function clearIndex() {
    return redis.del('keys')
        .then(function() {
            return redis.keys('*')
        })
        .map(function(key) {
            return redis.del(key);
        });
}

function initializeCache() {
    log('Initializing cache...');
    couchdb.info()
        .then(function(info) {
            log('Update seq: ', info.update_seq);
            log('Documents count: ', info.doc_count);
            var slicesCount = 100;
            var sliceSize = Math.ceil(info.doc_count/ slicesCount);
            return clearIndex()
                .then(function() {
                    var slices = [0];
                    for (var i=1; i<slicesCount; i++) {
                        slices.push(slices[i-1]+sliceSize);
                    }
                    return slices;
                })
                .each(function(start) {
                    return getDocumentsSlice(start, sliceSize);
                }, {concurrency: 1})
                .then(function() {
                    return redis.set('update_seq', info.update_seq);
                });
        })
        .finally(function() {
            redis.quit();
        });
}

function updateCache() {
    redis.get('update_seq')
        .then(function (seq) {
            if (seq === null) {
                return Promise.reject('Uninitialized index, use --init to initialize');
            }
            var last_seq = seq;
            return couchdb.changes({since: last_seq, include_docs: true})
                .then(function(documents) {
                    var documentsCount = documents.length;
                    log(documentsCount + ' document(s) changed since seq ' + seq);
                    for (var i = 0; i < documentsCount; i++) {
                        var document = documents[i];
                        addDocumentToCache(document.doc);
                        last_seq = Math.max(last_seq, document.seq);
                    }
                    log('Waiting for next changes...');
                    return redis.set('update_seq', last_seq);
                });
        })
        .delay(5000)
        .then(updateCache)
        .catch(function(err) {
            log(err);
            redis.quit();
        });
}

if (argv.init) {
    initializeCache();
} else {
    updateCache();
}

