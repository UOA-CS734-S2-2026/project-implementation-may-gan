import 'package:flutter/widgets.dart';

import '../ui/coming_soon.dart';

// WDCC pages whose REST APIs have not landed yet.

/// Friend lists return with the relationships UI (#46, #47).
class FriendsScreen extends StatelessWidget {
  const FriendsScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    title: 'friends',
    message: 'Friends are on their way. Check back soon.',
  );
}

/// Profiles and past daylies return with the profile API (#68).
class MyDaysScreen extends StatelessWidget {
  const MyDaysScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    title: 'my days',
    message: 'Your past daylies will live here soon.',
  );
}

/// Messaging returns with its REST API.
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) => const ComingSoonScreen(
    title: 'messages',
    message: 'Messages are on their way. Check back soon.',
  );
}
