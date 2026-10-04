import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Taps the add tile in [slot] and chooses from the library in the sheet that
/// opens.
Future<void> addFromLibrary(WidgetTester tester, [int slot = 0]) async {
  await tester.tap(find.byKey(Key('composer.media.$slot')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('composer.media.source.library')));
  await tester.pumpAndSettle();
}
