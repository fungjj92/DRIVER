from datetime import datetime, timedelta
import json
import uuid

import mock
import pytz

from rest_framework.request import Request

from rest_framework.test import APIClient, APITestCase, APIRequestFactory, force_authenticate
from rest_framework import status
from django.contrib.auth.models import User
from django.conf import settings

from ashlar.models import RecordSchema, RecordType, Record

from data.filters import RecordAuditLogFilter
from data.models import RecordAuditLogEntry
from data.views import DriverRecordViewSet, DriverRecordSchemaViewSet, DriverRecordAuditLogViewSet
from data.serializers import DetailsReadOnlyRecordSerializer, DetailsReadOnlyRecordSchemaSerializer


class DriverRecordViewTestCase(APITestCase):
    def setUp(self):
        super(DriverRecordViewTestCase, self).setUp()

        try:
            self.admin = User.objects.get(username=settings.DEFAULT_ADMIN_USERNAME)
        except User.DoesNotExist:
            self.admin = User.objects.create_user('admin', 'admin@ashlar', 'admin')
            self.admin.is_superuser = True
            self.admin.is_staff = True
            self.admin.save()

        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.factory = APIRequestFactory()

        self.now = datetime.now(pytz.timezone('Asia/Manila'))
        self.then = self.now - timedelta(days=10)
        self.beforeThen = self.then - timedelta(days=1)
        self.afterThen = self.then + timedelta(days=1)
        self.beforeNow = self.now - timedelta(days=1)
        self.afterNow = self.now + timedelta(days=1)

        self.tod = self.now.hour
        self.dow = self.now.isoweekday() + 1  # 1 added here to handle differences in indexing

        self.record_type = RecordType.objects.create(label='foo', plural_label='foos')
        self.schema = RecordSchema.objects.create(schema={"type": "object"},
                                                  version=1,
                                                  record_type=self.record_type)
        self.record1 = Record.objects.create(occurred_from=self.now,
                                             occurred_to=self.now,
                                             geom='POINT (0 0)',
                                             location_text='Equator',
                                             schema=self.schema)
        # Create different numbers of objects at the different times so we can distinguish
        self.record2 = Record.objects.create(occurred_from=self.then,
                                             occurred_to=self.then,
                                             geom='POINT (0 0)',
                                             location_text='Equator',
                                             schema=self.schema)
        self.record3 = Record.objects.create(occurred_from=self.then,
                                             occurred_to=self.then,
                                             geom='POINT (0 0)',
                                             location_text='Equator',
                                             schema=self.schema)

    def test_toddow(self):
        url = '/api/records/toddow/?record_type={}'.format(str(self.record_type.uuid))
        response = json.loads(self.admin_client.get(url).content)
        self.assertEqual(len(response), 2)
        for toddow in response:
            if toddow['dow'] == self.dow:
                self.assertEqual(toddow['tod'], self.tod)
                self.assertEqual(toddow['count'], 1)
            else:
                self.assertEqual(toddow['count'], 2)

    def test_stepwise(self):
        """Test that date filtering is working appropriately and that data is being binned properly
        """
        url = ('/api/records/stepwise/?record_type={uuid}&occurred_max={maximum}&occurred_min={minimum}'
               .format(uuid=str(self.record_type.uuid),
                       minimum=self.beforeThen.isoformat() + 'Z',
                       maximum=datetime.now().isoformat() + 'Z'))

        response = json.loads(self.admin_client.get(url).content)
        self.assertEqual(len(response), 2)
        for step in response:
            if step['week'] == self.now.isocalendar()[1]:
                self.assertEqual(step['count'], 1)
            else:
                self.assertEqual(step['count'], 2)

    def test_arbitrary_filters(self):
        base = '/api/records/toddow/?record_type={rt}&occurred_max={dtmax}Z&occurred_min={dtmin}Z'

        url1 = base.format(rt=self.record_type.uuid,
                           dtmin=self.beforeNow.isoformat(),  # later than `then`
                           dtmax=self.afterNow.isoformat())
        response_data1 = json.loads(self.admin_client.get(url1).content)
        self.assertEqual(len(response_data1), 1)

        url2 = base.format(rt=self.record_type.uuid,
                           dtmin=self.beforeThen.isoformat(),  # `then`
                           dtmax=self.afterNow.isoformat())
        response_data2 = json.loads(self.admin_client.get(url2).content)
        self.assertEqual(len(response_data2), 2)

    def test_tilekey_param(self):
        """Ensure that the tilekey param stores a SQL query in Redis and returns an access token"""
        # Since the call to store in redis won't have access to a real Redis instance under test,
        # just ensure that it gets called when the correct query parameter is passed in.
        with mock.patch.object(DriverRecordViewSet, '_cache_tile_sql') as mocked_redis:
            factory = APIRequestFactory()
            view = DriverRecordViewSet.as_view({'get': 'list'})
            request = factory.get('/api/records/', {'tilekey': 'true'})
            force_authenticate(request, user=self.admin)
            response = view(request)
            self.assertEqual(mocked_redis.call_count, 1)
            self.assertIn('tilekey', response.data)
            # Since we're dealing with unserialized responses, this returns a UUID object.
            self.assertEqual(type(response.data['tilekey']), type(uuid.uuid4()))
            # Shouldn't be called again if 'tilekey' parameter is missing
            request = factory.get('/api/records/')
            force_authenticate(request, user=self.admin)
            response = view(request)
            self.assertEqual(mocked_redis.call_count, 1)

    def test_get_serializer_class(self):
        """Test that get_serializer_class returns read-only serializer correctly"""
        read_only = User.objects.create_user('public', 'public@public.com', 'public')
        view = DriverRecordViewSet()
        mock_req = mock.Mock(spec=Request)
        mock_req.user = read_only
        view.request = mock_req
        serializer_class = view.get_serializer_class()
        self.assertEqual(serializer_class, DetailsReadOnlyRecordSerializer)

    def test_audit_log_creation(self):
        """Test that audit logs are generated on create operations"""
        url = '/api/records/'
        post_data = {
            'data': {
                'Person': [],
                'Accident Details': {
                    'Num passenger casualties': '',
                    'Num driver casualties': '',
                    'Num pedestrian casualties': '',
                    '_localId': '9635a7f7-a897-4a3f-904e-93f5b273f990',
                    'Num vehicles': '',
                    'Description': ''
                },
                'Vehicle': []
            },
            'schema': self.schema.pk,
            'geom': 'POINT(120.81298917531966 15.180301034030107)',
            'location_text': 'JASA, Gapan, Nueva Ecija, Central Luzon, 3105, Philippines',
            'city': 'Gapan',
            'road': 'JASA',
            'state': 'Nueva Ecija',
            'weather': '',
            'light': '',
            'occurred_from': '2015-12-31T16:00:00.000Z',
            'occurred_to': '2015-12-31T16:00:00.000Z'
        }
        self.assertEqual(RecordAuditLogEntry.objects.count(), 0)
        response = self.admin_client.post(url, post_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RecordAuditLogEntry.objects.count(), 1)


