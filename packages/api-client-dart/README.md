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

For local HTTPS auth, use `https://localhost:8787` in iOS Simulator. Android emulators and USB-connected debug devices use that same URL with `adb reverse tcp:8787 tcp:8787` after the mkcert CA is installed on the device. It is not a LAN-accessible endpoint. See [Environments](../../docs/dayli/environments.md) for the trust and launch steps. Staging and production URLs must come from application configuration.

Regenerate this package from the repository root with `pnpm generate:clients`.
