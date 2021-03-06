'use strict';

describe('driver.blackSpots: BlackSpots', function () {

    beforeEach(module('ase.templates'));
    beforeEach(module('driver.blackSpots'));

    var $compile;
    var $rootScope;

    beforeEach(inject(function (_$compile_, _$rootScope_) {
        $compile = _$compile_;
        $rootScope = _$rootScope_;
    }));

    it('should load directive', function () {
        var scope = $rootScope.$new();
        var element = $compile('<driver-black-spots></driver-black-spots>')(scope);
        $rootScope.$apply();
    });
});
