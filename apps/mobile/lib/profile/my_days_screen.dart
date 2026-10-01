import 'package:flutter/material.dart';

import '../app/app_scope.dart';
import '../app/theme.dart';
import '../friends/social_profile_screen.dart';

/// Your own profile: every dayli you have posted, one day at a time.
class MyDaysScreen extends StatelessWidget {
  const MyDaysScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppScope.of(context).session;
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final username = session.user?.username;
        if (username == null) {
          return Center(
            child: Text(
              'Choose a username to see your daylies.',
              style: DayliText.serif(context),
            ),
          );
        }
        return SocialProfileScreen(username: username);
      },
    );
  }
}