class DriverRecordSchemaViewTestCase(APITestCase):

    def test_get_serializer_class(self):
        """Test that get_serializer_class returns read-only serializer correctly"""
        read_only = User.objects.create_user('public', 'public@public.com', 'public')
        view = DriverRecordSchemaViewSet()
        mock_req = mock.Mock(spec=Request)
        mock_req.user = read_only
        view.request = mock_req
        serializer_class = view.get_serializer_class()
        self.assertEqual(serializer_class, DetailsReadOnlyRecordSchemaSerializer)


class DriverRecordAuditLogViewSetTestCase(APITestCase):
    def setUp(self):
        super(DriverRecordAuditLogViewSetTestCase, self).setUp()
        try:
            self.admin = User.objects.get(username=settings.DEFAULT_ADMIN_USERNAME)
        except User.DoesNotExist:
            self.admin = User.objects.create_user('admin', 'admin@ashlar', 'admin')
            self.admin.is_superuser = True
            self.admin.is_staff = True
            self.admin.save()
        self.now = datetime.now(pytz.timezone('Asia/Manila'))
        self.ten_days_ago = self.now - timedelta(days=10)
        self.ten_days_hence = self.now + timedelta(days=10)

        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.url = '/api/audit-log/'

    def test_view_permissions(self):
        """Test that view is read-only to admin"""
        response = self.admin_client.get(self.url, {'min_date': self.ten_days_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.admin_client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_param_validation(self):
        """Tests that the view ensures min_date and max_date exist and are <= 1 month apart"""
        response = self.admin_client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.admin_client.get(self.url, {'min_date': self.now})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.admin_client.get(self.url, {'max_date': self.now})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        long_long_ago = self.now - timedelta(days=300)
        response = self.admin_client.get(self.url, {'min_date': long_long_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.admin_client.get(self.url, {'min_date': self.ten_days_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_view_filters(self):
        """Test that view filtering works"""
        self.assertIs(DriverRecordAuditLogViewSet.filter_class, RecordAuditLogFilter)
        # Create some spurious audit log entries so that we can filter them
        for act in ['create', 'update', 'delete']:
            RecordAuditLogEntry.objects.create(user=self.admin,
                                               username='admin',
                                               record_uuid='1234',
                                               action=act)

        response = self.admin_client.get(self.url, {'min_date': self.ten_days_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(3, len(json.loads(response.content)))
        response = self.admin_client.get(self.url, {'action': 'delete',
                                                    'min_date': self.ten_days_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(1, len(json.loads(response.content)))
        response = self.admin_client.get(self.url, {'max_date': self.ten_days_ago,
                                                    'min_date': self.ten_days_ago})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(0, len(json.loads(response.content)))
        response = self.admin_client.get(self.url, {'username': 'admin',
                                                    'min_date': self.ten_days_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(3, len(json.loads(response.content)))
        response = self.admin_client.get(self.url, {'username': 'not-a-user',
                                                    'min_date': self.ten_days_ago,
                                                    'max_date': self.ten_days_hence})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(0, len(json.loads(response.content)))
