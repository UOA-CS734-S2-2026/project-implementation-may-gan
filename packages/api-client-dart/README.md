# dayli_api_client

Generated Dart client for the Dayli API. Do not edit this package by hand.

## Usage

Add this workspace package to the Flutter application with a path dependency, then pass the API URL explicitly:

```dart
import 'package:dayli_api_client/api.dart';

final client = ApiClient(basePath: apiBaseUrl);
final systemApi = SystemApi(client);
final health = await systemApi.systemHealth();
```

Typical local URLs are `http://localhost:8787` for iOS Simulator and `http://10.0.2.2:8787` for Android Emulator. Physical devices need the development machine's reachable network address. Staging and production URLs must come from application configuration.

Regenerate this package from the repository root with `pnpm generate:clients`.
