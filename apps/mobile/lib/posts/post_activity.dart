import 'package:flutter/foundation.dart';

/// Tells screens that the signed-in user's own posts changed, such as after
/// the server accepts a new dayli or deletes one, so they can reload values
/// derived from them like the streak.
class PostActivity extends ChangeNotifier {
  void changed() => notifyListeners();
}
