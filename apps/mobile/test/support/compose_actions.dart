import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Brings the media tile in [slot] on screen from wherever the composer is
/// scrolled. The tiles sit below the prompt and answer, so on a short screen
/// they can start below the fold as well as above it.
Future<void> showMediaTile(WidgetTester tester, [int slot = 0]) async {
  final tile = find.byKey(Key('composer.media.$slot'));
  if (tile.evaluate().isEmpty) {
    // Not built yet: the list is scrolled well past it, so scroll back up.
    await tester.scrollUntilVisible(
      tile,
      -200,
      scrollable: find
          .descendant(
            of: find.byType(ComposerScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
  }
  await tester.ensureVisible(tile);
  await tester.pumpAndSettle();
}

/// Taps the add tile in [slot] and chooses from the library in the sheet that
/// opens.
Future<void> addFromLibrary(WidgetTester tester, [int slot = 0]) async {
  await showMediaTile(tester, slot);
  await tester.tap(find.byKey(Key('composer.media.$slot')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('composer.media.source.library')));
  await tester.pumpAndSettle();
}
