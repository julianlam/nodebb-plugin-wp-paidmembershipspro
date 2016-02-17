"use strict";

var async = require.main.require('async'),
	winston = require.main.require('winston'),
	_ = require.main.require('underscore'),
	xmlrpc = require('xmlrpc');

var db = module.parent.require('./database'),
	groups = module.parent.require('./groups'),
	meta = module.parent.require('./meta');

var controllers = require('./lib/controllers'),
	plugin = {
		_settings: {
			host: '127.0.0.1',
			port: 80,
			path: '/xmlrpc.php'
		}
	};

plugin.init = function(params, callback) {
	var router = params.router,
		hostMiddleware = params.middleware,
		hostControllers = params.controllers;
		
	router.get('/admin/plugins/wp-paidmembershipspro', hostMiddleware.admin.buildHeader, controllers.renderAdminPage);
	router.get('/api/admin/plugins/wp-paidmembershipspro', controllers.renderAdminPage);

	async.waterfall([
		async.apply(plugin.refreshSettings),
		function(next) {
			plugin.client = xmlrpc.createClient({ host: plugin._settings.host, port: plugin._settings.port, path: plugin._settings.path });
			next();
		},
		async.apply(plugin.createGroups)
	], callback);
};

plugin.addAdminNavigation = function(header, callback) {
	header.plugins.push({
		route: '/plugins/wp-paidmembershipspro',
		icon: 'fa-lock',
		name: 'Paid Memberships Pro (WordPress)'
	});

	callback(null, header);
};

plugin.refreshSettings = function(callback) {
	meta.settings.get('wp-paidmembershipspro', function(err, settings) {
		// Filter out empty values
		for(var key in settings) {
			if (settings.hasOwnProperty(key) && !settings[key]) {
				delete settings[key];
			}
		}

		plugin._settings = _.defaults(settings, plugin._settings);
		callback();
	});
};

plugin.createGroups = function(callback) {
	/*
		Note: Can't use this method as the pmp plugin returns boolean even if I pass in true, 'true', 1, or '1' to hasMembershipAccess.
	*/

	// winston.verbose('[plugins/wp-paidmembershipspro] Querying for membership levels...');
	// plugin.client.methodCall('pmpro.hasMembershipAccess', [plugin._settings.adminuser, plugin._settings.adminpass, 1, 1, 'true'], function(err, payload) {
	// 	if (err) {
	// 		winston.error('[plugins/wp-paidmembershipspro] Unable to retrieve groups list!');
	// 		return callback();
	// 	}

	// 	console.log(payload);
		callback();
	// });
};

plugin.process = function(data, callback) {
	plugin.client.methodCall('pmpro.getMembershipLevelForUser', [plugin._settings.adminuser, plugin._settings.adminpass, parseInt(data.profile.ID, 10)], function(err, membership) {
		if (err) {
			winston.error('[plugins/wp-paidmembershipspro] Unable to verify user membership data for uid ' + data.user.uid + ', revoking...');
			winston.error(err.message);
			console.log(err.stack);
			return plugin.revokeAccess(data.user.uid, callback);
		}

		plugin.grantAccess(data.user.uid, membership.name, callback);
	});
};

plugin.grantAccess = function(uid, groupName, callback) {
	winston.verbose('[plugins/wp-paidmembershipspro] Granting access to "' + groupName + '" for uid ' + uid);
	async.series([
		function(next) {
			groups.exists(groupName, function(err, exists) {
				if (!exists) {
					winston.verbose('[plugins/wp-paidmembershipspro] Group "' + groupName + '" does not exist, creating...');
					groups.create({
						name: groupName,
						hidden: 1,
						disableJoinRequests: 1,
						system: 1
					}, next);
				} else {
					next();
				}
			});
		},
		async.apply(groups.join, groupName, parseInt(uid, 10))
	], callback);
};

plugin.revokeAccess = function(uid, callback) {
	winston.verbose('[plugins/wp-paidmembershipspro] Revoking access to membership groups for uid ' + uid);
	callback();
};

module.exports = plugin;