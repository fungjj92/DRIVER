(function() {
    'use strict';

    /**
     * @ngInject
     */
    function AuthService($log, $q, $http, $cookies, $rootScope, $timeout, $window, ASEConfig, UserService) {
        var module = {};

        var canWriteCookieString = 'AuthService.canWrite';
        var userIdCookieString = 'AuthService.userId';
        var tokenCookieString = 'AuthService.token';
        var cookieTimeout = null;
        var cookieTimeoutMillis = 24 * 60 * 60 * 1000;      // 24 hours

        var events = {
            loggedIn: 'ASE:Auth:LoggedIn',
            loggedOut: 'ASE:Auth:LoggedOut'
        };

        module.events = events;

        module.isAuthenticated =  function () {
            return !!(module.getToken() && module.getUserId() >= 0);
        };

        module.authenticate = function(auth, needsAdmin) {
            var dfd = $q.defer();
            $http.post(ASEConfig.api.hostname + '/api-token-auth/', auth)
            .success(function(data, status) {
                var result = {
                    status: status,
                    error: ''
                };

                // if user needs to be an admin to log in, check if they are first
                if (needsAdmin) {
                    if (data && data.user && data.token) {
                        $log.debug('sending user service user:');
                        $log.debug(data.user);
                        $log.debug('and token');
                        $log.debug(data.token);

                        UserService.isAdmin(data.user, data.token).then(function(isAdmin) {
                            if (isAdmin) {
                                // am an admin; log in
                                setUserId(data.user);
                                setToken(data.token);
                                result.isAuthenticated = module.isAuthenticated();
                                if (result.isAuthenticated) {
                                    // admins can write records
                                    setCanWrite(true).then(function() {
                                        $rootScope.$broadcast(events.loggedIn);
                                        dfd.resolve(result);
                                    });
                                } else {
                                    result.error = 'Unknown error logging in.';
                                    dfd.resolve(result);
                                }
                            } else {
                                // user is not an admin and admin access is required
                                $log.debug('user service sent back:');
                                $log.debug(isAdmin);
                                result.isAuthenticated = false;
                                result.error = 'Must be an administrator to access this portion of the site.';
                                dfd.resolve(result);
                            }
                        }, function() {
                            result.isAuthenticated = false;
                            result.error = 'Unknown error logging in.';
                            dfd.resolve(result);
                        });
                    } else {
                        result.isAuthenticated = false;
                        result.error = 'Error obtaining user information.';
                        dfd.resolve(result);
                    }
                } else {
                    // admin access not required; log in
                    setUserId(data.user);
                    setToken(data.token);
                    result.isAuthenticated = module.isAuthenticated();
                    if (result.isAuthenticated) {
                        // set whether user has write access or not
                        UserService.canWriteRecords(data.user, data.token).then(function(canWrite) {
                            setCanWrite(canWrite).then(function() {
                                $rootScope.$broadcast(events.loggedIn);
                                dfd.resolve(result);
                            });
                        });
                    } else {
                        result.error = 'Unknown error logging in.';
                        setCanWrite(false);
                        dfd.resolve(result);
                    }
                }
            })
            .error(function(data, status) {
                var error = _.values(data).join(' ');
                if (data.username) {
                    error = 'Username field required.';
                }
                if (data.password) {
                    error = 'Password field required.';
                }
                var result = {
                    isAuthenticated: false,
                    status: status,
                    error: error
                };
                dfd.resolve(result);
            });

            return dfd.promise;
        };

        module.getToken = function() {
            return $cookies.getObject(tokenCookieString);
        };

        module.getUserId = function() {
            var userId = parseInt($cookies.getObject(userIdCookieString), 10);
            return isNaN(userId) ? -1 : userId;
        };

        /*
         * Returns true if currently logged in user has write access (admin or analyst)
         */
        module.hasWriteAccess = function() {
            return $cookies.getObject(canWriteCookieString) || false;
        };

        module.logout =  function() {
            setUserId(null);
            $cookies.remove(tokenCookieString, {path: '/'});
            setCanWrite(false).then(function() {
                $rootScope.$broadcast(events.loggedOut);
                if (cookieTimeout) {
                    $timeout.cancel(cookieTimeout);
                    cookieTimeout = null;
                }

                // Hit logout openid endpoint after clearing cookies to log out of API session
                // created by SSO login, too. Refreshes page for token/user cookies to clear as well.
                // Redirects back to current location when done.
                $window.location.href = [ASEConfig.api.hostname,
                    '/api-auth/logout/?next=',
                    $window.location.href].join('');
            });
        };

        return module;


        function setCanWrite(canWrite) {
            // set cookie after a timeout. Angular polls every 100ms to see if there are any
            // cookies to set; necessary to make sure cookie is set before full page refresh.
            //
            // https://github.com/angular/angular.js/blob/1bb33cccbe12bda4c397ddabab35ba1df85d5137/src/ng/browser.js#L102
            // https://github.com/angular/angular.js/blob/1bb33cccbe12bda4c397ddabab35ba1df85d5137/src/ngCookies/cookies.js#L58-L66
            return $timeout(function() {
                $cookies.putObject(canWriteCookieString, canWrite, {path: '/'});
            }, 110);
        }

        function setToken(token) {
            if (!token) {
                return;
            }

            // clear timeout if we re-authenticate for whatever reason
            if (cookieTimeout) {
                $timeout.cancel(cookieTimeout);
                cookieTimeout = null;
            }

            $cookies.putObject(tokenCookieString, token, {path: '/'});

            cookieTimeout = $timeout(function() {
                module.logout();
            }, cookieTimeoutMillis);
        }

        function setUserId(id) {
            var userId = parseInt(id, 10);
            userId = !isNaN(userId) && userId >= 0 ? userId : -1;
            $cookies.putObject(userIdCookieString, userId, {path: '/'});
        }
    }

    angular.module('ase.auth').factory('AuthService', AuthService);

})();
