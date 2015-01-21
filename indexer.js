#!/usr/bin/env node
var Promise = require('bluebird'),
    couchdb = require('./lib/couchdb').client,
    argv = require('minimist')(process.argv.slice(2)),
    elasticsearch = require('elasticsearch').Client(),
    log = require('logging').from(__filename);

function addDocumentToCache(document) {
    if (document.name) {
        var pkg = {
            name: document.name
        };
        if (document.description) {
            pkg.desc = document.description;
        }
        if (document.keywords) {
            pkg.kw = document.keywords;
        }
        if (document.versions) {
            pkg.ver = Object.keys(document.versions);
        }
        if (document.time && document.time.modified) {
            pkg.time = document.time.modified
        }
        return elasticsearch.index({
            index: 'packages',
            type: 'package',
            id: document.name,
            body: pkg
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
    return elasticsearch.indices.exists({ index: 'packages' })
        .then(function(exists) {
            if (exists) {
                return elasticsearch.indices.delete({ index: 'packages' });
            }
            return Promise.resolve();
        })
        .then(function() {
            return elasticsearch.indices.exists({ index: 'info' })
                .then(function(exists) {
                    if (exists) {
                        return elasticsearch.indices.delete({ index: 'info' });
                    }
                    return Promise.resolve();
                })
        })
        .then(function() {
            return elasticsearch.indices.create({ index: 'packages' })
        })
        .then(function() {
            return elasticsearch.indices.create({ index: 'info' })
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
                    return elasticsearch.index({
                        index: 'info',
                        type: 'seq',
                        id: 'update_seq',
                        body: { value: info.update_seq }
                    });
                });
        });
}

function updateCache() {
    elasticsearch.get({
            index: 'info',
            type: 'seq',
            fields: [ 'value' ],
            id: 'update_seq'
        })
        .then(function (seq) {
            if (seq === null) {
                return Promise.reject('Uninitialized index, use --init to initialize');
            }
            var last_seq = seq.fields.value;
            return couchdb.changes({since: last_seq, include_docs: true})
                .then(function(documents) {
                    var documentsCount = documents.length;
                    log(documentsCount + ' document(s) changed since seq ' + seq.fields.value);
                    for (var i = 0; i < documentsCount; i++) {
                        var document = documents[i];
                        addDocumentToCache(document.doc);
                        last_seq = Math.max(last_seq, document.seq);
                    }
                    log('Waiting for next changes...');
                    return elasticsearch.index({
                        index: 'info',
                        type: 'seq',
                        id: 'update_seq',
                        body: { value: last_seq }
                    });
                });
        })
        .delay(5000)
        .then(updateCache)
        .catch(function(err) {
            log(err);
        });
}

if (argv.init) {
    initializeCache();
} else {
    updateCache();
}

