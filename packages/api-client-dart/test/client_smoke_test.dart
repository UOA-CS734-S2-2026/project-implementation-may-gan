import 'package:dayli_api_client/api.dart';
import 'package:test/test.dart';

void main() {
  test('constructs the public client with an explicit base URL', () {
    const baseUrl = 'http://10.0.2.2:8787';
    final client = ApiClient(basePath: baseUrl);
    final api = SystemApi(client);

    expect(api.apiClient.basePath, baseUrl);
  });
}
