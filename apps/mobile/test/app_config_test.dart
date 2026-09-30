import 'package:dayli_mobile/app/config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('leaves media uploads off unless a build turns them on', () {
    expect(
      const AppConfig(
        apiBaseUrl: 'https://api.example.test',
      ).mediaUploadsEnabled,
      isFalse,
    );
  });
}
