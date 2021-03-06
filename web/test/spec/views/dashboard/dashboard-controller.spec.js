'use strict';

describe('driver.views.dashboard: DashboardController', function () {

    beforeEach(module('ase.mock.resources'));
    beforeEach(module('driver.mock.resources'));
    beforeEach(module('driver.views.dashboard'));

    var $controller;
    var $httpBackend;
    var $rootScope;
    var $scope;
    var Controller;
    var DriverResourcesMock;
    var ResourcesMock;

    beforeEach(inject(function (_$controller_, _$httpBackend_, _$rootScope_,
                                _DriverResourcesMock_, _ResourcesMock_) {
        $controller = _$controller_;
        $httpBackend = _$httpBackend_;
        $rootScope = _$rootScope_;
        $scope = $rootScope.$new();
        DriverResourcesMock = _DriverResourcesMock_;
        ResourcesMock = _ResourcesMock_;
    }));

    it('should pass this placeholder test', function () {
        Controller = $controller('DashboardController', { $scope: $scope });

        $httpBackend.expectGET(/\/api\/boundaries/)
            .respond(ResourcesMock.GeographyResponse);
        $httpBackend.expectGET(/\/api\/recordtypes\//)
            .respond(200, ResourcesMock.RecordTypeResponse);

        $scope.$apply();
    });
});
