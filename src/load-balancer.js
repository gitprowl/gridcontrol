var request = require('request');
var crypto  = require('crypto');
var debug   = require('debug')('lb');

/**
 * Load balancer
 * @constructor
 * @param opts {object} options
 * @param opts.task_manager {object} task manager object
 * @param opts.net_manager {object} net manager object
 * @param opts.local_loop {boolean} should the LB proxy query to local?
 */
var LoadBalancer = function(opts) {
  this.local_loop       = opts.local_loop || true;
  this.stats_tasks      = {};
  this.processing_tasks = {};

  // Round robin index
  this._rri = 0;
};

LoadBalancer.prototype.findSuitablePeer = function(req, cb) {
  var that  = this;
  var retry = 0;

  //@todo take monitoring data into account
  function genPeerHash() {
    var all_peers     = [];

    all_peers.push({
      socket : {
        identity : {
          synchronized : true
        }
      },
      local        : true
    });

    var remote_peers  = req.net_manager.getSocketRouters();

    remote_peers.forEach(function(peer) {
      all_peers.push(peer);
    });

    return all_peers;
  };

  (function rec() {
    if (retry++ > 15)
      console.error('Trying too many time to route request!');

    var peers  = genPeerHash();
    var target = peers[that._rri++ % peers.length];

    if (target.socket.identity.synchronized == false)
      return setTimeout(rec, 100);
    return cb(null, target);
  })();
};

LoadBalancer.prototype.route = function(req, res, next) {
  var task_id  = req.body.task_id;
  var task_data = req.body;

  var that = this;

  var uid = crypto.randomBytes(32).toString('hex');

  // Avoid integer overflow
  if (Number.isSafeInteger(that._rri) === false)
    that._rri = 0;

  this.findSuitablePeer(req, function(err, peer) {
    if (peer.local) {
      console.log('Routing to local');
      req.task_manager.triggerTask(task_id, task_data, function(err, ret) {
        res.send(ret);
      });
      return false;
    }

    console.log('Re routing query to %s:%s',
                peer.socket.identity.private_ip,
                peer.socket.identity.api_port);

    peer.send('trigger', {
      task_id : task_id,
      data    : task_data
    }, function(err, data) {
      res.send(data);
    });

    return false;




    // @todo: do stats on task processing (invokation, errors...)
    // + Log running tasks for smarter load balancing in the future
    // + link with HealthCheck regular data to know load
    // if (!that.stats_tasks[task_id])

    that.processing_tasks[task_exec_id] = {
      started_at : new Date(),
      peer_info  : peer,
      task_id    : task_id,
      rout_url   : url
    };

    function onErr() {
      delete that.processing_tasks[task_exec_id];
      console.error('Error while proxying task request');
      res.end();
    }

    a.on('error', onErr);

    a.on('end', function() {
      delete that.processing_tasks[task_exec_id];
    });

    // Proxy query to the right service
    req
      .pipe(a, { end : false })
      .pipe(res)
      .on('error', onErr);
  });
};

LoadBalancer.prototype.broadcast = function(req, res, next) {
};

module.exports = LoadBalancer;
