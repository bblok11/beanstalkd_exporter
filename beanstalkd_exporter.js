var _ = require('underscore');
var async = require('async');

var Prometheus = require("prometheus-client");
var fivebeans = require('fivebeans');
var express = require('express');
var argv = require('yargs')
    .usage('Usage: $0 <servers> [options]')
    .example('$0 127.0.0.1:11300 192.168.2.100 -p 9010', 'Listen to Beanstalkd at 127.0.0.1, port 9010')
    .alias('p', 'port')
    .alias('h', 'help')
    .default('p', 9114)
    .describe('p', 'Server port')
    .demand(1)
    .help('h')
    .argv;

var servers = argv._;
var serverPort = argv.p;

// Prepare server configs
var serverConfigs = [];

servers.forEach(function(server){

    var serverParts = server.split(':');
    serverConfigs.push({
        host: serverParts[0],
        port: serverParts.length > 1 ? parseInt(serverParts[1]) : 11300,
        connection: null
    });
});

var prometheus = new Prometheus();

var globalKeys = ['current-jobs-urgent', 'current-jobs-ready', 'current-jobs-reserved', 'current-jobs-delayed', 'current-jobs-buried', 'cmd-put',
    'cmd-peek', 'cmd-peek-ready', 'cmd-peek-delayed', 'cmd-peek-buried', 'cmd-reserve', 'cmd-reserve-with-timeout', 'cmd-delete', 'cmd-release',
    'cmd-use', 'cmd-watch', 'cmd-ignore', 'cmd-bury', 'cmd-kick', 'cmd-touch', 'cmd-stats', 'cmd-stats-job', 'cmd-stats-tube', 'cmd-list-tubes',
    'cmd-list-tube-used', 'cmd-list-tubes-watched', 'cmd-pause-tube', 'job-timeouts', 'total-jobs', 'max-job-size', 'current-tubes', 'current-connections',
    'current-producers', 'current-workers', 'current-waiting', 'total-connections', 'uptime'];

var tubeKeys = ['current-jobs-urgent', 'current-jobs-ready', 'current-jobs-reserved', 'current-jobs-delayed', 'current-jobs-buried',
    'total-jobs', 'current-using', 'current-watching', 'current-waiting', 'cmd-delete', 'cmd-pause-tube', 'pause', 'pause-time-left'];

// Create stats gauges
var gauges = {};

var up = gauges['up'] = prometheus.newGauge({
    namespace: "beanstalkd",
    name: "up",
    help: "Server is up"
});

var stats_error = gauges['stats_error'] = prometheus.newGauge({
    namespace: "beanstalkd",
    name: "stats_error",
    help: "Error during stats"
});

_.each(globalKeys, function(key){

    var name = 'global_' + parseKey(key);

    gauges[name] = prometheus.newGauge({
        namespace: "beanstalkd",
        name: name,
        help: "STATS " + key
    });
});

_.each(tubeKeys, function(key){

    var name = 'tube_' + parseKey(key);

    gauges[name] = prometheus.newGauge({
        namespace: "beanstalkd",
        name: name,
        help: "STATS TUBE " + key
    });
});

function update(req, res, updateCallback) {

    console.log('Getting stats...');

    _.each(serverConfigs, function (server) {

        var serverId = server.host + ':' + server.port;
        var serverIdObj = { server: serverId };

        var beanstalk = new fivebeans.client(server.host, server.port);
        beanstalk
            .on('connect', function () {

                console.log('Server ' + serverId + ' up');

                // Set up
                up.set(serverIdObj, 1);
                stats_error.set(serverIdObj, 0);

                var statsFunctions = [];

                beanstalk.list_tubes(function(tubesError, tubes){

                    if(tubesError){

                        console.error(tubesError);

                        stats_error.set(serverIdObj, 1);
                        beanstalk.end();
                        beanstalk = null;

                        updateCallback();

                        return;
                    }

                    // Get global stats
                    statsFunctions.push(function(callback){

                        beanstalk.stats(function(statsError, stats){

                            if(statsError){

                                callback(statsError);
                                return;
                            }

                            _.each(stats, function(statsValue, statsName){

                                var gague = gauges['global_' + parseKey(statsName)];
                                if(gague){
                                    gague.set(serverIdObj, statsValue);
                                }
                            });

                            callback();
                        });
                    });

                    // Get tube stats
                    _.each(tubes, function(tube){

                        statsFunctions.push(function(callback){

                            var tubeIdObj = { server: serverId, tube: tube };

                            beanstalk.stats_tube(tube, function(statsTubeError, statsTube){

                                if(statsTubeError){

                                    callback(statsTubeError);
                                    return;
                                }

                                _.each(statsTube, function(statsValue, statsName){

                                    var gague = gauges['tube_' + parseKey(statsName)];
                                    if(gague){
                                        gague.set(tubeIdObj, statsValue);
                                    }
                                });

                                callback();
                            });
                        });
                    });

                    // START
                    console.log('Getting stats for ' + serverId + '...');

                    async.series(statsFunctions, function(statsError){

                        if(statsError){

                            console.error(statsError);
                            stats_error.set(serverIdObj, 1);
                        }

                        beanstalk.end();
                        beanstalk = null;

                        console.log('Stats for ' + serverId + ' done');

                        updateCallback();
                    });
                });
            })
            .on('error', function (err) {

                // Set down
                console.log(err);
                console.log('Server ' + serverId + ' down');

                up.set(serverIdObj, 0);

                beanstalk.end();
                beanstalk = null;

                updateCallback();
            })
            .connect();
    });
}

function parseKey(key)
{
    return key.replace(/\-/g, '_');
}

// START
var app = express();
app.get("/metrics", update, prometheus.metricsFunc());

app.listen(serverPort, function() {
    console.log('Server listening at port ' + serverPort + '...');
});
app.on("error", function(err) {
    return console.error("Metric server error: " + err);
});