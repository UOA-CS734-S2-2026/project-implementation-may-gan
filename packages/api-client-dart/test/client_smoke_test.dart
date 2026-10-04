import 'package:dayli_api_client/api.dart';
import 'package:test/test.dart';

void main() {
  test('constructs the public client with an explicit base URL', () {
    const baseUrl = 'https://localhost:8787';
    final client = ApiClient(basePath: baseUrl);
    final api = SystemApi(client);

    expect(api.apiClient.basePath, baseUrl);
  });

  test('omits an absent notification capability from legacy registration', () {
    final request = RegisterPushDeviceRequest(
      token: 'opaque-token',
      platform: RegisterPushDeviceRequestPlatformEnum.ios,
      optedIn: true,
    );

    expect(request.toJson(), isNot(contains('notificationSchemaVersion')));
  });

  test('serializes the supported notification capability version', () {
    final request = RegisterPushDeviceRequest(
      token: 'opaque-token',
      platform: RegisterPushDeviceRequestPlatformEnum.android,
      optedIn: true,
      notificationSchemaVersion: 1,
    );

    expect(request.toJson()['notificationSchemaVersion'], 1);
  });
}
