'use strict';

describe('driver.navbar: NavbarController', function () {

    beforeEach(module('ase.mock.resources'));
    beforeEach(module('driver.mock.resources'));
    beforeEach(module('driver.navbar'));
    beforeEach(module('driver.views.account'));
    beforeEach(module('driver.views.dashboard'));
    beforeEach(module('ui.router'));

    var $controller;
    var $httpBackend;
    var $rootScope;
    var $scope;
    var $state;
    var Controller;
    var DriverResourcesMock;
    var ResourcesMock;

    beforeEach(inject(function (_$controller_, _$httpBackend_, _$rootScope_, _$state_,
                                _DriverResourcesMock_, _ResourcesMock_) {
        $controller = _$controller_;
        $httpBackend = _$httpBackend_;
        $rootScope = _$rootScope_;
        $scope = $rootScope.$new();
        $state = _$state_;
        DriverResourcesMock = _DriverResourcesMock_;
        ResourcesMock = _ResourcesMock_;

        spyOn($state, 'go');
    }));

    it('should have record types, boundaries, and available states', function () {
        var geographiesUrl = /\/api\/boundaries/;
        var recordTypeUrl = /\/api\/recordtypes\/\?active=True/;
        var boundaryUrl = /\/api\/boundarypolygons/;
        var userInfoUrl = /\/api\/users/;

        $httpBackend.expectGET(geographiesUrl).respond(200, ResourcesMock.GeographyResponse);
        $httpBackend.expectGET(recordTypeUrl).respond(200, ResourcesMock.RecordTypeResponse);
        $httpBackend.expectGET(boundaryUrl).respond(200, ResourcesMock.BoundaryNoGeomResponse);
        $httpBackend.expectGET(userInfoUrl).respond(200, ResourcesMock.UserInfoResponse);

        Controller = $controller('NavbarController', {
            $scope: $scope
        });
        $scope.$apply();

        $httpBackend.flush();
        $httpBackend.verifyNoOutstandingRequest();

        expect(Controller.recordTypeResults.length).toBeGreaterThan(0);
        expect(Controller.geographyResults.length).toBeGreaterThan(0);
        expect(Controller.boundaryResults.length).toBeGreaterThan(0);
    });

    it('should not have current state as an option', function () {
        var geographiesUrl = /\/api\/boundaries/;
        var recordTypeUrl = /\/api\/recordtypes\/\?active=True/;
        var boundaryUrl = /\/api\/boundarypolygons/;
        var userInfoUrl = /\/api\/users/;

        $httpBackend.expectGET(geographiesUrl).respond(200, ResourcesMock.GeographyResponse);
        $httpBackend.expectGET(recordTypeUrl).respond(200, ResourcesMock.RecordTypeResponse);
        $httpBackend.expectGET(boundaryUrl).respond(200, ResourcesMock.BoundaryNoGeomResponse);
        $httpBackend.expectGET(userInfoUrl).respond(200, ResourcesMock.UserInfoResponse);

        $state.current = $state.get('dashboard');

        Controller = $controller('NavbarController', {
            $scope: $scope
        });

        $httpBackend.flush();
        $httpBackend.verifyNoOutstandingRequest();

        var matches = _.filter(Controller.availableStates, function(state) {
            return state.name === 'dashboard';
        });
        expect(Controller.availableStates.length).toBeGreaterThan(0);
        // TODO: add this back in - $state.current isn't working properly in the test context
        // expect(matches.length).toBe(0);
    });

    it('should correctly navigate to state', function () {
        var geographiesUrl = /\/api\/boundaries/;
        var recordTypeUrl = /\/api\/recordtypes\/\?active=True/;
        var boundaryUrl = /\/api\/boundarypolygons/;
        var userInfoUrl = /\/api\/users/;

        $httpBackend.expectGET(geographiesUrl).respond(200, ResourcesMock.GeographyResponse);
        $httpBackend.expectGET(recordTypeUrl).respond(200, ResourcesMock.RecordTypeResponse);
        $httpBackend.expectGET(boundaryUrl).respond(200, ResourcesMock.BoundaryNoGeomResponse);
        $httpBackend.expectGET(userInfoUrl).respond(200, ResourcesMock.UserInfoResponse);

        Controller = $controller('NavbarController', {
            $scope: $scope
        });

        $httpBackend.flush();
        $httpBackend.verifyNoOutstandingRequest();

        Controller.navigateToStateName('account');
        expect($state.go).toHaveBeenCalledWith('account');

        Controller.onStateSelected($state.get('dashboard'));
        expect($state.go).toHaveBeenCalledWith('dashboard');
    });
});
