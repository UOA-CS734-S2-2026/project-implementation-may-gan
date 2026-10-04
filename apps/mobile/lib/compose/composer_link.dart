import 'package:flutter/foundation.dart';

import 'composer_controller.dart';

/// The custom URL scheme that opens today's composer from outside the app:
/// the Siri and Shortcuts action on iOS, the launcher shortcut on Android,
/// and any link a person saves themselves, such as
/// `dayli://app/post?rating=7`. The router reads only the path, so the host
/// is a fixed placeholder. See docs/dayli/native-composer-entry-points.md.
const composerLinkScheme = 'dayli';

/// The in-app route for today's composer.
const composerPath = '/post';

/// The only query parameter a composer link reads.
const composerRatingParameter = 'rating';

/// Reads a prefilled rating from a link. Anything other than a whole number
/// in the post contract's range (see [DailyPostLimits]) is ignored, so the
/// composer opens with no rating.
int? parsePrefilledRating(String? raw) {
  if (raw == null || !RegExp(r'^[0-9]{1,2}$').hasMatch(raw)) return null;
  final rating = int.parse(raw);
  return rating < DailyPostLimits.ratingMin ||
          rating > DailyPostLimits.ratingMax
      ? null
      : rating;
}

/// The in-app location for a composer [uri]: the path with only a valid
/// rating kept. The scheme, host, and every other parameter are dropped.
String composerLocation(Uri uri) {
  final rating = parsePrefilledRating(
    uri.queryParameters[composerRatingParameter],
  );
  return rating == null
      ? composerPath
      : '$composerPath?$composerRatingParameter=$rating';
}

/// Counts composer links as they arrive from outside the app. The composer
/// treats each arrival as an event, so the same link opened twice still fills
/// the rating twice.
class ComposerLinkSequence extends ChangeNotifier {
  int _count = 0;

  int get current => _count;

  void arrived() {
    _count++;
    notifyListeners();
  }
}
