var Asker = require('../lib/asker'),
    httpTest = require('./lib/http'),
    contimer = require('contimer'),
    assert = require('chai').assert;

module.exports = {
    '#getUrl() should returns requested URL built from host, port and path options' : function() {
        var PROTOCOL = 'http:',
            HOST = 'yandex.com',
            PORT = '443',
            PATH = '/search',
            request = new Asker({
                protocol : PROTOCOL,
                host : HOST,
                port : PORT,
                path : PATH
            });

        assert.strictEqual(request.getUrl(), PROTOCOL + '//' + HOST + ':' + PORT + PATH,
            'url generated by Asker#getUrl is correct');
    },

    '#done() should call callback if passed to constructor' : function(done) {
        var ERROR = new Error('error'),
            RESPONSE = 'ok',

            request = new Asker({}, function(error, response) {
                assert.strictEqual(error, ERROR,
                    'error argument passed to callback');

                assert.strictEqual(response, RESPONSE,
                    'error argument passed to callback');

                done();
            });

        request.done(ERROR, RESPONSE);
    },

    '#done() should not trying to call undefined callback' : function() {
        var request = new Asker();

        assert.doesNotThrow(function() {
            request.done();
        });
    },

    '#done() should set #_isRunning flag to false' : function() {
        var request = new Asker();

        request._isRunning = true;

        assert.strictEqual(request._isRunning, true,
            '_isRunning was set to true manually');

        request.done();

        assert.strictEqual(request._isRunning, false,
            '_isRunning was set to false by #done() call');
    },

    '#getTimers() must returns `undefined` for timers, which is not resolved' : function() {
        var timers = (new Asker()).getTimers();

        assert.strictEqual(typeof timers.network, 'undefined', 'network time is undefined');
        assert.strictEqual(typeof timers.total, 'undefined', 'total time is undefined');
    },

    '#getTimers() returns timers values' : function() {
        var request = new Asker(),
            DELTA = 100;

        request._networkTime = { time : DELTA };

        assert.strictEqual(request.getTimers().network, DELTA, 'network time is computed right');

        request._executionTime = { time : DELTA };

        assert.strictEqual(request.getTimers().total, DELTA, 'total time is computed right');
    },

    '#execute starts "execution" timer' : function() {
        var request = new Asker();

        request.execute();

        assert(contimer.stop(request, 'execution').time >= 0, '#execute starts "execution" timer');
    },

    '#getTimers returns `NaN` if timers was not resolved' : function() {
        var request = new Asker();

        assert(isNaN(request.getTimers().total), '#getTimers().total is NaN');
        assert(isNaN(request.getTimers().network), '#getTimers().network is NaN');
    },

    'httpRequest `socket` event listener starts "network" timer' : httpTest(function(done, server) {
        var request = new Asker({ port : server.port });

        server.addTest(function(req, res) {
            assert.strictEqual(typeof contimer.stop(request, 'network').time, 'number',
                'network was started on request start');

            res.end();
            done();
        });

        request.execute();
    }),

    '#getTimers returns undefined `network` while request is not completed' : httpTest(function(done, server) {
        var request = new Asker({ port : server.port });

        server.addTest(function(req, res) {
            assert.strictEqual(typeof request.getTimers().network, 'undefined',
                'network timer is undefined');

            res.end();

            done();
        });

        request.execute();
    }),

    'httpRequest `end` event listener stops the "network" timer' : httpTest(function(done, server) {
        var request;

        server.addTest(function(req, res) {
            res.end();
        });

        request = new Asker({ port : server.port }, function() {
            assert(request.getTimers().network >= 0, 'network time is greater or equals to 0');

            done();
        });

        request.execute();
    }),

    '#formatTimestamp must return stringified human-readable result of #getTimers' : httpTest(function(done, server) {
        var TIMEOUT = 50,
            request;

        server.addTest(function(req, res) {
            setTimeout(function() {
                res.end();
            }, TIMEOUT);
        });

        request = new Asker({ port : server.port }, function() {
            var ts = request.formatTimestamp(),
                netTime, totalTime;

            assert.ok(/^in \d+\~\d+ ms$/.test(ts), 'timestamp format is ok');

            netTime = parseInt(/^in (\d+)~/.exec(ts)[1], 10);
            totalTime = parseInt(/~(\d+) ms$/.exec(ts)[1], 10);

            assert.ok( ! isNaN(netTime), 'network time is a number');
            assert.ok( ! isNaN(totalTime), 'total time is a number');

            assert.strictEqual(netTime, request.getTimers().network, 'stringified and original net time is equal');
            assert.strictEqual(totalTime, request.getTimers().total, 'stringified and original total time is equal');

            done();
        });

        request.execute();
    }),

    '#formatTimestamp interpolate undefined network time as "0"' : function() {
        var request = new Asker();

        assert.ok(/^in 0~/.test(request.formatTimestamp()), 'net time is "0"');
    },

    '#getResponseMetaBase returns fulfilled object after request execution' : httpTest(function(done, server) {
        var request;

        server.addTest(function(req, res) {
            res.end();
        });

        request = new Asker({ port : server.port }, function() {
            var metaBase = request.getResponseMetaBase();

            assert.strictEqual(typeof metaBase, 'object', 'meta is object');
            assert.deepEqual(Object.keys(metaBase), ['time','options','retries'],
                'meta contains required fields');
            assert.deepEqual(metaBase.time, request.getTimers(),
                'meta.time is equal #getTimers result');
            assert.deepEqual(metaBase.options, request.options,
                'meta.options is equal #options hash');
            assert.strictEqual(metaBase.retries.limit, request.options.maxRetries,
                'meta.retries.limit is equal #options.maxRetries');
            assert.strictEqual(metaBase.retries.used, request.retries,
                'meta.retries.used is equal #retries');

            done();
        });

        request.execute();
    }),

    '#resolve calls #done() without error and produce `response` object' : function(done) {
        var request = new Asker({}, function() {
                done();
            }),
            _done = request.done;

        request.done = function(error, data) {
            assert.strictEqual(error, null,
                '#done() called without error');

            assert.strictEqual(typeof data, 'object',
                '#done() called with data object');

            _done.apply(request, arguments);
        };

        request.resolve();
    },

    '#resolve produce `response.meta` using #getResponseMetaBase if the argument `meta` is not passed' : function(done) {
        var request = new Asker({}, function(error, response) {
            assert.deepEqual(response.meta, request.getResponseMetaBase(),
                'response.meta is equal request.getResponseMetaBase() result');

            done();
        });

        request.resolve();
    },

    '#statusCodeFilter must return `accept` only for codes 200 and 201' : function() {
        var request = new Asker();

        assert.deepEqual(
            request.statusCodeFilter(200),
            { accept : true, isRetryAllowed : true },
            'code 200 is accepted and retry is allowed for it');

        assert.deepEqual(
            request.statusCodeFilter(201),
            { accept : true, isRetryAllowed : true },
            'code 201 is accepted and retry is allowed for it');

        assert.deepEqual(
            request.statusCodeFilter(301),
            { accept : false, isRetryAllowed : true },
            'code 301 is not accepted and retry is allowed for it');

        assert.deepEqual(
            request.statusCodeFilter(401),
            { accept : false, isRetryAllowed : false },
            'code 401 is not accepted and retry is not allowed for it');
    }
};
